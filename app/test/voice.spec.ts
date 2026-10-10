import { describe, expect, it, vi } from 'vitest';
import { Recorder, buildWav, rmsOfChunk, syntheticChunk, SILENCE_AFTER_SPEECH_MS, SILENCE_NO_SPEECH_MS, MAX_RECORDING_MS } from '../src/voice';

const mic = () => ({ open: vi.fn(async () => true), close: vi.fn(async () => true) });
it('start reports a denied mic', async () => {
  const r = new Recorder({ open: async () => false, close: async () => true }, vi.fn());
  expect(await r.start()).toBe(false); expect(r.active).toBe(false);
});
const silence = () => new Uint8Array(3200);

describe('voice', () => {
  it('builds a 16 kHz mono 16-bit WAV', () => {
    const wav = buildWav([new Uint8Array(3200), new Uint8Array(3200)]);
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(6400);
    expect(wav.length).toBe(6444);
  });
  it('rms: silence 0, tone loud', () => {
    expect(rmsOfChunk(silence())).toBe(0);
    expect(rmsOfChunk(syntheticChunk(0))).toBeGreaterThan(1000);
  });
  it('auto-stops after silence following speech', async () => {
    const stop = vi.fn(); const r = new Recorder(mic(), stop); await r.start();
    for (let i = 0; i < 10; i++) r.push(syntheticChunk(i));
    for (let i = 0; i < SILENCE_AFTER_SPEECH_MS / 100 - 1; i++) r.push(silence());
    expect(stop).not.toHaveBeenCalled();
    r.push(silence());
    expect(stop).toHaveBeenCalledWith('silence');
    const wav = await r.stop();
    expect(wav!.length).toBeGreaterThan(44);
  });
  it('times out when nothing is said', async () => {
    const stop = vi.fn(); const r = new Recorder(mic(), stop); await r.start();
    for (let i = 0; i < SILENCE_NO_SPEECH_MS / 100; i++) r.push(silence());
    expect(stop).toHaveBeenCalledWith('silence');
  });
  it('caps recording length', async () => {
    const stop = vi.fn(); const r = new Recorder(mic(), stop); await r.start();
    for (let i = 0; i < MAX_RECORDING_MS / 100; i++) r.push(syntheticChunk(i));
    expect(stop).toHaveBeenCalledWith('max');
  });
  it('cancel closes the mic and drops audio', async () => {
    const m = mic(); const r = new Recorder(m, vi.fn()); await r.start();
    r.push(syntheticChunk(0)); r.cancel();
    expect(m.close).toHaveBeenCalled();
    expect(await r.stop()).toBeNull();
  });
});
