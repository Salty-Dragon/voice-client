// The operation's text chat as a panel: a tab per net the player is on, its
// lines, and one line to write in. The Voice tab shows it, and so does the
// chat window the compact strip opens into; both are handed the same view
// (src/chat.ts) and the same four actions.

import { useEffect, useRef, useState } from "react";
import type { ChatChannel, ChatLineView, ChatView } from "../chat";
import { t } from "../words";
import { NET_TEXT } from "./net-style";

export type ChatActions = {
  say(room: string, text: string): void;
  /** Which channel is on screen now; null when the panel goes away. */
  watch(room: string | null): void;
  remove(id: number): void;
  mute(userId: number, on: boolean): void;
};

const hhmm = (at: string) => {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function ChatPanel({
  view,
  act,
  compact = false,
  chatKey,
  onTyping,
  onDone,
}: {
  view: ChatView;
  act: ChatActions;
  /** The chat window over the game: smaller, no times, nothing that needs a careful mouse. */
  compact?: boolean;
  /** The chat window only: what the chat key did last (the native side has put the window in front, or says it could not). */
  chatKey?: { how: string; n: number };
  /** The chat window only: the line got or lost the keyboard. */
  onTyping?: (on: boolean) => void;
  /** The chat window only: the line was sent or given up, and the keyboard should go back to the game. */
  onDone?: (sent: boolean) => void;
}) {
  const [room, setRoom] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const channel: ChatChannel | undefined = view.channels.find((c) => c.room === room) ?? view.channels[0];
  const lines: ChatLineView[] = channel ? (view.lines[channel.room] ?? []) : [];

  // Whatever channel is on screen counts as read.
  const shown = channel?.room ?? null;
  useEffect(() => {
    act.watch(shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  useEffect(() => () => act.watch(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  // The chat key was pressed. If the window was given the keyboard, the line takes it now.
  useEffect(() => {
    if (!chatKey?.n) return;
    if (chatKey.how === "direct" || chatKey.how === "attach") input.current?.focus();
    else input.current?.blur();
  }, [chatKey]);

  // The newest line stays in view.
  const last = lines.at(-1)?.id;
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [last, shown]);

  if (!view.operation || !channel) {
    return (
      <div className={`flex min-h-0 flex-1 items-center justify-center px-3 text-center text-text-muted ${compact ? "text-[12px]" : "text-sm"}`} data-chat="none">
        {t("The chat is for operations. It opens here when you are in one.")}
      </div>
    );
  }

  const done = (sent: boolean) => {
    input.current?.blur();
    onDone?.(sent);
  };
  const cannot = view.muted ? t("Your writing is switched off for this operation. You can still read.") : !channel.write ? "You read here. You do not write here." : "";

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${compact ? "text-[13px]" : "text-sm"}`} data-chat={channel.room}>
      <div className="flex shrink-0 flex-wrap items-center gap-1 px-1 pt-1" role="tablist" aria-label="Chat channels">
        {view.channels.map((c) => (
          <button
            key={c.room}
            type="button"
            role="tab"
            aria-selected={c.room === channel.room}
            data-chat-tab={c.net}
            className={`cursor-pointer rounded-sm px-2 text-[11px] font-semibold uppercase tracking-wider ${c.room === channel.room ? `${NET_TEXT[c.net]} bg-white/10` : "text-text-muted hover:text-text"}`}
            onClick={() => setRoom(c.room)}
          >
            {c.label}
            {view.unread[c.room] && c.room !== channel.room && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-gold-bright align-middle" role="img" aria-label="New lines" />}
          </button>
        ))}
      </div>
      <ol ref={list} className={`min-h-0 flex-1 overflow-y-auto px-2 py-1 ${compact ? "leading-[19px]" : "leading-6"}`} data-chat-lines aria-live="polite">
        {lines.length === 0 && <li className="text-[12px] italic text-text-muted">Nothing has been written here yet.</li>}
        {lines.map((l) => {
          if (l.userId === null) return <li key={l.id} className="text-[12px] italic text-text-muted" data-chat-note>{t(l.text)}</li>;
          const own = l.userId === view.me;
          const off = view.mutedIds.includes(l.userId);
          return (
            <li key={l.id} className="group break-words" data-chat-line={l.id}>
              {!compact && <span className="text-[11px] tabular-nums text-text-muted">{hhmm(l.at)} </span>}
              <span className={`font-semibold ${own ? "text-gold-bright" : "text-gold"}`}>{l.name}</span>
              {l.tag && !compact && <span className="text-[11px] text-text-muted"> [{l.tag}]</span>}{" "}
              {l.text}
              {(own || view.moderates) && (
                <span className="ml-2 hidden gap-2 align-middle text-[11px] group-hover:inline-flex group-focus-within:inline-flex">
                  <button type="button" className="cursor-pointer text-text-muted hover:text-danger" onClick={() => act.remove(l.id)} aria-label={`Remove this line of ${l.name}`}>
                    remove
                  </button>
                  {view.moderates && !own && (
                    <button type="button" className="cursor-pointer text-text-muted hover:text-danger" onClick={() => act.mute(l.userId as number, !off)} aria-label={off ? `Let ${l.name} write again` : `Switch off ${l.name}'s writing`}>
                      {off ? "let write" : "switch off"}
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <form
        className="flex shrink-0 items-center gap-1 px-1 pb-1"
        onSubmit={(e) => {
          e.preventDefault();
          const said = text.trim();
          if (said && !cannot) act.say(channel.room, said);
          setText("");
          done(!!said);
        }}
      >
        <input
          ref={input}
          className={`min-w-0 flex-1 rounded-sm border bg-black/40 px-2 py-0.5 text-text outline-none disabled:opacity-60 ${typing ? "border-gold-bright" : "border-line"}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => {
            setTyping(true);
            onTyping?.(true);
          }}
          onBlur={() => {
            setTyping(false);
            onTyping?.(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              done(false);
            }
          }}
          maxLength={300}
          readOnly={!!cannot}
          placeholder={cannot || (typing && onDone ? "Enter sends, Esc gives up" : `Write to ${channel.label}`)}
          aria-label="Chat line"
          autoComplete="off"
          spellCheck={false}
        />
      </form>
    </div>
  );
}
