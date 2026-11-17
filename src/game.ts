// The alliance's classes, roles and level bands. They live on the server, so
// the lists can change without a new version of the app; they are fetched once
// per run and kept.

import { useEffect, useState } from "react";
import { rpc, type GameOptions } from "./api";

let cached: GameOptions | null = null;
let loading: Promise<GameOptions> | null = null;

function load(): Promise<GameOptions> {
  loading ??= rpc<GameOptions>("game.options")
    .then((g) => (cached = g))
    .catch((e) => {
      loading = null; // try again next time something asks
      throw e;
    });
  return loading;
}

/** The lists, or null while they load (or if the server is too old to have them). */
export function useGame(): GameOptions | null {
  const [game, setGame] = useState(cached);
  useEffect(() => {
    if (cached) return;
    let live = true;
    load().then((g) => live && setGame(g)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return game;
}

/** What a class does in a party ("Buffer", "Healer", ...), or null if unknown. */
export const roleOf = (game: GameOptions | null, className: string | null | undefined): string | null =>
  (className && game?.classes.find((c) => c.name === className)?.role) || null;
