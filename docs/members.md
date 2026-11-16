# Guide for members

You never pick a voice channel in this app. Your place in the roster decides what you hear and where you can speak, and when an organiser moves you, your voice follows.

## Getting started

1. **Install.** Download the newest installer from the [Releases page](../../../releases). It is not code-signed yet, so Windows shows a blue SmartScreen warning: click **More info**, then **Run anyway**.
2. **Sign in.** Click **Sign in with Discord**. Your browser opens, you approve, and the app continues by itself. The app receives your Discord account ID and name only: no email, no server list, never your password.
   - If the app does not continue, the browser page has a section called **The app did not open** with a code. In the app, open **Enter code instead** and paste it.
3. **Your name.** Enter your in-game name exactly as it appears in game (letters and digits, no spaces), and optionally a class tag such as BP, OL or SWS so callers can find healers and buffers.
4. **Setup wizard.** Three short steps: choose your microphone and headset, record three seconds and hear them back, then choose how you talk (see [Talking](#talking)).
5. **Join your clan.** Open the **Clan** tab, find your clan and click **Request to join**. A clan leader or officer has to approve you. Until then you cannot hear anything.

Once approved you land in your clan's lounge automatically.

## Where you are

The **Voice** tab always shows where you are and who is there.

| Situation | Where you are |
| --- | --- |
| No operation is live | Your clan's **lounge**: everyone in the clan who has the app open |
| An operation you belong to goes live | Pulled into the operation automatically |
| The operation ends | Back in the lounge automatically |

When there are operations, a **You are in** picker appears at the top. Use it to sit a live operation out in the lounge, or to join a planned operation early. If you choose the lounge during a live operation, you stay there for that operation; the next one that starts pulls you in again.

## Nets

During an operation you listen to several nets at once. They are listed on the left of the Voice tab, highest priority first.

| Net | You hear | Who can speak |
| --- | --- | --- |
| **Broadcast** | The event leader's calls to everyone | Event leader and deputies |
| **Command** | Only if you are a leader | Event leader, deputies, clan leaders, party leaders |
| **Clan** | Your clan's orders | Clan leader and officers |
| **Party** | Your party | Everyone in the party |
| **Reserve** | Others waiting for a party | Everyone without a party, and the organisers |

A plain member hears Broadcast, Clan and their Party. Each card shows who is speaking and how you talk there ("Hold Mouse 4", "Voice activated", or "Listen only").

**Click a net** to see everyone connected to it. **Click a player** to set your own volume for them or mute them. That changes only what you hear, and is remembered on your computer.

## Talking

Party, Reserve and the lounge work the same way, and you choose one of two modes:

- **Push-to-talk.** Hold a key and speak. Mouse side buttons work. One key, the **Party** key, is used for your party and for the lounge.
- **Voice activation.** The mic opens when you speak. Set the marker on the level bar above your keyboard noise and below your voice, or click **Auto** and stay quiet for five seconds.

Broadcast, Command and Clan are always push-to-talk, each with its own key. If you are given a role that can speak on one of them, the app asks you to bind a key for it.

Good to know:

- Your keys are never taken from the game. The game still receives them.
- Speaking on one net never mutes what you hear on the others.
- While you hold a Broadcast, Command or Clan key, your voice goes only to that net; voice activation pauses.
- The **Mute all** key silences your mic everywhere until you press it again. The header shows **Mic muted** while it is on.

Change any of this in **Settings**.

## When a higher net is live

While someone speaks on a higher net, the nets below it get quieter for you (30% by default) and return when the higher net goes quiet. So a Broadcast call cuts through party chatter without silencing it. Turn this off or change the level in **Settings → Priority**.

## Being moved, and asking to move

- When an organiser moves you to another party, you hear a short cue, a line tells you where you went, and your voice switches within a second or two. You do nothing.
- To ask to join a party yourself, open **Operations**, open the operation, and click **Ask to join** on the party. Its leader accepts or declines. You can cancel, and asking a different party replaces the first request.

## If you lead a party

The first player placed in a party leads it. A party leader:

- Is on **Command** as well as their party, and should bind a Command key.
- Sees join requests on the Voice tab ("X asks to join Party 1") and answers with **Accept** or **Decline**.
- Can send one of their own members to Reserve from the roster board, rename the party, and hand leadership to another member.

If you are moved out of your party, leadership passes to the next member automatically.

## Browser version

`https://ignite.v1rtopia.com/voice` is the same app in a browser, for a quick look or a second PC. Sign in on the site first. Its keys only work while the browser tab has focus, so use the Windows app for events.

## One connection per account

Your account can have one voice connection at a time. Opening the app somewhere else disconnects the first one, which shows **Reconnect here**.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| Keys do nothing while the game is in front | Settings → **Key capture**: make sure **Polling** is selected. If it still fails, tick **Always start as administrator** and restart the app. |
| A banner says the sound is held back | Click **Enable audio**. |
| Nobody hears you | Check the level bar moves in Settings → Devices, that the right microphone is chosen, and that **Mic muted** is not showing. |
| "Microphone problem" banner | Allow microphone access for the app in Windows privacy settings, then click **Try again**. |
| "Server link lost, retrying…" | Your voice keeps working. The app reconnects by itself; only roster changes wait until it does. |
| A net shows "Disconnected, retrying…" | It rejoins by itself within a few seconds. If your network blocks voice traffic entirely, tell an admin. |
| You were signed out | Someone signed in with your account elsewhere, or you were removed. Sign in again. |

## What is stored about you

On the server: your Discord account ID and name, your in-game name and class tag, your clan membership, your place in each operation's roster, and when you joined and left each net. Voice is never recorded. Key bindings, audio settings and your per-player volumes stay on your computer.
