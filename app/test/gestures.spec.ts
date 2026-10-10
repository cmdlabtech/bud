import { describe, expect, it } from 'vitest';
import { toGesture } from '../src/gestures';

describe('gestures (touchpad and R1 ring map to the same gestures)', () => {
  it('CLICK normalized to undefined is a press, on text, list, and sys events', () => {
    expect(toGesture({ textEvent: { containerName: 'bot2' } })).toMatchObject({ kind: 'press' });
    expect(toGesture({ listEvent: { currentSelectItemName: 'Needs you', currentSelectItemIndex: 0 } })).toMatchObject({ kind: 'press', index: 0 });
    expect(toGesture({ listEvent: { currentSelectItemName: 'Needs you' } })).toMatchObject({ kind: 'press', index: 0 });
    expect(toGesture({ sysEvent: { eventSource: 2 } })).toMatchObject({ kind: 'press', source: 'ring' });
    // Captured in the simulator: press on list row 0 carries neither index nor name.
    expect(toGesture({ listEvent: { containerID: 2, containerName: 'needs' } })).toMatchObject({ kind: 'press', index: 0 });
    // Captured in the simulator: press on a text container is a sysEvent with only eventSource.
    expect(toGesture({ sysEvent: { eventSource: 1 } })).toMatchObject({ kind: 'press', source: 'glasses-r' });
  });
  it('swipes keep the list index', () => {
    expect(toGesture({ listEvent: { eventType: 2, currentSelectItemIndex: 4 } })).toMatchObject({ kind: 'down', index: 4 });
    expect(toGesture({ listEvent: { eventType: 1, currentSelectItemIndex: 3 } })).toMatchObject({ kind: 'up', index: 3 });
    expect(toGesture({ textEvent: { eventType: 1 } })).toMatchObject({ kind: 'up' });
  });
  it('double press from glasses L, glasses R, and ring', () => {
    expect(toGesture({ sysEvent: { eventType: 3, eventSource: 1 } })).toMatchObject({ kind: 'double', source: 'glasses-r' });
    expect(toGesture({ sysEvent: { eventType: 3, eventSource: 3 } })).toMatchObject({ kind: 'double', source: 'glasses-l' });
    expect(toGesture({ sysEvent: { eventType: 3, eventSource: 2 } })).toMatchObject({ kind: 'double', source: 'ring' });
    expect(toGesture({ textEvent: { eventType: 3 } })).toMatchObject({ kind: 'double' });
  });
  it('long press and release arrive on sysEvent without a source', () => {
    expect(toGesture({ sysEvent: { eventType: 9 } })).toEqual({ kind: 'long' });
    expect(toGesture({ sysEvent: { eventType: 10 } })).toEqual({ kind: 'longRelease' });
  });
  it('lifecycle, menu, audio', () => {
    expect(toGesture({ sysEvent: { eventType: 4 } })).toEqual({ kind: 'foregroundEnter' });
    expect(toGesture({ sysEvent: { eventType: 5 } })).toEqual({ kind: 'foregroundExit' });
    expect(toGesture({ sysEvent: { eventType: 7 } })).toEqual({ kind: 'exit' });
    expect(toGesture({ sysEvent: { eventType: 6 } })).toEqual({ kind: 'exit' });
    expect(toGesture({ menuItemClickEvent: { itemID: 31 } })).toEqual({ kind: 'menu', itemId: 31 });
    const pcm = new Uint8Array(3200);
    expect(toGesture({ audioEvent: { audioPcm: pcm } })).toEqual({ kind: 'audio', pcm });
    expect(toGesture(null)).toBeNull();
    expect(toGesture({ sysEvent: { eventType: 8 } })).toBeNull();
  });
});
