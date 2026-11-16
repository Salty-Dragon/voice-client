# Privacy policy

This covers the Windows app built from this repository and the server the released installer connects to, `ignite.v1rtopia.com`. If you build the app yourself and point it at another server (`VITE_SERVER`), that server's operator decides what is kept there.

## Before you sign in

The app sends nothing to any server until you click **Sign in with Discord**. It has no telemetry, analytics, crash reporting, advertising or automatic update check.

## What the app sends once you are signed in

| What | When | Why |
| --- | --- | --- |
| Your Discord account ID and Discord name | At sign-in, from Discord to the server | To know who you are. Only Discord's `identify` permission is requested: no email address, no server list, no messages. The app never sees your Discord password. |
| In-game name and class tag | When you type them | Shown to other members beside your voice. |
| Clan membership, join requests, roster places, clan crest images | When you or your leaders change them | To decide which voice rooms you belong in. |
| Your voice | While you hold a push-to-talk key, or while voice activation is open | Relayed live to the members of that room. It is not recorded or stored. |
| Times you joined and left voice rooms | Automatically while connected | So organisers can see who is present. |
| Changes made by leaders and admins (moves, approvals, bans) | When made | An audit log of who did what. |

Like any internet service, the server and the network in front of it (Cloudflare) see your IP address while you are connected, and it may appear in their access logs.

## What stays on your computer

Key bindings, audio device choices, volume settings and per-player volumes. They are never sent.

## Keyboard and mouse

To notice push-to-talk keys while a game has focus, the app reads keyboard and mouse button state system-wide. Only the keys you have bound are acted on, plus the single key you press while binding one. Key presses are not logged, stored or sent anywhere, and they are never blocked: other programs still receive them. The code is in [`src-tauri/src/input`](src-tauri/src/input).

## Who can see what

Other signed-in members see your in-game name, class tag, clan and which voice room you are in. Clan leaders, event leaders and alliance admins also see join requests and rosters. Your Discord account ID is visible only to the server's administrators. Clan crest images can be loaded by anyone who knows their address.

## How long it is kept

Sign-in sessions expire and are deleted. Account, clan, roster, voice-room times and audit entries are kept until the server's administrators remove them. Nothing is sold or shared with anyone else.

## Removing your data

Signing out ends your session. To have your account and its records deleted, ask an alliance admin, or open an issue in this repository (do not put personal details in the issue).

## Other services involved

- Discord, for sign-in: <https://discord.com/privacy>
- Cloudflare, in front of the server: <https://www.cloudflare.com/privacypolicy/>
- The app displays its interface with Microsoft Edge WebView2, part of Windows: <https://privacy.microsoft.com/privacystatement>
