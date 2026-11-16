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

Download the latest installer from [Releases](../../releases) and run it. It installs for the current Windows user only and needs no administrator rights.

Releases so far are not code-signed, so Windows SmartScreen warns: choose **More info**, then **Run anyway**.

## Uninstall

Open **Windows Settings → Apps → Installed apps**, find **Warcryer** and choose **Uninstall**. This removes the program, its Start menu entry and the sign-in link it registered. Tick "Delete the application data" in the uninstaller to also remove your saved key bindings and settings.

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

Application in progress: this applies to releases published after it is accepted.

- Committers and reviewers: [Salty-Dragon](https://github.com/Salty-Dragon)
- Approvers: [Salty-Dragon](https://github.com/Salty-Dragon)

Every release is built from this repository by [GitHub Actions](.github/workflows/build.yml) on GitHub-hosted runners, and is published only after the installed app passes an [automated test](.github/workflows/test-windows.yml) on a clean Windows machine.

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it. Nothing is sent until you sign in. What is sent after that, and what the server keeps, is described in the [privacy policy](PRIVACY.md).

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
