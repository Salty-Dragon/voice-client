// Push-to-talk input. In the desktop app the Rust side owns a system-wide
// hook and only reports keys that are bound to a net. In a browser the same
// interface is backed by window key events, which only fire while the tab has
// focus.

import type { NetId } from "./engine";
import { mouseButtonToVk } from "./keys";

export type Binding = { net: NetId; code: number };
export type InputSource = "hook" | "raw" | "poll";

export type PttEvent = { net: NetId; down: boolean; /** epoch ms at capture */ t: number };
export type Foreground = {
  selfElevated: boolean;
  /** null = could not be read, which from a normal process usually means elevated */
  elevated: boolean | null;
  exe: string;
};
export type InputDiag = { hook: number; raw: number; poll: number };

export interface InputBackend {
  readonly desktop: boolean;
  setBindings(bindings: Binding[]): Promise<void>;
  setSource(source: InputSource): Promise<void>;
  /** Resolves with the next key or mouse button pressed. */
  capture(): Promise<number>;
  onPtt(cb: (e: PttEvent) => void): void;
  onForeground(cb: (f: Foreground) => void): void;
  onDiag(cb: (d: InputDiag) => void): void;
  restartAsAdmin(): Promise<void>;
}

export const isDesktop = "__TAURI_INTERNALS__" in window;

async function desktopBackend(): Promise<InputBackend> {
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen, once } = await import("@tauri-apps/api/event");
  return {
    desktop: true,
    setBindings: (bindings) => invoke("set_bindings", { bindings }),
    setSource: (source) => invoke("set_source", { source }),
    capture: () =>
      new Promise<number>((resolve, reject) => {
        once<{ code: number }>("captured", (e) => resolve(e.payload.code))
          .then(() => invoke("capture_next"))
          .catch(reject);
      }),
    onPtt: (cb) => void listen<PttEvent>("ptt", (e) => cb(e.payload)),
    onForeground: (cb) => void listen<Foreground>("foreground", (e) => cb(e.payload)),
    onDiag: (cb) => void listen<InputDiag>("input-diag", (e) => cb(e.payload)),
    restartAsAdmin: () => invoke("restart_as_admin"),
  };
}

function browserBackend(): InputBackend {
  let bindings: Binding[] = [];
  let pttCb: (e: PttEvent) => void = () => {};
  let capturing: ((code: number) => void) | null = null;
  const pressed = new Set<number>();

  const handle = (code: number, down: boolean, ev: Event) => {
    if (down && capturing) {
      ev.preventDefault();
      const done = capturing;
      capturing = null;
      done(code);
      return;
    }
    if (down === pressed.has(code)) return; // auto-repeat
    if (down) pressed.add(code);
    else pressed.delete(code);
    for (const b of bindings) {
      if (b.code === code) pttCb({ net: b.net, down, t: Date.now() });
    }
  };

  const typing = (e: Event) => {
    const el = e.target as HTMLElement | null;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  };

  window.addEventListener("keydown", (e) => {
    if (!typing(e) || capturing) handle(e.keyCode, true, e);
  });
  window.addEventListener("keyup", (e) => handle(e.keyCode, false, e));
  window.addEventListener("mousedown", (e) => {
    const vk = mouseButtonToVk(e.button);
    if (vk !== null) handle(vk, true, e);
  });
  window.addEventListener("mouseup", (e) => {
    const vk = mouseButtonToVk(e.button);
    if (vk !== null) handle(vk, false, e);
  });
  // Losing focus loses the key-up, so release everything.
  window.addEventListener("blur", () => {
    for (const code of [...pressed]) handle(code, false, new Event("blur"));
  });

  return {
    desktop: false,
    setBindings: async (b) => {
      bindings = b;
    },
    setSource: async () => {},
    capture: () => new Promise<number>((resolve) => (capturing = resolve)),
    onPtt: (cb) => {
      pttCb = cb;
    },
    onForeground: () => {},
    onDiag: () => {},
    restartAsAdmin: async () => {},
  };
}

export function createInput(): Promise<InputBackend> {
  return isDesktop ? desktopBackend() : Promise.resolve(browserBackend());
}
