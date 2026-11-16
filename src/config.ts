// One place for everything that differs between the desktop app, the web
// fallback and a test setup.

export const isDesktop = "__TAURI_INTERNALS__" in window;

/** Shown in the UI. */
export const APP_NAME: string = import.meta.env.VITE_APP_NAME ?? "Warcryer";

/** The site. In the browser the client is served from it, so it is simply our own origin. */
export const SERVER: string = (isDesktop ? (import.meta.env.VITE_SERVER ?? "https://ignite.v1rtopia.com") : location.origin).replace(/\/$/, "");

export const CONTROL_URL: string = import.meta.env.VITE_CONTROL_URL ?? `${SERVER.replace(/^http/, "ws")}/control`;

export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? "dev";

/** The guides, kept beside the client's source. */
export const DOCS_URL = "https://github.com/Warcryer/client/blob/main/docs";

/** Link scheme that brings a browser sign-in back to the desktop app. */
export const LINK_SCHEME = "warcryer";
