// One bot the user set up on the phone page. Lives only in the Even app's local storage on the phone.
export interface BotConfig { id: string; name: string; url: string; key: string }
export interface Settings { bots: BotConfig[]; xaiKey: string }
