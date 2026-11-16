// Window behaviour that lives on the native side of the desktop app.

import { isDesktop } from "./config";
import { getSettings, onSettings } from "./settings";

let last: boolean | null = null;

async function push() {
  const want = getSettings().closeToTray;
  if (want === last) return;
  last = want;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_close_to_tray", { enabled: want });
}

/** Keeps the native side in step with the "keep running in the tray" setting. */
export function startShell() {
  if (!isDesktop) return;
  void push().catch(() => {});
  onSettings(() => void push().catch(() => {}));
}
