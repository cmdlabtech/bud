// PageSpec -> Even Hub SDK calls. First page uses createStartUpPageContainer,
// later pages rebuildPageContainer; small changes use textContainerUpgrade (no flicker).
import {
  CreateStartUpPageContainer, ListContainerProperty, ListItemContainerProperty, MenuContainerProperty,
  MenuItemProperty, RebuildPageContainer, TextContainerProperty, TextContainerUpgrade, type EvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import type { PageSpec } from './screens';

export interface Display {
  show(page: PageSpec): Promise<void>;
  update(name: string, content: string): Promise<void>;
  readonly current: PageSpec | null;
}

export function toSdk(page: PageSpec) {
  const textObject: TextContainerProperty[] = [];
  const listObject: ListContainerProperty[] = [];
  page.containers.forEach((c, i) => {
    const base = { xPosition: c.x, yPosition: c.y, width: c.w, height: c.h, containerID: i + 1, containerName: c.name, isEventCapture: c.capture ? 1 : 0, paddingLength: c.pad ?? 4 };
    if (c.kind === 'text') {
      textObject.push(new TextContainerProperty({ ...base, borderWidth: c.border ?? 0, borderColor: c.bcolor ?? 0, borderRadius: c.border ? 6 : 0, content: c.content || ' ', textColor: c.color ?? 4 }));
    } else {
      listObject.push(new ListContainerProperty({ ...base, borderWidth: 0, borderColor: 0, borderRadius: 0, itemContainer: new ListItemContainerProperty({ itemCount: c.items.length, itemName: c.items, isItemSelectBorderEn: 1 }) }));
    }
  });
  const menuObject = new MenuContainerProperty({ menuItems: page.menu.map(m => new MenuItemProperty({ itemID: m.id, itemName: m.label })) });
  return { containerTotalNum: page.containers.length, textObject, listObject, menuObject };
}

export class GlassDisplay implements Display {
  current: PageSpec | null = null;
  private started = false;
  private queue: Promise<void> = Promise.resolve();
  constructor(private bridge: EvenAppBridge) {}

  show(page: PageSpec): Promise<void> {
    this.queue = this.queue.then(async () => {
      const payload = toSdk(page);
      if (!this.started) {
        const r = await this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(payload));
        this.started = true;
        // Non-zero (e.g. the page already exists after a WebView reload): rebuild instead,
        // otherwise the glasses keep showing the previous session's page.
        if (r !== 0) {
          console.warn('[render] startup result', r, '- rebuilding');
          await this.bridge.rebuildPageContainer(new RebuildPageContainer(payload));
        }
      } else {
        const ok = await this.bridge.rebuildPageContainer(new RebuildPageContainer(payload));
        if (!ok) console.warn('[render] rebuild failed', page.key);
      }
      this.current = page;
    }).catch(err => console.warn('[render] show error', err));
    return this.queue;
  }

  update(name: string, content: string): Promise<void> {
    this.queue = this.queue.then(async () => {
      const page = this.current;
      if (!page) return;
      const idx = page.containers.findIndex(c => c.name === name && c.kind === 'text');
      if (idx < 0) return;
      const c = page.containers[idx];
      if (c.kind === 'text') c.content = content;
      await this.bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: idx + 1, containerName: name, content: content || ' ' }));
    }).catch(err => console.warn('[render] update error', err));
    return this.queue;
  }
}
