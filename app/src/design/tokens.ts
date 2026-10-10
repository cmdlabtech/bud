// Riri's layout tokens (design/render_sheet.py, Oct 10 2026). Change here to restyle.
// textColor: 4 focus, 3 secondary, 2 metadata, 1 gesture hints. 0 is never used.
export const W = 576;
export const H = 288;
export const HDR_H = 32;
export const FOOT_Y = 258;
export const FOOT_H = 30;
export const BRIGHT = { focus: 4, secondary: 3, meta: 2, hint: 1 } as const;
export const BORDER = { reply: 6, draft: 10, header: 8 } as const;
export const HOME_LIST_W = 516;     // list column; counter gets 60 px ("20/20" wrapped at 48 px in the simulator)
export const HOME_BOT_SLOTS = 18;   // "Needs you" + 18 bots + "More bots (N)" = 20 list items max
