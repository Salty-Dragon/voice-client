// An alliance's own words for the five things the app is built around.
//
// The app is written in one set of words: alliance, clan, party, constant
// party, operation. A guild that calls a clan a guild and an operation a raid
// sets that in its game profile, and every sentence the app shows is passed
// through `reword` on its way to the screen.
//
// What a player typed (a name, a clan's name, an operation's name) must never
// be changed: a clan called "Party Crashers" stays that. Where a sentence
// carries such a value, the value is wrapped with `d()`; `reword` leaves what
// is wrapped alone and removes the wrapping.
//
// This file has no imports, on purpose. It is a copy of `core/words.ts` in the
// server's repository, which also holds its tests; keep the two the same.

export type Word = { one: string; many: string };
export type Words = { alliance: Word; clan: Word; party: Word; constantParty: Word; operation: Word };
export const WORD_KEYS = ["alliance", "clan", "party", "constantParty", "operation"] as const;

export const DEFAULT_WORDS: Words = {
  alliance: { one: "alliance", many: "alliances" },
  clan: { one: "clan", many: "clans" },
  party: { one: "party", many: "parties" },
  constantParty: { one: "constant party", many: "constant parties" },
  operation: { one: "operation", many: "operations" },
};

// Invisible marks around a value that is not ours to change (Unicode's "isolate" pair).
const OPEN = "⁨";
const CLOSE = "⁩";
/** Marks a value a player typed, so that `reword` leaves it as it is. */
export const d = (value: unknown): string => `${OPEN}${String(value ?? "").replace(/[⁨⁩]/g, "")}${CLOSE}`;

const same = (a: Words, b: Words) => WORD_KEYS.every((k) => a[k].one === b[k].one && a[k].many === b[k].many);

// Longest first, so that "constant party" is not read as "party". An "a" or "an" in front is taken along, to be corrected.
const FIND = /\b(?:(an?)(\s+))?(constant parties|constant party|alliances|alliance|clans|clan|parties|party|operations|operation)\b/gi;
const SOURCE: Record<string, [keyof Words, keyof Word]> = {};
for (const k of WORD_KEYS) {
  SOURCE[DEFAULT_WORDS[k].one] = [k, "one"];
  SOURCE[DEFAULT_WORDS[k].many] = [k, "many"];
}

/** The new word, written the way the old one was: CLAN, Clan or clan. */
function shaped(found: string, to: string): string {
  if (found.length > 1 && found === found.toUpperCase()) return to.toUpperCase();
  if (found[0] !== found[0].toLowerCase()) return to[0].toUpperCase() + to.slice(1);
  return to;
}

function swap(words: Words, text: string): string {
  return text.replace(FIND, (_all, article: string | undefined, gap: string | undefined, found: string) => {
    const [key, form] = SOURCE[found.toLowerCase()];
    const to = shaped(found, words[key][form]);
    if (!article) return to;
    // "an operation" becomes "a raid"; "a clan" becomes "an order".
    const fitting = /^[aeiou]/i.test(to) ? "an" : "a";
    const first = article[0] === "A" ? "A" : "a";
    const rest = article.length > 1 && article === article.toUpperCase() ? fitting.slice(1).toUpperCase() : fitting.slice(1);
    return `${first}${rest}${gap}${to}`;
  });
}

/** A sentence in the app's words, said in the alliance's. Values wrapped with `d()` come through untouched, without their wrapping. */
export function reword(words: Words | null | undefined, text: string): string {
  const marked = text.includes(OPEN);
  if (!words || same(words, DEFAULT_WORDS)) return marked ? text.replace(/[⁨⁩]/g, "") : text;
  if (!marked) return swap(words, text);
  let out = "";
  let at = 0;
  while (at < text.length) {
    const open = text.indexOf(OPEN, at);
    if (open < 0) {
      out += swap(words, text.slice(at));
      break;
    }
    const close = text.indexOf(CLOSE, open + 1);
    out += swap(words, text.slice(at, open));
    if (close < 0) {
      // An opening mark with no end: treat the rest as a value.
      out += text.slice(open + 1);
      break;
    }
    out += text.slice(open + 1, close);
    at = close + 1;
  }
  return out;
}

const WORD_OK = /^[\p{L}\p{N}](?:[\p{L}\p{N} '-]{0,22}[\p{L}\p{N}])?$/u;
const LABEL: Record<keyof Words, string> = { alliance: "alliance", clan: "clan", party: "party", constantParty: "constant party", operation: "operation" };

/**
 * The messages name the five in the app's own words, marked so that they stay that way: an admin
 * who is choosing what a clan is called must be told about "clan", not about their new word for it.
 *
 * Checks the words an admin sent. Returns them in the form that is stored, or throws an Error whose
 * message says what is wrong. Nothing sent, or a word left empty, means the app's own word.
 */
export function cleanWords(input: unknown): Words {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out = {} as Words;
  for (const key of WORD_KEYS) {
    const pair = (v[key] && typeof v[key] === "object" ? v[key] : {}) as Record<string, unknown>;
    const tidy = (x: unknown) => (typeof x === "string" ? x.trim().replace(/\s+/g, " ") : "");
    const one = tidy(pair.one) || DEFAULT_WORDS[key].one;
    const many = tidy(pair.many) || (one === DEFAULT_WORDS[key].one ? DEFAULT_WORDS[key].many : "");
    if (!many) throw new Error(`Words: give the word for more than one ${d(LABEL[key])} too.`);
    for (const w of [one, many]) {
      if (!WORD_OK.test(w)) throw new Error(`Words: "${d(w.slice(0, 30))}" should be 1 to 24 letters, digits, spaces, hyphens or apostrophes.`);
    }
    out[key] = { one, many };
  }
  // Two different things under one word would make every sentence about them ambiguous.
  const seen = new Map<string, keyof Words>();
  for (const key of WORD_KEYS) {
    for (const w of new Set([out[key].one.toLowerCase(), out[key].many.toLowerCase()])) {
      const other = seen.get(w);
      if (other && other !== key) throw new Error(`Words: "${d(w)}" is used for both ${d(LABEL[other])} and ${d(LABEL[key])}.`);
      seen.set(w, key);
    }
  }
  return out;
}

/** Words as stored, or the app's own where something is missing or malformed. Never throws. */
export function wordsOf(stored: unknown): Words {
  try {
    return cleanWords(stored);
  } catch {
    return DEFAULT_WORDS;
  }
}
