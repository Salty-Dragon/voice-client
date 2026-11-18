// Key bindings and audio settings stay on this machine; the server never sees them.

import { useSyncExternalStore } from "react";

export type NetKind = "broadcast" | "command" | "clan" | "party" | "reserve" | "lounge";
/** Highest priority first. */
export const NET_ORDER: NetKind[] = ["broadcast", "command", "clan", "party", "reserve", "lounge"];
/** What a key can be bound to. A lounge uses the Party key: both are "talk to the people around me". */
/** "broadcastLock" is a toggle for the event leader: Broadcast stays open for a briefing without a key held. */
/** "chat" (trial) puts the keyboard in the chat line of the strip's window; it is not a talk key. */
export type BindTarget = Exclude<NetKind, "lounge"> | "muteAll" | "broadcastLock" | "chat";
export const bindTargetOf = (net: NetKind): Exclude<NetKind, "lounge"> => (net === "lounge" ? "party" : net);
export type InputSource = "poll" | "hook" | "raw";

export type Settings = {
  wizardDone: boolean;
  inputDeviceId: string;
  outputDeviceId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  /** Windows virtual-key code per target, or null when unbound. */
  bindings: Record<BindTarget, number | null>;
  /** How keys are read while another window has focus. Polling needs no administrator rights. */
  source: InputSource;
  /** Party and Reserve: hold a key, or open the mic on voice. */
  partyMode: "ptt" | "voice";
  /** Level in dBFS at which voice activation opens the mic. */
  vadThresholdDb: number;
  vadHoldMs: number;
  netVolume: Record<NetKind, number>;
  cues: boolean;
  cueVolume: number;
  alwaysAdmin: boolean;
  /** Lower nets get quieter while a higher one is live. */
  ducking: boolean;
  /** How loud a ducked net stays, 0 to 1. */
  duckLevel: number;
  /** Your own volume for individual players, by their id. Missing means 1. */
  playerVolume: Record<string, number>;
  /** Players you have muted for yourself. */
  playerMuted: Record<string, boolean>;
  /** Desktop app: look for a new version at start and every few hours. */
  autoUpdate: boolean;
  /** Desktop app: closing the window hides it in the tray and voice keeps running. */
  closeToTray: boolean;
  /** Desktop app: a small always-on-top window that shows who is speaking. */
  strip: boolean;
};

const DEFAULTS: Settings = {
  wizardDone: false,
  inputDeviceId: "",
  outputDeviceId: "",
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  bindings: { broadcast: null, command: null, clan: null, party: null, reserve: null, muteAll: null, broadcastLock: null, chat: null },
  source: "poll",
  partyMode: "ptt",
  vadThresholdDb: -45,
  vadHoldMs: 400,
  netVolume: { broadcast: 1, command: 1, clan: 1, party: 1, reserve: 1, lounge: 1 },
  cues: true,
  cueVolume: 0.5,
  alwaysAdmin: false,
  ducking: true,
  duckLevel: 0.3,
  playerVolume: {},
  playerMuted: {},
  autoUpdate: true,
  closeToTray: false,
  strip: false,
};

const KEY = "settings.v1";

function read(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
    return {
      ...DEFAULTS,
      ...saved,
      bindings: { ...DEFAULTS.bindings, ...saved.bindings },
      netVolume: { ...DEFAULTS.netVolume, ...saved.netVolume },
    };
  } catch {
    return DEFAULTS;
  }
}

let current = read();
const listeners = new Set<() => void>();

export const getSettings = () => current;

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: settings last for this run only */
  }
  listeners.forEach((l) => l());
}

export function onSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useSettings = () => useSyncExternalStore(onSettings, getSettings);
