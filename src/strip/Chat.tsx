// TRIAL (0.22.0-chat.1). The chat window the strip opens into: tabs, lines,
// and one line to type in. It is here to find out two things over a real
// game: whether a window like this is pleasant to have on top of it, and
// whether the chat key can take the keyboard and hand it back. Nothing typed
// here goes anywhere: the lines are made up and yours stay on this computer.

import { useEffect, useRef, useState } from "react";
import { t } from "../words";

export type ChatPrefs = { open: boolean; w: number; h: number; alpha: number };
const PREFS_KEY = "strip.chat.v1";
const DEFAULT: ChatPrefs = { open: false, w: 380, h: 290, alpha: 0.82 };
export function loadPrefs(): ChatPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<ChatPrefs>;
    return {
      open: p.open === true,
      w: Math.min(1600, Math.max(260, Number(p.w) || DEFAULT.w)),
      h: Math.min(1200, Math.max(170, Number(p.h) || DEFAULT.h)),
      alpha: Math.min(1, Math.max(0.3, Number(p.alpha) || DEFAULT.alpha)),
    };
  } catch {
    return DEFAULT;
  }
}
export function savePrefs(p: ChatPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* not remembered */
  }
}

type Channel = "party" | "clan" | "all";
type Line = { id: number; who: string | null; text: string; mine?: boolean };
// Tab names: t() where shown.
const TABS: { id: Channel; label: string; tone: string }[] = [
  { id: "party", label: "Party", tone: "text-net-party" },
  { id: "clan", label: "Clan", tone: "text-net-clan" },
  { id: "all", label: "Orders", tone: "text-net-broadcast" },
];
let nextId = 1;
const line = (who: string | null, text: string, mine = false): Line => ({ id: nextId++, who, text, mine });
// Made-up lines, so the window has something in it. t() where shown.
const SAMPLE: Record<Channel, [string | null, string][]> = {
  party: [
    [null, "The operation started. You are in Vanguard."],
    ["Mira", "two coming over the bridge"],
    ["Dorn", "need a res at the gate"],
    ["Mira", "on my way"],
  ],
  clan: [
    ["Kael", "second wave: regroup at the stairs in two minutes"],
    [null, "Dorn was moved to Vanguard."],
  ],
  all: [
    ["Event leader", "Hold the north gate until the bell."],
    ["Event leader", "Mages to the wall, everyone else inside."],
  ],
};
const ARRIVING: [Channel, string, string][] = [
  ["party", "Dorn", "back up, thanks"],
  ["clan", "Kael", "stairs now"],
  ["party", "Mira", "they are pulling back"],
  ["all", "Event leader", "Good. Hold position."],
];

const invoke = (cmd: string, args?: Record<string, unknown>) =>
  import("@tauri-apps/api/core").then(({ invoke }) => invoke<unknown>(cmd, args)).catch(() => undefined);

/** What the chat key did last, in words, for the trial. */
const SAID: Record<string, string> = {
  direct: "The chat key took the keyboard (the ordinary way).",
  attach: "The chat key took the keyboard (the second way).",
  failed: "Windows did not let the chat key take the keyboard. Click the line to type.",
  back: "Back to the game without sending.",
  sent: "Sent. The game has the keyboard again.",
  kept: "Sent, but Windows did not hand the keyboard back: click the game.",
  cancelled: "Not sent. The game has the keyboard again.",
};

export function Chat({ alpha, chatKey }: { alpha: number; chatKey: { how: string; n: number } }) {
  const [tab, setTab] = useState<Channel>("party");
  const [lines, setLines] = useState<Record<Channel, Line[]>>(() => ({
    party: SAMPLE.party.map(([w, x]) => line(w, x)),
    clan: SAMPLE.clan.map(([w, x]) => line(w, x)),
    all: SAMPLE.all.map(([w, x]) => line(w, x)),
  }));
  const [unread, setUnread] = useState<Record<Channel, boolean>>({ party: false, clan: false, all: false });
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [said, setSaid] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const tabNow = useRef(tab);
  tabNow.current = tab;

  // The chat key was pressed. If the window was given the keyboard, the line takes it now.
  useEffect(() => {
    if (!chatKey.n) return;
    if (chatKey.how === "direct" || chatKey.how === "attach") input.current?.focus();
    else input.current?.blur();
    setSaid(SAID[chatKey.how] ?? "");
  }, [chatKey]);

  // Lines arriving while you play, to see what that is like. They never take the keyboard.
  useEffect(() => {
    let n = 0;
    const timer = window.setInterval(() => {
      const [ch, who, what] = ARRIVING[n++ % ARRIVING.length];
      setLines((all) => ({ ...all, [ch]: [...all[ch], line(who, what)].slice(-200) }));
      if (ch !== tabNow.current) setUnread((u) => ({ ...u, [ch]: true }));
    }, 20_000);
    return () => window.clearInterval(timer);
  }, []);

  // The newest line stays in view.
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [lines, tab]);

  const done = (sent: boolean) => {
    input.current?.blur();
    void invoke("chat_done").then((ok) => setSaid(SAID[sent ? (ok ? "sent" : "kept") : "cancelled"]));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-chat>
      <div className="truncate border-y border-gold-dim/40 px-2 py-0.5 text-[12px] text-net-broadcast" data-chat-order>
        Order: hold the north gate. Regroup at the stairs 21:40.
      </div>
      <div className="flex shrink-0 items-center gap-1 px-1 pt-1" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            className={`cursor-pointer rounded-sm px-2 text-[11px] font-semibold uppercase tracking-wider ${tab === x.id ? `${x.tone} bg-white/10` : "text-text-muted hover:text-text"}`}
            onClick={() => {
              setTab(x.id);
              setUnread((u) => ({ ...u, [x.id]: false }));
            }}
          >
            {t(x.label)}
            {unread[x.id] && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-gold-bright align-middle" role="img" aria-label="New lines" />}
          </button>
        ))}
      </div>
      <ol ref={list} className="min-h-0 flex-1 overflow-y-auto px-2 py-1 leading-[19px]" data-chat-lines>
        {lines[tab].map((l) =>
          l.who === null ? (
            <li key={l.id} className="text-[12px] italic text-text-muted">{t(l.text)}</li>
          ) : (
            <li key={l.id} className="break-words">
              <span className={`mr-1.5 font-semibold ${l.mine ? "text-gold-bright" : "text-gold"}`}>{l.who}</span>
              {l.mine ? l.text : t(l.text)}
            </li>
          ),
        )}
      </ol>
      <form
        className="flex shrink-0 items-center gap-1 px-1 pb-1"
        onSubmit={(e) => {
          e.preventDefault();
          const said = text.trim();
          if (said) setLines((all) => ({ ...all, [tab]: [...all[tab], line("You", said.slice(0, 300), true)] }));
          setText("");
          done(!!said);
        }}
      >
        <input
          ref={input}
          className={`min-w-0 flex-1 rounded-sm border bg-black/40 px-2 py-0.5 text-text outline-none ${typing ? "border-gold-bright" : "border-line"}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => {
            setTyping(true);
            void invoke("chat_typing", { on: true });
          }}
          onBlur={() => {
            setTyping(false);
            void invoke("chat_typing", { on: false });
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              done(false);
            }
          }}
          maxLength={300}
          placeholder={typing ? "Enter sends, Esc gives up" : `Write to ${t(TABS.find((x) => x.id === tab)!.label)}`}
          aria-label="Chat line"
          autoComplete="off"
          spellCheck={false}
        />
      </form>
      <div className="shrink-0 truncate px-2 pb-1 text-[10px] text-text-muted" data-chat-said>
        {said || `Trial: made-up lines, and what you type stays on this computer. See-through ${Math.round(alpha * 100)}%.`}
      </div>
    </div>
  );
}
