// App state machine for BUD 1.0 (send-only): bot list -> listen -> transcript -> sent -> list.
// No relay, no polling, no replies. Everything external is injected so it can be tested.
import { NetError, sendToBot, transcribe, webhookBody, type Fetch } from './net';
import type { Display } from './render';
import {
  MENU, homeListText, homePage, levelText, listeningPage, posText, recText, sendErrorPage, sentPage, setupPage, transcriptPage,
} from './screens';
import type { BotConfig, Settings } from './types';
import { Recorder, syntheticChunk, type MicControl, type StopReason } from './voice';

export type Screen = 'setup' | 'home' | 'listening' | 'transcript' | 'sent' | 'sendError';

export const MIC_WATCHDOG_MS = 3000;
export const MIC_OFF_TEXT = 'No sound from the glasses mic. In the Even app, allow the microphone for BUD, then long press to try again.';

export interface Deps {
  display: Display;
  fetch: Fetch;
  mic: MicControl;
  loadSettings: () => Promise<Settings>;
  exit: () => void;
  sentMs: number;
  micStub?: boolean;
  log?: (...a: unknown[]) => void;
}

export function sttErrorText(kind: string): string {
  if (kind === 'nokey') return 'No xAI key on this phone. Add it on the BUD phone page.';
  if (kind === 'auth') return 'xAI did not accept the key. Check it on the BUD phone page.';
  if (kind === 'rate') return 'Too many tries. Wait a minute, then long press to try again.';
  if (kind === 'network') return "Can't reach xAI. Check the phone's connection, then long press to try again.";
  return "Couldn't turn that into text. Long press to try again.";
}

export function sendErrorText(kind: string): string {
  if (kind === 'auth') return 'The sender key was not accepted. Check this bot on the phone page.';
  if (kind === 'bad') return 'The webhook did not accept it. Check the URL on the phone page.';
  if (kind === 'rate') return 'Too many sends. Wait a minute and retry.';
  if (kind === 'network') return "Couldn't reach Grok Bot. Check the phone's connection.";
  return 'Grok Bot had a problem. Try again in a moment.';
}

export class Controller {
  screen: Screen = 'home';
  settings: Settings = { bots: [], xaiKey: '' };
  homeSel = 0;
  showPos = true;
  botId = '';
  holdMode = false;
  draft: string | null = null;
  draftError: string | undefined;
  sendError = '';
  sending = false;
  inForeground = true;
  overlayOpen = false;
  private stubTimer: ReturnType<typeof setInterval> | null = null;
  private backTimer: ReturnType<typeof setTimeout> | null = null;
  private lastLevelPaint = 0;
  private recorder: Recorder;

  constructor(private d: Deps) {
    this.recorder = new Recorder(d.mic, r => void this.stopListening(r));
  }

  private log(...a: unknown[]) { this.d.log?.('[bud]', ...a); }
  get bots(): BotConfig[] { return this.settings.bots; }
  bot(id = this.botId): BotConfig | undefined { return this.bots.find(b => b.id === id); }
  private botName(id = this.botId): string { return this.bot(id)?.name ?? 'bot'; }

  // ---------------------------------------------------------------- startup / settings
  async start(): Promise<void> { await this.reload(); }

  // Re-read settings (after the phone page saves). Only redraws when nothing is in progress.
  async reload(): Promise<void> {
    this.settings = await this.d.loadSettings();
    this.homeSel = Math.min(this.homeSel, Math.max(0, this.bots.length - 1));
    if (this.screen === 'home' || this.screen === 'setup') await this.goHome();
  }

  async goHome(message?: string): Promise<void> {
    this.clearBackTimer();
    if (this.bots.length === 0) return this.go('setup', message);
    return this.go('home');
  }

  // ---------------------------------------------------------------- rendering
  async go(screen: Screen, message?: string): Promise<void> {
    this.screen = screen;
    const name = this.botName();
    const page = (() => {
      switch (screen) {
        case 'setup': return setupPage({ reason: this.bots.length ? 'nokey' : 'nobots', message });
        case 'home': return homePage({ names: this.bots.map(b => b.name), selected: this.homeSel, showPos: this.showPos });
        case 'listening': return listeningPage({ botName: name, elapsedMs: this.recorder.elapsedMs, levels: this.recorder.levels, holdMode: this.holdMode });
        case 'transcript': return transcriptPage({ botName: name, text: this.draft, error: this.draftError });
        case 'sent': return sentPage({ botName: name, sending: this.sending });
        case 'sendError': return sendErrorPage({ botName: name, text: this.draft ?? '', reason: this.sendError });
      }
    })();
    await this.d.display.show(page);
  }

  // ---------------------------------------------------------------- voice
  async startTalk(botId: string, hold: boolean) {
    if (!this.bot(botId)) return;
    this.clearBackTimer();
    this.botId = botId; this.holdMode = hold; this.draft = null; this.draftError = undefined;
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
      this.onAudio(t < 15 ? syntheticChunk(t) : new Uint8Array(3200)); // 1.5 s tone, then silence
      t++;
    }, 100);
  }

  onAudio(pcm: Uint8Array) {
    if (this.screen !== 'listening' || !this.recorder.active) return;
    this.recorder.push(pcm);
    const now = Date.now();
    if (now - this.lastLevelPaint > 300) {
      this.lastLevelPaint = now;
      void this.d.display.update('rec', recText(this.recorder.elapsedMs));
      void this.d.display.update('level', levelText(this.recorder.levels));
    }
  }

  async stopListening(reason: StopReason) {
    if (this.screen !== 'listening' || !this.recorder.active) return;
    this.log('stop listening', reason);
    if (reason === 'cancel' || reason === 'background') { this.recorder.cancel(); await this.goHome(); return; }
    const wav = await this.recorder.stop();
    this.draft = null; this.draftError = undefined;
    await this.go('transcript');
    if (!wav) { this.draft = ''; await this.go('transcript'); return; }
    try {
      this.draft = await transcribe(this.d.fetch, this.settings.xaiKey, wav);
    } catch (e) {
      this.draftError = sttErrorText(e instanceof NetError ? e.kind : 'server');
    }
    if ((this.screen as Screen) === 'transcript') await this.go('transcript');
  }

  // ---------------------------------------------------------------- send
  async sendDraft() {
    const text = this.draft;
    const bot = this.bot();
    if (!text || !bot || this.sending) return;
    this.sending = true;
    await this.go('sent');
    try {
      await sendToBot(this.d.fetch, bot, webhookBody('voice', text));
      this.sending = false;
      await this.go('sent');
      this.backTimer = setTimeout(() => { this.backTimer = null; if (this.screen === 'sent') { this.draft = null; void this.goHome(); } }, this.d.sentMs);
    } catch (e) {
      this.sending = false;
      this.sendError = sendErrorText(e instanceof NetError ? e.kind : 'server');
      this.log('send failed', e instanceof NetError ? `${e.kind} ${e.status}` : 'error');
      await this.go('sendError');
    }
  }

  private clearBackTimer() { if (this.backTimer) clearTimeout(this.backTimer); this.backTimer = null; }

  // Every gesture gets a visible response (Even QA). At a list boundary, flash the header.
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;
  async nudge(text: string) {
    await this.d.display.update('hdr', text);
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.nudgeTimer = setTimeout(() => { if (this.screen === 'home') void this.d.display.update('hdr', 'BUD'); }, 1500);
  }

  // ---------------------------------------------------------------- input
  async handle(g: import('./gestures').Gesture): Promise<void> {
    if (g.kind === 'audio') { this.onAudio(g.pcm); return; }
    if (g.kind === 'foregroundEnter') {
      if (this.inForeground) { this.overlayOpen = true; return; } // contextual menu overlay opened
      this.inForeground = true; return;
    }
    if (g.kind === 'foregroundExit') {
      if (this.overlayOpen) { this.overlayOpen = false; return; }
      this.inForeground = false;
      if (this.screen === 'listening') await this.stopListening('background');
      return;
    }
    if (g.kind === 'exit') { this.inForeground = false; this.clearBackTimer(); if (this.recorder.active) this.recorder.cancel(); return; }
    this.overlayOpen = false;
    this.inForeground = true;
    if (g.kind === 'menu') return this.menu(g.itemId);

    switch (this.screen) {
      case 'setup':
        if (g.kind === 'double') return this.d.exit();
        if (g.kind === 'press') { await this.reload(); if (this.screen === 'setup') await this.go('setup', 'Still nothing set up. Add a bot on your phone.'); }
        return;
      case 'home': return this.homeInput(g);
      case 'listening':
        if (g.kind === 'double') return this.stopListening('cancel');
        if (g.kind === 'press') return this.stopListening('press');
        if (g.kind === 'longRelease' && this.holdMode) return this.stopListening('release');
        return;
      case 'transcript':
        if (this.draft === null && !this.draftError) { if (g.kind === 'double') return this.goHome(); return; } // transcribing
        if (g.kind === 'double') { this.draft = null; return this.goHome(); }
        if (g.kind === 'press' && this.draft) return this.sendDraft();
        if (g.kind === 'long') return this.startTalk(this.botId, true);
        return;
      case 'sent':
        if (this.sending) return;
        if (g.kind === 'long') return this.startTalk(this.botId, true);
        this.draft = null; return this.goHome();
      case 'sendError':
        if (g.kind === 'double') { this.draft = null; return this.goHome(); }
        if (g.kind === 'press') return this.sendDraft();
        if (g.kind === 'long') return this.startTalk(this.botId, true);
        return;
    }
  }

  private async homeInput(g: import('./gestures').Gesture) {
    const n = this.bots.length;
    if (g.kind === 'up' || g.kind === 'down') {
      const next = Math.max(0, Math.min(n - 1, this.homeSel + (g.kind === 'down' ? 1 : -1)));
      if (next === this.homeSel) return this.nudge(g.kind === 'down' ? 'End of list' : 'Top of list');
      this.homeSel = next;
      await this.d.display.update('rows', homeListText(this.bots.map(b => b.name), this.homeSel));
      if (this.showPos) await this.d.display.update('pos', posText(this.homeSel, n));
      return;
    }
    if (g.kind === 'double') return this.d.exit(); // root: opens the system exit dialog
    const bot = this.bots[this.homeSel];
    if (!bot) return;
    if (!this.settings.xaiKey) { await this.go('setup'); return; }
    if (g.kind === 'press') return this.startTalk(bot.id, false);
    if (g.kind === 'long') return this.startTalk(bot.id, true);
  }

  private async menu(id: number) {
    switch (id) {
      case MENU.home[0].id: case MENU.setup[0].id: return this.reload().then(() => this.goHome());
      case 21: return this.stopListening('cancel');
      case 31: if (this.screen === 'transcript') return this.sendDraft(); return;
      case 32: return this.startTalk(this.botId, false);
      case 33: case 62: case 72: this.draft = null; return this.goHome();
      case 71: if (this.screen === 'sendError') return this.sendDraft(); return;
    }
  }
}
