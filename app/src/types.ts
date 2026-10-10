// One bot the user set up on the phone page. Lives only in the Even app's local storage on the phone.
export interface BotConfig { id: string; name: string; url: string; key: string }
// Hub mode (1.0.2): one webhook (the user's hub bot's Glass inbox) plus a list of display names
// from a pasted bot list code. Names only; the hub forwards each task to the named teammate.
export interface HubConfig { url: string; key: string }
export interface Settings { bots: BotConfig[]; xaiKey: string; hub?: HubConfig | null; hubBots?: string[] }
// One glasses list entry. Hub-routed entries share the hub's webhook and carry a target name.
export interface Route extends BotConfig { target?: string; viaHub?: boolean }
