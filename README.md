# Voice client

Windows voice client built on [Tauri](https://tauri.app) and [LiveKit](https://livekit.io). MIT licensed.

This is the **Phase 0 spike**: throwaway code that answers a few yes/no questions before the real client is built.

## What it does

- Joins four voice rooms ("nets") at once from a single microphone capture.
- Each net has its own push-to-talk key. Holding a key opens the mic on that net only.
- Keys are captured system-wide, so they work while a game has focus. They are never swallowed: the game still receives them.

## Key capture and privacy

The app installs a low-level keyboard and mouse hook and a Raw Input listener. Only keys you have bound to a net are ever passed on, plus the single key you press while binding. Nothing is logged or sent anywhere. The code is in [`src-tauri/src/input`](src-tauri/src/input).

## Test checklist

Install the latest build from [Releases](../../releases). It is unsigned, so Windows SmartScreen warns: choose **More info**, then **Run anyway**.

1. Join, then bind a key to each net. Bind at least one mouse side button.
2. **Game running normally.** With the game in front, hold each key and speak. Check on a second machine that the right net lights up, and that both capture counters climb.
3. **Game running as administrator.** The app should show a red warning naming the game. Click **Restart as administrator** and repeat step 2.
4. Switch the method between **Low-level hook** and **Raw Input** and repeat step 2.
5. **Latency.** Start talking, then press a key, twenty times or so. Note the "hook → audio leaving" median and max. Target: under 150 ms.
6. **Reconnect.** Disable your network adapter for 10 seconds and re-enable it. Wait for the "all 4 rooms recovered" line, then use **Copy log**.

## Build

```
npm ci
npx tauri build
```

Requires Node 22 and stable Rust on Windows. GitHub Actions builds the installer on every push and attaches it to a release for every `v*` tag.
