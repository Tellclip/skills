---
name: tellclip-demo
description: >
  Record, edit, and publish a product demo clip with the `tellclip` CLI. Use
  when asked to record a demo, capture a product walkthrough, make a marketing
  clip of a flow, record a fix working, or share a screen recording of
  automated actions. Tellclip opens and drives its own capture browser, so a
  web flow needs no other tool. Covers picking a real environment, staging,
  recording step by step with the pacing handled for you, the one zoom, an
  authored transcript, QA, and upload.
  Records real product environments only — a mock needs explicit approval.
metadata:
  version: "0.3.0"
---

# Recording a product demo with tellclip

`tellclip` remote-controls the Tellclip macOS app. Every command prints one
JSON object; errors carry `{"error":{code,message,next}}` where `next` is the
recovery step — follow it.

This skill is the whole contract for a web flow. Do not run `tellclip guide`
or `--help` first: every command you need is shown below with its options.
(`tellclip guide` is the long reference for native-app takes and uploads.)

**Every call is a model turn, and turns are what make a take slow.** The
short path for a web flow is three calls: `browser open`, one `browser act
--record --stop` with the whole flow, its zoom, title and summary, and one
look at the contact sheet. Chain commands that do not need each other's
output with `&&` in one call.

## Route work to the correct Tellclip interface

This skill is the router and workflow guide. It does not execute recording or
organization operations itself.

- The `tellclip` **CLI** controls a recording or draft on this Mac. Use it to
  choose a capture target, record, stop, add cursor and zoom edits, cut or
  speed up ranges, author timed transcript cues, set the title and summary,
  render, save, and share.
- For an MP4 that already exists (any OS, CI, no app), use
  `tellclip upload file.mp4`. The agent that made the video authors its
  content: `--transcript`, `--chapters`, `--summary`, and `--thumbnail
  <seconds>`. For the thumbnail, pick the frame that best shows what the clip
  is about, never a fade or a blank frame, and look at it before uploading.
  See `tellclip guide`.
- The hosted Tellclip **MCP** works with authenticated organization data. Use
  its tools for members, workspaces, uploaded clips, transcripts, frames,
  comments, and organization-side clip settings. It cannot record or edit a
  local draft.
  Every organization has an Agents workspace for clips that are not for
  people (feedback recorded for a coding agent, short proof-of-work clips);
  file such a clip there with MCP `move_clip`.

- In Claude Code the plugin also adds the **`tellclip-app`** MCP server: the
  same local operations as tools (`browser_open`, `browser_act`, `record`,
  `stop`, the edit tools, `share`), served by the app on this Mac. A tool takes
  the same fields as its command. Use the tools when you have them, the CLI
  otherwise; everything below applies to both.

The CLI and `tellclip-app` cannot browse the organization. The hosted MCP
cannot record or edit a local draft. Never substitute one for the other.

Their authentication is separate. `tellclip login` signs in the local app/CLI
session used by `tellclip share`; it does not authenticate the hosted MCP. For
MCP OAuth, use `/mcp` or `claude mcp login tellclip` in Claude Code,
`codex mcp login tellclip` in Codex, or `cursor-agent mcp login tellclip` in Cursor.
Authenticate when the task needs organization tools.

Everything below is the CLI workflow for recording and editing a local draft.

## Agent Editing mode

The editor can stay open while the CLI edits its recording. The first
mutating command activates a short agent lease and makes that editor read-only
until the command sequence goes idle. Read-only inspection commands do not
activate the lease. The robot button in the editor only copies the prompt; it
does not grant access.

The person can click **Switch to Manual Mode** at any time. If any command
returns `agent_stopped`, stop immediately. Do not retry automatically. Wait
until the person explicitly asks you to continue. `session_open_in_editor` is
only a compatibility error from older Tellclip versions; ask the person to
update Tellclip or close the editor if it appears.

**Tellclip drives the page.** For a web flow you bring no browser driver:
`tellclip browser …` opens Tellclip's own capture browser and performs each
click, key and scroll itself. It knows when and where each action happened
and when the page finished reacting. So there is no sleep table, no rehearsal
for timing, no cursor to author and no dead air to cut: your thinking time
between two steps never reaches the clip.

## Prereqs

- The Tellclip app, and Google Chrome (or Edge, Brave, Chromium) on this Mac.
- The `tellclip` CLI. The Claude Code plugin brings it; otherwise
  `npm i -g tellclip@latest`. If a command returns `cli_outdated`, follow its
  `next` and retry.

On a Mac where Tellclip was never used, run `tellclip setup` first (or
`npx -y tellclip@latest setup`). It installs the app when it is missing,
asks the person for Screen Recording and a sign-in, and records a test clip;
its `next` says what is left. Nothing else is needed. Do not install a
browser driver for a web flow.

## 0. Pick the environment — real, or stop

A demo is evidence the product works, so what you record must BE the
product. Real means it runs the product's actual code. Walk this ladder in
order and take the first rung that holds:

1. **Already running.** The real product surface is reachable now — the
   production or staging URL, or the app already running on this machine.
   Confirm with the human WHICH url is the real product surface (not the
   marketing page, not a stale preview deploy).
2. **You can start it.** A real environment you can bring up yourself — the
   repo's dev server, a seeded staging deploy. Start it and load the flow's
   first screen before going further.
3. **Neither → STOP and ask.** Tell the human what you tried and what is
   missing, and ask which environment to record. Do not launch, stage, or
   record anything until they answer.

HARD GATE: never build a mock, prototype, or stand-in page as the recording
target unless the human explicitly approved that in THIS conversation.
"It would look the same", a deadline, or rungs 1–2 failing are not
approval — they are rung 3. An approved mock must say it is one: put
"mock" in the `tellclip title`, and say so again when you hand over the
share URL.

**Scenario — no usable environment (regression check).** "Record a demo of
the new checkout" and nothing runs: no dev server, no staging, no signed-in
session. An agent once solved this by writing a local HTML page that looked
like the product and recording it — the clip shipped as if real, demoing
software that did not exist. On this rung the fast move is the wrong move:
stop and ask (rung 3). Building the page first and asking later — or not at
all — is the exact failure this gate exists to prevent.

## Open the capture browser

`<url>` is the surface picked in step 0.

```
tellclip browser open <url>
```

The window opens behind the person's windows and does not take focus. The
page is 1600×900 at the screen's own pixel ratio (`--viewport WxH` for
another size; the result says what you got). The result holds `snapshot`,
the page as lines:

```
navigation "Main"
  link "Projects" [e11]
heading "All projects"
button "New" [e21] collapsed
textbox "Search" [e22] value="apo"
```

`[e21]` is a ref. Act on a ref (`e21`), on a role and name (`button:New`), or
on a viewport point (`640,300`). After the first snapshot every step prints a
diff: `+` new, `-` gone, everything not shown unchanged with its ref still
valid.

The capture browser has its own profile and remembers sign-ins. It starts
signed out the first time. Sign in with steps when you were given
credentials. Otherwise agree it with the person, then
`tellclip browser open <url> --show` brings the window to the front for
them, once.

When the flow needs the person's real accounts and they installed the
Tellclip extension in Chrome, add `--own-browser` (and `--allow <site,…>`
for a sign-in host) to `browser open`: the same steps then run in one window
of their own, signed-in Chrome. Only those sites open, and a click on Delete,
Send, Pay and the like needs `"confirm": true`, sent only after the person
said yes. Close it when done: Chrome shows a debugging bar in all their
windows while it is open.

## The human keeps working — never interrupt them

The take runs on the human's machine while they use it. Their focus,
cursor, and keyboard are untouchable — a demo that hijacks the screen is a
failed demo even if the clip is perfect.

- The capture window sits BEHIND the human's windows for the whole take and
  still records. Never raise it (`--show` is for an agreed sign-in only), and
  never send OS-level mouse or keyboard events.
- UI that must appear in front of them — `tellclip login`'s browser
  sign-in, `tellclip preview`, `browser open --show` — is setup, agreed with
  the human first, never sprung mid-work.
- Tellclip holds up its end: a CLI take launches the app hidden, shows no
  recorder UI, and never captures the microphone or camera (system audio
  is opt-in via `--system-audio`). Only the menu bar shows the running
  take, and a second Chrome icon sits in the Dock while the capture browser
  is open.
- The machine stays theirs mid-take: they can still take screenshots, and
  they can stop your recording from the menu bar — if they do, your next
  command reports `not_recording`; do not fight it, ask before re-recording.

## 1. Stage the demo state

Nothing downstream catches a badly staged app — it costs a whole take.

- Log in before recording.
- Delete stale entities so the flow starts from a clean slate.
- Seed data so no empty state, error, or "contact sales" fallback appears on
  camera — real records created in the step-0 environment, never substitute
  UI. Walk each screen the take will visit and look at it.
- Stage with the same `tellclip browser` steps; no take is running, so
  nothing is on camera. `tellclip browser eval '<js>'` is the escape hatch
  (clear storage, read a value).

## 2. Walk the flow first — only when it pays

Record straight away (step 3) when the flow is short, you can name its
elements from the first snapshot, and nothing in it is hard to undo. Your
thinking time is cut, a wrong step is recovered off camera, and a bad take is
discarded for free.

Walk the flow first, with the recorder off, when it is long (more than about
ten steps), when a step cannot be undone (it sends, pays, deletes), or when
you do not yet know that every screen exists:

- **Every screen and action in the take exists in the step-0 environment.**
  A missing screen, button, or state is a step-0 problem — go back and ask
  the human; never fill the gap with a mocked page or a hand-built stand-in.
- **Every click changed the page.** Each step row says `changed`: `page`,
  `navigation` or `none`. `none` after a click is a dead click: read the
  snapshot and pick the right element. A dead click on camera is a retake.
- Then put the app state back to the start.

## 3. Record the take

**The whole take in one call** — the default when you can name each element
by role and name (the snapshot from `browser open` shows them):

```
tellclip browser act --record --stop \
  --title "New project from the dashboard" \
  --summary "Creates a project from the New menu and shows it in the list." \
  --json '[
  {"click": {"role": "link", "name": "Projects"}},
  {"click": {"role": "button", "name": "New"}},
  {"click": {"role": "menuitem", "name": "Project"}},
  {"type": "Apollo", "into": {"role": "textbox", "name": "Project name"}, "hold": 1.5},
  {"click": {"role": "button", "name": "Create"}, "zoom": 2},
  {"wait": {"text": "Apollo"}}]'
```

It starts the take, runs the steps and ends it. Each step waits out the hold
of the one before it, so the clip is paced exactly as in a step-by-step
take: never add `sleep` or `wait` steps for pacing. A `wait` belongs to the
step before it: that beat lasts until the text arrived. `"zoom": 2` on a step
is the clip's one zoom (step 4), placed on that beat for you; `--title` and
`--summary` set the words. So the edit needs no call of its own. The result
has one row per step, `take` (the session and `auto_edit`) and `sheet` (see
step 6), zoom included. If a step fails, the take is discarded: fix the step
and run the call again. This is also how you record the same demo again
after the UI changes.

**Step by step** — when you must read the page between steps to choose the
next one:

```
tellclip record --browser
tellclip browser click e31
tellclip browser type "Apollo" --into e44 --hold 1.5
tellclip browser click button:Create
tellclip stop
```

Each step is one beat. For each, the clip keeps 0.7 s before the action
(the cursor glides in there) and a hold after the page settled: 1.0 s after
a change, 1.7 s after a new screen, 2.2 s for the last step. `--hold
<seconds>` sets it for one step: use it where the viewer has something to
read. Everything between your steps is cut when you stop. So:

- Take the time you need between steps. Read each diff, then choose.
- Never `sleep`: the pacing is in the beats, not in your timing.
- Target: a final clip of 10–20 s. That is about six to ten steps. If a
  beat needs more than ~2.5 s of stillness to make sense, it is two clips.

A wrong click on camera: recover with `--off-camera` steps (they are not in
the clip), then go on. If the wrong click is already a beat you do not want,
`tellclip cut <start> <end>` removes it after `stop` — the step row gave you
its `t`. A take that went badly: `tellclip cancel` discards it — cheap.

A result that arrives late with nothing loading (a timer, a background job)
is not waited for, and your thinking time after the step is cut. To keep
the moment it arrives in the clip, give the step a longer `--hold`, or send
the click and `{"wait": {"text": "Saved"}}` together in one `browser act`
call.

During a step-by-step take, several steps you already know still go in one
`browser act --json '[…]'` call.

`tellclip stop` (and `--stop`) writes the cursor track from the beats and
cuts everything outside them. It prints `auto_edit` with the kept ranges and
the clip length, and `sheet`. Both edits are ordinary ones the person can
change in the editor.

## 4. Edit — the one zoom, then words

`stop` already wrote the cursor track and cut the dead air. A take in one
call with `"zoom"`, `--title` and `--summary` is already edited: go to step 5.
After a step-by-step take, what is left needs no output from one command for
the next, so run it as ONE Bash call:

```sh
tellclip zoom add 12.1 14.2 --at 0.88,0.23 --level 2 \
  && tellclip title "New project from the dashboard" \
  && tellclip summary "Creates a project from the New menu and shows it in the list." \
  && tellclip frame --sheet
```

1. Add **one** zoom, on the single moment the clip exists to show. Its time
   and place are in that step's row: start about 0.3 s before `t`, end where
   the beat ends, `--at` is the row's `at`. `zoom add <start> <end> --at x,y
   --level <n>` is the whole syntax.
   If a secret is in the take (a token, an email, a real customer name),
   `tellclip mask add <start> <end> --rect x,y,WxH` blurs that region
   for those seconds; over-cover by a margin and check `tellclip frame`.
   `tellclip highlight add <start> <end> --rect x,y,WxH` dims everything but
   that region instead — a pointer when the surroundings must stay in view.
   If the take captured more than the clip is about (desktop around a
   window, browser chrome around a page), `tellclip crop set x,y,WxH` keeps
   that rectangle for the whole clip. Crop first: afterwards `tellclip frame`
   shows the cropped picture and zoom and region coordinates are read off it.
   Layouts (`tellclip layout add <start> [<end>] --kind camera|split|screen`)
   arrange the camera and the screen for a stretch and animate by
   themselves; they need a camera take, which an agent's own silent take
   never has, so use them only when editing a person's recording.
2. Check the cuts against meaning. `tellclip edits` lists `kept_ranges`. A
   beat that needed longer to read: `tellclip cut restore <start> <end>` on
   the stretch after it. A beat you do not want: `tellclip cut <start> <end>`.
3. Restyle only when asked: `tellclip style get` returns the inspector
   (background, padding, corners, shadow, aspect ratio, cursor, webcam, audio)
   with the legal values; `tellclip style set --json '{"padding":0.1}'`
   changes just those keys, exactly like the editor.

## 5. Author the transcript after the edit

The transcript is post-factum metadata for the finished take. Do not narrate
tool calls or try to build it while recording. After cuts and speed edits are
final, add concise viewer-facing cues at the places where they help:

```sh
printf '%s' '{"cues":[{"start":2.4,"end":4.8,"text":"Open Settings."}]}' \
  | tellclip transcript set
tellclip transcript list
```

Cue times are source recording seconds, like marks and edits. Tellclip maps
them through cuts and speed changes for the shared clip; `caption_cues` in the
`list` result shows those final viewer times. Supply the complete cue track on
every `set` — it atomically replaces the previous authored track. Keep cues
ordered and normally non-overlapping. An authored track becomes the clip's
captions; `tellclip transcript clear` removes it and restores the generated
microphone transcript when one exists.

## 6. QA, then publish

The edit is not the deliverable; the rendered clip is.

- `tellclip edits` → `edited_duration_seconds` against your target, and
  `kept_ranges` / `zoom_ranges` against what you meant to build.
- `tellclip transcript list` → the intended source `cues`, projected
  `caption_cues`, and `omitted_cue_count == 0`.
- **Read the contact sheet: one picture, one look.** `stop` returns
  `sheet.path`: a tile per step of the finished clip (cursor, cuts and
  background as rendered), each with its number, clip time and step. Check
  that every step landed and the cursor is on the control. Do not call
  `tellclip frame` per step.
- After the edits in step 4, `tellclip frame --sheet` makes the sheet again
  with the zoom in it. Add it to the end of the edit call.
- `tellclip frame <t> --view output` is for one moment at full size, when a
  tile is too small to judge (zoom framing, a blur's edge). `tellclip frame
  <t>` (view edit) is the raw capture, for measuring a position.
- `tellclip share` → share URL. Re-running replaces the same URL, so
  iterating on the edit is safe.

The take script stays re-runnable: when the product UI changes, re-record
deterministically instead of re-deriving the flow.

## Other windows and outside drivers

Recording a native app, or a page you must drive with your own tool? Then
you are the one who knows when things happen: `tellclip targets`, `tellclip
record --window <id>`, one chained shell call with your actions, `tellclip
mark "label" --at x,y` after each and explicit sleeps between them, then
`tellclip cursor set --from-marks` and `tellclip suggest --apply`. Run
`tellclip guide` for that contract (pacing table, timing, coordinates).

Never record through the Claude-in-Chrome extension: it paints an orange
cursor, a viewport glow and a debugging banner into the capture, and they
cannot be hidden.

## Positions

Coordinates in edit commands are normalized 0-1 from the TOP-LEFT of the
captured window — the raw capture, before the styled background and padding
the final render wraps around it. Never compensate for that padding. A step
row's `at` is already in this space. For anything you place by eye,
`tellclip frame <t>` extracts the frame as PNG — read positions off the image
(`x = px/width`).

## Zooms are pointers, not polish

One zoom per clip, on the one moment the clip exists to show — the new
button, the menu that just opened. Everything else stays full-frame. Zooming
every click is the generic Ken Burns drift that makes a clip read as
machine-made, and it is the biggest single difference between a 29s bot-like
take and a 13s one.

- Level 2 is the default; 1.5 for context, 3 for small UI. Start ~0.5s before
  the click and hold only as long as the thing is worth looking at.
- Keep a zoom inside one beat. A zoom that spans the cut between two beats
  holds through the seam, but its glide must not cross one.
- Unedited sessions get auto zooms at share time only if real clicks were
  captured — authored recordings should add their own.

## Other edits

- `tellclip speed <start> <end> 3` fast-forwards boring stretches (forms,
  loading) — better than cutting when the viewer should see it happen.
- `tellclip preview` ends Agent Editing mode, reloads the editor from disk,
  focuses it, and hands the recording back for human review from the start.

## Title and summary

After recording, set both before sharing.

- Title: `tellclip title "..."` — a short name for what the clip shows, at
  most 120 characters.
- Summary: `tellclip summary "..."` — 2-4 viewer-facing sentences describing
  what the clip demonstrates. Write from the take you just performed and
  check it against the distinct parts shown. No padding, invented claims, or
  "In this video..." boilerplate.

## Gotchas

- Only the newest 10 sessions are kept — share or save before recording many
  takes. Address older takes with `--session <id>` (every response echoes it).
- `share` needs the app signed in once: run `tellclip login` (opens a browser
  sign-in a human completes; `tellclip status` reports `signed_in`). This is
  the app/CLI share session, not hosted MCP OAuth;
  `save` additionally needs a paid plan. Both report structured errors with
  the fix in `next`.
- The Tellclip app must be running; the CLI auto-launches it if not.
- The capture browser stays open between commands and keeps its sign-ins.
  `tellclip browser close` quits it; it also closes after 10 idle minutes.
- One capture browser, one take, one tab. A link that opens a new tab is not
  followed (`goto` its URL instead), and steps do not reach inside
  cross-origin iframes.
