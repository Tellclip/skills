#!/usr/bin/env node

// src/auth.ts
import { spawnSync } from "node:child_process";
import http from "node:http";
import { hostname } from "node:os";

// src/errors.ts
var EmitAndExit = class extends Error {
  constructor(payload, exitCode) {
    super("emit");
    this.payload = payload;
    this.exitCode = exitCode;
  }
};
function cliError(code, message, next, exitCode) {
  const error = { code, message };
  if (next !== void 0) error.next = next;
  return new EmitAndExit({ error }, exitCode);
}
var UsageError = class extends Error {
  constructor(message, showUsage = true) {
    super(message);
    this.showUsage = showUsage;
  }
};

// src/auth.ts
var appDefaultsDomain = "com.withmjp.tellclip";
var appSessionKey = "TCAuthSession";
var appleReferenceEpochMs = 9783072e5;
var loginTimeoutMs = 6e5;
function normalizedWebBaseURL(raw) {
  const value = (raw ?? process.env.TELLCLIP_WEB_BASE_URL ?? "").trim();
  const base = value !== "" ? value : "https://tellclip.com";
  try {
    const url = new URL(base);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return base.replace(/\/+$/, "");
  }
}
function appSessionPayload(input) {
  const expiresAt = (Date.parse(input.expiresAtIso) - appleReferenceEpochMs) / 1e3;
  return JSON.stringify({
    token: input.token,
    expiresAt,
    user: input.user,
    webBaseURL: input.webBaseURL
  });
}
async function standaloneLogin(deps = {}) {
  const base = deps.webBaseURL ?? normalizedWebBaseURL();
  const openUrl = deps.openUrl ?? openInBrowser;
  const persist = deps.persistAppSession ?? writeAppSession;
  const timeoutMs = deps.timeoutMs ?? loginTimeoutMs;
  const listener = await startLoopbackListener();
  try {
    const start = await postJson(`${base}/api/auth/native/start`, {
      redirectUri: listener.redirectUri,
      deviceName: `${hostname()} (tellclip CLI)`
    });
    const authorizationUrl = typeof start.authorizationUrl === "string" ? start.authorizationUrl : "";
    const state = typeof start.state === "string" ? start.state : "";
    if (authorizationUrl === "" || state === "") {
      throw loginFailed("The sign-in server returned an unusable response.");
    }
    if (!openUrl(authorizationUrl)) {
      throw cliError(
        "login_failed",
        `Could not open a browser. Open this URL on this Mac to sign in: ${authorizationUrl}`,
        "The sign-in callback lands on this machine's loopback, so the browser must run here.",
        1
      );
    }
    const callback = await withTimeout(listener.waitForCallback(), timeoutMs);
    if (callback.state !== state) {
      throw loginFailed("The sign-in response could not be verified (state mismatch).");
    }
    const complete = await postJson(`${base}/api/auth/native/complete`, {
      code: callback.code,
      state: callback.state
    });
    const token = typeof complete.token === "string" ? complete.token : "";
    const expiresAtIso = typeof complete.expiresAt === "string" ? complete.expiresAt : "";
    const user = complete.user;
    if (token === "" || expiresAtIso === "" || typeof user?.email !== "string") {
      throw loginFailed("The sign-in server returned an unusable session.");
    }
    persist(appSessionPayload({ token, expiresAtIso, user, webBaseURL: base }));
    return { signed_in: true, email: user.email };
  } finally {
    listener.close();
  }
}
async function standaloneLogout(deps = {}) {
  const base = deps.webBaseURL ?? normalizedWebBaseURL();
  const read = deps.readAppSession ?? readAppSession;
  const remove = deps.deleteAppSession ?? deleteAppSession;
  const session = read();
  if (session?.token) {
    await fetch(`${base}/api/auth/native/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.token}` }
    }).catch(() => {
    });
  }
  remove();
  return { signed_in: false };
}
function startLoopbackListener() {
  return new Promise((resolveListener, rejectListener) => {
    let settle;
    let fail;
    const callbackPromise = new Promise((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (!url.pathname.startsWith("/auth/callback")) {
        response.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get("error");
      if (error) {
        const description = url.searchParams.get("error_description") ?? error;
        respondHtml(response, 400, "Sign-in failed", description);
        fail?.(loginFailed(description));
        return;
      }
      const code = url.searchParams.get("code") ?? "";
      const state = url.searchParams.get("state") ?? "";
      if (code === "" || state === "") {
        respondHtml(response, 400, "Sign-in failed", "The callback was missing its code.");
        fail?.(loginFailed("The browser callback was missing its authorization code."));
        return;
      }
      respondHtml(response, 200, "Signed in", "Tellclip sign-in complete. You can close this window.");
      settle?.({ code, state });
    });
    server.on("error", rejectListener);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolveListener({
        redirectUri: `http://127.0.0.1:${port}/auth/callback`,
        waitForCallback: () => callbackPromise,
        close: () => server.close()
      });
    });
  });
}
function respondHtml(response, status, title, body) {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  response.end(
    `<!doctype html><html><head><meta charset="utf-8"><title>Tellclip \u2014 ${title}</title></head><body style="font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><main style="text-align:center"><h1 style="font-size:22px">${title}</h1><p style="color:#555">${body}</p></main></body></html>`
  );
}
async function postJson(url, body) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch {
    throw cliError(
      "login_failed",
      `Could not reach the sign-in server at ${url}.`,
      "Check the network connection, then run 'tellclip login' again.",
      1
    );
  }
  const payload = await response.json().catch(() => void 0);
  if (!response.ok || payload === void 0) {
    const message = typeof payload?.error === "string" ? payload.error : "Tellclip sign-in failed.";
    throw loginFailed(message);
  }
  return payload;
}
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        cliError(
          "login_timeout",
          "Sign-in did not complete within 10 minutes.",
          "Run 'tellclip login' again and finish sign-in in the browser.",
          1
        )
      );
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
function loginFailed(message) {
  return cliError(
    "login_failed",
    message,
    "Run 'tellclip login' again and complete sign-in in the browser.",
    1
  );
}
function openInBrowser(url) {
  return spawnSync("/usr/bin/open", [url], { stdio: "ignore" }).status === 0;
}
function writeAppSession(payloadJson) {
  const hex = Buffer.from(payloadJson, "utf8").toString("hex");
  const result = spawnSync("defaults", ["write", appDefaultsDomain, appSessionKey, "-data", hex], {
    stdio: "ignore"
  });
  if (result.status !== 0) {
    throw cliError(
      "login_failed",
      "Signed in, but could not store the session for the Tellclip app.",
      "Run 'tellclip login' again with the Tellclip app running.",
      1
    );
  }
}
function readAppSession() {
  const result = spawnSync("defaults", ["export", appDefaultsDomain, "-"], { encoding: "utf8" });
  if (result.status !== 0 || typeof result.stdout !== "string") return void 0;
  const match = result.stdout.match(
    new RegExp(`<key>${appSessionKey}</key>\\s*<data>\\s*([A-Za-z0-9+/=\\s]+?)\\s*</data>`)
  );
  if (!match) return void 0;
  try {
    const session = JSON.parse(Buffer.from(match[1].replace(/\s+/g, ""), "base64").toString("utf8"));
    return typeof session?.token === "string" ? { token: session.token } : void 0;
  } catch {
    return void 0;
  }
}
function deleteAppSession() {
  spawnSync("defaults", ["delete", appDefaultsDomain, appSessionKey], { stdio: "ignore" });
}

// src/guide.ts
var agentGuideText = `# Tellclip agent guide

You are driving a screen recording of a real macOS window while you automate
it (browser or any app), then polishing and sharing the result. Every command
prints one JSON object. Errors look like {"error":{"code","message","next"}} \u2014
\`next\` always tells you the recovery step.

CLI recordings are invisible on the host machine: the app launches hidden, no
recorder UI appears, and nothing steals the human's focus \u2014 only the menu bar
shows the running take. They are also always silent on input: the microphone
and camera are never captured (\`--system-audio\` opts into app sound); the
narration is the authored transcript. The human can still take screenshots
during your take, and can stop it from the menu bar \u2014 your next command then
reports \`not_recording\`.

## Skill, CLI, and MCP \u2014 route the work correctly

- The \`tellclip-demo\` skill routes the task and teaches the workflow. It does
  not execute the work itself.
- This CLI controls a recording or draft on this Mac: capture, cursor and zoom
  edits, cuts, speed changes, an authored timed transcript, metadata,
  rendering, saving, and sharing.
- Tellclip's hosted MCP works with authenticated organization data: members,
  workspaces, uploaded clips, transcripts, frames, comments, and
  organization-side clip settings.

The CLI cannot browse the organization.
MCP cannot record or edit a local draft. Neither substitutes for the other.

Authentication is separate too.
\`tellclip login\` signs in the local app/CLI session used by \`tellclip share\`.
It does not authenticate the hosted MCP. For MCP OAuth, use \`/mcp\` or
\`claude mcp login tellclip\` in Claude Code,
\`codex mcp login tellclip\` in Codex, or
\`cursor-agent mcp login tellclip\` in Cursor. Authenticate when organization
tools are needed.

A demo is a TAKE, not a transcript of your tool calls. The whole difference
between a clip that reads as human-made and one that reads as bot-made is
pacing and restraint, and both are decided before you press record.

## The loop

1. Stage the app and rehearse the flow with recording OFF (see Staging).
2. \`tellclip targets\` \u2014 pick the window (match bundle_id/title, note window_id).
3. Record the take as ONE chained shell invocation: \`record\`, then
   action+mark pairs separated by explicit sleeps, then \`stop\` (see The take).
4. Author the cursor track from marks, and add THE one zoom.
5. \`tellclip suggest\` \u2014 the app detects stretches where nothing on screen
   moved and returns cut ranges that route around your zooms. Review each
   against meaning, then apply with \`tellclip cut\` or \`suggest --apply\`.
6. Author the post-factum transcript from verified marks and frames.
7. QA the result \u2014 \`tellclip edits\`, \`tellclip transcript list\`,
   \`tellclip frame\` (see Closing the loop).
8. \`tellclip share\` \u2014 renders and uploads, returns the share URL
   (first time: run \`tellclip login\`, see Sharing).

## Staging \u2014 never record an unrehearsed flow

Two passes, both before the take:

1. STAGE the app. Log in. Delete stale entities so the flow starts from a
   clean slate. Seed whatever the screens need so no empty state, error, or
   "contact support" fallback appears on camera. Confirm with the human WHICH
   url is the real product surface \u2014 filming the wrong page is the single
   most expensive mistake available here, and nothing downstream catches it.
2. REHEARSE with recording off. Walk the entire flow: collect every element
   ref/selector, the normalized coordinates, and the scroll targets, and
   assert each click actually mutated the UI (menu opened, dialog appeared,
   row disappeared). Re-snapshot after every navigation \u2014 element refs go
   stale silently. Then reset the app state back to the start.

If a step still needs you to LOOK at output mid-take, you have not rehearsed
enough: \`tellclip cancel\` and rehearse again. A discarded take costs seconds;
a dead click on camera is a retake, and it cannot be fixed in the edit.

## The take \u2014 one invocation, no thinking inside it

Record the whole demo as a SINGLE chained shell call:

    tellclip record --window 42 \\
      && sleep 1.5 && <click> && tellclip mark "opened menu" --at 0.31,0.12 \\
      && sleep 1.1 && <click> && tellclip mark "chose Export" --at 0.34,0.28 \\
      && sleep 2.2 && tellclip stop

Your reasoning time is dead air on camera. Every turnaround between two
separate tool calls is a multi-second hole that you then have to cut back
out \u2014 the same flow driven one call per click ran 83s raw and 29s cut; chained
in one invocation it ran 23s raw and 13s cut. Sleeps are the ONLY pacing.

Practicalities: shell state (variables, functions) does not survive between
tool calls in most agent harnesses, so define any helper INSIDE the same
invocation as the take. You cannot read \`record\`'s response mid-chain, and you
do not need to \u2014 every command defaults to the newest session.

## Pacing \u2014 you have no prior for human speed

    menu / dropdown opens                    hold 0.9-1.3s
    new screen or step                       1.5-2s before the next action
    click -> dependent click, same screen    0.6-0.8s
    final beat before stop                   2-2.5s
    whole raw take                           under 30s (final clip 10-20s)

If a beat needs more than ~2.5s of stillness to make sense, it is two clips,
not one long one.

## Timing \u2014 never estimate timestamps

The recording clock is the only truth. Three ways to get accurate times,
best first:

- Chained shell commands (recommended, and the same call that gives you
  pacing): drive the browser with a bash CLI (\`agent-browser\`, or any CDP
  driver with inline marks) and chain the mark onto the action \u2014
    agent-browser click @e5 && tellclip mark "clicked X" --at 0.49,0.11
  The mark lands ~100 ms after the action with no LLM turnaround between
  them. This is also the visually clean path: launch with
  \`--args "--disable-infobars,about:blank"\` for a banner-free single-tab
  window. Never capture a browser driven by the Claude-in-Chrome extension \u2014
  it paints an orange cursor, viewport glow, and a debugging banner into the
  page at the compositor level; they cannot be hidden.
- In-page listener (browser MCP tools): before acting, inject once:
    window.__tc = [];
    addEventListener('click', e => __tc.push(
      {t: Date.now(), x: e.clientX, y: e.clientY}), true);
  After \`stop\`, read \`window.__tc\` once and batch retroactive marks
  with \`--epoch-ms\`.
- Live marks (fallback): call \`tellclip mark "label"\` right after an action.
  The stamp is late by your own turnaround; treat it as an upper bound and
  verify with \`tellclip frame\` before zooming tightly.

Epoch timestamps convert through the anchor automatically \u2014 the app subtracts
\`started_at_epoch_ms\` and any paused intervals.

## Real input only

Clicks must go through real input events (\`Input.dispatchMouseEvent\`,
\`agent-browser click\`). A synthetic \`el.click()\` silently no-ops on component
libraries that open on pointerdown \u2014 Radix, Headless UI, most command
palettes: the JS call reports success, the menu never opens, and the mark
you dropped points at nothing. Assert the resulting UI during rehearsal.

## Positions \u2014 verify, don't compute blind

Zoom targets and cursor points are normalized 0-1 from the TOP-LEFT of the
captured window \u2014 the RAW capture, exactly what \`tellclip frame <t>\` extracts
as PNG; read coordinates off that image (x = px/width, y = py/height). The
shared clip is rendered with a styled background and padding around the
capture, but that never affects your coordinates: the renderer maps them into
the styled layout itself. Never compensate for padding. Browser client
coordinates need the window-chrome offset added
(x = (chrome_left + clientX) / window_width) \u2014 when in doubt, frame-verify.

## Time domain

All edit times are SOURCE seconds \u2014 positions in the original recording.
Cutting 0-2s does NOT shift later timestamps: marks stay valid no matter how
many cuts you make.

Zooms and cuts keep each other clean automatically: a cut seam never lands
inside a zoom's glide \u2014 a zoom that would end at a seam is pulled back so
the camera settles first (or dropped when too little of it survives), a
zoom hold spanning a cut holds through the seam, and \`suggest\` never
proposes cuts inside authored zooms. Author zooms BEFORE cutting dead air
so suggestions can route around them.

## Cursor track (browser automation records no real cursor)

CDP clicks never move the macOS cursor, so the recording has none. Author one:

- Positioned marks make this automatic: \`tellclip cursor set --from-marks\`
  turns every mark that has \`--at\` into a click waypoint with smooth motion
  and click effects.
- Or supply the track directly:
    tellclip cursor set --file track.json
    {"points":[{"t":0,"x":0.5,"y":0.5},
               {"t":3.2,"x":0.31,"y":0.44,"click":true}]}

The app synthesizes human-like motion between points (idle, then move,
spring-smoothed) \u2014 sparse waypoints are enough. Add a point per click plus
one per meaningful hover.

## Editing discipline

- Zooms first, then dead air: \`tellclip suggest\` finds still stretches from
  the video itself (the recorder only stores frames when pixels change),
  pads them so settles stay visible, and carves them around authored zooms
  so no camera motion ever meets a seam. Animated content (looping videos,
  spinners) never gets flagged \u2014 visible motion is not dead air, so judge
  those stretches yourself. \`--min-still <s>\` raises the bar (default 2.0),
  \`--apply\` cuts everything suggested in one shot.
- Read every suggestion against MEANING, not stillness. A screen carrying
  something the viewer has to read keeps 1.5-2s after the cut even though
  nothing on it moves \u2014 \`suggest\` will happily reduce your one verification
  screen to a flash. Skip tail cuts that make the ending land abruptly. Do
  take the head cut: there is always a multi-second gap between \`record\` and
  your first action.
- \`tellclip edits\` after each mutation \u2014 confirm the timeline is what you
  think it is before moving on.
- Zooms are pointers, not polish: ONE zoom per clip, on the single moment the
  clip exists to show (the new button, the menu that just opened). Everything
  else stays full-frame. Zooming every click is generic Ken Burns drift and
  is most of what makes a clip read as machine-made.
- Level 2 is the default; 1.5 for context, 3 for small UI. Start ~0.5s before
  the click and hold only as long as the thing is worth looking at.
- Never zoom a stretch you expect \`suggest\` to cut. Suggestions route AROUND
  authored zooms, so a long zoom traps its own dead air inside the clip.
- Unedited recordings get automatic zooms at share time (from detected
  clicks, if any). \`tellclip zoom clear\` opts out; any \`zoom add\` takes full
  manual control.
- Sessions: every response echoes which session was touched. Commands default
  to the latest session; pass --session <id> when working with several takes.
  Only the newest 10 sessions are kept.

## Transcript \u2014 author it after the edit

Author the transcript after the edit, never while recording. An automated
take normally has no spoken narration; its transcript is concise viewer-facing
context for the distinct beats that actually appear on screen, not a log of
your commands or reasoning.

Build the whole track atomically from source-time marks and frame checks:

    printf '%s' '{"cues":[{"start":3.2,"end":5.0,"text":"Open the workspace settings."}]}' \\
      | tellclip transcript set

\`tellclip transcript set --file transcript.json\` reads the same shape from a
file. Cue times are SOURCE seconds, so marks remain valid after cuts; Tellclip
maps each cue through cuts and speed changes when it shares. Run \`tellclip
transcript list\` and check \`caption_cues\` for the final viewer-time positions.
Keep cues short, non-overlapping, and grounded in frames you verified. Submit
the full track again to replace it safely; do not append partial state across
retries.

The authored track becomes captions and the uploaded clip's transcript and
chapter input. CLI takes are silent, so the authored track is THE narration.
For a session the human recorded in the app with a microphone, the authored
track overrides the speech-generated transcript without deleting it;
\`tellclip transcript clear\` restores the generated track.

Cuts and speed changes made after \`transcript set\` can remove cues entirely;
every \`cut\`/\`speed\`/\`edits\` response reports the loss as
\`transcript_omitted_cue_count\`. If it is not 0, re-submit a track that
matches the new edit.

## Title and summary

Before sharing, set both: \`tellclip title "..."\` gives the clip a short,
specific name (120 characters maximum), while \`tellclip summary "..."\` gives
viewers 2-4 sentences about what the clip demonstrates. Ground the summary in
what you actually showed and said; omit padding, invented claims, and "In this
video..." boilerplate. Run \`tellclip edits\` to read both back, then share.

## Closing the loop \u2014 QA before you hand over a URL

The edit is not the deliverable; the rendered clip is. Check it:

- \`tellclip edits\` \u2014 \`edited_duration_seconds\` against your target, and
  \`kept_ranges\`/\`zoom_ranges\` against what you intended to build.
- \`tellclip frame <t>\` at each mark time \u2014 right page, right state, nothing
  half-rendered. This extracts the RAW capture, so it verifies content, not
  the styled render.
- If you need to check the final framing: \`tellclip save --out demo.mp4\` and
  pull 2-3 frames out of the file \u2014 zoom crop, cursor visible, no seam
  landing mid-motion.

## Sharing

\`tellclip share\` needs the app signed in. Run \`tellclip login\`: it opens a
browser sign-in (a human completes it once, within 10 minutes) and returns
{"signed_in":true,"email":\u2026} when the session lands. The app does not need
to be running \u2014 without it the CLI runs the browser flow itself and the app
adopts the sign-in when it next starts. The session persists across app
launches; \`tellclip status\` reports \`signed_in\`, and \`tellclip logout\`
signs out. This session is unrelated to hosted MCP OAuth. Re-running share on
the same session replaces
the clip at the SAME URL \u2014 safe to iterate. \`tellclip save --out demo.mp4\`
renders locally without uploading. \`tellclip preview\` opens the human
editor; close it before running more CLI edits.`;

// src/output.ts
function sortedForOutput(value) {
  if (Array.isArray(value)) return value.map(sortedForOutput);
  if (typeof value === "object" && value !== null) {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortedForOutput(value[key]);
    }
    return sorted;
  }
  return value;
}
function emit(object, exitCode) {
  const pretty = process.stdout.isTTY === true;
  let text;
  try {
    text = JSON.stringify(sortedForOutput(object), null, pretty ? 2 : void 0) ?? "{}";
  } catch {
    text = "{}";
  }
  process.stdout.write(text + "\n");
  process.exitCode = exitCode;
}

// src/spec.ts
import { readFileSync } from "node:fs";
var valueOptions = /* @__PURE__ */ new Set([
  "--window",
  "--app",
  "--display",
  "--region",
  "--session",
  "--at",
  "--level",
  "--t",
  "--epoch-ms",
  "--out",
  "--file",
  "--min-still"
]);
var booleanFlags = /* @__PURE__ */ new Set([
  "--system-audio",
  "--from-marks",
  "--apply"
]);
function parseArgs(args) {
  const parsed = { positional: [], options: /* @__PURE__ */ new Map(), flags: /* @__PURE__ */ new Set() };
  let index = 0;
  while (index < args.length) {
    const argument = args[index];
    if (booleanFlags.has(argument)) {
      parsed.flags.add(argument);
    } else if (valueOptions.has(argument)) {
      if (index + 1 >= args.length) {
        throw new UsageError(`${argument} requires a value.`);
      }
      parsed.options.set(argument, args[index + 1]);
      index += 1;
    } else if (argument.startsWith("--")) {
      throw new UsageError(`Unknown option ${argument}.`);
    } else {
      parsed.positional.push(argument);
    }
    index += 1;
  }
  return parsed;
}
function parseDouble(text) {
  if (!/^\S+$/.test(text)) return void 0;
  const value = Number(text);
  return Number.isNaN(value) ? void 0 : value;
}
function double(text, name) {
  const value = parseDouble(text);
  if (value === void 0) {
    throw new UsageError(`${name} must be a number, got '${text}'.`);
  }
  return value;
}
function splitNonEmpty(text, separator) {
  return text.split(separator).filter((part) => part !== "");
}
function pointObject(text, name) {
  const parts = splitNonEmpty(text, ",");
  const x = parts.length === 2 ? parseDouble(parts[0]) : void 0;
  const y = parts.length === 2 ? parseDouble(parts[1]) : void 0;
  if (x === void 0 || y === void 0) {
    throw new UsageError(`${name} must be 'x,y' with normalized 0-1 values, got '${text}'.`);
  }
  return { x, y };
}
function regionObject(text) {
  const parts = splitNonEmpty(text, ",");
  if (parts.length === 3 && parts[2].includes("x")) {
    const size = splitNonEmpty(parts[2], "x");
    if (size.length === 2) {
      const [x, y] = [parseDouble(parts[0]), parseDouble(parts[1])];
      const [width, height] = [parseDouble(size[0]), parseDouble(size[1])];
      if (x !== void 0 && y !== void 0 && width !== void 0 && height !== void 0) {
        return { x, y, width, height };
      }
    }
  }
  if (parts.length === 4) {
    const [x, y] = [parseDouble(parts[0]), parseDouble(parts[1])];
    const [width, height] = [parseDouble(parts[2]), parseDouble(parts[3])];
    if (x !== void 0 && y !== void 0 && width !== void 0 && height !== void 0) {
      return { x, y, width, height };
    }
  }
  throw new UsageError(`--region must be 'x,y,WxH' (e.g. 0,38,1280x800), got '${text}'.`);
}
function editSpec(op, parsed, fields = {}) {
  const body = { op };
  const session = parsed.options.get("--session");
  if (session !== void 0) body.session = session;
  Object.assign(body, fields);
  return { method: "POST", path: "/rpc/edit", body };
}
function makeRequestSpec(command, args) {
  const parsed = parseArgs(args);
  switch (command) {
    case "targets":
      return { method: "GET", path: "/targets" };
    case "status":
      return { method: "GET", path: "/status" };
    case "record": {
      const body = {
        system_audio: parsed.flags.has("--system-audio")
      };
      const selectors = ["--window", "--app", "--display", "--region"].filter((option) => parsed.options.has(option));
      if (selectors.length !== 1) {
        throw new UsageError("record needs exactly one of --window, --app, --display, --region.");
      }
      switch (selectors[0]) {
        case "--window": {
          const value = parsed.options.get("--window");
          if (/^[+-]?\d+$/.test(value)) {
            body.window_id = parseInt(value, 10);
          } else {
            body.window_title = value;
          }
          break;
        }
        case "--app":
          body.app = parsed.options.get("--app");
          break;
        case "--display":
          body.display = parsed.options.get("--display");
          break;
        default:
          body.region = regionObject(parsed.options.get("--region"));
      }
      return { method: "POST", path: "/rpc/record", body };
    }
    case "stop":
    case "cancel":
    case "pause":
    case "resume":
      return { method: "POST", path: `/rpc/${command}`, body: {} };
    case "login":
      return { method: "POST", path: "/rpc/login", body: {} };
    case "logout":
      return { method: "POST", path: "/rpc/logout", body: {} };
    case "mark": {
      if (parsed.positional.length !== 1) {
        throw new UsageError('mark needs a label: tellclip mark "clicked publish".');
      }
      const body = { label: parsed.positional[0] };
      const at = parsed.options.get("--at");
      if (at !== void 0) body.at = pointObject(at, "--at");
      const t = parsed.options.get("--t");
      if (t !== void 0) body.t = double(t, "--t");
      const epoch = parsed.options.get("--epoch-ms");
      if (epoch !== void 0) body.epoch_ms = double(epoch, "--epoch-ms");
      const session = parsed.options.get("--session");
      if (session !== void 0) body.session = session;
      return { method: "POST", path: "/rpc/mark", body };
    }
    case "zoom": {
      const subcommand = parsed.positional[0];
      if (subcommand === void 0) {
        throw new UsageError("zoom needs a subcommand: add, list, or clear.");
      }
      switch (subcommand) {
        case "add": {
          if (parsed.positional.length !== 3) {
            throw new UsageError("zoom add needs start and end seconds: tellclip zoom add 3 7.");
          }
          const fields = {
            start: double(parsed.positional[1], "start"),
            end: double(parsed.positional[2], "end")
          };
          const level = parsed.options.get("--level");
          if (level !== void 0) fields.level = double(level, "--level");
          const at = parsed.options.get("--at");
          if (at !== void 0) fields.at = pointObject(at, "--at");
          return editSpec("zoom_add", parsed, fields);
        }
        case "list":
          return editSpec("zoom_list", parsed);
        case "clear":
          return editSpec("zoom_clear", parsed);
        default:
          throw new UsageError(`Unknown zoom subcommand '${subcommand}'.`);
      }
    }
    case "cut":
      if (parsed.positional.length !== 2) {
        throw new UsageError("cut needs start and end seconds: tellclip cut 12.5 18.2.");
      }
      return editSpec("cut", parsed, {
        start: double(parsed.positional[0], "start"),
        end: double(parsed.positional[1], "end")
      });
    case "speed":
      if (parsed.positional.length !== 3) {
        throw new UsageError("speed needs start, end, and rate: tellclip speed 20 30 2.");
      }
      return editSpec("speed", parsed, {
        start: double(parsed.positional[0], "start"),
        end: double(parsed.positional[1], "end"),
        rate: double(parsed.positional[2], "rate")
      });
    case "title":
      if (parsed.positional.length !== 1) {
        throw new UsageError('title needs the text: tellclip title "Onboarding demo".');
      }
      return editSpec("title", parsed, { text: parsed.positional[0] });
    case "summary":
      if (parsed.positional.length !== 1) {
        throw new UsageError('summary needs the text: tellclip summary "Shows the onboarding flow.".');
      }
      return editSpec("summary", parsed, { text: parsed.positional[0] });
    case "transcript": {
      const subcommand = parsed.positional[0];
      if (subcommand === void 0) {
        throw new UsageError("transcript needs a subcommand: set, list, or clear.");
      }
      switch (subcommand) {
        case "set": {
          if (parsed.positional.length !== 1) {
            throw new UsageError("transcript set reads a JSON cue track from --file or stdin.");
          }
          let trackData;
          const file = parsed.options.get("--file");
          if (file !== void 0) {
            try {
              trackData = readFileSync(file);
            } catch {
              throw new UsageError(`Could not read transcript track file at ${file}.`, false);
            }
          } else {
            trackData = readFileSync(0);
          }
          const cues = parseTranscriptTrack(trackData);
          if (cues === void 0) {
            throw new UsageError(
              'Transcript track must be JSON: {"cues":[{"start":1.5,"end":3.2,"text":"Open Settings."},\u2026]}.',
              false
            );
          }
          return editSpec("transcript_set", parsed, { cues });
        }
        case "list":
          if (parsed.positional.length !== 1) {
            throw new UsageError("transcript list takes no positional arguments.");
          }
          return editSpec("transcript_list", parsed);
        case "clear":
          if (parsed.positional.length !== 1) {
            throw new UsageError("transcript clear takes no positional arguments.");
          }
          return editSpec("transcript_clear", parsed);
        default:
          throw new UsageError(`Unknown transcript subcommand '${subcommand}'.`);
      }
    }
    case "suggest": {
      const fields = {};
      const minStill = parsed.options.get("--min-still");
      if (minStill !== void 0) fields.min_still = double(minStill, "min-still");
      if (parsed.flags.has("--apply")) fields.apply = true;
      return editSpec("suggest", parsed, fields);
    }
    case "edits":
      return editSpec("dump", parsed);
    case "marks":
      return editSpec("marks", parsed);
    case "frame": {
      if (parsed.positional.length !== 1) {
        throw new UsageError("frame needs a time in seconds: tellclip frame 12.4.");
      }
      const fields = { t: double(parsed.positional[0], "t") };
      const out = parsed.options.get("--out");
      if (out !== void 0) fields.out = out;
      return editSpec("frame", parsed, fields);
    }
    case "cursor": {
      const subcommand = parsed.positional[0];
      if (subcommand === void 0) {
        throw new UsageError("cursor needs a subcommand: set or clear.");
      }
      switch (subcommand) {
        case "set": {
          if (parsed.flags.has("--from-marks")) {
            return editSpec("cursor_set", parsed, { from_marks: true });
          }
          let trackData;
          const file = parsed.options.get("--file");
          if (file !== void 0) {
            try {
              trackData = readFileSync(file);
            } catch {
              throw new UsageError(`Could not read cursor track file at ${file}.`, false);
            }
          } else {
            trackData = readFileSync(0);
          }
          const points = parseCursorTrack(trackData);
          if (points === void 0) {
            throw new UsageError(
              'Cursor track must be JSON: {"points":[{"t":0,"x":0.5,"y":0.5,"click":false},\u2026]}.',
              false
            );
          }
          return editSpec("cursor_set", parsed, { points });
        }
        case "clear":
          return editSpec("cursor_clear", parsed);
        default:
          throw new UsageError(`Unknown cursor subcommand '${subcommand}'.`);
      }
    }
    case "preview": {
      const body = {};
      const session = parsed.options.get("--session");
      if (session !== void 0) body.session = session;
      return { method: "POST", path: "/rpc/preview", body };
    }
    case "save": {
      const body = {};
      const session = parsed.options.get("--session");
      if (session !== void 0) body.session = session;
      const out = parsed.options.get("--out");
      if (out !== void 0) body.out = out;
      return { method: "POST", path: "/rpc/save", body };
    }
    case "share": {
      const body = {};
      const session = parsed.options.get("--session");
      if (session !== void 0) body.session = session;
      return { method: "POST", path: "/rpc/share", body };
    }
    default:
      throw new UsageError(`Unknown command '${command}'.`);
  }
}
function parseCursorTrack(data) {
  let track;
  try {
    track = JSON.parse(data.toString("utf8"));
  } catch {
    return void 0;
  }
  if (typeof track !== "object" || track === null || Array.isArray(track)) return void 0;
  const points = track.points;
  if (!Array.isArray(points)) return void 0;
  const objects = points.every(
    (point) => typeof point === "object" && point !== null && !Array.isArray(point)
  );
  return objects ? points : void 0;
}
function parseTranscriptTrack(data) {
  let track;
  try {
    track = JSON.parse(data.toString("utf8"));
  } catch {
    return void 0;
  }
  if (typeof track !== "object" || track === null || Array.isArray(track)) return void 0;
  const cues = track.cues;
  if (!Array.isArray(cues)) return void 0;
  const objects = cues.every(
    (cue) => typeof cue === "object" && cue !== null && !Array.isArray(cue)
  );
  return objects ? cues : void 0;
}

// src/transport.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import { readFileSync as readFileSync2 } from "node:fs";
import http2 from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
function discoveryFilePath() {
  return join(homedir(), "Library", "Application Support", "TellClip", "cli.json");
}
function readDiscoveryFile() {
  try {
    const object = JSON.parse(readFileSync2(discoveryFilePath(), "utf8"));
    const { port, token } = object ?? {};
    if (Number.isInteger(port) && typeof token === "string") {
      return { port, token };
    }
  } catch {
  }
  return void 0;
}
function send(spec, endpoint, timeoutMs) {
  return new Promise((resolve) => {
    const payload = spec.method === "POST" ? JSON.stringify(spec.body ?? {}) : void 0;
    const headers = {
      authorization: `Bearer ${endpoint.token}`
    };
    if (payload !== void 0) {
      headers["content-type"] = "application/json";
      headers["content-length"] = Buffer.byteLength(payload);
    }
    const request = http2.request(
      { host: "127.0.0.1", port: endpoint.port, path: spec.path, method: spec.method, headers },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on(
          "end",
          () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks) })
        );
        response.on("error", () => resolve(void 0));
      }
    );
    request.setTimeout(timeoutMs, () => request.destroy());
    request.on("error", () => resolve(void 0));
    if (payload !== void 0) request.write(payload);
    request.end();
  });
}
async function probe(endpoint) {
  const response = await send({ method: "GET", path: "/status" }, endpoint, 2e3);
  return response !== void 0;
}
function launchApp() {
  const appPath = process.env.TELLCLIP_APP;
  const args = appPath ? ["-g", "-j", appPath] : ["-g", "-j", "-b", "com.withmjp.tellclip"];
  const result = spawnSync2("/usr/bin/open", args, { stdio: "ignore" });
  return result.status === 0;
}
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function connectOrLaunch() {
  const known = readDiscoveryFile();
  if (known && await probe(known)) return known;
  if (!launchApp()) {
    throw cliError(
      "app_unreachable",
      "The Tellclip app is not installed, so the CLI has nothing to control.",
      "Install Tellclip from https://tellclip.com and open it once, then retry. For a non-standard location, set TELLCLIP_APP=/path/to/TellClip.app.",
      3
    );
  }
  const deadline = Date.now() + 15e3;
  while (Date.now() < deadline) {
    await sleep(250);
    const endpoint = readDiscoveryFile();
    if (endpoint && await probe(endpoint)) return endpoint;
  }
  throw cliError(
    "app_unreachable",
    "Tellclip is not responding on its control port.",
    "Quit Tellclip if it is running, reopen it, then retry. The app must be running for the CLI to work.",
    3
  );
}

// src/usage.ts
var usageText = `tellclip \u2014 record, edit, and share Tellclip clips from the command line.

USAGE
  tellclip targets
  tellclip record (--window <id|title> | --app <name|bundle-id> | --display <id|main> | --region <x,y,WxH>)
                  [--system-audio]
  tellclip status
  tellclip pause | resume
  tellclip mark <label> [--at <x,y>] [--t <seconds> | --epoch-ms <ms>] [--session <s>]
  tellclip stop
  tellclip cancel
  tellclip zoom add <start> <end> [--level <1-5>] [--at <x,y>] [--session <s>]
  tellclip zoom list | zoom clear [--session <s>]
  tellclip suggest [--min-still <seconds>] [--apply] [--session <s>]
  tellclip cut <start> <end> [--session <s>]
  tellclip speed <start> <end> <rate> [--session <s>]
  tellclip title <text> [--session <s>]
  tellclip summary <text> [--session <s>]
  tellclip transcript set [--file <path>] [--session <s>]
  tellclip transcript list [--session <s>]
  tellclip transcript clear [--session <s>]
  tellclip edits | marks [--session <s>]
  tellclip frame <seconds> [--out <path>] [--session <s>]
  tellclip cursor set [--file <path>] [--from-marks] [--session <s>]
  tellclip cursor clear [--session <s>]
  tellclip preview [--session <s>]
  tellclip save [--out <path>] [--session <s>]
  tellclip share [--session <s>]
  tellclip login | logout
  tellclip guide

All output is JSON. Edit and transcript cue times are seconds in the source
recording; coordinates are normalized 0-1 from the top-left of the captured
window. Run \`tellclip guide\` for the full agent workflow.`;

// src/main.ts
async function run() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (command === void 0) {
    throw new UsageError("No command given.");
  }
  if (command === "help" || command === "-h" || command === "--help") {
    process.stdout.write(usageText + "\n");
    return;
  }
  if (command === "guide") {
    process.stdout.write(agentGuideText + "\n");
    return;
  }
  const spec = makeRequestSpec(command, args.slice(1));
  if (command === "login" || command === "logout") {
    const endpoint = readDiscoveryFile();
    if (endpoint === void 0 || !await probe(endpoint)) {
      const result = command === "login" ? await standaloneLogin() : await standaloneLogout();
      emit(result, 0);
      return;
    }
    await sendAndEmit(spec, endpoint);
    return;
  }
  await sendAndEmit(spec, await connectOrLaunch());
}
async function sendAndEmit(spec, endpoint) {
  const response = await send(spec, endpoint, 36e5);
  if (response === void 0) {
    throw cliError(
      "app_unreachable",
      "Tellclip stopped responding mid-command.",
      "Check that Tellclip is still running, then retry. Long renders resume from cache.",
      3
    );
  }
  let object;
  try {
    object = JSON.parse(response.body.toString("utf8"));
  } catch {
    object = void 0;
  }
  if (typeof object !== "object" || object === null || Array.isArray(object)) {
    throw cliError("bad_response", "The app returned a non-JSON response.", void 0, 1);
  }
  const result = object;
  emit(result, result.error === void 0 ? 0 : 1);
}
run().catch((error) => {
  if (error instanceof UsageError) {
    if (error.showUsage) {
      process.stderr.write(usageText + "\n");
    }
    emit({ error: { code: "usage", message: error.message } }, 2);
  } else if (error instanceof EmitAndExit) {
    emit(error.payload, error.exitCode);
  } else {
    const message = error instanceof Error ? error.message : String(error);
    emit({ error: { code: "internal_error", message } }, 1);
  }
});
