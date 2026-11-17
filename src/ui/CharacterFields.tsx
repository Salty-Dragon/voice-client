import type { GameOptions } from "../api";

/** Class and level pickers, from the alliance's own lists. Classes are grouped by what they do in a party. */
export function CharacterFields({
  game,
  className,
  levelBand,
  onClass,
  onLevel,
  none = "Not chosen",
}: {
  game: GameOptions;
  className: string;
  levelBand: string;
  onClass: (v: string) => void;
  onLevel: (v: string) => void;
  /** Label of the empty choice. */
  none?: string;
}) {
  const loose = game.classes.filter((c) => c.role === null);
  return (
    <div className="flex flex-wrap gap-3">
      {game.classes.length > 0 && <label className="flex flex-col gap-1 text-text-muted">
        Class
        <select className="field" value={className} onChange={(e) => onClass(e.target.value)}>
          <option value="">{none}</option>
          {game.roles.map((role) => (
            <optgroup key={role} label={role}>
              {game.classes.filter((c) => c.role === role).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </optgroup>
          ))}
          {loose.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
      </label>}
      {/* An alliance that keeps no bands is not asked for one. */}
      {game.levelBands.length > 0 && <label className="flex flex-col gap-1 text-text-muted">
        {game.levelLabel ?? "Level"}
        <select className="field" value={levelBand} onChange={(e) => onLevel(e.target.value)} aria-label={game.levelLabel ?? "Level"}>
          <option value="">{none}</option>
          {game.levelBands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </label>}
    </div>
  );
}
