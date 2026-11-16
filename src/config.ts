// One place for everything that differs between the desktop app, the web
// fallback and a test setup.

export const isDesktop = "__TAURI_INTERNALS__" in window;

/** Shown in the UI. Kept out of code identifiers so a rename is one setting. */
export const APP_NAME: string = import.meta.env.VITE_APP_NAME ?? "Alliance Voice";

/** The site. In the browser the client is served from it, so it is simply our own origin. */
export const SERVER: string = (isDesktop ? (import.meta.env.VITE_SERVER ?? "https://ignite.v1rtopia.com") : location.origin).replace(/\/$/, "");

export const CONTROL_URL: string = import.meta.env.VITE_CONTROL_URL ?? `${SERVER.replace(/^http/, "ws")}/control`;

/** Link scheme that brings a browser sign-in back to the desktop app. */
export const LINK_SCHEME = "ignite-voice";
