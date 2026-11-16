import { APP_NAME, APP_VERSION, DOCS_URL, isDesktop } from "../config";
import { foreground } from "../runtime";
import { setSettings, useSettings, type BindTarget, type InputSource } from "../settings";
import { useApp } from "./app-context";
import { DevicePickers, KeyBind, MicTest, NET_NAME, NET_TEXT, PartyMode } from "./common";
import { ProfileForm } from "./NameStep";
import { tip } from "./tips";

async function openInBrowser(url: string) {
  if (isDesktop) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

const GUIDES = [
  { file: "members.md", label: "Members" },
  { file: "clan-leaders.md", label: "Clan leaders and officers" },
  { file: "alliance-admins.md", label: "Alliance admins and event leaders" },
];

const KEYS: { target: BindTarget; label: string; note: string }[] = [
  { target: "broadcast", label: "Broadcast", note: "Event leader and deputies" },
  { target: "command", label: "Command", note: "Leaders" },
  { target: "clan", label: "Clan", note: "Clan leader and officers" },
  { target: "party", label: "Party", note: "Your party, and the lounge" },
  { target: "reserve", label: "Reserve", note: "While you have no party" },
  { target: "muteAll", label: "Mute all", note: "Press once to silence your mic everywhere, again to restore" },
];

const SOURCES: { id: InputSource; label: string; note: string }[] = [
  { id: "poll", label: "Polling", note: "Works with the game running as administrator. Recommended." },
  { id: "hook", label: "Low-level hook", note: "Needs this app to run as administrator if the game does." },
  { id: "raw", label: "Raw Input", note: "Same limit as the hook." },
];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-4 first:border-0 first:pt-0">
      <h2 className="title title-rule text-sm text-gold">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-center gap-2" {...(hint ? tip(hint) : {})}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

export function SettingsPanel({ onClose, onSignOut }: { onClose: () => void; onSignOut: () => void }) {
  const s = useSettings();
  const { info, refreshInfo } = useApp();
  return (
    <div className="absolute inset-0 z-20 flex justify-end bg-black/60" onClick={onClose}>
      <aside className="panel h-full w-full max-w-md overflow-y-auto p-6 flex flex-col gap-5" onClick={(e) => e.stopPropagation()} aria-label="Settings">
        <div className="flex items-center justify-between">
          <h1 className="title text-gold-bright">Settings</h1>
          <button type="button" className="btn btn-quiet text-sm" onClick={onClose}>Close</button>
        </div>

        <Group title="Devices">
          <DevicePickers />
          <MicTest />
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <Toggle label="Echo cancellation" hint="Stops others hearing themselves through your speakers. Leave on unless you use a headset and hear artefacts." checked={s.echoCancellation} onChange={(v) => setSettings({ echoCancellation: v })} />
            <Toggle label="Noise suppression" hint="Removes fans, keyboard and background noise. It also runs before voice activation, so key clicks open the mic less often." checked={s.noiseSuppression} onChange={(v) => setSettings({ noiseSuppression: v })} />
            <Toggle label="Auto gain" hint="Evens out your volume so you are not too quiet or too loud." checked={s.autoGainControl} onChange={(v) => setSettings({ autoGainControl: v })} />
          </div>
        </Group>

        <Group title="Party, Reserve and lounge">
          <PartyMode />
          {s.partyMode === "voice" && (
            <label className="flex items-center gap-3 text-text-muted" {...tip("How long the mic stays open after you stop speaking, so word endings and short pauses are not cut off.")}>
              Keep open after you stop
              <input
                type="range"
                min={100}
                max={1500}
                step={50}
                value={s.vadHoldMs}
                onChange={(e) => setSettings({ vadHoldMs: Number(e.target.value) })}
              />
              <span className="tabular-nums text-text">{s.vadHoldMs} ms</span>
            </label>
          )}
        </Group>

        <Group title="Keys">
          <ul className="flex flex-col gap-2">
            {KEYS.map((k) => (
              <li key={k.target} className="flex items-center gap-3">
                <span className={`w-24 font-medium ${k.target === "muteAll" ? "" : NET_TEXT[k.target]}`}>{k.label}</span>
                <KeyBind target={k.target} label={k.label} />
                <span className="text-xs text-text-muted">{k.note}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-muted">
            Keys are never taken from the game: it still receives them. Only keys bound here are looked at.
            {!isDesktop && " In the browser, keys only work while this tab has focus."}
          </p>
        </Group>

        <Group title="Volume">
          {(Object.keys(NET_NAME) as (keyof typeof NET_NAME)[]).map((net) => (
            <label key={net} className="flex items-center gap-3">
              <span className={`w-24 ${NET_TEXT[net]}`}>{NET_NAME[net]}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={s.netVolume[net]}
                onChange={(e) => setSettings({ netVolume: { ...s.netVolume, [net]: Number(e.target.value) } })}
              />
              <span className="tabular-nums text-text-muted w-10">{Math.round(s.netVolume[net] * 100)}%</span>
            </label>
          ))}
        </Group>

        <Group title="Priority">
          <Toggle label="Lower other nets while a higher one is live" hint="So a Broadcast or Command call cuts through party chatter. Nothing is muted, only made quieter." checked={s.ducking} onChange={(v) => setSettings({ ducking: v })} />
          <label className="flex items-center gap-3 text-text-muted">
            Lowered nets stay at
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={s.duckLevel}
              disabled={!s.ducking}
              aria-label="Volume of lowered nets"
              onChange={(e) => setSettings({ duckLevel: Number(e.target.value) })}
            />
            <span className="tabular-nums text-text w-10">{Math.round(s.duckLevel * 100)}%</span>
          </label>
          <p className="text-xs text-text-muted">
            Order: Broadcast, Command, Clan, Party. On Command, the event leader, deputies and clan leaders also lower the party leaders.
            Nothing is ever muted by this, only made quieter.
          </p>
        </Group>

        <Group title="Sounds">
          <Toggle label="Play a cue when you are moved to another party" checked={s.cues} onChange={(v) => setSettings({ cues: v })} />
          <label className="flex items-center gap-3 text-text-muted">
            Cue volume
            <input type="range" min={0} max={1} step={0.05} value={s.cueVolume} onChange={(e) => setSettings({ cueVolume: Number(e.target.value) })} />
          </label>
        </Group>

        {isDesktop && (
          <Group title="Key capture">
            {SOURCES.map((src) => (
              <label key={src.id} className="flex items-start gap-2">
                <input type="radio" className="mt-1" checked={s.source === src.id} onChange={() => setSettings({ source: src.id })} />
                <span>
                  {src.label}
                  <span className="block text-xs text-text-muted">{src.note}</span>
                </span>
              </label>
            ))}
            <Toggle
              label="Always start as administrator (from the next start)"
              checked={s.alwaysAdmin}
              onChange={(v) => setSettings({ alwaysAdmin: v })}
            />
            <p className="text-xs text-text-muted">
              This app is running as {foreground?.selfElevated ? "administrator" : "a normal user"}. With Polling you should not need administrator rights.
            </p>
          </Group>
        )}

        <Group title="Help">
          <ul className="flex flex-col gap-1">
            {GUIDES.map((g) => (
              <li key={g.file}>
                <button type="button" className="text-gold hover:text-gold-bright cursor-pointer" onClick={() => void openInBrowser(`${DOCS_URL}/${g.file}`)}>
                  Guide: {g.label}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-text-muted">Hover over almost anything in the app for a short explanation.</p>
        </Group>

        <Group title="Account">
          <ProfileForm name={info.user.name} classTag={info.user.classTag ?? ""} onSaved={refreshInfo} submit="Save" />
          <div><button type="button" className="btn btn-quiet text-sm" onClick={onSignOut}>Sign out</button></div>
        </Group>

        <p className="text-center text-xs text-text-muted">{APP_NAME} {APP_VERSION}</p>
      </aside>
    </div>
  );
}
