<img src="app-icon.png" width="96" align="right" alt="">

# Warcryer

Voice chat for large gaming alliances and clans: a free, open-source alternative to TeamSpeak, where the event roster decides who hears whom. Project page: <https://warcryer.github.io>.

This is the Windows client, built on [Tauri](https://tauri.app) and [LiveKit](https://livekit.io). MIT licensed.

Voice follows the roster: the server tells the client which voice rooms ("nets") it belongs in, and the client connects to exactly those. Nobody picks a channel by hand. When an organiser moves you to another party, your audio follows within a couple of seconds.

Between events you sit in your clan's lounge. When an operation you belong to goes live you are pulled into it, and returned to the lounge when it ends.

The app is also where the alliance is run: joining a clan (by request or by invite link), approving members, keeping constant parties, creating operations, signing up for them, building the roster on a drag-and-drop board and checking attendance afterwards. Each screen offers only what your role allows, and the server checks every action again.

## What it does

- Holds several nets at once (Broadcast, Command, Clan, Party, Reserve) from a single microphone capture.
- Each net you may speak on has its own push-to-talk key. Holding a key opens the mic on that net only.
- Party and Reserve can use voice activation instead, with an adjustable sensitivity.
- Keys work while a game has focus, including mouse side buttons. They are never swallowed: the game still receives them.
- Signs in with Discord through your normal browser. The app never sees your Discord password.
- Lowers the nets below while a higher one is live, so a leader's call cuts through without muting anyone.
- Keeps a party on Command: if its leader drops out, the party is asked to choose another, and the next member is promoted if nobody does.
- Rosters are reusable: clans keep constant parties that drop onto a board in one click, and a new operation can start from an earlier one.
- Plans the event as well as carrying it: players set their class and level and answer "are you coming?", the board shows what each party still needs, and afterwards it lists who was in voice and for how long.
- Updates itself, with every update signed. Sits in the Windows tray; can keep running there when the window is closed.
- An optional compact strip: a small always-on-top window showing who is speaking on which net. It is an ordinary window, never drawn into the game.

## Key capture and privacy

To notice your push-to-talk keys while the game is in front, the app reads keyboard and mouse button state system-wide. Three methods are available in Settings; the default, Polling, asks Windows whether keys are down a few hundred times a second and needs no administrator rights.

Only keys you have bound to a net are ever acted on, plus the single key you press while binding. Key presses are not logged, stored or sent anywhere. The code is in [`src-tauri/src/input`](src-tauri/src/input).

Key bindings and audio settings stay on your computer. The server receives your Discord account ID and name at sign-in, your in-game name, class and level when you set them, and your answer when you sign up for an event. It records when you join and leave each net, from which an operation's organisers and your clan's leadership see how long you were in voice. Voice itself is never recorded. The [privacy policy](PRIVACY.md) has the full list.

## Guides

Step-by-step guides for [members](docs/members.md), [clan leaders and officers](docs/clan-leaders.md) and [alliance admins and event leaders](docs/alliance-admins.md).

## Install

Download the latest installer from [Releases](../../releases) and run it. It installs for the current Windows user only and needs no administrator rights.

Releases so far are not code-signed, so Windows SmartScreen warns: choose **More info**, then **Run anyway**.

## Updates

From version 0.8.0 the app updates itself. An update found when the app starts installs before you join voice; one found while it is running waits for you to click **Restart to update**. Every update is signed with the project's update key, and the app refuses one whose signature does not match the key built into it. Automatic checks can be switched off in **Settings → Window and updates**.

Only full releases are offered as updates. A tag with a suffix, such as `v1.2.3-rc.1`, is published as a pre-release for testing and is never offered.

## Uninstall

Open **Windows Settings → Apps → Installed apps**, find **Warcryer** and choose **Uninstall**. This removes the program, its Start menu entry and the sign-in link it registered. Tick "Delete the application data" in the uninstaller to also remove your saved key bindings and settings.

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

Not in effect yet: releases so far are unsigned. This applies to releases published after the project's application is accepted.

- Committers and reviewers: [Salty-Dragon](https://github.com/Salty-Dragon)
- Approvers: [Salty-Dragon](https://github.com/Salty-Dragon)

Every release is built from this repository by [GitHub Actions](.github/workflows/build.yml) on GitHub-hosted runners, and is published only after the installed app passes an [automated test](.github/workflows/test-windows.yml) on a clean Windows machine.

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it, with one exception: it checks for updates, sending only its version number, which you can switch off in Settings. Nothing else is sent until you sign in. What is sent after that, and what the server keeps, is described in the [privacy policy](PRIVACY.md).

## Build

```
npm ci
npx tauri build     # Windows installer
npm run build:web   # the same UI for the browser fallback, served under /voice/
```

Requires Node 22 and stable Rust on Windows. GitHub Actions builds the installer on every push and attaches it to a release for every `v*` tag.

Building the installer needs an update-signing key in `TAURI_SIGNING_PRIVATE_KEY`. For a build of your own, make a key pair with `npx tauri signer generate`, put its public half in `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`, and change the update address there, or set `bundle.createUpdaterArtifacts` to `false` to build without updates.

The server address is set at build time with `VITE_SERVER`.

## Layout

| Path | What |
| --- | --- |
| `src/engine.ts` | Rooms, microphone, push-to-talk and voice activation |
| `src/control.ts` | The control channel that delivers your nets |
| `src/auth.ts` | Sign-in through the system browser |
| `src/update.ts` | Checking for, verifying and installing updates |
| `src/invite.ts` | Clan invite links opened in the app |
| `src/strip/` | The compact strip: its own small page, fed by the main window, with no voice of its own |
| `src/api.ts` | Calls to the backend for clans, operations and the roster |
| `src/ui/` | Screens: voice, operations and roster board, clan, settings |
| `src-tauri/src/input/` | System-wide key capture (Windows) |
| `src-tauri/src/lib.rs` | The desktop shell: tray icon, close-to-tray, updater plugin |
| `docs/` | The guides, also shown inside the app |

## Name and artwork

Warcryer is a community project. It is not affiliated with or endorsed by NCSOFT or any game publisher, and it contains no game artwork: the emblem in [`art/`](art) and every drawing in the app, including the sword on the opening screen ([`src/ui/SwordLoader.tsx`](src/ui/SwordLoader.tsx)), were made for this project. TeamSpeak is a trademark of its owner, named above only for comparison; Warcryer is not affiliated with it.
