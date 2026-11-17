// The alliance's game setup: its classes, roles, party size, level bands and
// event types. It lives on the server, where the alliance's admins edit it,
// so it can change without a new version of the app. It is fetched once and
// kept, and fetched again when the server says something wider than one
// operation has changed (an admin saving the setup is such a change).

import { useSyncExternalStore } from "react";
import { rpc, type GameOptions } from "./api";
import { setWords } from "./words";

let cached: GameOptions | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  if (!cached) void load();
  return () => listeners.delete(l);
};

function load(): Promise<void> {
  loading ??= rpc<GameOptions>("game.options")
    .then((g) => {
      // The same lists again are not a change: do not redraw every screen for nothing.
      if (JSON.stringify(g) !== JSON.stringify(cached)) {
        cached = g;
        // Before anything redraws: every sentence drawn from here on is said in the alliance's words.
        setWords(g.words);
        listeners.forEach((l) => l());
      }
    })
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Fetches the setup again. Called when the server reports a wide change. */
export const refreshGame = (): void => void load();

/** The setup, or null while it loads (or if the server is too old to have it). */
export const useGame = (): GameOptions | null => useSyncExternalStore(subscribe, () => cached);

/** What a class does in a party ("Buffer", "Healer", ...), or null if unknown. */
export const roleOf = (game: GameOptions | null, className: string | null | undefined): string | null =>
  (className && game?.classes.find((c) => c.name === className)?.role) || null;

/** How many players make a full party; nine until the server says otherwise. */
export const partySizeOf = (game: GameOptions | null): number => game?.partySize ?? 9;
