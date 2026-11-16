// The long-lived pieces, created once: the voice engine and the key input.

import { isDesktop } from "./config";
import { VoiceEngine } from "./engine";
import { createInput, type Foreground, type InputBackend } from "./input";
import { getSettings, onSettings, type NetKind } from "./settings";

export const engine = new VoiceEngine();

let input: InputBackend | null = null;
let lastBindings = "";
let lastSource = "";

function push() {
  if (!input) return;
  const s = getSettings();
  const bindings = Object.entries(s.bindings)
    .filter((e): e is [string, number] => e[1] !== null)
    .map(([net, code]) => ({ net, code }));
  const key = JSON.stringify(bindings);
  if (key !== lastBindings) {
    lastBindings = key;
    void input.setBindings(bindings);
  }
  if (s.source !== lastSource) {
    lastSource = s.source;
    void input.setSource(s.source);
  }
}

export let foreground: Foreground | null = null;
let triedElevate = false;

export const inputReady: Promise<InputBackend> = createInput(isDesktop).then((i) => {
  input = i;
  i.onPtt((e) => {
    if (e.net === "muteAll") {
      if (e.down) engine.toggleMuteAll();
    } else {
      engine.ptt(e.net as NetKind, e.down);
    }
  });
  i.onForeground((f) => {
    foreground = f;
    // "Always start as administrator": relaunch elevated once per start. If
    // the Windows prompt is declined the app carries on as a normal user.
    if (getSettings().alwaysAdmin && !f.selfElevated && !triedElevate) {
      triedElevate = true;
      i.restartAsAdmin().catch(() => {});
    }
  });
  push();
  onSettings(push);
  return i;
});

/** Resolves with the next key or mouse button the player presses. */
export async function captureKey(): Promise<number> {
  return (await inputReady).capture();
}
