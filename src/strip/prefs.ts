// How the chat window was left: open or folded back into the strip, its size,
// and how see-through it is. Kept on this computer. The main window writes
// here too, to open the chat window from a button of its own.

export type ChatPrefs = { open: boolean; w: number; h: number; alpha: number };
export const PREFS_KEY = "strip.chat.v1";
const DEFAULT: ChatPrefs = { open: false, w: 380, h: 290, alpha: 0.82 };

export function loadPrefs(): ChatPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<ChatPrefs>;
    return {
      open: p.open === true,
      w: Math.min(1600, Math.max(260, Number(p.w) || DEFAULT.w)),
      h: Math.min(1200, Math.max(170, Number(p.h) || DEFAULT.h)),
      alpha: Math.min(1, Math.max(0.3, Number(p.alpha) || DEFAULT.alpha)),
    };
  } catch {
    return DEFAULT;
  }
}
export function savePrefs(p: ChatPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* not remembered */
  }
}
