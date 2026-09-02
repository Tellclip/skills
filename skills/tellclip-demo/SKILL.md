---
name: tellclip-demo
description: >
  Record, edit, and publish a product demo clip with the `tellclip` CLI while
  driving a browser with `agent-browser`. Use when asked to record a demo,
  capture a product walkthrough, make a marketing clip of a flow, or share a
  screen recording of automated actions. Covers staging the demo state,
  rehearsing before the take, recording the whole flow in one shell
  invocation with human pacing, clean-browser launch, precise timing via
  chained marks, authored cursor and transcript tracks, zoom/cut/speed edits,
  and upload.
  Records real product environments only — a mock needs explicit approval.
---

# Recording a product demo with tellclip

`tellclip` remote-controls the Tellclip macOS app. Every command prints one
JSON object; errors carry `{"error":{code,message,next}}` where `next` is the
recovery step — follow it. Full contract: run `tellclip guide`.

## Route work to the correct Tellclip interface

This skill is the router and workflow guide. It does not execute recording or
organization operations itself.

- The `tellclip` **CLI** controls a recording or draft on this Mac. Use it to
  choose a capture target, record, stop, add cursor and zoom edits, cut or
  speed up ranges, author timed transcript cues, set the title and summary,
  render, save, and share.
- The hosted Tellclip **MCP** works with authenticated organization data. Use
  its tools for members, workspaces, uploaded clips, transcripts, frames,
  comments, and organization-side clip settings. It cannot record or edit a
  local draft.

The CLI cannot browse the organization. MCP cannot record or edit a local
draft. They are complementary; never substitute one for the other.

Their authentication is separate. `tellclip login` signs in the local app/CLI
session used by `tellclip share`; it does not authenticate the hosted MCP. For
MCP OAuth, use `/mcp` or `claude mcp login tellclip` in Claude Code,
`codex mcp login tellclip` in Codex, or `cursor-agent mcp login tellclip` in Cursor.
Authenticate when the task needs organization tools.

Everything below is the CLI workflow for recording and editing a local draft.

Drive the browser with `agent-browser` (Vercel's agent CLI). Because both
tools are bash commands, actions, marks and sleeps chain inside a single
shell script — full interactivity, ms-accurate timing, and no LLM turnaround
anywhere in the recording.

**A demo is a take, not a transcript of your tool calls.** Stage the app,
rehearse with the recorder off, then record the whole flow in ONE shell
invocation. Your reasoning time between two tool calls is dead air on camera:
the same flow driven one call per click ran 83s raw / 29s cut; chained into a
single script it ran 23s raw / 13s cut.

## Prereqs

- `tellclip` CLI: `npm i -g tellclip` (auto-launches the Tellclip app).
- `agent-browser`: `brew install agent-browser` (or `npm i -g agent-browser`),
  then `agent-browser install` once to download its browser.
- `jq` (used by the bundled helper).

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

## Launch a clean capture browser

`<url>` is the surface picked in step 0.

```
agent-browser open <url> --headed --args "--disable-infobars,about:blank"
agent-browser set viewport 1600 900
```

`set viewport` is a request, not a fact: the window can clamp to the screen
or keep its old size, and every downstream number — marks, zoom targets,
framing — silently drifts when the real size differs from the one you set.
Read it back and require an exact match before recording:

```
agent-browser eval 'JSON.stringify({iw:innerWidth,ih:innerHeight,ow:outerWidth,oh:outerHeight})'
```

`iw`×`ih` must equal the viewport you set. If it does not, pick a size the
screen actually fits and re-verify — never compensate in coordinates.

The `--args` string is load-bearing: `--disable-infobars` suppresses the
"Chrome for Testing is only for automated testing" banner, `about:blank`
prevents a stray "New Tab" tab in the tab strip. CRITICAL: every later
`open`/`goto` (mid-demo navigation) must repeat the exact same
`--headed --args "..."` flags — agent-browser relaunches the browser when
launch flags change, which brings the banner and stray tab back. Verify the
window is clean during rehearsal with a throwaway session — `tellclip record
--window <id>`, `tellclip stop`, `tellclip frame 0.5` — and look at the PNG:
clean window, and the size you set (a Retina capture is 2× the point size).

## The human keeps working — never interrupt them

The take runs on the human's machine while they use it. Their focus,
cursor, and keyboard are untouchable — a demo that hijacks the screen is a
failed demo even if the clip is perfect.

- CDP input needs no focus: the capture window can sit BEHIND the human's
  windows for the whole take and still record. Never activate or raise it,
  and never send OS-level mouse or keyboard events — the authored cursor
  track (below) exists precisely so the real cursor never has to move.
- Launch and size the capture browser ONCE, up front — that launch is the
  one focus steal the human expects. A mid-take relaunch (the launch-flags
  trap above) flashes a fresh window at them on top of wrecking the take.
- UI that must appear in front of them — `tellclip login`'s browser
  sign-in, `tellclip preview` — is setup, agreed with the human first,
  never sprung mid-work.
- Tellclip holds up its end: a CLI take launches the app hidden, shows no
  recorder UI, and never captures the microphone or camera (system audio
  is opt-in via `--system-audio`). Only the menu bar shows the running
  take.
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

## 2. Rehearse with the recorder OFF

Walk the entire flow once, collecting what the take needs: element refs,
scroll targets, coordinates. Three things to verify as you go:

- **Every screen and action in the take exists in the step-0 environment.**
  The rehearsal is where the flow proves it is real. A missing screen,
  button, or state is a step-0 problem — go back and ask the human; never
  fill the gap with a mocked page or a hand-built stand-in.
- **Every click actually mutated the UI.** `agent-browser click` dispatches
  real CDP input, so it works — but a click on a mispicked ref, or any
  synthetic `el.click()`, silently no-ops on Radix / Headless UI menus: the
  call reports success and the menu never opens. Assert the menu/dialog
  appeared. A dead click on camera is a retake, not an edit.
- **Re-snapshot after every navigation** — `agent-browser snapshot -i` is
  read-only and doesn't disturb the page. Refs go stale silently across
  navigations, and stale refs are what lose takes.

Then reset the app state back to the start. If a beat still needs you to
*look* at output mid-take, you have not rehearsed enough.

## 3. Record the take — one invocation

`tellclip targets` → the window with `app_name == "Google Chrome for Testing"`,
note `window_id`. Then write the whole take as a script and run it with one
Bash call: copy `<skill-dir>/scripts/take-template.sh`, fill in the beats,
`bash take.sh <window_id>`.

Every beat is one line — `sleep <pace>; tc-click @e5 "clicked Features"` —
which clicks the element AND drops a mark at its center (bounding box +
window-chrome offset measured live). Non-click beats mark themselves:
`agent-browser scroll down 450 && tellclip mark "scrolled"`.

Pacing — you have no prior for human speed, so use these:

| beat | hold |
| --- | --- |
| menu / dropdown opens | 0.9–1.3s |
| new screen or step | 1.5–2s before the next action |
| click → dependent click, same screen | 0.6–0.8s |
| final beat before stop | 2–2.5s |

Target: raw take under 30s, final clip 10–20s. If a beat needs more than
~2.5s of stillness to make sense, it is two clips, not one long one. Sleeps
are the only pacing you get; keeping helpers inside the script matters
because shell state does not survive between agent tool calls.

Botched take? `tellclip cancel` discards it — cheap. Genuinely slow setup
mid-flow (a long build, a human step) is what `tellclip pause` / `resume`
are for.

## 4. Edit — cursor, one zoom, then cuts

1. `tellclip cursor set --from-marks` — synthesizes the cursor the CDP
   recording has none of.
2. Add **one** zoom, on the single moment the clip exists to show. Zooms
   come BEFORE cuts so dead-air suggestions route around them.
3. `tellclip suggest` returns still stretches detected from the video itself
   as cut ranges that never touch your zooms. Review each against meaning
   before applying with `tellclip cut` (or `suggest --apply` to take all):
   an information-bearing screen keeps 1.5–2s even though nothing moves on
   it, and tail cuts often make the ending land abruptly. Always take the
   head cut — there is a multi-second gap between `record` and your first
   action. Animated content (looping video, spinners) is never flagged, so
   judge those stretches yourself. `tellclip edits` after each mutation.

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
- `tellclip frame <t>` at each mark → right page, right state, nothing
  half-rendered. (Raw capture, so it checks content, not the styled render.)
- Need the final framing checked? `tellclip save --out demo.mp4` and pull
  2–3 frames from the file: zoom crop, cursor visible, no seam mid-motion.
- `tellclip share` → share URL. Re-running replaces the same URL, so
  iterating on the edit is safe.

The take script stays re-runnable: when the product UI changes, re-record
deterministically instead of re-deriving the flow.

## Timing: never estimate timestamps

Your tool-call turnaround is seconds — an estimated timestamp is a wrong
timestamp. Chained `action && tellclip mark` keeps the gap ~100 ms, which is
accurate enough to edit against directly. Times are SOURCE seconds and stay
valid across cuts (cutting 0-2s does not renumber later timestamps).

If you cannot use agent-browser (e.g. MCP-only browsing), inject a click
logger before acting:
`window.__tc=[];addEventListener('click',e=>__tc.push({t:Date.now(),x:e.clientX,y:e.clientY}),true)`
then after `stop` batch retroactive marks:
`tellclip mark "label" --epoch-ms <t> --at <x,y>`. Never record through the
Claude-in-Chrome extension: it paints an orange cursor, viewport glow, and a
debugging banner into the capture at the compositor level — they cannot be
hidden. Any CDP driver (e.g. a raw Playwright script) also works with the
same inline-mark discipline.

## Positions: verify against a frame

Coordinates are normalized 0-1 from the TOP-LEFT of the captured window —
the raw capture, before the styled background/padding the final render wraps
around it. Never compensate for that padding; the renderer maps your
coordinates into the styled layout itself. `tc-click` computes positions for
you; for anything manual, `tellclip frame <t>` extracts the exact raw frame
as PNG — read positions off the image (`x = px/width`).

## Cursor: author it, the recording has none

CDP clicks never move the real macOS cursor. Positioned marks fix this in one
command: `tellclip cursor set --from-marks` synthesizes human-like motion
with click effects. Add non-click waypoints via `--file` if the demo needs
hover movement between clicks.

## Zooms are pointers, not polish

One zoom per clip, on the one moment the clip exists to show — the new
button, the menu that just opened. Everything else stays full-frame. Zooming
every click is the generic Ken Burns drift that makes a clip read as
machine-made, and it is the biggest single difference between a 29s bot-like
take and a 13s one.

- Level 2 is the default; 1.5 for context, 3 for small UI. Start ~0.5s before
  the click and hold only as long as the thing is worth looking at.
- Never zoom a stretch you expect `suggest` to cut: suggestions route AROUND
  authored zooms, so a long zoom traps its own dead air inside the clip.
- Unedited sessions get auto zooms at share time only if real clicks were
  captured — authored recordings should add their own.

## Other edits

- `tellclip speed <start> <end> 3` fast-forwards boring stretches (forms,
  loading) — better than cutting when the viewer should see it happen.
- `tellclip preview` opens the human editor (close it before further CLI
  edits).

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
- agent-browser's daemon survives between commands; `agent-browser close`
  ends the session, `pkill -f agent-browser` forces a truly fresh launch.
