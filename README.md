<img src="app-icon.png" width="96" align="right" alt="">

# Warcryer

Push-to-talk voice chat for large gaming alliances, where the event roster decides who hears whom. Project page: <https://warcryer.github.io>.

This is the Windows client, built on [Tauri](https://tauri.app) and [LiveKit](https://livekit.io). MIT licensed.

Voice follows the roster: the server tells the client which voice rooms ("nets") it belongs in, and the client connects to exactly those. Nobody picks a channel by hand. When an organiser moves you to another party, your audio follows within a couple of seconds.

Between events you sit in your clan's lounge. When an operation you belong to goes live you are pulled into it, and returned to the lounge when it ends.

The app is also where the alliance is run: joining a clan, approving members, creating operations and building the roster on a drag-and-drop board. Each screen offers only what your role allows, and the server checks every action again.

## What it does

- Holds several nets at once (Broadcast, Command, Clan, Party, Reserve) from a single microphone capture.
- Each net you may speak on has its own push-to-talk key. Holding a key opens the mic on that net only.
- Party and Reserve can use voice activation instead, with an adjustable sensitivity.
- Keys work while a game has focus, including mouse side buttons. They are never swallowed: the game still receives them.
- Signs in with Discord through your normal browser. The app never sees your Discord password.

## Key capture and privacy

To notice your push-to-talk keys while the game is in front, the app reads keyboard and mouse button state system-wide. Three methods are available in Settings; the default, Polling, asks Windows whether keys are down a few hundred times a second and needs no administrator rights.

Only keys you have bound to a net are ever acted on, plus the single key you press while binding. Key presses are not logged, stored or sent anywhere. The code is in [`src-tauri/src/input`](src-tauri/src/input).

Key bindings and audio settings stay on your computer. The server receives your Discord account ID and name at sign-in, and your in-game name and class tag when you set them.

## Guides

Step-by-step guides for [members](docs/members.md), [clan leaders and officers](docs/clan-leaders.md) and [alliance admins and event leaders](docs/alliance-admins.md).

## Install

Download the latest installer from [Releases](../../releases). It is not code-signed yet, so Windows SmartScreen warns: choose **More info**, then **Run anyway**.

## Build

```
npm ci
npx tauri build     # Windows installer
npm run build:web   # the same UI for the browser fallback, served under /voice/
```

Requires Node 22 and stable Rust on Windows. GitHub Actions builds the installer on every push and attaches it to a release for every `v*` tag.

The server address is set at build time with `VITE_SERVER`.

## Layout

| Path | What |
| --- | --- |
| `src/engine.ts` | Rooms, microphone, push-to-talk and voice activation |
| `src/control.ts` | The control channel that delivers your nets |
| `src/auth.ts` | Sign-in through the system browser |
| `src/api.ts` | Calls to the backend for clans, operations and the roster |
| `src/ui/` | Screens: voice, operations and roster board, clan, settings |
| `src-tauri/src/input/` | System-wide key capture (Windows) |

## Name and artwork

Warcryer is a community project. It is not affiliated with or endorsed by NCSOFT or any game publisher, and it contains no game artwork: the emblem in [`art/`](art) and every drawing in the app were made for this project.
