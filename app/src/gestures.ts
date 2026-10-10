// Normalize Even Hub SDK events into gestures. Same gestures arrive from the G2
// temple touchpads and the R1 ring (Even docs /docs/build/device-apis).
import { OsEventTypeList, EventSourceType } from '@evenrealities/even_hub_sdk';

export type Gesture =
  | { kind: 'press'; index?: number; itemName?: string; source?: string }
  | { kind: 'double'; source?: string }
  | { kind: 'up'; index?: number; source?: string }
  | { kind: 'down'; index?: number; source?: string }
  | { kind: 'long' }
  | { kind: 'longRelease' }
  | { kind: 'menu'; itemId: number }
  | { kind: 'audio'; pcm: Uint8Array }
  | { kind: 'foregroundEnter' }
  | { kind: 'foregroundExit' }
  | { kind: 'exit' };

function sourceName(s: unknown): string | undefined {
  if (s === EventSourceType.TOUCH_EVENT_FROM_RING || s === 2) return 'ring';
  if (s === EventSourceType.TOUCH_EVENT_FROM_GLASSES_L || s === 3) return 'glasses-l';
  if (s === EventSourceType.TOUCH_EVENT_FROM_GLASSES_R || s === 1) return 'glasses-r';
  return undefined;
}

export function toGesture(event: any): Gesture | null {
  if (!event) return null;
  if (event.audioEvent?.audioPcm) return { kind: 'audio', pcm: event.audioEvent.audioPcm };
  if (event.menuItemClickEvent && event.menuItemClickEvent.itemID != null) return { kind: 'menu', itemId: Number(event.menuItemClickEvent.itemID) };

  const list = event.listEvent;
  const text = event.textEvent;
  const sys = event.sysEvent;
  let type: number | undefined = list?.eventType ?? text?.eventType ?? sys?.eventType;
  const source = sourceName(sys?.eventSource);

  if (sys && !list && !text) {
    switch (type) {
      case OsEventTypeList.FOREGROUND_ENTER_EVENT: return { kind: 'foregroundEnter' };
      case OsEventTypeList.FOREGROUND_EXIT_EVENT: return { kind: 'foregroundExit' };
      case OsEventTypeList.ABNORMAL_EXIT_EVENT:
      case OsEventTypeList.SYSTEM_EXIT_EVENT: return { kind: 'exit' };
      case OsEventTypeList.IMU_DATA_REPORT: return null;
    }
  }
  // SDK quirk (seen in Wondereye): CLICK_EVENT (0) is normalized to undefined.
  if (type == null && (list || text || sys)) type = OsEventTypeList.CLICK_EVENT;

  // List index 0 can also be normalized away; fall back to 0 when a name is present.
  // List index 0 is normalized away too (seen in the simulator: no index and no name),
  // so a list event without an index means row 0.
  const index: number | undefined = list ? (list.currentSelectItemIndex ?? 0) : undefined;
  switch (type) {
    case OsEventTypeList.CLICK_EVENT: return { kind: 'press', index, itemName: list?.currentSelectItemName, source };
    case OsEventTypeList.DOUBLE_CLICK_EVENT: return { kind: 'double', source };
    case OsEventTypeList.SCROLL_TOP_EVENT: return { kind: 'up', index, source };
    case OsEventTypeList.SCROLL_BOTTOM_EVENT: return { kind: 'down', index, source };
    case OsEventTypeList.LONG_PRESS_EVENT: return { kind: 'long' };
    case OsEventTypeList.LONG_PRESS_RELEASE_EVENT: return { kind: 'longRelease' };
  }
  return null;
}
