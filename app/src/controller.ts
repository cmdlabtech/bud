// App state machine: screens, gestures, polling, cache, outbox, voice flow.
// Everything external is injected so it can be tested without the glasses.
import { ApiError, type KV, type RelayClient } from './api';
import type { Gesture } from './gestures';
import type { Display } from './render';
import {
  MENU, NEED_ACTIONS, homePage, homeRows, levelText, listeningPage, needItemPage, needsListPage, offlinePage,
  pageText, pairingPage, posText, READER_PAGE_CHARS, THREAD_BOX_CHARS, readerPage, recText, sentPage, sentStatus, sortBots,
  threadPage, transcriptPage, homeHeader, homeItems, homeListText, freshTag, type Freshness, type HomeRow,
} from './screens';
import { progressBar } from './text';
import type { Bot, Message, Need } from './types';
import { Recorder, syntheticChunk, type MicControl, type StopReason } from './voice';

export type Screen = 'pairing' | 'home' | 'needsList' | 'needItem' | 'thread' | 'reader' | 'listening' | 'transcript' | 'sent' | 'offline';

export const CACHE_KEY = 'glass.cache.v1';
export const OUTBOX_KEY = 'glass.outbox.v1';
export const OUTBOX_MAX = 5;
export const OUTBOX_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export const MIC_WATCHDOG_MS = 3000;
export const MIC_OFF_TEXT = 'No sound from the glasses mic. In the Even app, allow the microphone for Grok Bot Glass, then long press to try again.';

export interface OutboxItem { bot_id: string; text: string; ts: number }
interface Cache { bots: Bot[]; needs: Need[]; savedAt: number; threads?: Record<string, { messages: Message[]; total: number }> }

export interface Deps {
  display: Display;
  api: RelayClient;
  kv: KV;
  mic: MicControl;
  exit: () => void;
  pollMs: number;
  replyPollMs: number;
  replyTimeoutMs: number;
  micStub?: boolean;
  log?: (...a: unknown[]) => void;
}

export class Controller {
  screen: Screen = 'home';
  root: Screen = 'home';
  bots: Bot[] = [];
  needs: Need[] = [];
  freshness: Freshness = 'loading';
  savedAt = 0;
  outbox: OutboxItem[] = [];
  homePageNo: 0 | 1 = 0;
  homeSel = 0;
  showPos = true;
  botId = '';
  messages: Message[] = [];
  total = 0;
  offset = 0;
  readerPageNo = 0;
  needIndex = 0;
  holdMode = false;
  draft: string | null = null;
  draftError: string | undefined;
  sent: { id: string | null; botId: string; text: string; status: string; startedAt: number } | null = null;
  offlineAttempt = 1;
  inForeground = true;
  overlayOpen = false;
  busy = false;
  private threads: Record<string, { messages: Message[]; total: number }> = {};
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private replyTimer: ReturnType<typeof setInterval> | null = null;
  private stubTimer: ReturnType<typeof setInterval> | null = null;
  private lastLevelPaint = 0;
  private recorder: Recorder;
  private talkReturn: Screen = 'thread';
  private flushing = false;

  constructor(private d: Deps) {
    this.recorder = new Recorder(d.mic, r => void this.stopListening(r));
  }

  private log(...a: unknown[]) { this.d.log?.('[glass]', ...a); }
  private bot(id = this.botId): Bot { return this.bots.find(b => b.id === id) ?? { id, name: id.toUpperCase(), label: '', needs: 0, unread: 0 }; }

  // ---------------------------------------------------------------- startup
  async start(): Promise<void> {
    const paired = await this.d.api.load();
    await this.loadCache();
    if (!paired) { this.root = 'pairing'; await this.go('pairing'); return; }
    // Never blank: cached state (or a loading screen) is drawn before any network call.
    this.freshness = this.bots.length ? 'cached' : 'loading';
    this.root = 'home';
    await this.go('home');
    const ok = await this.refresh();
    if (!ok && this.bots.length === 0) { this.root = 'offline'; await this.go('offline'); }
    this.startPolling();
  }

  async onPaired(): Promise<void> {
    if (!(await this.d.api.load())) return;
    this.root = 'home';
    this.freshness = this.bots.length ? 'cached' : 'loading';
    await this.go('home');
    await this.refresh();
    this.startPolling();
  }

  private async loadCache() {
    try {
      const c = JSON.parse((await this.d.kv.get(CACHE_KEY)) || 'null') as Cache | null;
      if (c && Array.isArray(c.bots)) { this.bots = c.bots; this.needs = c.needs ?? []; this.savedAt = c.savedAt ?? 0; this.threads = c.threads ?? {}; }
    } catch { /* bad cache: ignore */ }
    try {
      const o = JSON.parse((await this.d.kv.get(OUTBOX_KEY)) || '[]') as OutboxItem[];
      this.outbox = Array.isArray(o) ? o.filter(i => i && typeof i.text === 'string' && Date.now() - i.ts < OUTBOX_MAX_AGE_MS).slice(-OUTBOX_MAX) : [];
    } catch { this.outbox = []; }
  }
  private saveCache() {
    const threads: Cache['threads'] = {};
    for (const [k, v] of Object.entries(this.threads)) threads[k] = { messages: v.messages.slice(-6), total: v.total };
    void this.d.kv.set(CACHE_KEY, JSON.stringify({ bots: this.bots, needs: this.needs, savedAt: this.savedAt, threads } satisfies Cache)).catch(() => {});
  }
  private saveOutbox() { void this.d.kv.set(OUTBOX_KEY, JSON.stringify(this.outbox)).catch(() => {}); }

  // ---------------------------------------------------------------- polling
  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => { if (this.inForeground && this.screen !== 'listening') void this.refresh(); }, this.d.pollMs);
  }
  stopPolling() { if (this.pollTimer) clearInterval(this.pollTimer); this.pollTimer = null; }

  // Fetch bots + needs (+ open thread). Returns false when offline.
  async refresh(): Promise<boolean> {
    if (!this.d.api.paired) return false;
    try {
      const [bots, needs] = await Promise.all([this.d.api.bots(), this.d.api.needs()]);
      const before = this.homeSignature();
      this.bots = bots; this.needs = needs; this.savedAt = Date.now(); this.freshness = 'live'; this.offlineAttempt = 1;
      if (this.screen === 'thread' && this.botId) await this.loadThread(false);
      this.saveCache();
      await this.flushOutbox();
      await this.repaintAfterRefresh(before);
      return true;
    } catch (e) {
      return this.handleBackgroundError(e);
    }
  }

  private async handleBackgroundError(e: unknown): Promise<boolean> {
    const kind = e instanceof ApiError ? e.kind : 'server';
    this.log('refresh failed', kind);
    if (kind === 'auth') { this.stopPolling(); this.root = 'pairing'; await this.go('pairing', 'This device was unpaired. Ask Shuri for a new code.'); return false; }
    const was = this.freshness;
    this.freshness = this.bots.length ? 'offline' : this.freshness;
    if (this.screen === 'home' && was !== this.freshness) await this.paintHeader();
    if (this.screen === 'offline') { this.offlineAttempt = Math.min(this.offlineAttempt + 1, 3); await this.go('offline'); }
    return false;
  }

  private homeSignature(): string {
    return JSON.stringify(homeItems({ bots: this.bots, needs: this.needs, page: this.homePageNo }).items);
  }

  private async repaintAfterRefresh(before: string) {
    switch (this.screen) {
      case 'home':
        // Only redraw rows when they changed; keep the cursor on the same row when possible.
        if (this.homeSignature() !== before) { this.homeSel = Math.min(this.homeSel, this.rows().length - 1); await this.go('home'); } else await this.paintHeader();
        break;
      case 'needsList': await this.go('needsList'); break;
      case 'thread': await this.go('thread'); break;
      case 'offline': this.root = this.root === 'offline' ? 'home' : this.root; await this.go('home'); break;
    }
  }

  private async paintHeader() {
    const newCount = this.bots.filter(b => b.unread > 0).length;
    const base = this.homePageNo === 0 ? homeHeader(this.needs.length, newCount) : 'Grok Bot   more bots';
    await this.d.display.update('hdr', base + freshTag(this.freshness, this.savedAt, Date.now(), this.outbox.length));
  }

  // ---------------------------------------------------------------- outbox
  private enqueue(botId: string, text: string) {
    this.outbox.push({ bot_id: botId, text, ts: Date.now() });
    if (this.outbox.length > OUTBOX_MAX) this.outbox.shift();
    this.saveOutbox();
  }

  async flushOutbox(): Promise<void> {
    if (this.flushing || this.outbox.length === 0) return;
    this.flushing = true;
    try {
      while (this.outbox.length) {
        const item = this.outbox[0];
        try {
          const r = await this.d.api.send(item.bot_id, item.text);
          this.outbox.shift(); this.saveOutbox();
          if (this.sent && this.sent.status === 'queued' && this.sent.botId === item.bot_id && this.sent.text === item.text) {
            this.sent = { ...this.sent, id: r.message_id, status: r.status === 'failed' ? 'failed' : 'pending', startedAt: Date.now() };
            if (this.screen === 'sent') { await this.go('sent'); this.startReplyPoll(); }
          }
        } catch (e) {
          if (e instanceof ApiError && (e.kind === 'bad' || e.kind === 'notfound')) { this.outbox.shift(); this.saveOutbox(); continue; }
          break; // still offline / rate limited: keep it for the next poll
        }
      }
    } finally { this.flushing = false; }
  }

  // ---------------------------------------------------------------- rendering
  rows(): HomeRow[] { return homeRows(sortBots(this.bots), this.homePageNo); }

  async go(screen: Screen, message?: string): Promise<void> {
    if (screen !== 'sent') this.stopReplyPoll();
    this.screen = screen;
    const now = Date.now();
    const page = (() => {
      switch (screen) {
        case 'pairing': return pairingPage({ message });
        case 'home': return homePage({ bots: this.bots, needs: this.needs, page: this.homePageNo, selected: this.homeSel, showPos: this.showPos, freshness: this.freshness, savedAt: this.savedAt, now, outbox: this.outbox.length });
        case 'needsList': return needsListPage({ needs: this.needs, toast: message });
        case 'needItem': {
          const n = this.needs[this.needIndex];
          if (!n) return needsListPage({ needs: this.needs, toast: message });
          const p = needItemPage({ need: n, index: this.needIndex, total: this.needs.length, now });
          if (message) { const h = p.containers.find(c => c.name === 'hdr'); if (h && h.kind === 'text') h.content = message; }
          return p;
        }
        case 'thread': return threadPage({ bot: this.bot(), messages: this.messages, total: this.total, offset: this.offset, now });
        case 'reader': return readerPage({ botName: this.bot().name, text: this.latestReplyText(), page: this.readerPageNo });
        case 'listening': return listeningPage({ botName: this.bot().name, elapsedMs: this.recorder.elapsedMs, levels: this.recorder.levels, holdMode: this.holdMode });
        case 'transcript': return transcriptPage({ botName: this.bot().name, text: this.draft, error: this.draftError });
        case 'sent': {
          const s = this.sent!;
          return sentPage({ botName: this.bot(s.botId).name, text: s.text, status: s.status, frac: this.sentFrac() });
        }
        case 'offline': return offlinePage({ reason: 'offline', hasOutbox: this.outbox.length > 0, attempt: this.offlineAttempt, maxAttempts: 3, now, isRoot: this.root === 'offline' });
      }
    })();
    if (screen === 'needItem' && !this.needs[this.needIndex]) this.screen = 'needsList';
    await this.d.display.show(page);
  }

  private latestReplyText(): string {
    const last = this.messages[this.messages.length - 1];
    return last ? `${this.bot().name}: ${last.reply_short ?? ''}` : '';
  }
  private readerPages(): number { return pageText(this.latestReplyText(), READER_PAGE_CHARS).length; }
  private sentFrac(): number {
    const s = this.sent; if (!s) return 0;
    if (s.status === 'replied') return 1;
    return Math.min(1, (Date.now() - s.startedAt) / this.d.replyTimeoutMs);
  }

  // ---------------------------------------------------------------- thread
  async openThread(botId: string) {
    this.botId = botId; this.offset = 0; this.readerPageNo = 0;
    const cached = this.threads[botId];
    this.messages = cached?.messages ?? []; this.total = cached?.total ?? 0;
    await this.go('thread');
    await this.loadThread(true);
  }

  private async loadThread(repaint: boolean) {
    const id = this.botId;
    try {
      const r = await this.d.api.thread(id);
      if (this.botId !== id) return;
      // Keep any local queued messages visible at the end of the thread.
      const queued: Message[] = this.outbox.filter(o => o.bot_id === id).map((o, i) => ({ id: `q${i}`, bot_id: id, text: o.text, status: 'queued', reply_short: null, created_at: o.ts, replied_at: null }));
      this.messages = [...r.messages, ...queued]; this.total = r.total + queued.length;
      this.threads[id] = { messages: r.messages, total: r.total };
      const b = this.bots.find(x => x.id === id);
      if (b && b.unread > 0) { b.unread = 0; void this.d.api.markRead(id).catch(() => {}); }
      if (repaint && this.screen === 'thread' && this.botId === id) await this.go('thread');
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'auth') await this.handleBackgroundError(e);
    }
  }

  // ---------------------------------------------------------------- voice
  async startTalk(botId: string, hold: boolean) {
    if (!botId) return;
    if (this.screen !== 'listening' && this.screen !== 'transcript') this.talkReturn = this.screen === 'home' ? 'home' : 'thread';
    if (this.botId !== botId) { this.botId = botId; this.messages = this.threads[botId]?.messages ?? []; this.total = this.threads[botId]?.total ?? 0; this.offset = 0; }
    this.holdMode = hold; this.draft = null; this.draftError = undefined;
    const opened = await this.recorder.start();
    this.recorder.active = true; // audioControl's result is not reliable (false in the simulator); audio arrival decides
    if (!opened) this.log('audioControl returned false; waiting for audio');
    await this.go('listening');
    // Permission-denial path (Even QA): no audio within MIC_WATCHDOG_MS means the mic is off.
    const startedAt = Date.now();
    setTimeout(() => {
      if (this.screen === 'listening' && this.recorder.active && this.recorder.chunks.length === 0 && this.recorder.startedAt <= startedAt) {
        this.recorder.cancel();
        this.draftError = MIC_OFF_TEXT;
        void this.go('transcript');
      }
    }, MIC_WATCHDOG_MS);
    if (this.d.micStub) this.runMicStub();
  }

  private runMicStub() {
    let t = 0;
    if (this.stubTimer) clearInterval(this.stubTimer);
    this.stubTimer = setInterval(() => {
      if (!this.recorder.active) { clearInterval(this.stubTimer!); this.stubTimer = null; return; }
      // 1.5 s of tone, then silence -> silence auto-stop after 2 s.
      this.onAudio(t < 15 ? syntheticChunk(t) : new Uint8Array(3200));
      t++;
    }, 100);
  }

  onAudio(pcm: Uint8Array) {
    if (this.screen !== 'listening' || !this.recorder.active) return;
    this.recorder.push(pcm);
    const now = Date.now();
    if (now - this.lastLevelPaint > 300 && this.screen === 'listening') {
      this.lastLevelPaint = now;
      void this.d.display.update('rec', recText(this.recorder.elapsedMs));
      void this.d.display.update('level', levelText(this.recorder.levels));
    }
  }

  async stopListening(reason: StopReason) {
    if (this.screen !== 'listening' || !this.recorder.active) return;
    this.log('stop listening', reason);
    if (reason === 'cancel' || reason === 'background') {
      this.recorder.cancel();
      if (this.talkReturn === 'home') await this.go('home'); else await this.go('thread');
      return;
    }
    const wav = await this.recorder.stop();
    this.draft = null; this.draftError = undefined;
    await this.go('transcript');
    if (!wav) { this.draft = ''; await this.go('transcript'); return; }
    try {
      const text = await this.d.api.transcribe(wav);
      this.draft = text.trim();
    } catch (e) {
      const kind = e instanceof ApiError ? e.kind : 'server';
      this.draftError = kind === 'offline' ? "Offline. Can't turn speech into text right now. Long press to try again."
        : kind === 'rate' ? 'Too many tries. Wait a minute, then long press to try again.'
        : "Couldn't turn that into text. Long press to try again.";
    }
    if ((this.screen as Screen) === 'transcript') await this.go('transcript');
  }

  async sendDraft() {
    const text = this.draft;
    if (!text || this.busy) return;
    this.busy = true;
    const botId = this.botId;
    this.sent = { id: null, botId, text, status: 'sending', startedAt: Date.now() };
    await this.go('sent');
    try {
      const r = await this.d.api.send(botId, text);
      this.sent = { ...this.sent, id: r.message_id, status: r.status === 'failed' ? 'failed' : 'pending', startedAt: Date.now() };
      this.threads[botId] = { messages: [...(this.threads[botId]?.messages ?? []), { id: r.message_id, bot_id: botId, text, status: this.sent.status as Message['status'], reply_short: null, created_at: Date.now(), replied_at: null }], total: (this.threads[botId]?.total ?? 0) + 1 };
    } catch (e) {
      const kind = e instanceof ApiError ? e.kind : 'server';
      if (kind === 'offline' || kind === 'server' || kind === 'rate') { this.enqueue(botId, text); this.sent = { ...this.sent, status: 'queued' }; }
      else this.sent = { ...this.sent, status: 'failed' };
    } finally { this.busy = false; }
    if (this.screen === 'sent') { await this.go('sent'); if (this.sent?.status === 'pending') this.startReplyPoll(); }
  }

  private startReplyPoll() {
    this.stopReplyPoll();
    this.replyTimer = setInterval(() => void this.checkReply(), this.d.replyPollMs);
  }
  private stopReplyPoll() { if (this.replyTimer) clearInterval(this.replyTimer); this.replyTimer = null; }

  async checkReply() {
    const s = this.sent;
    if (!s?.id || this.screen !== 'sent' || !this.inForeground) return;
    try {
      const m = await this.d.api.message(s.id);
      if (m.status !== s.status) {
        this.sent = { ...s, status: m.status };
        await this.d.display.update('status', sentStatus(this.bot(s.botId).name, m.status));
      }
      await this.d.display.update('bar', progressBar(this.sentFrac()));
      if (m.status === 'replied') {
        this.stopReplyPoll();
        setTimeout(() => { if (this.screen === 'sent' && this.sent?.id === s.id) void this.openThread(s.botId); }, 1200);
      } else if (m.status === 'timeout' || m.status === 'failed') {
        this.stopReplyPoll();
        await this.go('sent');
      }
    } catch { /* transient: keep polling */ }
  }

  // ---------------------------------------------------------------- needs
  async actOnNeed(actionIndex: number) {
    const n = this.needs[this.needIndex];
    const a = NEED_ACTIONS[actionIndex];
    if (!n || !a || this.busy) return;
    this.busy = true;
    try {
      await this.d.api.act(n.id, a.action);
      this.needs = this.needs.filter(x => x.id !== n.id);
      const b = this.bots.find(x => x.id === n.bot_id); if (b && b.needs > 0) b.needs--;
      this.saveCache();
      await this.d.display.update('hdr', a.done);
      setTimeout(() => {
        if (this.screen !== 'needItem') return;
        if (this.needIndex >= this.needs.length) this.needIndex = 0;
        void (this.needs.length ? this.go('needItem') : this.go('needsList', 'All clear. Nothing needs you.'));
      }, 1500);
    } catch (e) {
      const kind = e instanceof ApiError ? e.kind : 'server';
      await this.d.display.update('hdr', kind === 'offline' ? 'Offline. Try again when connected.' : kind === 'notfound' ? 'Already handled.' : 'Did not go through. Try again.');
      if (kind === 'notfound') { this.needs = this.needs.filter(x => x.id !== n.id); }
    } finally { this.busy = false; }
  }

  // Every gesture gets a visible response (Even QA). At a boundary, flash the header.
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;
  async nudge(text: string) {
    const page = this.d.display.current;
    const hdr = page?.containers.find(c => c.name === 'hdr');
    const original = hdr && hdr.kind === 'text' ? hdr.content : '';
    const key = page?.key;
    await this.d.display.update('hdr', text);
    if (hdr && hdr.kind === 'text') hdr.content = original; // keep the page spec's real header
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.nudgeTimer = setTimeout(() => { if (this.d.display.current?.key === key) void this.d.display.update('hdr', original); }, 1500);
  }

  // ---------------------------------------------------------------- input
  async handle(g: Gesture): Promise<void> {
    if (g.kind === 'audio') { this.onAudio(g.pcm); return; }
    if (g.kind === 'foregroundEnter') {
      if (this.inForeground) { this.overlayOpen = true; return; } // contextual menu overlay opened
      this.inForeground = true; this.startPolling(); void this.refresh(); return;
    }
    if (g.kind === 'foregroundExit') {
      if (this.overlayOpen) { this.overlayOpen = false; return; } // overlay closed, app still on screen
      this.inForeground = false; this.stopPolling();
      if (this.screen === 'listening') await this.stopListening('background');
      return;
    }
    if (g.kind === 'exit') { this.inForeground = false; this.stopPolling(); this.stopReplyPoll(); if (this.recorder.active) this.recorder.cancel(); return; }
    // Any input means no overlay has focus.
    this.overlayOpen = false;
    if (!this.inForeground) { this.inForeground = true; this.startPolling(); }
    if (g.kind === 'menu') return this.menu(g.itemId);

    switch (this.screen) {
      case 'pairing':
        if (g.kind === 'double') return this.d.exit();
        if (g.kind === 'press') { if (await this.d.api.load()) await this.onPaired(); else await this.go('pairing', 'Still not paired. Enter the code on your phone.'); }
        return;
      case 'offline':
        if (g.kind === 'double') { if (this.root === 'offline') return this.d.exit(); return this.go('home'); }
        if (g.kind === 'press') {
          await this.d.display.update('retry', 'Retrying...');
          if (!(await this.refresh()) && this.screen === 'offline') { this.offlineAttempt = Math.min(3, this.offlineAttempt + 1); await this.go('offline'); }
        }
        return;
      case 'home': return this.homeInput(g);
      case 'needsList':
        if (g.kind === 'double') return this.go('home');
        if (g.kind === 'press' && this.needs.length) { this.needIndex = Math.min(g.index ?? 0, this.needs.length - 1); return this.go('needItem'); }
        if (g.kind === 'press') return this.nudge('Nothing needs you right now');
        return;
      case 'needItem':
        if (g.kind === 'double') return this.go('needsList');
        if (g.kind === 'press') return this.actOnNeed(g.index ?? 0);
        return;
      case 'thread':
        if (g.kind === 'double') return this.go('home');
        if (g.kind === 'press') return this.startTalk(this.botId, false);
        if (g.kind === 'long') return this.startTalk(this.botId, true);
        if (g.kind === 'up') { const shown = Math.min(2, this.messages.length - this.offset); if (this.total - this.offset - shown > 0 && this.offset + 1 < this.messages.length) { this.offset++; return this.go('thread'); } return this.nudge(this.messages.length ? 'No older messages here' : 'No messages yet'); }
        if (g.kind === 'down') {
          if (this.offset > 0) { this.offset--; return this.go('thread'); }
          if (pageText(this.latestReplyText(), THREAD_BOX_CHARS).length > 1) { this.readerPageNo = 0; return this.go('reader'); }
          return this.nudge('This is the latest');
        }
        return;
      case 'reader':
        if (g.kind === 'double') return this.go('thread');
        if (g.kind === 'press') return this.startTalk(this.botId, false);
        if (g.kind === 'long') return this.startTalk(this.botId, true);
        if (g.kind === 'down') { if (this.readerPageNo < this.readerPages() - 1) { this.readerPageNo++; return this.go('reader'); } return this.nudge('End of reply'); }
        if (g.kind === 'up') { if (this.readerPageNo > 0) { this.readerPageNo--; return this.go('reader'); } return this.nudge('Start of reply'); }
        return;
      case 'listening':
        if (g.kind === 'double') return this.stopListening('cancel');
        if (g.kind === 'press') return this.stopListening('press');
        if (g.kind === 'longRelease' && this.holdMode) return this.stopListening('release');
        return;
      case 'transcript':
        if (this.draft === null && !this.draftError) { if (g.kind === 'double') return this.go(this.talkReturn); return; } // transcribing
        if (g.kind === 'double') { this.draft = null; return this.go(this.talkReturn === 'home' ? 'home' : 'thread'); }
        if (g.kind === 'press' && this.draft) return this.sendDraft();
        if (g.kind === 'long') return this.startTalk(this.botId, true);
        return;
      case 'sent':
        if (g.kind === 'double') return this.go('home');
        if (g.kind === 'press') return this.sent?.status === 'failed' ? this.openThread(this.sent.botId) : this.openThread(this.sent?.botId ?? this.botId);
        if (g.kind === 'long') return this.startTalk(this.sent?.botId ?? this.botId, true);
        return;
    }
  }

  private async homeInput(g: Gesture) {
    if (this.bots.length === 0) {
      if (g.kind === 'double') return this.d.exit();
      if (g.kind === 'press') { this.freshness = 'loading'; await this.go('home'); if (!(await this.refresh())) { this.freshness = 'offline'; await this.go('home'); } }
      return;
    }
    const rows = this.rows();
    if (g.kind === 'up' || g.kind === 'down') {
      const next = Math.max(0, Math.min(rows.length - 1, this.homeSel + (g.kind === 'down' ? 1 : -1)));
      if (next === this.homeSel) return this.nudge(g.kind === 'down' ? 'End of list' : 'Top of list');
      this.homeSel = next;
      const { items } = homeItems({ bots: this.bots, needs: this.needs, page: this.homePageNo });
      await this.d.display.update('rows', homeListText(items, this.homeSel));
      if (this.showPos) await this.d.display.update('pos', posText(this.homeSel, rows.length));
      return;
    }
    if (g.kind === 'double') {
      if (this.homePageNo === 1) { this.homePageNo = 0; this.homeSel = 0; return this.go('home'); }
      return this.d.exit(); // root: opens the system exit dialog
    }
    const row = rows[this.homeSel];
    if (g.kind === 'press') {
      if (!row) return;
      if (row.type === 'needs') return this.go('needsList');
      if (row.type === 'more') { this.homePageNo = 1; this.homeSel = 0; return this.go('home'); }
      if (row.type === 'back') { this.homePageNo = 0; this.homeSel = 0; return this.go('home'); }
      return this.openThread(row.id);
    }
    if (g.kind === 'long') {
      if (row?.type === 'bot') return this.startTalk(row.id, true);
      await this.d.display.update('hdr', 'Pick a bot first, then long press to talk.');
    }
  }

  private async menu(id: number) {
    switch (id) {
      case MENU.home[0].id: if (await this.refresh()) await this.go('home'); return;
      case MENU.home[1].id: return this.startTalk('edith', false);
      case MENU.home[2].id: case 41: await this.refresh(); return this.go('needsList');
      case 43: case 13: case 53: case 62: case 72: return this.go('home');
      case 11: return this.handle({ kind: 'up' });
      case 12: { const b = this.bots.find(x => x.id === this.botId); if (b) b.unread = 0; void this.d.api.markRead(this.botId).catch(() => {}); return this.go('thread'); }
      case 15: this.readerPageNo = 0; return this.go('reader');
      case 16: return this.go('thread');
      case 21: return this.stopListening('cancel');
      case 31: if (this.screen === 'transcript') return this.sendDraft(); return;
      case 32: return this.startTalk(this.botId, false);
      case 33: this.draft = null; return this.go(this.talkReturn === 'home' ? 'home' : 'thread');
      case 51: if (this.needs.length) { this.needIndex = (this.needIndex + 1) % this.needs.length; return this.go('needItem'); } return;
      case 52: { const n = this.needs[this.needIndex]; if (n) return this.openThread(n.bot_id); return; }
      case 61: return this.openThread(this.sent?.botId ?? this.botId);
      case 71: return this.handle({ kind: 'press' });
      case 81: return this.handle({ kind: 'press' });
    }
  }
}
