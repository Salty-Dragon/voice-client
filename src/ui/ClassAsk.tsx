// A player confirms their name before they are in any alliance, and the lists
// of classes and levels belong to an alliance. So the question "which class do
// you play?" can only be asked once they are in one. This bar asks it, once
// per run of the app, until it is answered. It is a bar and not a step: voice
// and everything else go on underneath.

import { useState } from "react";
import { rpc } from "../api";
import { useGame } from "../game";
import { t } from "../words";
import { useAct, useApp } from "./app-context";
import { CharacterFields } from "./CharacterFields";

export function ClassAsk() {
  const { info, refreshInfo } = useApp();
  const game = useGame();
  const act = useAct();
  const [later, setLater] = useState(false);
  const [open, setOpen] = useState(false);
  const [cls, setCls] = useState("");
  const [band, setBand] = useState(info.user.levelBand ?? "");
  if (later || !info.alliance || !game || game.classes.length === 0 || info.user.className) return null;
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-gold-dim bg-bg-2 px-4 py-2" role="status" data-class-ask>
      <span className="self-center">
        Which class do you play?
        <span className="ml-2 text-text-muted">{t("Organisers see it when they build parties, and the board works out from it what each party still needs.")}</span>
      </span>
      {open ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act.run(() => rpc("profile.save", { name: info.user.name, className: cls, levelBand: band }))) refreshInfo();
          }}
        >
          <CharacterFields game={game} className={cls} levelBand={band} onClass={setCls} onLevel={setBand} />
          <button className="btn text-sm" disabled={act.busy || !cls}>Save</button>
          {act.error && <span className="text-danger" role="alert">{act.error}</span>}
        </form>
      ) : (
        <button type="button" className="btn text-sm" onClick={() => setOpen(true)}>Choose class</button>
      )}
      <button type="button" className="btn btn-quiet text-sm" onClick={() => setLater(true)}>Later</button>
    </div>
  );
}
