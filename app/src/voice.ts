// Voice capture. WAV/RMS helpers copied from Wondereye
// (cmdlabtech/Wondereye packages/frontend/src/voice.ts, v1.7.0) and adapted for
// hold-to-talk: long press starts, release stops, press stops in tap mode.
// G2 mic format per Even docs (/docs/build/device-apis): PCM 16 kHz, s16le, mono.
export const AUDIO_SAMPLE_RATE = 16000;
export const AUDIO_BIT_DEPTH = 16;
export const AUDIO_CHANNELS = 1;

export const SILENCE_THRESHOLD = 200;        // RMS below this = silence (0-32768 scale)
export const SILENCE_AFTER_SPEECH_MS = 2000; // auto-stop after 2 s of silence once speech started
export const SILENCE_NO_SPEECH_MS = 5000;    // auto-stop if nothing is said for 5 s
export const MAX_RECORDING_MS = 30000;       // hard cap
export const MAX_AUDIO_BYTES = 1_000_000;    // ~31 s of PCM, under the relay's 2 MB cap

export function rmsOfChunk(chunk: Uint8Array): number {
  let sum = 0;
  const samples = Math.floor(chunk.length / 2);
  for (let i = 0; i < samples; i++) {
    let sample = (chunk[i * 2 + 1] << 8) | chunk[i * 2];
    if (sample & 0x8000) sample -= 0x10000;
    sum += sample * sample;
  }
  return samples > 0 ? Math.sqrt(sum / samples) : 0;
}

export function chunkDurationMs(chunk: Uint8Array): number {
  return (chunk.length / ((AUDIO_BIT_DEPTH / 8) * AUDIO_CHANNELS) / AUDIO_SAMPLE_RATE) * 1000;
}

export function buildWav(chunks: Uint8Array[]): Uint8Array {
  const totalBytes = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(44 + totalBytes);
  const view = new DataView(out.buffer);
  const ascii = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  const byteRate = AUDIO_SAMPLE_RATE * AUDIO_CHANNELS * (AUDIO_BIT_DEPTH / 8);
  ascii(0, 'RIFF'); view.setUint32(4, 36 + totalBytes, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, AUDIO_CHANNELS, true); view.setUint32(24, AUDIO_SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true); view.setUint16(32, AUDIO_CHANNELS * (AUDIO_BIT_DEPTH / 8), true);
  view.setUint16(34, AUDIO_BIT_DEPTH, true);
  ascii(36, 'data'); view.setUint32(40, totalBytes, true);
  let off = 44;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

export type StopReason = 'release' | 'press' | 'silence' | 'max' | 'cancel' | 'background';

export interface MicControl { open(): Promise<boolean>; close(): Promise<boolean> }

export class Recorder {
  chunks: Uint8Array[] = [];
  levels: number[] = [];
  elapsedMs = 0;
  active = false;
  startedAt = 0;
  private bytes = 0;
  private silenceMs = 0;
  private heardSpeech = false;

  constructor(private mic: MicControl, private onAutoStop: (r: StopReason) => void) {}

  // Returns false when the glasses mic could not be opened (e.g. permission denied).
  async start(): Promise<boolean> {
    this.chunks = []; this.levels = []; this.elapsedMs = 0; this.bytes = 0; this.silenceMs = 0; this.heardSpeech = false;
    this.active = true;
    this.startedAt = Date.now();
    let ok = false;
    try { ok = await this.mic.open(); } catch { ok = false; }
    if (!ok) this.active = false;
    return ok;
  }

  // Feed one PCM chunk from audioEvent.audioPcm.
  push(chunk: Uint8Array): void {
    if (!this.active || !chunk || chunk.length === 0) return;
    this.chunks.push(chunk);
    this.bytes += chunk.length;
    const rms = rmsOfChunk(chunk);
    const dur = chunkDurationMs(chunk);
    this.elapsedMs += dur;
    this.levels.push(rms);
    if (this.levels.length > 40) this.levels.shift();
    if (rms < SILENCE_THRESHOLD) this.silenceMs += dur; else { this.silenceMs = 0; this.heardSpeech = true; }
    if (this.heardSpeech && this.silenceMs >= SILENCE_AFTER_SPEECH_MS) this.onAutoStop('silence');
    else if (!this.heardSpeech && this.silenceMs >= SILENCE_NO_SPEECH_MS) this.onAutoStop('silence');
    else if (this.elapsedMs >= MAX_RECORDING_MS || this.bytes >= MAX_AUDIO_BYTES) this.onAutoStop('max');
  }

  // Stop capture; returns WAV bytes or null if nothing usable was captured.
  async stop(): Promise<Uint8Array | null> {
    if (!this.active) return null;
    this.active = false;
    this.mic.close().catch(() => {});
    if (this.bytes === 0 || !this.heardSpeech) return null; // nothing said: skip the STT call
    return buildWav(this.chunks);
  }

  cancel(): void {
    if (!this.active) return;
    this.active = false;
    this.chunks = [];
    this.mic.close().catch(() => {});
  }
}

// Dev-only synthetic speech for the simulator when the box has no mic.
// Only reachable when VITE_MIC_STUB=1 at dev time (tree-shaken from builds).
export function syntheticChunk(t: number): Uint8Array {
  const n = 1600; // 100 ms at 16 kHz, same as the simulator's audio events
  const out = new Uint8Array(n * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < n; i++) {
    const s = Math.round(3000 * Math.sin((2 * Math.PI * 220 * (t * n + i)) / AUDIO_SAMPLE_RATE));
    view.setInt16(i * 2, s, true);
  }
  return out;
}
