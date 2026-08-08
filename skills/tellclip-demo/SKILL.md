---
name: tellclip-demo
description: >
  Record, edit, and publish a product demo video with the `tellclip` CLI while
  driving a browser with `agent-browser`. Use when asked to record a demo,
  capture a product walkthrough, make a marketing clip of a flow, or share a
  screen recording of automated actions. Covers staging the demo state,
  rehearsing before the take, recording the whole flow in one shell
  invocation with human pacing, clean-browser launch, precise timing via
  chained marks, authored cursor tracks, zoom/cut/speed edits, and upload.
---

# Recording a product demo with tellclip

`tellclip` remote-controls the Tellclip macOS app. Every command prints one
JSON object; errors carry `{"error":{code,message,next}}` where `next` is the
recovery step — follow it. Full contract: run `tellclip guide`.

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

## Launch a clean capture browser

```
agent-browser open <url> --headed --args "--disable-infobars,about:blank"
agent-browser set viewport 1600 900
```

The `--args` string is load-bearing: `--disable-infobars` suppresses the
"Chrome for Testing is only for automated testing" banner, `about:blank`
prevents a stray "New Tab" tab in the tab strip. CRITICAL: every later
`open`/`goto` (mid-demo navigation) must repeat the exact same
`--headed --args "..."` flags — agent-browser relaunches the browser when
launch flags change, which brings the banner and stray tab back. Verify the
window is clean during rehearsal with a throwaway session — `tellclip record
--window <id>`, `tellclip stop`, `tellclip frame 0.5` — and look at the PNG.

## 1. Stage the demo state

Nothing downstream catches a badly staged app — it costs a whole take.

- Log in before recording; confirm with the human WHICH url is the real
  product surface (not the marketing page, not a stale preview deploy).
- Delete stale entities so the flow starts from a clean slate.
- Seed data so no empty state, error, or "contact sales" fallback appears on
  camera. Walk each screen the take will visit and look at it.

## 2. Rehearse with the recorder OFF

Walk the entire flow once, collecting what the take needs: element refs,
scroll targets, coordinates. Two things to verify as you go:

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

## 5. QA, then publish

The edit is not the deliverable; the rendered clip is.

- `tellclip edits` → `edited_duration_seconds` against your target, and
  `kept_ranges` / `zoom_ranges` against what you meant to build.
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
- `tellclip title "..."` names the clip; `tellclip preview` opens the human
  editor (close it before further CLI edits).

## Gotchas

- Only the newest 10 sessions are kept — share or save before recording many
  takes. Address older takes with `--session <id>` (every response echoes it).
- `share` needs the app signed in once: run `tellclip login` (opens a browser
  sign-in a human completes; `tellclip status` reports `signed_in`);
  `save` additionally needs a paid plan. Both report structured errors with
  the fix in `next`.
- The Tellclip app must be running; the CLI auto-launches it if not.
- agent-browser's daemon survives between commands; `agent-browser close`
  ends the session, `pkill -f agent-browser` forces a truly fresh launch.
