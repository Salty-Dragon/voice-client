// The main window's side of the compact strip: it keeps the strip's window
// open or closed to match the setting, and sends it what to show.

import { isDesktop } from "../config";
import { getSettings, onSettings, setSettings } from "../settings";
import { CHANNEL, POSITION_KEY, type FromStrip, type StripState, type ToStrip } from "./feed";

let channel: BroadcastChannel | null = null;
let latest: StripState = { where: null, lines: [], muted: false, locked: false };
let sent = "";
let shown: boolean | null = null;

const post = () => channel?.postMessage({ type: "state", state: latest } satisfies ToStrip);

/** Called by the app whenever something the strip shows may have changed. */
export function publishStrip(state: StripState) {
  latest = state;
  if (!channel || !getSettings().strip) return;
  const key = JSON.stringify(state);
  if (key === sent) return;
  sent = key;
  post();
}

async function syncWindow() {
  const want = getSettings().strip;
  if (want === shown) return;
  shown = want;
  let x: number | null = null;
  let y: number | null = null;
  try {
    const pos = JSON.parse(localStorage.getItem(POSITION_KEY) ?? "null") as { x: number; y: number } | null;
    // Only a position that is on a screen now: a monitor may have been unplugged since.
    if (pos && pos.x >= -50 && pos.y >= -10 && pos.x < screen.availWidth + (screen as Screen & { availLeft?: number }).availLeft! + 4000 && pos.y < 4000) ({ x, y } = pos);
  } catch {
    /* open it where Windows puts it */
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_strip", { show: want, x, y });
  if (want) sent = "";
}

/** Starts keeping the strip in step with the setting. Desktop app only. */
export function startStrip() {
  if (!isDesktop || channel) return;
  channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (e: MessageEvent<FromStrip>) => {
    if (e.data?.type === "hello") post();
    else if (e.data?.type === "close") setSettings({ strip: false });
  };
  // The strip treats silence as "the app has gone", so say something regularly.
  window.setInterval(() => {
    if (getSettings().strip) post();
  }, 1500);
  void syncWindow().catch(() => {});
  onSettings(() => void syncWindow().catch(() => {}));
}
