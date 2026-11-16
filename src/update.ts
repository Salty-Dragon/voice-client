// App updates (desktop only). The app asks the server whether a newer version
// exists, downloads it, checks its signature against the key built into the
// app, and installs it.
//
// At start an update is installed straight away, before the player is in
// voice. While the app is running nothing is installed without a click: a
// banner offers "Restart to update".

import { useSyncExternalStore } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { isDesktop } from "./config";
import { engine } from "./runtime";
import { getSettings } from "./settings";

export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "current"; at: number }
  | { phase: "downloading"; version: string; percent: number | null }
  /** Downloaded and verified. `stalled` means installing it at start did not take effect last time. */
  | { phase: "ready"; version: string; stalled: boolean }
  | { phase: "installing"; version: string }
  | { phase: "failed"; message: string };

const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;
/** How long the start screen waits for the server before carrying on. */
const START_TIMEOUT_MS = 4000;
/** An install at start is not repeated for the same version within this time. */
const RETRY_AFTER_MS = 30 * 60 * 1000;
const ATTEMPT_KEY = "update.attempt";

let state: UpdateState = { phase: "idle" };
let pending: Update | null = null;
let busy = false;
const listeners = new Set<() => void>();

function set(next: UpdateState) {
  state = next;
  listeners.forEach((l) => l());
}

export const getUpdateState = () => state;
export const useUpdate = () =>
  useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, getUpdateState);

function attemptedRecently(version: string): boolean {
  try {
    const a = JSON.parse(localStorage.getItem(ATTEMPT_KEY) ?? "null") as { version: string; at: number } | null;
    return !!a && a.version === version && Date.now() - a.at < RETRY_AFTER_MS;
  } catch {
    return false;
  }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Looks for an update and downloads it. Resolves true when one is ready to install. */
export async function checkForUpdate(timeoutMs = 30000): Promise<boolean> {
  if (!isDesktop) return false;
  if (state.phase === "ready") return true;
  if (busy) return false;
  busy = true;
  try {
    set({ phase: "checking" });
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check({ timeout: timeoutMs });
    if (!update) {
      set({ phase: "current", at: Date.now() });
      return false;
    }
    let total = 0;
    let got = 0;
    set({ phase: "downloading", version: update.version, percent: null });
    await update.download((e) => {
      if (e.event === "Started") total = e.data.contentLength ?? 0;
      else if (e.event === "Progress") {
        got += e.data.chunkLength;
        set({ phase: "downloading", version: update.version, percent: total > 0 ? Math.min(100, Math.round((got / total) * 100)) : null });
      }
    });
    pending = update;
    set({ phase: "ready", version: update.version, stalled: attemptedRecently(update.version) });
    return true;
  } catch (e) {
    set({ phase: "failed", message: message(e) });
    return false;
  } finally {
    busy = false;
  }
}

/**
 * Installs the downloaded update. Windows closes the app while the installer
 * runs and starts it again afterwards, so this normally does not return.
 */
export async function installUpdate(): Promise<void> {
  if (!pending || state.phase !== "ready") return;
  const version = state.version;
  set({ phase: "installing", version });
  try {
    localStorage.setItem(ATTEMPT_KEY, JSON.stringify({ version, at: Date.now() }));
  } catch {
    /* without storage the repeat guard is skipped */
  }
  try {
    await engine.stop(); // leave voice cleanly rather than vanish mid-sentence
    await pending.install();
  } catch (e) {
    set({ phase: "failed", message: message(e) });
  }
}

/**
 * Run once before the app's first screen. Resolves when the app should carry
 * on: no update, updates switched off, the server too slow, or an install that
 * did not happen. When an update installs, the app is closed before this resolves.
 */
export async function updateAtStart(): Promise<void> {
  if (!isDesktop || !getSettings().autoUpdate) return;
  window.setInterval(() => {
    if (getSettings().autoUpdate) void checkForUpdate();
  }, CHECK_EVERY_MS);

  const found = checkForUpdate(START_TIMEOUT_MS);
  // Do not hold the start screen for a slow server; a download that has begun is worth waiting for.
  const waited = await Promise.race([
    found,
    new Promise<"slow">((resolve) =>
      window.setTimeout(() => {
        if (state.phase === "checking") resolve("slow");
      }, START_TIMEOUT_MS + 500),
    ),
  ]);
  if (waited !== true || state.phase !== "ready") return;
  // If installing this version at start did not take effect a moment ago, do
  // not loop: carry on, and leave the banner for the player to try by hand.
  if (state.stalled) return;
  await installUpdate();
}
