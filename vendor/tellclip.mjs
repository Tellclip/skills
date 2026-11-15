#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/version.ts
var version_exports = {};
__export(version_exports, {
  cliVersion: () => cliVersion,
  isVersionOlder: () => isVersionOlder
});
function isVersionOlder(candidate, minimum) {
  const candidateParts = numericVersion(candidate);
  const minimumParts = numericVersion(minimum);
  if (candidateParts === void 0 || minimumParts === void 0) return false;
  const count = Math.max(candidateParts.length, minimumParts.length);
  for (let index = 0; index < count; index += 1) {
    const candidatePart = candidateParts[index] ?? 0;
    const minimumPart = minimumParts[index] ?? 0;
    if (candidatePart !== minimumPart) return candidatePart < minimumPart;
  }
  return false;
}
function numericVersion(version) {
  const components = version.split(".");
  if (components.length === 0 || components.some((component) => !/^\d+$/.test(component))) {
    return void 0;
  }
  return components.map(Number);
}
var cliVersion;
var init_version = __esm({
  "src/version.ts"() {
    "use strict";
    cliVersion = true ? "0.3.0" : "dev";
  }
});

// src/auth.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import http2 from "node:http";
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

// src/session-store.ts
import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
function sessionPath(origin, configRoot) {
  const configured = process.env.XDG_CONFIG_HOME;
  const root = configRoot ?? (configured && path.isAbsolute(configured) ? configured : path.join(homedir(), ".config"));
  return path.join(
    root,
    "tellclip",
    "sessions",
    `${createHash("sha256").update(origin).digest("hex")}.json`
  );
}
function writeLinuxSession(origin, payload, configRoot) {
  const file = sessionPath(origin, configRoot);
  mkdirSync(path.dirname(file), { recursive: true, mode: 448 });
  chmodSync(path.dirname(file), 448);
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, payload, { mode: 384, flag: "wx" });
    renameSync(temporary, file);
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
    }
  }
}
function readLinuxSession(origin, configRoot) {
  const file = sessionPath(origin, configRoot);
  try {
    const info = lstatSync(file);
    if (!info.isFile() || (info.mode & 63) !== 0) return void 0;
    return readFileSync(file, "utf8");
  } catch {
    return void 0;
  }
}
function deleteLinuxSession(origin, configRoot) {
  try {
    unlinkSync(sessionPath(origin, configRoot));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

// src/transport.ts
import { spawnSync } from "node:child_process";
import { readFileSync as readFileSync2 } from "node:fs";
import http from "node:http";
import { homedir as homedir2 } from "node:os";
import { join } from "node:path";
init_version();
var updateNext = "In Claude Code run `claude plugin update tellclip@tellclip` and restart the session; otherwise `npm i -g tellclip@latest`.";
function discoveryFilePath() {
  return join(homedir2(), "Library", "Application Support", "TellClip", "cli.json");
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
function send(spec, endpoint, timeoutMs, version = cliVersion, signal) {
  return new Promise((resolve2) => {
    const payload = spec.method === "POST" ? JSON.stringify(spec.body ?? {}) : void 0;
    const headers = {
      authorization: `Bearer ${endpoint.token}`,
      "x-tellclip-cli-version": version
    };
    if (payload !== void 0) {
      headers["content-type"] = "application/json";
      headers["content-length"] = Buffer.byteLength(payload);
    }
    const request = http.request(
      { host: "127.0.0.1", port: endpoint.port, path: spec.path, method: spec.method, headers, signal },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on(
          "end",
          () => resolve2({ status: response.statusCode ?? 0, body: Buffer.concat(chunks) })
        );
        response.on("error", () => resolve2(void 0));
      }
    );
    request.setTimeout(timeoutMs, () => request.destroy());
    request.on("error", () => resolve2(void 0));
    if (payload !== void 0) request.write(payload);
    request.end();
  });
}
async function probe(endpoint, version = cliVersion) {
  const response = await send({ method: "GET", path: "/status" }, endpoint, 2e3, version);
  if (response === void 0) return void 0;
  let status = {};
  try {
    const parsed = JSON.parse(response.body.toString("utf8"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      status = parsed;
    }
  } catch {
  }
  if (typeof status.min_cli_version === "string" && isVersionOlder(version, status.min_cli_version)) {
    throw cliError(
      "cli_outdated",
      `tellclip ${version} is older than the minimum supported version ${status.min_cli_version}.`,
      updateNext,
      1
    );
  }
  if (typeof status.bundled_cli_version === "string" && isVersionOlder(version, status.bundled_cli_version)) {
    process.stderr.write(
      `tellclip ${version} is behind the version shipped with this Tellclip (${status.bundled_cli_version}). ${updateNext}
`
    );
  }
  if (typeof status.app_update_available === "string") {
    process.stderr.write(`A Tellclip app update is available (${status.app_update_available})
`);
  }
  return status;
}
function launchApp() {
  const appPath = process.env.TELLCLIP_APP;
  const args = appPath ? ["-g", "-j", appPath] : ["-g", "-j", "-b", "com.withmjp.tellclip"];
  const result = spawnSync("/usr/bin/open", args, { stdio: "ignore" });
  return result.status === 0;
}
var sleep = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms));
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
async function loginWithApp(endpoint, timeoutMs = loginTimeoutMs, signal) {
  const response = await send({ method: "POST", path: "/rpc/login", body: {} }, endpoint, timeoutMs, void 0, signal);
  if (!response) throw loginFailed("Tellclip did not finish sign-in.");
  let result;
  try {
    result = JSON.parse(response.body.toString("utf8"));
  } catch {
    throw loginFailed("Tellclip returned an unusable sign-in response.");
  }
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw loginFailed("Tellclip returned an unusable sign-in response.");
  }
  const payload = result;
  if (payload.error !== void 0) throw new EmitAndExit(payload, 1);
  return payload;
}
async function standaloneLogin(deps = {}) {
  const base = deps.webBaseURL ?? normalizedWebBaseURL();
  const openUrl = deps.openUrl ?? openInBrowser;
  const persist = deps.persistAppSession ?? ((payload) => process.platform === "linux" ? writeLinuxSession(base, payload) : writeAppSession(payload));
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
        `Could not open a browser. Open this URL on this computer: ${authorizationUrl}`,
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
  const read = deps.readAppSession ?? (() => readStoredSession(base));
  const remove = deps.deleteAppSession ?? (() => {
    if (process.platform === "linux") deleteLinuxSession(base);
    else if (readStoredSession(base)) deleteAppSession();
  });
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
    const callbackPromise = new Promise((resolve2, reject) => {
      settle = resolve2;
      fail = reject;
    });
    const server = http2.createServer((request, response) => {
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
  return new Promise((resolve2, reject) => {
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
        resolve2(value);
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
  return spawnSync2(process.platform === "linux" ? "xdg-open" : "/usr/bin/open", [url], { stdio: "ignore" }).status === 0;
}
function writeAppSession(payloadJson) {
  const hex = Buffer.from(payloadJson, "utf8").toString("hex");
  const result = spawnSync2("defaults", ["write", appDefaultsDomain, appSessionKey, "-data", hex], {
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
  const result = spawnSync2("defaults", ["export", appDefaultsDomain, "-"], { encoding: "utf8" });
  if (result.status !== 0 || typeof result.stdout !== "string") return void 0;
  const match = result.stdout.match(
    new RegExp(`<key>${appSessionKey}</key>\\s*<data>\\s*([A-Za-z0-9+/=\\s]+?)\\s*</data>`)
  );
  if (!match) return void 0;
  try {
    const session = JSON.parse(Buffer.from(match[1].replace(/\s+/g, ""), "base64").toString("utf8"));
    return typeof session?.token === "string" ? session : void 0;
  } catch {
    return void 0;
  }
}
function readStoredSession(base) {
  try {
    const session = process.platform === "linux" ? JSON.parse(readLinuxSession(base) ?? "null") : readAppSession();
    return session && session.webBaseURL === base && typeof session.token === "string" ? session : void 0;
  } catch {
    return void 0;
  }
}
function uploadToken(base) {
  if (process.env.TELLCLIP_API_KEY !== void 0) {
    const key = process.env.TELLCLIP_API_KEY.trim();
    if (!key) throw cliError("unauthorized", "TELLCLIP_API_KEY is empty.", "Supply an API key or unset it and run tellclip login.", 1);
    return key;
  }
  const session = readStoredSession(base);
  if (!session || !Number.isFinite(session.expiresAt) || session.expiresAt * 1e3 + appleReferenceEpochMs <= Date.now()) {
    throw cliError("unauthorized", "No valid sign-in for this server.", "Run tellclip login or set TELLCLIP_API_KEY.", 1);
  }
  return session.token;
}
function deleteAppSession() {
  spawnSync2("defaults", ["delete", appDefaultsDomain, appSessionKey], { stdio: "ignore" });
}

// src/guide.ts
init_version();
var agentGuideText = `# Tellclip agent guide (tellclip ${cliVersion})

On a new machine, start with \`tellclip setup\`. It sets up the app and agent
integrations, checks permission and sign-in, and records a short test clip.
Read the file at \`skill_path\` in its JSON result and follow its \`next\` instructions.

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

For an existing MP4, use \`tellclip upload file.mp4 --title "Demo"\`.
This command works on macOS and Linux without the Tellclip app.
It requires Node.js 20 or later and FFmpeg, including ffprobe.
Files must use 8-bit H.264 with 4:2:0 color and optional AAC audio.
The size limit is 5 GB (5,000,000,000 bytes).
Clips can be up to 60 minutes long.
The result is {"clip_id":"\u2026","url":"\u2026","status":"ready"}. Progress goes to stderr.

Tellclip does not transcribe uploads. You know what the video shows, so
author the content and send it with the upload:

  tellclip upload demo.mp4 --title "Demo" \\
    --transcript track.json --chapters chapters.json --summary "\u2026" \\
    --thumbnail 4.5

- \`--transcript\`: the \`transcript set\` cues JSON
  ({"cues":[{"start":1.5,"end":3.2,"text":"Open Settings."}]}) or a WebVTT
  file, e.g. from whisper. It becomes the captions and the transcript.
- \`--chapters\`: {"chapters":[{"start":0,"title":"Intro"}]}, 1\u201350 chapters,
  starts rounded down to whole seconds and strictly increasing, titles up to 120 characters.
- \`--summary\`: 2\u20134 sentences, up to 600 characters.
- \`--thumbnail\`: the second whose frame becomes the thumbnail and poster.
  Pick the frame that best shows what the clip is about: the key screen or
  the finished result. Never pick a fade, a blank or loading frame, or a
  transition. Look at it first:
  \`ffmpeg -ss 4.5 -i demo.mp4 -frames:v 1 thumb.jpg\`. Without it, Tellclip
  uses the most detailed frame of the first 5 seconds.
Times are seconds in the video. Everything is checked before the video
transfers. With a transcript, Tellclip generates any chapters or summary you
leave out; it never replaces what you authored.

For CI, use an organization API key in \`TELLCLIP_API_KEY\`.
Owners and admins create keys under Settings \u2192 Integrations.
Keys permit uploads only. They do not grant recording, editing, or MCP access.
The key takes precedence over personal sign-in, without fallback on failure.
Any member can instead use \`tellclip login\` from a computer with a browser.
Uploads require an active trial or subscription.

- The \`tellclip-demo\` skill routes the task and teaches the workflow. It does
  not execute the work itself.
- This CLI controls a recording or draft on this Mac: capture, cursor and zoom
  edits, cuts, speed changes, an authored timed transcript, metadata,
  rendering, saving, and sharing.
- Tellclip's hosted MCP works with authenticated organization data: members,
  workspaces, uploaded clips, transcripts, frames, comments, and
  organization-side clip settings.
- Every organization has an Agents workspace for clips that are not for
  people: feedback recorded for a coding agent and short proof-of-work clips.
  Use MCP move_clip to file a clip there when that is what it is.

The CLI cannot browse the organization.
MCP cannot record or edit a local draft. Neither substitutes for the other.

Authentication is separate too.
\`tellclip login\` signs in the local app/CLI session used by \`tellclip share\`.
It does not authenticate the hosted MCP. For MCP OAuth, use \`/mcp\` or
\`claude mcp login tellclip\` in Claude Code,
\`codex mcp login tellclip\` in Codex, or
\`cursor-agent mcp login tellclip\` in Cursor. Authenticate when organization
tools are needed.

## Agent Editing mode

The editor may stay open while you edit its recording. The first mutating
command temporarily places that editor in Agent Editing mode and makes it
read-only for the person at the Mac. The lease remains active while a command
runs and for a short idle period between commands. Read-only commands such as
\`status\`, \`targets\`, \`marks\`, \`frame\`, \`edits\`, \`zoom list\`,
\`transcript list\`, and \`suggest\` without \`--apply\` never activate it.

The person can choose Switch to Manual Mode at any time. If a command returns
\`agent_stopped\`, stop immediately, do not retry automatically, and wait for
an explicit request to continue. \`session_open_in_editor\` is a legacy error
from older Tellclip versions; ask the person to update Tellclip or close the
editor if it appears. The editor's robot button only copies an editing prompt;
clicking it does not grant agent access.

A demo is a TAKE, not a transcript of your tool calls. The whole difference
between a clip that reads as human-made and one that reads as bot-made is
pacing and restraint, and both are decided before you press record.

## Browser demos \u2014 Tellclip drives the page

For a web page, bring no browser driver. Tellclip opens its own capture
browser (the Chrome installed on this Mac, with a profile Tellclip keeps, so
a sign-in is done once) and performs each action itself. It knows when and
where each action happened and when the page finished reacting, so there is
no sleep table, no rehearsal for timing, no cursor to author and no dead air
to cut.

    tellclip browser open http://localhost:5173/app
    tellclip browser click e12 --off-camera      # staging, before the take
    tellclip record --browser
    tellclip browser click e31                   # one step = one beat
    tellclip browser type "Apollo" --into e44
    tellclip browser click button:Create
    tellclip stop                                # cursor and cuts are in place

The window opens behind the person's windows and never takes focus. It
renders at the screen's own pixel ratio, and \`open\` sizes the page to
1600x900 (\`--viewport WxH\` for another size; the result says what you got).

Reading the page. \`open\` and every step print \`snapshot\`: the page as
lines, read from Chrome's accessibility tree.

    navigation "Main"
      link "Projects" [e11]
    heading "All projects"
    button "New" [e21] collapsed
    textbox "Search" [e22] value="apo"

\`[e21]\` is a ref: act on it. State follows the ref (\`expanded\`,
\`checked\`, \`disabled\`, \`focused\`, \`value="\u2026"\`). After the first
snapshot you get a diff (\`snapshot_kind: "diff"\`): \`+\` lines are new, \`-\`
lines are gone, unmarked lines are the containers the new lines sit in, and
every line not shown is unchanged with its ref still valid. After a
navigation you get the whole page again. \`tellclip browser snapshot --full\`
re-reads it.

Targets. A ref (\`e21\`), a role and name (\`button:Create\`; stable across
runs, and when several match, the one in view is used), or a viewport point
(\`640,300\`, for a canvas).

Steps: \`click\`, \`hover\`, \`type <text> [--into <target>]\`, \`press <key>\`
(\`Enter\`, \`Escape\`, \`ArrowDown\`, \`Meta+K\`), \`scroll <pixels>\` or
\`scroll --to <target>\`, \`goto <url>\`, \`wait <seconds>\` or
\`wait --text "Saved"\`, \`eval <javascript>\` (the staging escape hatch; it
prints the value). Clicks are real pointer events, so menus that open on
pointerdown (Radix, Headless UI) open. Each step scrolls its element into
view, waits until it holds still, checks nothing covers it, acts, and waits
until the page settles: the DOM is quiet, the transitions the action started
have ended, and the requests it started have finished (up to 1.2 s).

Each step row tells you what happened:

    {"action":"click","label":"clicked \\"New\\" button","changed":"page",
     "settled":true,"t":12.41,"settled_t":12.73,"at":{"x":0.88,"y":0.23}}

- \`changed: "none"\` after a click means the click did nothing. Do not go
  on as if it worked: read the snapshot and pick the right element.
- \`settled: false\` means the page was still moving after 8 s (a stream, an
  endless loader). The step went on anyway.
- A result that arrives late with no request behind it (a timer, a job that
  finishes elsewhere) is not waited for. Put a \`wait\` for its text in the
  same \`browser act\` call as the action, or give the step a longer hold;
  a \`wait\` sent as a later call finds the result already there, and the
  moment it arrived is in the gap that gets cut.

Beats. While a \`record --browser\` take runs, every step is on camera. The
clip keeps, for each step, 0.7 s before the action (the drawn cursor glides
in there) and a hold after the page settled: 1.0 s after a change on the
page, 1.7 s after a navigation, 2.2 s for the last step. \`--hold <seconds>\`
sets it for one step: use it when the result needs reading. Everything
between the beats, which is your own thinking time, is cut at \`stop\`. So
take as long as you need between steps, and never \`sleep\`.

\`--off-camera\` keeps a step out of the clip: use it to recover after a
wrong click, or to prepare the next scene. A step sent while no take runs is
never on camera.

A known flow can go in one call. The steps run in order and stop at the
first failure; the beats of the steps that worked are kept:

    tellclip browser act --json '[
      {"click": {"role": "link", "name": "Projects"}},
      {"click": {"role": "button", "name": "New"}},
      {"type": "Apollo", "into": {"role": "textbox", "name": "Project name"}, "hold": 1.5},
      {"press": "Enter"}, {"wait": {"text": "Apollo"}}]'

Add \`--record --stop\` to that call and it is the whole take: it starts the
take, runs the steps and ends it. A failed step discards the take. In that
call, \`"zoom": 2\` on a step is the clip's one zoom, placed on that beat at
\`stop\` (start 0.3 s before the action, end with the beat), and \`--title\` /
\`--summary\` set the words, so the edit needs no call of its own. A
\`wait\` step is not a beat: it lengthens the beat before it.

\`tellclip stop\` then does what you would do by hand: it writes the cursor
track from the beats (\`cursor set --from-marks\`) and cuts everything outside
them, and prints \`auto_edit\` with \`kept_ranges\` and
\`edited_duration_seconds\`. Both are ordinary edits: \`cut restore\` and
\`cursor clear\` undo them, the person can change them in the editor, and
\`stop --no-auto-edit\` skips them. What is left for you: the one zoom (a
step's \`t\` and \`at\` are its time and place), title, summary, transcript,
QA and share, as below. \`stop\` also returns \`sheet\`: one picture with a
tile per step of the finished clip, so checking the take is one look.

Errors carry \`next\` and, for a failed step, the page as it is now
(\`snapshot\`) and the rows of the steps that worked (\`completed_steps\`):
\`stale_ref\` (pick a ref from the snapshot in the error), \`not_found\`,
\`ambiguous_target\` (\`candidates\` lists the refs), \`obscured\` (something
covers the element; close it first), \`not_visible\`, \`wait_timeout\`,
\`geometry_mismatch\` and \`browser_window_not_found\` (the capture window is
on another Space, minimized, or split across screens), \`browser_gone\` (the
person closed it; \`stop\` or \`cancel\` the take, then \`open\` again).

Signing in. The capture browser has its own profile and starts signed out.
Sign in with steps when you were given credentials. Otherwise agree it with
the person, then \`tellclip browser open <url> --show\` brings the window to
the front for them, once; the profile remembers.

Own browser. When the flow needs the person's real accounts and they have
the Tellclip extension in Chrome, \`tellclip browser open --own-browser <url>
[--allow accounts.google.com,\u2026]\` drives one popup window of their own,
signed-in Chrome instead; every other command is the same. The window opens
behind their windows; the OS cursor, their focus and their clipboard are left
alone, as with the capture browser. While it is open, Chrome shows
"Tellclip started debugging this browser" in all their windows (its Cancel
ends the session: \`browser_gone\`), so close it when done. The agent may open
the URL's site and the \`--allow\` sites only: another goto is
\`site_not_allowed\`, a link off them is stopped (\`blocked_navigation\` in the
row). A click on Delete, Send, Pay, Publish and the like returns
\`confirmation_required\`: ask the person, then resend the step with
\`"confirm": true\` (\`--confirm\`); the check reads English control names,
so treat it as a safety net, not permission. Enter or Space on a focused
control is checked the same way. A JavaScript confirm is answered no unless
the step has \`confirm\` (the row's \`dialogs\` says so). Its take is cropped
to the page. Without the extension: \`extension_not_connected\` (the first
connection can take 30 s; Chrome needs a window open); drop \`--own-browser\`.

Limits: one capture browser and one take at a time; one tab (a link that
opens a new tab is not followed, \`goto\` its URL instead); no steps inside
cross-origin iframes; native \`<select>\` menus and file pickers are not
drawn in the window (set the value with \`eval\`); JavaScript alerts and
confirms are accepted automatically. \`tellclip browser close\` quits it; it
also closes after 10 idle minutes and when Tellclip quits. For anything the
steps cannot do, \`open\` prints \`cdp_port\`: an outside CDP driver can attach
there and stamp its own marks as in the sections below.

## The loop for other windows and outside drivers

Recording a native app, or driving the page with your own tool? Then you are
the one who knows when things happen, and the rest of this guide up to
Editing discipline is the contract: stage, rehearse, record in one
invocation with sleeps, mark every action.

1. Stage the app and rehearse the flow with recording OFF (see Staging).
2. \`tellclip targets\` \u2014 pick the window (match bundle_id/title, note window_id).
3. Record the take as ONE chained shell invocation: \`record\`, then
   action+mark pairs separated by explicit sleeps, then \`stop\` (see The take).
4. Author the cursor track from marks, and add THE one zoom.
5. \`tellclip suggest\` \u2014 the app detects idle stretches (no clicks, typing,
   pointer movement or speech; your authored cursor track counts) and
   returns cut ranges that route around your zooms. Review each
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
the styled layout itself. Never compensate for padding. After \`tellclip crop
set\`, \`frame\` renders the cropped picture and every edit coordinate (zoom
\`--at\`, mask and highlight \`--rect\`, the \`edits\` rows) is 0-1 of THAT
picture \u2014 read them off the frame as always. Marks and cursor tracks are
recorded before any crop and stay in the full capture. Browser client
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

- Zooms first, then dead air: \`tellclip suggest\` finds idle stretches \u2014
  no typing, clicks, scrolling, pointer movement or speech \u2014 pads them so
  settles stay visible, and carves them around authored zooms so no camera
  motion ever meets a seam. A CLI take records no real input, so author the
  cursor track first: its moves and clicks are the activity; without it the
  whole take reads as idle. The screen is not a signal (a blinking caret
  changes pixels every second), so a page loading or a spinner while the
  cursor rests IS suggested \u2014 judge those stretches yourself.
  \`--min-still <s>\` raises the bar (default 2.0), \`--apply\` cuts
  everything suggested in one shot.
- \`tellclip suggest --speed [--apply]\` keeps idle stretches and plays them
  at 4x instead: 2s or more with no typing, clicks, scrolling, pointer
  movement or speech, padded like the cuts. The screen may change meanwhile,
  so use it when the viewer should see that time passed (a build, a page
  load) without sitting through it. Same detector as the cuts, so author
  the cursor track (\`tellclip cursor set\`) first. People get the
  same edit from the app's "Speed up idle stretches" setting.
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
- \`tellclip mask add <start> <end> --rect x,y,WxH\` blurs a region of the
  screen for a source-time range \u2014 the only way to hide a secret (a token, an
  email, a customer name) that is already in the take. The rect is normalized
  0-1 from the top-left of the frame \`tellclip frame\` shows; the blur follows zooms and
  survives cuts. Over-cover by a margin in space and time: a mask that ends
  at the last character leaves its edge readable. One mask per moment; make
  it bigger rather than adding an overlapping one. Verify with
  \`tellclip frame\`.
- \`tellclip highlight add <start> <end> --rect x,y,WxH\` is the opposite: the
  rect stays clear and the rest of the screen dims to half, for the one
  control the viewer should look at. Same rules as masks; it is a stronger
  pointer than a zoom when the layout around the control matters.
- \`tellclip crop set x,y,WxH\` keeps one rectangle of the captured frame for
  the WHOLE clip and drops the rest \u2014 for a take that captured more than the
  clip is about (a window plus desktop, a page plus browser chrome). Crop
  FIRST, before zooms and regions: the rect is measured on the uncropped
  capture, and afterwards \`frame\` shows the cropped picture and zoom and
  region coordinates are read off that. The output is the crop's own pixel
  size; zooms, masks, highlights and the cursor follow it. Each side must be
  at least 0.05 of the frame; anything smaller is a zoom's job. To change a
  crop, read \`tellclip frame <t> --view recording\` (the whole capture) and
  \`crop set\` again.
- \`tellclip layout add <start> [<end>] --kind camera|split|screen\` decides
  what fills the frame for a source-time range of a take that has a webcam:
  \`camera\` fills the frame with the person, \`split\` ("Split screen" in the
  app) puts the screen left and the camera right, \`screen\` hides the camera.
  Outside layout ranges the camera stays in its bubble. Ranges never overlap
  and are at least 1 s; without \`<end>\` a range is 3 s, trimmed into the
  free gap. Transitions are automatic (0.4 s) and zooms pause inside camera
  and split ranges. Your own takes record no camera, so this is for editing
  a person's recording \u2014 an intro or a sign-off on camera, split for the
  stretch where they talk the viewer through the screen. \`tellclip edits\`
  lists the ranges as \`layout_ranges\`.
- Fix one item instead of clearing a lane: every zoom, mask, highlight and
  layout row in \`tellclip edits\` has an \`id\`. \`tellclip zoom update <id>\` takes
  \`--level\`, \`--at x,y\`, \`--mode auto\`, \`--start\` and \`--end\`;
  \`mask|highlight update <id>\` take \`--rect\`, \`--start\` and \`--end\`;
  \`layout update <id>\` takes \`--kind\`, \`--start\` and \`--end\`;
  \`zoom|mask|highlight|layout remove <id>\` drops one. A wrong cut is not final:
  \`timeline_edit.removed_ranges\` lists what cuts removed, and
  \`tellclip cut restore <index>\` puts one back at normal speed.
- Sessions: every response echoes which session was touched. Commands default
  to the latest session; pass --session <id> when working with several takes.
  Only the newest 10 sessions are kept.

## Style \u2014 the editor's inspector as JSON

Everything in the editor's inspector is one object. \`tellclip style get\`
returns background, padding, corner_radius, shadow, aspect_ratio,
zoom_effects, cursor {visible, size, smoothing, press_effect, ripple, shortcuts,
individual_keys (typing too; this draft only)},
webcam {visible, anchor, frame_type, roundness, size} and audio
{mic_muted, mic_delay, noise_removed, system_muted} and export {quality,
frame_rate}, plus \`available\`: the legal background ids, aspect ratios,
webcam values, export values and number ranges.
\`webcam\` and \`audio\` are null when the draft has no camera or audio track.

    tellclip style set --json '{"background":"Ink","padding":0.1,"cursor":{"size":1.5}}'

Send only the keys to change (\`--file patch.json\` or stdin work too). The
edit runs through the editor's own code, so it is exactly a click in the
inspector: background, padding, aspect ratio and cursor also become the look
of the person's next recordings. Leave the look alone unless asked to change it.

Presets are saved looks: \`tellclip preset list\` (ids, and which one the
draft matches), \`preset apply <id>\`, \`preset save <name>\`,
\`preset delete <id>\`. Custom backgrounds: \`tellclip background add
--image <path>\` (or \`--color 1F2937\`, \`--gradient 3B82F6,A855F7,135\`) adds
one and shows it; \`background remove <id>\` drops one. Sharing, saving and
recording stay CLI commands.

## Coverage \u2014 the CLI and the in-app agent

Everything the editor changes on a draft is a CLI command here and a tool
of Tellclip's in-app agent, run by the same app code. \`tellclip status\`
lists the app's edit ops as \`edit_ops\`.

    edits / frame / suggest          get_draft / frame / suggest
    zoom|mask|highlight|layout add|update|remove|clear
                                     <lane>_add|_update|_remove|_clear
    cut / cut restore / speed        cut / cut_restore / speed
    crop set|clear                   crop_set / crop_clear
    cursor set|clear                 cursor_set / cursor_clear
    transcript set|list|clear        transcript_set / get_transcript / transcript_clear
    transcript cut|pause|tidy        cut_words / edit_pause / tidy_transcript
    title / summary                  title / summary
    style get|set                    get_style / set_style
    preset list|apply|save|delete    list_presets / apply_preset / save_preset / delete_preset
    background add|remove            add_background / remove_background

CLI only: \`marks\` and the per-lane \`list\` commands (the agent reads
\`get_draft\`), plus recording (\`record --cdp\` in CI too), the capture browser (\`browser \u2026\`),
\`preview\`, \`save\` and \`share\` \u2014 the in-app agent edits a draft; it does
not record, browse or publish.

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
\`tellclip transcript clear\` restores the generated track. Without an
authored track, \`transcript list\` returns the speech transcript's cues with
\`fallback: "generated"\` and a \`words\` array (each spoken word's \`index\`,
start and end in source seconds, and \`cut\` when it is out of the clip) and a
\`pauses\` array (every stretch of 1 s or more with no transcribed speech:
gaps between words, and silences the audio shows inside a word; \`index\`,
start, end, \`after_word\`, and \`kept_seconds\` still playing); it
starts transcription if needed and reports \`fallback: "generating"\` while
that runs, so call it again.

Cut speech by its words, as Cut in the editor's Transcript tab does:
\`tellclip transcript cut <from> <to>\` cuts words \`from\`..\`to\` (inclusive
indices) as one stretch, reaching half-way into the silence around them (at
most 0.2 s), never into a kept word; add \`--restore\` to put them back.
\`tellclip transcript pause <index>\` shortens one pause to 0.4 s,
\`--remove\` leaves 0.1 s, \`--restore\` puts it back; nothing outside the
pause is cut.
\`tellclip transcript tidy\` shortens every pause of 1 s or more to 0.4 s and
cuts filler words (um, uh); \`--no-pauses\` / \`--no-fillers\` skip one. A pause can hold silent on-screen action, so check frames before tidying.

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
  half-rendered. The default view is the capture (cut to the crop), so it
  verifies content and is what coordinates are read off.
- \`tellclip frame <t> --view output\` renders that moment the way the
  finished clip shows it \u2014 crop, zoom, blur, highlights, layout, background,
  cursor and camera. Check every zoom, mask and highlight with it before you
  share.
- The whole take in one picture: \`tellclip frame --sheet\` returns a contact
  sheet with a tile per mark (or per time you pass, up to 12), on view output.
  Use it to check that every step landed; use single frames for detail.
- Look at several moments in one call: \`tellclip frame 3.8 5.2 9 --view
  output\` returns one picture per time (2-8), in the order given, each with
  its source time, clip time (\`edited_t\`) and pixel size; a time cut from the
  clip comes back \`cut: true\` (no picture on view output). Check a zoom at
  its start, middle and end this way instead of three calls. Use a single
  time when you place a rect and want full detail.

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
renders locally without uploading. \`tellclip preview\` ends Agent Editing
mode, reloads the editor from disk, focuses it, and starts review from the
beginning. Run it when the editing pass is complete.

## Recording in CI (Linux runners, no Mac)

A CI job can record the headless browser it already drives. The CLI attaches
over the Chrome DevTools Protocol, records the page that is active, takes
step text from \`tellclip mark\`, and \`share\` uploads the take; Tellclip
edits it in the cloud (a zoom and a caption per step, idle time cut or sped
up) and returns the clip's link, a thumbnail, the MP4 and a PR comment in
Markdown. It needs Node 22+, ffmpeg and ffprobe on PATH, and
\`TELLCLIP_API_KEY\` (an organization API key) for \`share\`.

\`\`\`
tellclip record --cdp <port|ws-url|http-url> [--title <text>]
tellclip mark "<what> because <why>"      # before each action, every step
tellclip title "<text>" | tellclip summary "<text>"
tellclip stop                              # prints frames, duration, pixel ratio, marks
tellclip share [--name <key>] [--out clip.mp4] [--comment-file clip.md] [--wait 180]
               [--captions track|burned] [--tier standard|high|preview]
\`\`\`

- \`--cdp\` takes the browser's debugging port (launch it with
  \`--remote-debugging-port=9222\`), or \`$(agent-browser get cdp-url)\`, or a
  Playwright or Puppeteer browser started with a debugging port. \`record\`
  returns once the first frame is on disk; a recorder keeps running in the
  background until \`stop\`.
- Launch the browser with \`--force-device-scale-factor=2\`. At pixel ratio 1
  zoomed steps look soft; \`record\` and \`stop\` warn (\`low_pixel_ratio\`).
- A mark opens a step: log it just before the step's actions. The pointer and
  key events until the next mark belong to it. Keys are stored as times only.
- The recorder follows one tab through navigations and reloads. If the
  browser closes, the take ends as \`partial: true\` with what was captured.
- \`stop\` encodes once with ffmpeg. Run \`stop\` and \`share\` under
  \`if: always()\` so a failed test still gets its clip.
- \`share\` prints one JSON object: \`clip_id\`, \`link\`, \`status\`,
  \`thumbnail_url\`, \`mp4_path\`, \`duration_s\`, \`steps\`, \`comment_path\`.
  \`status\` is \`ready\` when the MP4 is done. When \`--wait\` (seconds,
  default 180) runs out first it is \`queued\`, \`rendering\` or
  \`ingesting\`: the link already works and shows the progress, and
  \`share\` again keeps waiting for the same render. Captions are a track on
  the clip page; \`--captions burned\` also draws them into the MP4.
- The clip is private to the organization and filed in its Agents workspace;
  people open the link signed in. The thumbnail URL loads without sign-in, so
  a PR comment can show it.
- With \`CI=true\`, record/mark/stop/share never fail the job: they exit 0 and
  print \`{"ok":false,"error":{\u2026}}\` plus a \`::warning::\` line. Add \`--strict\`
  (or \`TELLCLIP_STRICT=1\`) to get non-zero exits. On a Mac, \`CI=true\` also
  keeps mark/title/summary/stop/share off the Tellclip app; unset \`CI\` or set
  \`TELLCLIP_STRICT=1\` to drive the app.
- The clip key is repository + pull request + \`--name\` (default: the job
  id). The same key gives the same clip and the same link; a new run replaces
  its render. The comment starts with \`<!-- tellclip:<name> -->\` so a
  workflow can edit the comment in place, e.g. \`gh pr comment "$PR"
  --body-file clip.md --edit-last --create-if-none\`.
- Fork pull requests get no secrets: \`share\` prints \`no_credentials\`,
  uploads nothing, and the comment says the clip was skipped.
- \`share\` talks to the server \`tellclip upload\` uses:
  \`TELLCLIP_WEB_BASE_URL\`, default https://tellclip.com.
- Take files live in \`$TELLCLIP_HOME\`, else \`$RUNNER_TEMP/tellclip\`, else
  \`~/.tellclip\`.`;

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
import { readFileSync as readFileSync3 } from "node:fs";
import { resolve } from "node:path";
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
  "--min-still",
  "--rect",
  "--json",
  "--mode",
  "--start",
  "--end",
  "--image",
  "--color",
  "--gradient",
  "--kind",
  "--view",
  "--viewport",
  "--into",
  "--over",
  "--to",
  "--text",
  "--timeout",
  "--label",
  "--hold",
  "--title",
  "--summary",
  "--allow"
]);
var booleanFlags = /* @__PURE__ */ new Set([
  "--system-audio",
  "--from-marks",
  "--apply",
  "--speed",
  "--restore",
  "--remove",
  "--no-pauses",
  "--no-fillers",
  "--show",
  "--full",
  "--off-camera",
  "--browser",
  "--no-auto-edit",
  "--sheet",
  "--record",
  "--stop",
  "--own-browser",
  "--confirm"
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
function parseBrowserTarget(text) {
  if (/^e\d+$/.test(text)) return text;
  if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(text)) {
    const [x, y] = text.split(",").map(Number);
    return { x, y };
  }
  const colon = text.indexOf(":");
  if (colon !== -1 && /^[A-Za-z]+$/.test(text.slice(0, colon))) {
    return { role: text.slice(0, colon), name: text.slice(colon + 1) };
  }
  throw new UsageError("A target is a ref (e12), role:name (button:Create) or x,y (640,300).");
}
function browserStepSpec(step, parsed) {
  const label = parsed.options.get("--label");
  if (label !== void 0) step.label = label;
  const hold = parsed.options.get("--hold");
  if (hold !== void 0) step.hold = double(hold, "--hold");
  if (parsed.flags.has("--off-camera")) step.off_camera = true;
  if (parsed.flags.has("--confirm")) step.confirm = true;
  return { method: "POST", path: "/rpc/browser", body: { op: "act", steps: [step] } };
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
function rectObject(text, name) {
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
  throw new UsageError(
    `${name} must be 'x,y,WxH' with normalized 0-1 values (e.g. 0.1,0.2,0.3x0.08), got '${text}'.`
  );
}
var layoutKinds = ["camera", "split", "screen"];
function layoutKind(text) {
  if (!layoutKinds.includes(text)) {
    throw new UsageError(`--kind must be one of camera, split, screen, got '${text}'.`);
  }
  return text;
}
function itemFields(usage, parsed) {
  if (parsed.positional.length !== 2) {
    throw new UsageError(`${usage} needs the id from 'tellclip edits': tellclip ${usage} <id>.`);
  }
  const fields = { id: parsed.positional[1] };
  const start = parsed.options.get("--start");
  if (start !== void 0) fields.start = double(start, "--start");
  const end = parsed.options.get("--end");
  if (end !== void 0) fields.end = double(end, "--end");
  return fields;
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
      const body = {};
      if (!parsed.flags.has("--browser") || parsed.flags.has("--system-audio")) {
        body.system_audio = parsed.flags.has("--system-audio");
      }
      const selectors = ["--browser", "--window", "--app", "--display", "--region"].filter((option) => parsed.options.has(option) || parsed.flags.has(option));
      if (selectors.length !== 1) {
        throw new UsageError("record needs exactly one of --browser, --window, --app, --display, --region.");
      }
      switch (selectors[0]) {
        case "--browser":
          body.browser = true;
          break;
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
      return {
        method: "POST",
        path: "/rpc/stop",
        body: parsed.flags.has("--no-auto-edit") ? { auto_edit: false } : {}
      };
    case "cancel":
    case "pause":
    case "resume":
      return { method: "POST", path: `/rpc/${command}`, body: {} };
    case "browser": {
      const [subcommand, argument] = parsed.positional;
      switch (subcommand) {
        case "open": {
          if (parsed.positional.length > 2) {
            throw new UsageError("browser open takes an optional URL: tellclip browser open http://localhost:5173/.");
          }
          const body = { op: "open" };
          if (argument !== void 0) body.url = argument;
          const viewport = parsed.options.get("--viewport");
          if (viewport !== void 0) {
            const size = viewport.split("x");
            const width = size.length === 2 ? parseDouble(size[0]) : void 0;
            const height = size.length === 2 ? parseDouble(size[1]) : void 0;
            if (width === void 0 || height === void 0) {
              throw new UsageError(`--viewport must be 'WxH' (e.g. 1600x900), got '${viewport}'.`);
            }
            body.width = width;
            body.height = height;
          }
          if (parsed.flags.has("--show")) body.show = true;
          if (parsed.flags.has("--own-browser")) body.own_browser = true;
          const allow = parsed.options.get("--allow");
          if (allow !== void 0) {
            if (!parsed.flags.has("--own-browser")) {
              throw new UsageError("--allow adds sites to an --own-browser session: tellclip browser open --own-browser <url> --allow accounts.google.com.");
            }
            const sites = splitNonEmpty(allow, ",").map((site) => site.trim()).filter((site) => site !== "");
            if (sites.length === 0) throw new UsageError("--allow needs one or more sites, separated by commas.");
            body.allow = sites;
          }
          return { method: "POST", path: "/rpc/browser", body };
        }
        case "snapshot": {
          const body = { op: "snapshot" };
          if (parsed.flags.has("--full")) body.full = true;
          return { method: "POST", path: "/rpc/browser", body };
        }
        case "act": {
          if (parsed.positional.length !== 1) {
            throw new UsageError("browser act reads JSON steps from --json, --file or stdin.");
          }
          const json = parsed.options.get("--json");
          const file = parsed.options.get("--file");
          let text;
          if (json !== void 0) {
            text = json;
          } else if (file !== void 0) {
            try {
              text = readFileSync3(file, "utf8");
            } catch {
              throw new UsageError(`Could not read browser steps file at ${file}.`, false);
            }
          } else {
            text = readFileSync3(0, "utf8");
          }
          let steps;
          try {
            steps = JSON.parse(text);
          } catch {
            steps = void 0;
          }
          if (typeof steps !== "object" || steps === null) {
            throw new UsageError('Browser steps must be a JSON array or object: [{"click":"e12"}].', false);
          }
          if (!Array.isArray(steps)) steps = [steps];
          const body = { op: "act", steps };
          if (parsed.flags.has("--record")) body.record = true;
          if (parsed.flags.has("--stop")) body.stop = true;
          const title = parsed.options.get("--title");
          if (title !== void 0) body.title = title;
          const summary = parsed.options.get("--summary");
          if (summary !== void 0) body.summary = summary;
          return { method: "POST", path: "/rpc/browser", body };
        }
        case "click":
        case "hover":
          if (parsed.positional.length !== 2) {
            throw new UsageError(`browser ${subcommand} needs a target: tellclip browser ${subcommand} e12.`);
          }
          return browserStepSpec({ [subcommand]: parseBrowserTarget(argument) }, parsed);
        case "type": {
          if (parsed.positional.length !== 2) {
            throw new UsageError('browser type needs text: tellclip browser type "Hello".');
          }
          const step = { type: argument };
          const into = parsed.options.get("--into");
          if (into !== void 0) step.into = parseBrowserTarget(into);
          return browserStepSpec(step, parsed);
        }
        case "press":
          if (parsed.positional.length !== 2) {
            throw new UsageError("browser press needs a key: tellclip browser press Enter.");
          }
          return browserStepSpec({ press: argument }, parsed);
        case "scroll": {
          const to = parsed.options.get("--to");
          const over = parsed.options.get("--over");
          if (to !== void 0) {
            if (parsed.positional.length !== 1 || over !== void 0) {
              throw new UsageError("browser scroll takes pixels [--over <target>] or --to <target>.");
            }
            return browserStepSpec({ scroll: { to: parseBrowserTarget(to) } }, parsed);
          }
          if (parsed.positional.length !== 2) {
            throw new UsageError("browser scroll needs pixels or --to <target>: tellclip browser scroll 450.");
          }
          const by = double(argument, "pixels");
          return browserStepSpec({ scroll: over === void 0 ? by : { by, over: parseBrowserTarget(over) } }, parsed);
        }
        case "goto":
          if (parsed.positional.length !== 2) {
            throw new UsageError("browser goto needs a URL: tellclip browser goto https://example.com/.");
          }
          return browserStepSpec({ goto: argument }, parsed);
        case "wait": {
          const text = parsed.options.get("--text");
          const timeout = parsed.options.get("--timeout");
          if (text !== void 0) {
            if (parsed.positional.length !== 1) {
              throw new UsageError("browser wait takes seconds or --text <text> [--timeout <seconds>].");
            }
            const wait = { text };
            if (timeout !== void 0) wait.timeout = double(timeout, "--timeout");
            return browserStepSpec({ wait }, parsed);
          }
          if (parsed.positional.length !== 2 || timeout !== void 0) {
            throw new UsageError("browser wait needs seconds or --text <text>: tellclip browser wait 0.5.");
          }
          return browserStepSpec({ wait: double(argument, "seconds") }, parsed);
        }
        case "eval":
          if (parsed.positional.length !== 2) {
            throw new UsageError('browser eval needs JavaScript: tellclip browser eval "document.title".');
          }
          return browserStepSpec({ eval: argument }, parsed);
        case "close":
          return { method: "POST", path: "/rpc/browser", body: { op: "close" } };
        default:
          throw new UsageError(
            subcommand === void 0 ? "browser needs a subcommand: open, snapshot, act, click, hover, type, press, scroll, goto, wait, eval, or close." : `Unknown browser subcommand '${subcommand}'. Use open, snapshot, act, click, hover, type, press, scroll, goto, wait, eval, or close.`
          );
      }
    }
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
        throw new UsageError("zoom needs a subcommand: add, update, remove, list, or clear.");
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
        case "update": {
          const fields = itemFields("zoom update", parsed);
          const level = parsed.options.get("--level");
          if (level !== void 0) fields.level = double(level, "--level");
          const mode = parsed.options.get("--mode");
          if (mode !== void 0) fields.mode = mode;
          const at = parsed.options.get("--at");
          if (at !== void 0) fields.at = pointObject(at, "--at");
          return editSpec("zoom_update", parsed, fields);
        }
        case "remove":
          return editSpec("zoom_remove", parsed, itemFields("zoom remove", parsed));
        case "list":
          return editSpec("zoom_list", parsed);
        case "clear":
          return editSpec("zoom_clear", parsed);
        default:
          throw new UsageError(`Unknown zoom subcommand '${subcommand}'.`);
      }
    }
    case "mask":
    case "highlight": {
      const subcommand = parsed.positional[0];
      if (subcommand === void 0) {
        throw new UsageError(`${command} needs a subcommand: add, update, remove, list, or clear.`);
      }
      switch (subcommand) {
        case "add": {
          if (parsed.positional.length !== 3) {
            throw new UsageError(
              `${command} add needs start and end seconds and --rect: tellclip ${command} add 3 7 --rect 0.1,0.2,0.3x0.08.`
            );
          }
          const rect = parsed.options.get("--rect");
          if (rect === void 0) {
            throw new UsageError(`${command} add needs --rect x,y,WxH (normalized 0-1, top-left).`);
          }
          return editSpec(`${command}_add`, parsed, {
            start: double(parsed.positional[1], "start"),
            end: double(parsed.positional[2], "end"),
            rect: rectObject(rect, "--rect")
          });
        }
        case "update": {
          const fields = itemFields(`${command} update`, parsed);
          const rect = parsed.options.get("--rect");
          if (rect !== void 0) fields.rect = rectObject(rect, "--rect");
          return editSpec(`${command}_update`, parsed, fields);
        }
        case "remove":
          return editSpec(`${command}_remove`, parsed, itemFields(`${command} remove`, parsed));
        case "list":
          return editSpec(`${command}_list`, parsed);
        case "clear":
          return editSpec(`${command}_clear`, parsed);
        default:
          throw new UsageError(`Unknown ${command} subcommand '${subcommand}'.`);
      }
    }
    case "layout": {
      const subcommand = parsed.positional[0];
      if (subcommand === void 0) {
        throw new UsageError("layout needs a subcommand: add, update, remove, list, or clear.");
      }
      switch (subcommand) {
        case "add": {
          if (parsed.positional.length < 2 || parsed.positional.length > 3) {
            throw new UsageError(
              "layout add needs start seconds, optional end seconds, and --kind: tellclip layout add 3 7 --kind split."
            );
          }
          const kind = parsed.options.get("--kind");
          if (kind === void 0) {
            throw new UsageError("layout add needs --kind camera|split|screen.");
          }
          const fields = {
            start: double(parsed.positional[1], "start"),
            kind: layoutKind(kind)
          };
          if (parsed.positional.length === 3) fields.end = double(parsed.positional[2], "end");
          return editSpec("layout_add", parsed, fields);
        }
        case "update": {
          const fields = itemFields("layout update", parsed);
          const kind = parsed.options.get("--kind");
          if (kind !== void 0) fields.kind = layoutKind(kind);
          return editSpec("layout_update", parsed, fields);
        }
        case "remove":
          return editSpec("layout_remove", parsed, itemFields("layout remove", parsed));
        case "list":
          return editSpec("layout_list", parsed);
        case "clear":
          return editSpec("layout_clear", parsed);
        default:
          throw new UsageError(`Unknown layout subcommand '${subcommand}'.`);
      }
    }
    case "crop": {
      const subcommand = parsed.positional[0];
      if (subcommand === void 0) {
        throw new UsageError("crop needs a subcommand: set or clear.");
      }
      switch (subcommand) {
        case "set": {
          if (parsed.positional.length !== 2) {
            throw new UsageError("crop set needs the rectangle: tellclip crop set 0.1,0.2,0.5x0.6.");
          }
          return editSpec("crop_set", parsed, { rect: rectObject(parsed.positional[1], "crop set") });
        }
        case "clear":
          return editSpec("crop_clear", parsed);
        default:
          throw new UsageError(`Unknown crop subcommand '${subcommand}'.`);
      }
    }
    case "cut":
      if (parsed.positional[0] === "restore") {
        const index = parsed.positional[1];
        if (parsed.positional.length !== 2 || !/^\d+$/.test(index)) {
          throw new UsageError("cut restore needs an index from 'tellclip edits' removed_ranges: tellclip cut restore 0.");
        }
        return editSpec("cut_restore", parsed, { index: parseInt(index, 10) });
      }
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
        throw new UsageError("transcript needs a subcommand: set, list, clear, cut, pause, or tidy.");
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
              trackData = readFileSync3(file);
            } catch {
              throw new UsageError(`Could not read transcript track file at ${file}.`, false);
            }
          } else {
            trackData = readFileSync3(0);
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
        case "cut": {
          const [, from, to] = parsed.positional;
          if (parsed.positional.length !== 3 || !/^\d+$/.test(from) || !/^\d+$/.test(to)) {
            throw new UsageError(
              "transcript cut needs the first and last word index from 'tellclip transcript list': tellclip transcript cut 12 18."
            );
          }
          const fields = { from: parseInt(from, 10), to: parseInt(to, 10) };
          if (parsed.flags.has("--restore")) fields.restore = true;
          return editSpec("transcript_cut", parsed, fields);
        }
        case "pause": {
          const [, index] = parsed.positional;
          if (parsed.positional.length !== 2 || !/^\d+$/.test(index)) {
            throw new UsageError(
              "transcript pause needs a pause index from 'tellclip transcript list': tellclip transcript pause 2 [--remove|--restore]."
            );
          }
          if (parsed.flags.has("--remove") && parsed.flags.has("--restore")) {
            throw new UsageError("transcript pause takes --remove or --restore, not both.");
          }
          const action = parsed.flags.has("--remove") ? "remove" : parsed.flags.has("--restore") ? "restore" : "shorten";
          return editSpec("transcript_pause", parsed, { index: parseInt(index, 10), action });
        }
        case "tidy":
          if (parsed.positional.length !== 1) {
            throw new UsageError("transcript tidy takes no positional arguments.");
          }
          return editSpec("transcript_tidy", parsed, {
            pauses: !parsed.flags.has("--no-pauses"),
            fillers: !parsed.flags.has("--no-fillers")
          });
        default:
          throw new UsageError(`Unknown transcript subcommand '${subcommand}'.`);
      }
    }
    case "suggest": {
      const fields = {};
      const minStill = parsed.options.get("--min-still");
      if (minStill !== void 0) fields.min_still = double(minStill, "min-still");
      if (parsed.flags.has("--apply")) fields.apply = true;
      if (parsed.flags.has("--speed")) fields.speed = true;
      return editSpec("suggest", parsed, fields);
    }
    case "edits":
      return editSpec("dump", parsed);
    case "marks":
      return editSpec("marks", parsed);
    case "frame": {
      const sheet = parsed.flags.has("--sheet");
      if (parsed.positional.length === 0 && !sheet) {
        throw new UsageError(
          "frame needs a time in seconds: tellclip frame 12.4 (or several: tellclip frame 3.8 5.2 9), or --sheet for one picture of the whole take."
        );
      }
      const fields = sheet ? { sheet: true, ...parsed.positional.length ? { times: parsed.positional.map((value) => double(value, "times")) } : {} } : parsed.positional.length === 1 ? { t: double(parsed.positional[0], "t") } : { times: parsed.positional.map((value) => double(value, "times")) };
      const out = parsed.options.get("--out");
      if (out !== void 0) fields.out = out;
      const view = parsed.options.get("--view");
      if (view !== void 0) {
        if (!["edit", "recording", "output"].includes(view)) {
          throw new UsageError("--view is edit, recording or output.");
        }
        fields.view = view;
      }
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
              trackData = readFileSync3(file);
            } catch {
              throw new UsageError(`Could not read cursor track file at ${file}.`, false);
            }
          } else {
            trackData = readFileSync3(0);
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
    case "style": {
      const subcommand = parsed.positional[0];
      switch (subcommand) {
        case "get":
          return editSpec("style_get", parsed);
        case "set": {
          const json = parsed.options.get("--json");
          const file = parsed.options.get("--file");
          let text;
          if (json !== void 0) {
            text = json;
          } else if (file !== void 0) {
            try {
              text = readFileSync3(file, "utf8");
            } catch {
              throw new UsageError(`Could not read style patch file at ${file}.`, false);
            }
          } else {
            text = readFileSync3(0, "utf8");
          }
          const patch = parseJSONObject(text);
          if (patch === void 0) {
            throw new UsageError(
              'Style patch must be a JSON object: {"padding":0.1,"cursor":{"size":1.5}}.',
              false
            );
          }
          return editSpec("style_set", parsed, patch);
        }
        default:
          throw new UsageError("style needs a subcommand: get or set.");
      }
    }
    case "preset": {
      const [subcommand, argument] = parsed.positional;
      switch (subcommand) {
        case "list":
          return editSpec("preset_list", parsed);
        case "save":
        case "apply":
        case "delete":
          if (parsed.positional.length !== 2) {
            throw new UsageError(
              subcommand === "save" ? 'preset save needs a name: tellclip preset save "Launch look".' : `preset ${subcommand} needs an id from 'tellclip preset list'.`
            );
          }
          return editSpec(`preset_${subcommand}`, parsed, subcommand === "save" ? { name: argument } : { id: argument });
        default:
          throw new UsageError("preset needs a subcommand: list, apply, save, or delete.");
      }
    }
    case "background": {
      const subcommand = parsed.positional[0];
      if (subcommand === "remove") {
        if (parsed.positional.length !== 2) {
          throw new UsageError("background remove needs an id from 'tellclip style get' available.custom_backgrounds.");
        }
        return editSpec("background_remove", parsed, { id: parsed.positional[1] });
      }
      if (subcommand !== "add") {
        throw new UsageError("background needs a subcommand: add or remove.");
      }
      const image = parsed.options.get("--image");
      const color = parsed.options.get("--color");
      const gradient = parsed.options.get("--gradient");
      if ([image, color, gradient].filter((value) => value !== void 0).length !== 1) {
        throw new UsageError("background add needs exactly one of --image, --color, --gradient.");
      }
      if (image !== void 0) {
        return editSpec("background_add", parsed, { image: resolve(image) });
      }
      if (color !== void 0) return editSpec("background_add", parsed, { color });
      const parts = splitNonEmpty(gradient, ",");
      if (parts.length < 2 || parts.length > 3) {
        throw new UsageError("--gradient must be 'from,to[,angle]', e.g. 3B82F6,A855F7,135.");
      }
      const fields = { from: parts[0], to: parts[1] };
      if (parts.length === 3) fields.angle = double(parts[2], "angle");
      return editSpec("background_add", parsed, { gradient: fields });
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
function parseJSONObject(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return void 0;
  }
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}

// src/setup.ts
import { spawnSync as spawnSync3 } from "node:child_process";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join as join3 } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// src/setup-install.ts
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir as homedir3, tmpdir } from "node:os";
import { join as join2 } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
var exec = promisify(execFile);
var runSetupCommand = async (command, args) => {
  await exec(command, args, { timeout: 6e5 });
};
async function downloadDmg(source, destination, run3) {
  if (source.startsWith("file://")) {
    await copyFile(fileURLToPath(source), destination);
  } else if (!/^[a-z][a-z\d+.-]*:/i.test(source)) {
    await copyFile(source, destination);
  } else {
    if (!/^https?:\/\//i.test(source)) throw new Error("The setup DMG URL must use HTTP, HTTPS, file://, or a local path.");
    await run3("/usr/bin/curl", ["--fail", "--location", "--silent", "--show-error", "--max-time", "600", "--output", destination, "--url", source]);
  }
}
async function setupAppDirectory(override, home = homedir3(), writable = async (path8) => {
  try {
    await access(path8, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}) {
  return override ?? (await writable("/Applications") ? "/Applications" : join2(home, "Applications"));
}
async function installSetupApp(source, directory, deps = {}) {
  const run3 = deps.run ?? runSetupCommand;
  const temporary = await mkdtemp(join2(deps.tempRoot ?? tmpdir(), "tellclip-setup-"));
  const dmg = join2(temporary, "TellClip.dmg");
  const mount = join2(temporary, "mount");
  const app = join2(directory, "TellClip.app");
  let mounted = false;
  try {
    await mkdir(mount);
    await (deps.download ?? downloadDmg)(source, dmg, run3);
    await run3("/usr/bin/hdiutil", ["attach", dmg, "-nobrowse", "-readonly", "-mountpoint", mount]);
    mounted = true;
    try {
      await mkdir(directory, { recursive: true });
      await run3("/usr/bin/ditto", [join2(mount, "TellClip.app"), app]);
    } finally {
      await run3("/usr/bin/hdiutil", ["detach", mount]);
      mounted = false;
    }
    return app;
  } finally {
    await rm(dmg, { force: true });
    if (!mounted) await rm(temporary, { recursive: true, force: true });
  }
}

// src/setup.ts
var permissionNext = "Enable Tellclip under System Settings > Privacy & Security > Screen Recording, then run 'tellclip setup' again.";
var restartAdvice = "If you already enabled it, restart Tellclip to apply the grant, then run 'tellclip setup' again.";
var sharingNext = "Sharing needs a sign-in: run 'tellclip login' when you want a link.";
var readyNext = "Read the file at skill_path now and follow it: Tellclip is ready in this session without a restart. Then ask the person what they want recorded.";
var appLaunchWaitMs = 15e3;
var appLaunchPollMs = 250;
var personPollMs = 2e3;
function parseSetupArgs(args) {
  const flags = /* @__PURE__ */ new Set();
  let waitMs = 12e4;
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (["--dry-run", "--no-test", "--no-login", "--project"].includes(argument)) {
      flags.add(argument);
    } else if (argument === "--wait") {
      const seconds = args[++i];
      if (seconds === void 0 || !/^\d+(\.\d+)?$/.test(seconds) || !Number.isFinite(Number(seconds) * 1e3)) {
        throw new UsageError("--wait needs a non-negative number of seconds.");
      }
      waitMs = Number(seconds) * 1e3;
    } else {
      throw new UsageError(`Unknown setup argument ${argument}.`);
    }
  }
  return {
    dryRun: flags.has("--dry-run"),
    noTest: flags.has("--no-test"),
    noLogin: flags.has("--no-login"),
    project: flags.has("--project"),
    waitMs
  };
}
function setupSystem() {
  const read = (command, args) => spawnSync3(command, args, { encoding: "utf8" }).stdout?.trim() ?? "";
  if (process.platform !== "darwin") return { platform: process.platform, arch: process.arch, macos: "" };
  const arch = process.arch === "arm64" || read("/usr/sbin/sysctl", ["-n", "hw.optional.arm64"]) === "1" ? "arm64" : process.arch;
  return { platform: process.platform, arch, macos: read("/usr/bin/sw_vers", ["-productVersion"]) };
}
async function findRunningApp() {
  const endpoint = readDiscoveryFile();
  return endpoint && await probe(endpoint) ? endpoint : void 0;
}
async function setupClient(spec, endpoint, timeoutMs) {
  const response = await send(spec, endpoint, timeoutMs);
  if (!response) throw cliError("app_unreachable", "Tellclip stopped responding.", "Open Tellclip and run 'tellclip setup' again.", 1);
  let result;
  try {
    result = JSON.parse(response.body.toString("utf8"));
  } catch {
  }
  const code = result?.error?.code;
  if (response.status === 404 && (code === void 0 || code === "http_404")) throw outdatedApp();
  if (typeof result !== "object" || result === null || Array.isArray(result)) throw new Error("Tellclip returned a non-JSON setup response.");
  const payload = result;
  if (response.status >= 400 && payload.error === void 0) throw new Error(`Tellclip setup returned HTTP ${response.status}.`);
  return payload;
}
function outdatedApp() {
  return cliError("app_outdated", "This Tellclip app is too old for setup.", "Update Tellclip, then run 'tellclip setup' again.", 1);
}
function unwrap(result) {
  if (result.error !== void 0) {
    const error = result.error;
    if (["not_found", "route_not_found", "unknown_route", "unknown_path"].includes(String(error.code))) throw outdatedApp();
    throw new EmitAndExit(result, 1);
  }
  return result;
}
function setupStatus(result) {
  if (typeof result.app_version !== "string" || typeof result.signed_in !== "boolean" || !["authorized", "denied", "not_determined"].includes(String(result.screen_recording)) || !Array.isArray(result.agents) || typeof result.skill_path !== "string" || typeof result.browser?.found !== "boolean") {
    throw new Error("Tellclip returned an incomplete setup status.");
  }
  return result;
}
function failure(error) {
  if (error instanceof EmitAndExit) {
    const value = error.payload.error;
    return { detail: String(value.message), next: typeof value.next === "string" ? value.next : "Check Tellclip and run 'tellclip setup' again." };
  }
  return { detail: error instanceof Error ? error.message : String(error), next: "Resolve this setup error, then run 'tellclip setup' again." };
}
var joinNames = (names) => names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
function agentsDetail(agents) {
  const groups = /* @__PURE__ */ new Map();
  for (const agent of agents.filter((agent2) => agent2.detected)) {
    const kind = agent.installed === "none" ? agent.id === "claude_code" ? "plugin" : "skill" : agent.installed;
    groups.set(kind, [...groups.get(kind) ?? [], agent.name]);
  }
  return [...groups].map(([kind, names]) => `${joinNames(names)} (${kind})`).join(", ");
}
var projectMarker = "## Clips of your work (Tellclip)";
var projectBlock = `${projectMarker}

After a change a person can see in the running product, record a short clip of it with the tellclip-demo skill and put the share link in your final message (and in the pull request, when there is one). Skip it for changes with nothing to watch.
`;
async function projectContent(path8) {
  try {
    return await readFile(path8, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
}
async function configureProject(directory, dryRun) {
  let name = "AGENTS.md";
  let content = await projectContent(join3(directory, name));
  if (content === void 0) {
    const claude = await projectContent(join3(directory, "CLAUDE.md"));
    if (claude !== void 0) {
      name = "CLAUDE.md";
      content = claude;
    }
  }
  if (content?.split(/\r?\n/).includes(projectMarker)) return { step: "project", ok: true, detail: `${name} already has the Tellclip instructions.` };
  if (!dryRun) {
    const block = `${content ? content.endsWith("\n\n") ? "" : content.endsWith("\n") ? "\n" : "\n\n" : ""}${projectBlock}`;
    if (content === void 0) await writeFile(join3(directory, name), block, { flag: "wx" });
    else await appendFile(join3(directory, name), block);
  }
  return { step: "project", ok: true, detail: `${dryRun ? "Would add" : "Added"} Tellclip instructions to ${name}.` };
}
async function setup(args, deps = {}) {
  const options = parseSetupArgs(args);
  const now = deps.now ?? Date.now;
  const sleep4 = deps.sleep ?? delay;
  const interval = deps.pollIntervalMs ?? personPollMs;
  const findApp = deps.findApp ?? findRunningApp;
  const client2 = deps.client ?? setupClient;
  const steps = [];
  const recovery = [];
  let endpoint;
  let status;
  const call = async (op) => unwrap(await client2({ method: "POST", path: "/rpc/setup", body: { op } }, endpoint, op === "test_take" ? 12e4 : 5e3));
  const refresh = async () => status = setupStatus(await call("status"));
  const waitFor = async (ready, deadline, pollMs = interval, refreshStatus = refresh) => {
    while (!ready() && now() < deadline) {
      await sleep4(Math.min(pollMs, deadline - now()));
      await refreshStatus();
    }
  };
  try {
    const system = (deps.system ?? setupSystem)();
    if (system.platform !== "darwin" || system.arch !== "arm64" || !(Number.parseInt(system.macos, 10) >= 15)) {
      throw cliError("unsupported_platform", "Tellclip setup requires macOS 15 or later on an Apple silicon (arm64) Mac.", "Use a Mac with Apple silicon and macOS 15 or later, then run 'tellclip setup' again.", 1);
    }
    endpoint = await findApp();
    let detail = "Tellclip is running and its control server is ready.";
    if (!endpoint && !options.dryRun) {
      if ((deps.launch ?? launchApp)()) {
        await waitFor(() => endpoint !== void 0, now() + appLaunchWaitMs, deps.pollIntervalMs ?? appLaunchPollMs, async () => {
          endpoint = await findApp();
        });
        if (!endpoint) throw cliError("app_unreachable", "Tellclip launched but its control server did not respond.", "Open Tellclip and run 'tellclip setup' again.", 1);
        detail = "Launched Tellclip and connected to its control server.";
      } else {
        const app = await (deps.install ?? (async () => installSetupApp(
          process.env.TELLCLIP_SETUP_DMG_URL ?? "https://downloads.tellclip.com/beta/TellClip-latest.dmg",
          await setupAppDirectory(process.env.TELLCLIP_SETUP_APP_DIR)
        )))();
        await (deps.launchInstalled ?? ((path8) => runSetupCommand("/usr/bin/open", ["-g", "-j", path8])))(app);
        await waitFor(() => endpoint !== void 0, now() + appLaunchWaitMs, deps.pollIntervalMs ?? appLaunchPollMs, async () => {
          endpoint = await findApp();
        });
        if (!endpoint) throw cliError("app_unreachable", "Installed Tellclip, but its control server did not respond.", "Open Tellclip and run 'tellclip setup' again.", 1);
        detail = "Installed Tellclip and connected to its control server.";
      }
    }
    if (endpoint) await refresh();
    else detail = "Would launch Tellclip, or download and install it if it is missing.";
    steps.push({ step: "app", ok: true, detail });
  } catch (error) {
    const failed = failure(error);
    steps.push({ step: "app", ok: false, detail: failed.detail, needs_person: true });
    recovery.push(failed.next);
  }
  if (status) {
    try {
      if (!options.dryRun) status = setupStatus(await call("install_agents"));
      const names = agentsDetail(status.agents);
      const errors = status.errors ?? [];
      let detail = names ? `${options.dryRun ? "Would install or update" : "Installed"} ${names}.` : "No detected agents; the CLI works from any shell.";
      if (errors.length) detail += ` ${errors.map((error) => `${error.agent}: ${error.message}`).join("; ")}`;
      steps.push({ step: "agents", ok: errors.length === 0, detail });
      if (errors.length) recovery.push("Resolve the agent installation errors and run 'tellclip setup' again.");
    } catch (error) {
      const failed = failure(error);
      steps.push({ step: "agents", ok: false, detail: failed.detail });
      recovery.push(failed.next);
    }
    try {
      if (status.screen_recording !== "authorized" && !options.dryRun) {
        status = setupStatus(await call("request_permission"));
        await waitFor(() => status.screen_recording === "authorized", now() + options.waitMs);
      }
      const authorized = status.screen_recording === "authorized";
      const permission2 = {
        step: "permission",
        ok: authorized || options.dryRun,
        detail: authorized ? "Screen Recording is authorized." : options.dryRun ? "Would open System Settings and wait for Screen Recording permission." : `${permissionNext} ${restartAdvice}`
      };
      if (!permission2.ok) {
        permission2.needs_person = true;
        recovery.push(permission2.detail);
      }
      steps.push(permission2);
    } catch (error) {
      const failed = failure(error);
      steps.push({ step: "permission", ok: false, detail: failed.detail, needs_person: true });
      recovery.push(failed.next);
    }
    if (status.signed_in || options.noLogin || options.dryRun) {
      steps.push({
        step: "sign_in",
        ok: true,
        detail: status.signed_in ? "Already signed in to Tellclip." : options.noLogin ? "Skipped sign-in (--no-login); sharing needs a sign-in." : "Would open the browser and wait for Tellclip sign-in."
      });
    } else {
      const abort = new AbortController();
      let loginError;
      try {
        const deadline = now() + options.waitMs;
        const login = (deps.login ?? loginWithApp)(endpoint, Math.max(1, options.waitMs), abort.signal).catch((error) => {
          loginError = error;
        });
        await refresh();
        await waitFor(() => status.signed_in || loginError !== void 0, deadline);
        abort.abort();
        await login;
        steps.push({
          step: "sign_in",
          ok: status.signed_in,
          detail: status.signed_in ? "Signed in to Tellclip." : loginError ? failure(loginError).detail : "Sign-in did not finish before the setup wait ended.",
          ...!status.signed_in ? { needs_person: true } : {}
        });
      } catch (error) {
        steps.push({ step: "sign_in", ok: false, detail: failure(error).detail, needs_person: true });
      } finally {
        abort.abort();
      }
    }
    const permission = steps.find((step) => step.step === "permission");
    if (permission.ok && status.screen_recording !== "authorized" && !options.dryRun) {
      permission.ok = false;
      permission.detail = `${permissionNext} ${restartAdvice}`;
      permission.needs_person = true;
      recovery.push(permission.detail);
    }
    if (options.noTest || status.screen_recording !== "authorized" || !permission.ok || options.dryRun) {
      steps.push({
        step: "test",
        ok: options.noTest || options.dryRun || permission.ok,
        detail: options.noTest ? "Skipped the test clip (--no-test)." : options.dryRun ? "Would record and discard a short test clip after permission is authorized." : "Skipped the test clip until Screen Recording is authorized."
      });
    } else {
      try {
        const take = await call("test_take");
        const sheet = take.sheet;
        if (take.ok !== true || typeof take.clip_seconds !== "number" || !Number.isFinite(take.clip_seconds) || typeof sheet?.path !== "string") throw new Error("Tellclip returned an incomplete test clip response.");
        steps.push({ step: "test", ok: true, detail: `Recorded a ${take.clip_seconds.toFixed(1)} s test clip.`, sheet: sheet.path });
      } catch (error) {
        const failed = failure(error);
        steps.push({ step: "test", ok: false, detail: failed.detail });
        recovery.push(failed.next);
      }
    }
  } else {
    const pending = {
      agents: "install integrations for detected agents",
      permission: "request Screen Recording permission if needed",
      sign_in: options.noLogin ? "skip sign-in (--no-login)" : "sign in if needed",
      test: options.noTest ? "skip the test clip (--no-test)" : "record and discard a test clip"
    };
    for (const step of ["agents", "permission", "sign_in", "test"]) {
      const planned = options.dryRun && steps[0].ok;
      steps.push({
        step,
        ok: planned,
        detail: planned ? `Would ${pending[step]} once Tellclip is running.` : "Blocked until the app setup succeeds."
      });
    }
  }
  if (options.project) {
    try {
      steps.push(await configureProject(deps.cwd ?? process.cwd(), options.dryRun));
    } catch (error) {
      steps.push({ step: "project", ok: false, detail: failure(error).detail });
      recovery.push("Make the project instructions file writable, then run 'tellclip setup --project' again.");
    }
  }
  const ok = steps.every((step) => !["app", "permission", "test"].includes(step.step) || step.ok);
  let next = !ok ? recovery.join(" ") : options.dryRun ? "Dry run only: run 'tellclip setup' without --dry-run to apply these steps." : readyNext;
  if (ok && !options.dryRun) {
    if (steps.some((step) => step.sheet)) next += " Show them the test clip's picture at steps[test].sheet.";
    if (!status?.signed_in) next += ` ${sharingNext}`;
    if (recovery.length) next += ` ${recovery.join(" ")}`;
  }
  if (!ok && !/tellclip setup/.test(next)) next += " Then run 'tellclip setup' again.";
  return { ok, steps, ...status ? { skill_path: status.skill_path } : {}, next };
}

// src/usage.ts
var usageText = `tellclip \u2014 record, edit, and share Tellclip clips from the command line.

USAGE
  tellclip setup [--dry-run] [--no-test] [--no-login] [--project] [--wait <seconds>]
  tellclip --version
  tellclip upload <file.mp4> [--title <title>] [--transcript <cues.json|file.vtt>]
                  [--chapters <chapters.json>] [--summary <text>]
                  [--thumbnail <seconds>]
  tellclip targets
  tellclip record (--browser | --window <id|title> | --app <name|bundle-id>
                  | --display <id|main> | --region <x,y,WxH>)
                  [--system-audio]
  tellclip record --cdp <port|ws-url|http-url> [--title <text>] [--strict]   record a headless browser (Linux CI)
  tellclip status
  tellclip pause | resume
  tellclip mark <label> [--at <x,y>] [--t <seconds> | --epoch-ms <ms>] [--session <s>]
  tellclip stop [--no-auto-edit]
  tellclip cancel
  tellclip browser open [<url>] [--viewport <W>x<H>] [--show] [--own-browser [--allow <site,\u2026>]]
  tellclip browser snapshot [--full]
  tellclip browser act [--json <steps> | --file <path>] [--record] [--stop] [--title <text>] [--summary <text>]  # or steps JSON on stdin; --record --stop is a whole take in one call; a step's "zoom": 2 is the clip's one zoom
  tellclip browser click <target>
  tellclip browser hover <target>
  tellclip browser type <text> [--into <target>]
  tellclip browser press <key>
  tellclip browser scroll <pixels> [--over <target>]
  tellclip browser scroll --to <target>
  tellclip browser goto <url>
  tellclip browser wait <seconds>
  tellclip browser wait --text <text> [--timeout <seconds>]
  tellclip browser eval <javascript>
  tellclip browser close
  tellclip zoom add <start> <end> [--level <1-5>] [--at <x,y>] [--session <s>]
  tellclip zoom update <id> [--level <1-5>] [--at <x,y>] [--mode auto|manual]
                  [--start <s>] [--end <s>] [--session <s>]
  tellclip zoom remove <id> | zoom list | zoom clear [--session <s>]
  tellclip mask add <start> <end> --rect <x,y,WxH> [--session <s>]
  tellclip mask update <id> [--rect <x,y,WxH>] [--start <s>] [--end <s>] [--session <s>]
  tellclip mask remove <id> | mask list | mask clear [--session <s>]
  tellclip highlight add <start> <end> --rect <x,y,WxH> [--session <s>]
  tellclip highlight update <id> [--rect <x,y,WxH>] [--start <s>] [--end <s>] [--session <s>]
  tellclip highlight remove <id> | highlight list | highlight clear [--session <s>]
  tellclip layout add <start> [<end>] --kind camera|split|screen [--session <s>]
  tellclip layout update <id> [--kind camera|split|screen] [--start <s>] [--end <s>] [--session <s>]
  tellclip layout remove <id> | layout list | layout clear [--session <s>]
  tellclip crop set <x,y,WxH> | crop clear [--session <s>]
  tellclip suggest [--min-still <seconds>] [--speed] [--apply] [--session <s>]
  tellclip cut <start> <end> [--session <s>]
  tellclip cut restore <index> [--session <s>]
  tellclip speed <start> <end> <rate> [--session <s>]
  tellclip title <text> [--session <s>]
  tellclip summary <text> [--session <s>]
  tellclip transcript set [--file <path>] [--session <s>]
  tellclip transcript list [--session <s>]
  tellclip transcript clear [--session <s>]
  tellclip transcript cut <from> <to> [--restore] [--session <s>]
  tellclip transcript pause <index> [--remove|--restore] [--session <s>]
  tellclip transcript tidy [--no-pauses] [--no-fillers] [--session <s>]
  tellclip edits | marks [--session <s>]
  tellclip frame <seconds> [<seconds>...] [--view edit|recording|output] [--out <path|dir>] [--session <s>]
  tellclip frame --sheet [<seconds>...] [--view ...]   one picture: a tile per mark, or per time
  tellclip cursor set [--file <path>] [--from-marks] [--session <s>]
  tellclip cursor clear [--session <s>]
  tellclip style get [--session <s>]
  tellclip style set (--json <patch> | --file <path>) [--session <s>]
  tellclip preset list | preset apply <id> | preset save <name> | preset delete <id> [--session <s>]
  tellclip background add (--image <path> | --color <hex> | --gradient <from,to[,angle]>) [--session <s>]
  tellclip background remove <id> [--session <s>]
  tellclip preview [--session <s>]
  tellclip save [--out <path>] [--session <s>]
  tellclip share [--session <s>]
  tellclip share [--name <key>] [--out <clip.mp4>] [--comment-file <path>] [--wait <seconds>]
                 [--captions track|burned] [--tier standard|high|preview] [--strict]
                 CI take: upload, render in the cloud; prints the clip link, MP4 + PR comment
  tellclip login | logout
  tellclip guide

Start a new Mac with \`tellclip setup\`: connect to or install Tellclip, install
agent integrations, request Screen Recording permission, sign in, and test a clip.
--dry-run reports the steps without changes; --no-test and --no-login skip them.
--project adds clip instructions to AGENTS.md (or an existing CLAUDE.md).
--wait sets the permission and sign-in wait in seconds (default 120).

Browser single-step commands accept --label <text>, --hold <seconds>,
--off-camera and --confirm. Targets are refs (e12), role:name (button:Create),
or x,y (640,300) in viewport CSS pixels.

--own-browser drives one window of the person's own, signed-in Chrome through
the Tellclip extension instead of the capture browser. The agent may open the
URL's site and the --allow sites only; a click on Delete, Send, Pay and the like
needs "confirm": true, which you send only after the person said yes.

CI takes (record --cdp): mark, title, summary, stop and share go to the CI take
while it is open, and always on Linux. With CI=true they exit 0 on failure and
print {"ok":false,...} plus a ::warning:: line; --strict or TELLCLIP_STRICT=1
restores non-zero exits. With CI=true they never reach the Mac app; unset CI or
set TELLCLIP_STRICT=1 to drive it. Needs ffmpeg; share needs TELLCLIP_API_KEY
and uses the server upload uses (TELLCLIP_WEB_BASE_URL, default
https://tellclip.com).

All output is JSON. Edit and transcript cue times are seconds in the source
recording; edit coordinates are normalized 0-1 from the top-left of the captured
window. Run \`tellclip guide\` for the full agent workflow.`;

// src/upload.ts
import { execFile as execFile2 } from "node:child_process";
import { open, readFile as readFile2 } from "node:fs/promises";
import path2 from "node:path";
import { setTimeout as delay2 } from "node:timers/promises";

// src/authored-content.ts
var maxTranscriptBytes = 2 * 1024 * 1024;
var maxChapters = 50;
var maxChapterTitle = 120;
var maxSummary = 600;
var durationSlackSeconds = 0.5;
var transcriptHint = 'Use {"cues":[{"start":1.5,"end":3.2,"text":"Open Settings."}]} (seconds) or a WebVTT file.';
var chaptersHint = 'Use {"chapters":[{"start":0,"title":"Intro"},{"start":12.5,"title":"Settings"}]} (seconds).';
function invalid(code, message, next) {
  return cliError(code, message, next, 2);
}
function formatVttTimestamp(seconds) {
  const total = Math.max(0, Math.round(seconds * 1e3));
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  return `${pad(Math.floor(total / 36e5))}:${pad(Math.floor(total % 36e5 / 6e4))}:${pad(Math.floor(total % 6e4 / 1e3))}.${pad(total % 1e3, 3)}`;
}
function encodeVttText(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function cuesToVtt(cues) {
  const blocks = cues.map(
    (cue) => `${formatVttTimestamp(cue.start)} --> ${formatVttTimestamp(cue.end)}
${encodeVttText(cue.text)}`
  );
  return `WEBVTT

${blocks.join("\n\n")}
`;
}
var vttTiming = /^\s*((?:\d{2,}:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d{2,}:)?\d{2}:\d{2}[.,]\d{3})/;
function vttSeconds(label) {
  const parts = label.replace(",", ".").split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}
function parseTranscriptInput(source, duration) {
  const text = source.replace(/^﻿/, "");
  const limit = duration + durationSlackSeconds;
  let vtt;
  if (text.startsWith("WEBVTT")) {
    const timings = text.split(/\r?\n/).map((line) => vttTiming.exec(line)).filter((match) => match !== null);
    if (timings.length === 0)
      throw invalid("invalid_transcript", "The WebVTT file has no cues.", transcriptHint);
    for (const [, start, end] of timings) {
      if (vttSeconds(end) <= vttSeconds(start) || vttSeconds(end) > limit)
        throw invalid(
          "invalid_transcript",
          `Cue ${start} --> ${end} must end after it starts and before the video ends (${duration.toFixed(2)} s).`,
          transcriptHint
        );
    }
    vtt = text;
  } else {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw invalid("invalid_transcript", "The transcript is neither JSON nor WebVTT.", transcriptHint);
    }
    const cues = parsed?.cues;
    if (!Array.isArray(cues) || cues.length === 0)
      throw invalid("invalid_transcript", "The transcript needs a non-empty cues array.", transcriptHint);
    const normalized = cues.map((cue, index) => {
      const { start, end, text: cueText } = cue ?? {};
      const collapsed = typeof cueText === "string" ? cueText.replace(/\s+/g, " ").trim() : "";
      if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > limit || !collapsed)
        throw invalid(
          "invalid_transcript",
          `Cue ${index} needs 0 <= start < end <= ${duration.toFixed(2)} and non-empty text.`,
          transcriptHint
        );
      return { start, end: Math.min(end, duration), text: collapsed };
    });
    vtt = cuesToVtt(normalized.sort((a, b) => a.start - b.start));
  }
  if (Buffer.byteLength(vtt) > maxTranscriptBytes)
    throw invalid("invalid_transcript", "The transcript is larger than 2 MB.", "Shorten the transcript.");
  return vtt;
}
function formatChapterTimestamp(seconds) {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor(whole % 3600 / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${String(minutes).padStart(2, "0")}:${rest}`;
}
function parseChaptersInput(source, duration) {
  let parsed;
  try {
    parsed = JSON.parse(source.replace(/^﻿/, ""));
  } catch {
    throw invalid("invalid_chapters", "The chapters file is not JSON.", chaptersHint);
  }
  const chapters = parsed?.chapters;
  if (!Array.isArray(chapters) || chapters.length === 0 || chapters.length > maxChapters)
    throw invalid("invalid_chapters", `Provide 1\u2013${maxChapters} chapters.`, chaptersHint);
  let previous = -1;
  return chapters.map((chapter, index) => {
    const { start, title } = chapter ?? {};
    const trimmed = typeof title === "string" ? title.trim() : "";
    const second = typeof start === "number" && Number.isFinite(start) ? Math.floor(start) : NaN;
    if (!(second >= 0) || second >= duration || second <= previous || !trimmed || trimmed.length > maxChapterTitle)
      throw invalid(
        "invalid_chapters",
        `Chapter ${index} needs a start in whole seconds after the previous one and before ${duration.toFixed(2)}, and a 1\u2013${maxChapterTitle} character title.`,
        chaptersHint
      );
    previous = second;
    return { start: formatChapterTimestamp(second), title: trimmed };
  });
}
function parseSummaryInput(source) {
  const summary = source.trim();
  if (!summary || summary.length > maxSummary)
    throw invalid("invalid_summary", `The summary must contain 1\u2013${maxSummary} characters.`, "Write 2\u20134 sentences.");
  return summary;
}

// src/upload.ts
var maxUploadBytes = 5e9;
var uploadUsage = "Usage: tellclip upload <file.mp4> [--title <title>] [--transcript <cues.json|file.vtt>] [--chapters <chapters.json>] [--summary <text>] [--thumbnail <seconds>]";
var valueFlags = [
  "--title",
  "--transcript",
  "--chapters",
  "--summary",
  "--thumbnail"
];
function parseUploadArgs(args) {
  let file;
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (valueFlags.includes(argument) && values[argument] === void 0 && args[i + 1] !== void 0)
      values[argument] = args[++i];
    else if (!argument.startsWith("-") && file === void 0) file = argument;
    else throw new UsageError(uploadUsage);
  }
  if (!file) throw new UsageError("upload needs an MP4 file.");
  const title = (values["--title"] ?? path2.basename(file, path2.extname(file))).trim();
  if (!title || title.length > 200)
    throw new UsageError("Title must contain 1\u2013200 characters.");
  const resolve2 = (value) => value === void 0 ? void 0 : path2.resolve(value);
  const thumbnail = values["--thumbnail"] === void 0 ? void 0 : Number(values["--thumbnail"]);
  if (thumbnail !== void 0 && (values["--thumbnail"].trim() === "" || !Number.isFinite(thumbnail) || thumbnail < 0))
    throw new UsageError("--thumbnail needs a time in seconds, e.g. 4.5.");
  return {
    file: path2.resolve(file),
    title,
    transcript: resolve2(values["--transcript"]),
    chapters: resolve2(values["--chapters"]),
    summary: values["--summary"] === void 0 ? void 0 : parseSummaryInput(values["--summary"]),
    thumbnail
  };
}
async function readAuthoredFile(file) {
  return readFile2(file, "utf8").catch(() => {
    throw cliError(
      "file_unreadable",
      `Could not read ${file}.`,
      "Check the file path and permissions.",
      2
    );
  });
}
async function probeUpload(file) {
  const data = await new Promise((resolve2, reject) => {
    execFile2(
      "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file",
        "-f",
        "mov",
        "-i",
        file,
        "-show_format",
        "-show_streams",
        "-of",
        "json"
      ],
      { timeout: 3e4, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        if (error)
          reject(
            cliError(
              "invalid_video",
              "Could not inspect the MP4 file.",
              "Install FFmpeg (including ffprobe) and check that the file is readable.",
              1
            )
          );
        else resolve2(stdout);
      }
    );
  });
  let media;
  try {
    media = JSON.parse(data);
  } catch {
    throw cliError(
      "invalid_video",
      "Could not inspect the MP4 file.",
      void 0,
      1
    );
  }
  const videos = media.streams?.filter(
    (s) => s.codec_type === "video"
  ) ?? [];
  const audio = media.streams?.filter(
    (s) => s.codec_type === "audio"
  ) ?? [];
  if (!media.format?.format_name?.split(",").includes("mp4") || media.format.tags?.major_brand?.trim() === "qt" || videos.length !== 1 || videos[0].codec_name !== "h264" || !["yuv420p", "yuvj420p"].includes(videos[0].pix_fmt) || audio.length > 1 || audio.some((s) => s.codec_name !== "aac") || !Number.isFinite(Number(media.format.duration)) || Number(media.format.duration) <= 0) {
    throw cliError(
      "unsupported_video",
      "Use an 8-bit H.264 MP4 with optional AAC audio.",
      "Convert the file before uploading. Tellclip does not transcode uploads.",
      1
    );
  }
  return Number(media.format.duration);
}
function assertUploadOrigin(base) {
  let origin;
  try {
    origin = new URL(base);
  } catch {
    throw cliError(
      "invalid_server",
      "The server URL is invalid.",
      void 0,
      1
    );
  }
  if (origin.username || origin.password || origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) {
    throw cliError(
      "invalid_server",
      "The server must use HTTPS (except localhost).",
      void 0,
      1
    );
  }
}
async function uploadFile(args, deps = {}) {
  const { file, title, ...authored } = parseUploadArgs(args);
  const base = deps.base ?? normalizedWebBaseURL();
  assertUploadOrigin(base);
  const token = deps.token ?? uploadToken(base);
  const fetcher = deps.fetch ?? fetch;
  const handle = await open(file, "r").catch(() => {
    throw cliError(
      "file_unreadable",
      "Could not open the video file.",
      "Check the file path and permissions.",
      1
    );
  });
  let uploadId;
  let publishing = false;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  const request = async (suffix, method, body) => {
    let response;
    try {
      response = await fetcher(`${base}/api/clip-uploads${suffix}`, {
        method,
        redirect: "error",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        ...body === void 0 ? {} : { body: JSON.stringify(body) },
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(9e4)
        ])
      });
    } catch {
      throw cliError(
        "network_error",
        "Could not reach Tellclip.",
        "Check the connection and try again.",
        1
      );
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = payload.error;
      throw cliError(
        typeof error === "object" ? error.code ?? "upload_failed" : "upload_failed",
        typeof error === "string" ? error : error?.message ?? "Upload failed.",
        void 0,
        1
      );
    }
    return payload;
  };
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 1 || info.size > maxUploadBytes)
      throw cliError(
        "invalid_size",
        "Choose a non-empty video file no larger than 5 GB.",
        void 0,
        1
      );
    const duration = await (deps.probe ?? probeUpload)(file);
    const transcript = authored.transcript ? parseTranscriptInput(
      await readAuthoredFile(authored.transcript),
      duration
    ) : void 0;
    const chapters = authored.chapters ? parseChaptersInput(await readAuthoredFile(authored.chapters), duration) : void 0;
    if (authored.thumbnail !== void 0 && authored.thumbnail >= duration)
      throw cliError(
        "invalid_thumbnail",
        `--thumbnail must be before the video ends (${duration.toFixed(2)} s).`,
        "Pick a time inside the video.",
        2
      );
    const upload = await request("", "POST", {
      title,
      size_bytes: info.size,
      ...transcript === void 0 ? {} : { transcript_size_bytes: Buffer.byteLength(transcript) }
    });
    if (typeof upload.upload_id !== "string" || typeof upload.upload_url !== "string")
      throw cliError(
        "bad_response",
        "The server returned an invalid upload response.",
        void 0,
        1
      );
    uploadId = upload.upload_id;
    process.stderr.write("Uploading video\u2026\n");
    const stream = handle.createReadStream({
      start: 0,
      end: info.size - 1,
      autoClose: false
    });
    try {
      const response = await fetcher(upload.upload_url, {
        method: "PUT",
        redirect: "error",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(info.size)
        },
        body: stream,
        duplex: "half",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(36e5)
        ])
      });
      if (!response.ok)
        throw cliError(
          "upload_failed",
          "File transfer failed.",
          "Run the upload again.",
          1
        );
      await response.body?.cancel();
    } finally {
      stream.destroy();
    }
    if (transcript !== void 0) {
      if (typeof upload.transcript_upload_url !== "string")
        throw cliError(
          "bad_response",
          "The server did not accept a transcript.",
          "Update Tellclip's server or upload without --transcript.",
          1
        );
      const response = await fetcher(upload.transcript_upload_url, {
        method: "PUT",
        redirect: "error",
        headers: {
          "Content-Type": "text/vtt; charset=utf-8",
          "Content-Length": String(Buffer.byteLength(transcript))
        },
        body: transcript,
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(9e4)
        ])
      });
      if (!response.ok)
        throw cliError(
          "upload_failed",
          "Transcript transfer failed.",
          "Run the upload again.",
          1
        );
      await response.body?.cancel();
    }
    const content = {
      ...transcript === void 0 ? {} : { transcript_uploaded: true },
      ...authored.summary === void 0 ? {} : { summary: authored.summary },
      ...chapters === void 0 ? {} : { chapters },
      ...authored.thumbnail === void 0 ? {} : { thumbnail_seconds: authored.thumbnail }
    };
    process.stderr.write("Validating video\u2026\n");
    publishing = true;
    let complete;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        complete = await request(
          `/${uploadId}/complete`,
          "POST",
          Object.keys(content).length ? content : void 0
        );
        break;
      } catch (error) {
        const code = error instanceof EmitAndExit ? error.payload.error?.code : void 0;
        if (controller.signal.aborted || !["network_error", "busy"].includes(code ?? "") || attempt === 2)
          throw error;
        await delay2(1e3 * (attempt + 1), void 0, {
          signal: controller.signal
        });
      }
    }
    if (complete?.status !== "ready" || typeof complete.clip_id !== "string" || typeof complete.share_token !== "string") {
      throw cliError(
        "bad_response",
        "The server did not confirm publication.",
        void 0,
        1
      );
    }
    return {
      clip_id: complete.clip_id,
      url: `${base}/v/${complete.share_token}`,
      status: "ready"
    };
  } catch (error) {
    if (uploadId && !publishing) {
      await fetcher(`${base}/api/clip-uploads/${uploadId}`, {
        method: "DELETE",
        redirect: "error",
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5e3)
      }).catch(() => {
      });
    }
    if (error instanceof EmitAndExit || error instanceof UsageError)
      throw error;
    throw cliError(
      "upload_failed",
      "Video upload failed.",
      "Check the file and connection, then try again.",
      1
    );
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
    await handle.close();
  }
}

// src/main.ts
init_version();

// src/ci/commands.ts
import { existsSync as existsSync4, readFileSync as readFileSync7 } from "node:fs";
import path6 from "node:path";

// src/ci/finalize.ts
import { execFile as execFile3 } from "node:child_process";
import { existsSync as existsSync3, mkdirSync as mkdirSync4, readFileSync as readFileSync6, rmSync as rmSync2, statSync as statSync2, writeFileSync as writeFileSync4 } from "node:fs";
import { availableParallelism } from "node:os";
import path5 from "node:path";
init_version();

// src/ci/session-build.ts
var round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;
var clamp01 = (value) => Math.min(1, Math.max(0, value));
function orderFrames(frames) {
  const byTime = /* @__PURE__ */ new Map();
  for (const frame of frames) {
    if (!Number.isFinite(frame.ts) || frame.bytes <= 0) continue;
    const previous = byTime.get(frame.ts);
    if (previous === void 0 || previous.i < frame.i) byTime.set(frame.ts, frame);
  }
  return [...byTime.values()].sort((a, b) => a.ts - b.ts);
}
function buildInput(raw, firstMs, endMs) {
  const out = [];
  for (const event of [...raw].sort((a, b) => a.t - b.t)) {
    if (event.t < firstMs - 1e3 || event.t > endMs + 1e3) continue;
    const t = round(Math.max(0, (event.t - firstMs) / 1e3));
    if (event.type === "down" || event.type === "up") {
      if (event.x === void 0 || event.y === void 0) continue;
      const side = event.button === 2 ? "right" : event.button === 0 || event.button === void 0 ? "left" : void 0;
      if (side === void 0) continue;
      out.push({ t, type: `${side}${event.type === "down" ? "Down" : "Up"}`, x: round(clamp01(event.x)), y: round(clamp01(event.y)) });
    } else if (event.type === "wheel") {
      out.push({
        t,
        type: "scroll",
        ...event.x === void 0 || event.y === void 0 ? {} : { x: round(clamp01(event.x)), y: round(clamp01(event.y)) },
        dx: event.dx ?? 0,
        dy: event.dy ?? 0
      });
    } else if (event.type === "key") {
      out.push({ t, type: "key" });
    }
  }
  return out;
}
var defaultCursorOptions = { glideSeconds: 0.7, leadSeconds: 0.12, sampleHz: 60, start: { x: 0.5, y: 0.5 } };
var ease = (u) => u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
function synthesizeCursor(input, rawMoves, durationSeconds, options = defaultCursorOptions) {
  const points = [];
  for (const event of input) {
    if (event.type === "leftDown" || event.type === "rightDown" || event.type === "leftUp" || event.type === "rightUp") {
      points.push({ t: event.t, x: event.x, y: event.y, click: event.type.endsWith("Down") });
    }
  }
  for (const move of rawMoves) points.push({ t: move.t, x: move.x, y: move.y, click: false });
  points.sort((a, b) => a.t - b.t);
  const waypoints = [];
  for (const point of points) {
    const last = waypoints.at(-1);
    if (last !== void 0 && point.t - last.t < 0.03) {
      const t = point.click || !last.click ? point.t : last.t;
      waypoints[waypoints.length - 1] = { t, x: point.x, y: point.y, click: last.click || point.click };
    } else {
      waypoints.push({ ...point });
    }
  }
  const samples = [];
  const push = (t, x2, y2) => {
    const sample = { t: round(Math.max(0, t)), x: round(clamp01(x2)), y: round(clamp01(y2)), isInsideTarget: true, cursorId: "arrow" };
    const last = samples.at(-1);
    if (last !== void 0 && sample.t <= last.t) {
      if (sample.t === last.t) samples[samples.length - 1] = sample;
      return;
    }
    samples.push(sample);
  };
  let x = options.start.x;
  let y = options.start.y;
  let previousT = 0;
  push(0, x, y);
  const step = 1 / options.sampleHz;
  for (const waypoint of waypoints) {
    const distance = Math.hypot(waypoint.x - x, waypoint.y - y);
    if (distance < 2e-3) {
      previousT = waypoint.t;
      continue;
    }
    const begin = Math.max(previousT, waypoint.t - options.glideSeconds);
    const arrive = waypoint.click ? Math.max(begin, waypoint.t - options.leadSeconds) : waypoint.t;
    if (arrive - begin >= step) {
      push(begin, x, y);
      for (let t = begin + step; t < arrive; t += step) {
        const u = ease((t - begin) / (arrive - begin));
        push(t, x + (waypoint.x - x) * u, y + (waypoint.y - y) * u);
      }
    }
    push(arrive, waypoint.x, waypoint.y);
    if (waypoint.t > arrive) push(waypoint.t, waypoint.x, waypoint.y);
    x = waypoint.x;
    y = waypoint.y;
    previousT = waypoint.t;
  }
  push(Math.max(durationSeconds, previousT), x, y);
  return samples;
}
function buildMarks(lines, firstMs, durationSeconds, defaults) {
  let title = defaults.title;
  let summary = "";
  const marks = [];
  for (const line of lines) {
    if (typeof line.text !== "string") continue;
    if (line.kind === "title") title = line.text;
    else if (line.kind === "summary") summary = line.text;
    else if (line.kind === "mark") {
      const seconds = line.t ?? (line.epoch_ms === void 0 ? void 0 : (line.epoch_ms - firstMs) / 1e3);
      if (seconds === void 0 || !Number.isFinite(seconds)) continue;
      if (seconds > durationSeconds + 0.5) continue;
      marks.push({ t: round(Math.min(durationSeconds, Math.max(0, seconds)), 3), text: line.text, ...line.at ? { at: line.at } : {} });
    }
  }
  marks.sort((a, b) => a.t - b.t);
  return { version: 1, title, summary, partial: defaults.partial, ended_reason: defaults.endedReason, marks };
}
var percentile = (sorted, p) => sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
function frameStats(frames, durationSeconds) {
  const gaps = frames.slice(1).map((frame, index) => frame.ts - frames[index].ts).sort((a, b) => a - b);
  const lags = frames.map((frame) => frame.recv - frame.ts).sort((a, b) => a - b);
  const busy = gaps.filter((gap) => gap < 100);
  const bytes = frames.reduce((sum, frame) => sum + frame.bytes, 0);
  return {
    frames: frames.length,
    duration_s: round(durationSeconds, 3),
    fps_mean: round(frames.length / Math.max(durationSeconds, 1e-3), 1),
    fps_busy: busy.length ? round(1e3 / (busy.reduce((a, b) => a + b, 0) / busy.length), 1) : null,
    gap_ms: { p50: round(percentile(gaps, 0.5), 1), p95: round(percentile(gaps, 0.95), 1), p99: round(percentile(gaps, 0.99), 1), max: round(gaps.at(-1) ?? 0, 1) },
    receive_lag_ms: { p50: round(percentile(lags, 0.5), 1), p99: round(percentile(lags, 0.99), 1), max: round(lags.at(-1) ?? 0, 1) },
    bytes_total: bytes,
    kb_per_frame: frames.length ? round(bytes / frames.length / 1024, 1) : 0,
    sizes: [...new Set(frames.map((frame) => `${frame.w}x${frame.h}`))]
  };
}
function concatScript(frames, endMs, fileFor) {
  const lines = ["ffconcat version 1.0"];
  const entry = (frame, seconds) => {
    lines.push(`file '${fileFor(frame).replace(/'/g, "'\\''")}'`, "option framerate 90000", `duration ${seconds.toFixed(6)}`);
  };
  frames.forEach((frame, index) => {
    const next = index + 1 < frames.length ? frames[index + 1].ts : Math.max(endMs, frame.ts + 1);
    entry(frame, (next - frame.ts) / 1e3);
  });
  const last = frames.at(-1);
  if (last !== void 0) entry(last, 1e-3);
  return lines.join("\n") + "\n";
}
function jpegSize(data) {
  let index = 2;
  while (index + 9 < data.length) {
    if (data[index] !== 255) {
      index += 1;
      continue;
    }
    const marker = data[index + 1];
    if (marker >= 192 && marker <= 207 && marker !== 196 && marker !== 200 && marker !== 204) {
      return { h: data.readUInt16BE(index + 5), w: data.readUInt16BE(index + 7) };
    }
    if (marker === 216 || marker === 1 || marker >= 208 && marker <= 215) {
      index += 2;
      continue;
    }
    index += 2 + data.readUInt16BE(index + 2);
  }
  return void 0;
}

// src/ci/recorder.ts
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync as mkdirSync3, openSync, readFileSync as readFileSync5, writeFileSync as writeFileSync3, existsSync as existsSync2 } from "node:fs";
import { writeFile as writeFile2 } from "node:fs/promises";
import path4 from "node:path";

// src/ci/cdp.ts
var CdpError = class extends Error {
  constructor(method, message) {
    super(`${method}: ${message}`);
    this.method = method;
  }
};
function connectCdp(url, timeoutMs = 1e4) {
  return new Promise((resolve2, reject) => {
    const WebSocketClass = globalThis.WebSocket;
    if (WebSocketClass === void 0) {
      reject(new Error("This Node has no built-in WebSocket. Use Node 22 or newer."));
      return;
    }
    const ws = new WebSocketClass(url);
    let nextId = 0;
    let open3 = false;
    const pending = /* @__PURE__ */ new Map();
    const handlers = /* @__PURE__ */ new Map();
    const closeHandlers = [];
    const timer = setTimeout(() => {
      if (!open3) {
        try {
          ws.close();
        } catch {
        }
        reject(new Error(`Timed out connecting to ${cdpDisplay(url)}.`));
      }
    }, timeoutMs);
    ws.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8"));
      } catch {
        return;
      }
      if (typeof message.id === "number") {
        const entry = pending.get(message.id);
        if (entry === void 0) return;
        pending.delete(message.id);
        if (message.error !== void 0) entry.reject(new CdpError(entry.method, message.error.message ?? "failed"));
        else entry.resolve(message.result ?? {});
        return;
      }
      if (typeof message.method === "string") {
        for (const handler of handlers.get(message.method) ?? []) handler(message.params ?? {}, message.sessionId);
      }
    };
    ws.onclose = () => {
      for (const entry of pending.values()) entry.reject(new CdpError(entry.method, "connection closed"));
      pending.clear();
      if (!open3) {
        clearTimeout(timer);
        reject(new Error(`Could not connect to ${cdpDisplay(url)}.`));
        return;
      }
      open3 = false;
      for (const handler of closeHandlers) handler();
    };
    ws.onerror = () => {
    };
    ws.onopen = () => {
      open3 = true;
      clearTimeout(timer);
      const write = (method, params, sessionId, id) => {
        ws.send(JSON.stringify(sessionId === void 0 ? { id, method, params } : { id, method, params, sessionId }));
      };
      resolve2({
        send(method, params = {}, sessionId) {
          if (!open3) return Promise.reject(new CdpError(method, "connection closed"));
          const id = ++nextId;
          return new Promise((resolveSend, rejectSend) => {
            pending.set(id, { method, resolve: resolveSend, reject: rejectSend });
            write(method, params, sessionId, id);
          });
        },
        post(method, params = {}, sessionId) {
          if (!open3) return;
          const id = ++nextId;
          pending.set(id, { method, resolve: () => {
          }, reject: () => {
          } });
          write(method, params, sessionId, id);
        },
        on(method, handler) {
          handlers.set(method, [...handlers.get(method) ?? [], handler]);
        },
        onClose(handler) {
          closeHandlers.push(handler);
        },
        close() {
          try {
            ws.close();
          } catch {
          }
        }
      });
    };
  });
}
function cdpDisplay(text) {
  const value = text.trim();
  if (/^\d{1,5}$/.test(value)) return `127.0.0.1:${value}`;
  try {
    const url = new URL(value);
    return url.host ? `${url.protocol}//${url.host}` : "the --cdp address";
  } catch {
    return "the --cdp address";
  }
}
function parseCdpTarget(text) {
  const value = text.trim();
  if (/^\d{1,5}$/.test(value)) {
    const port = Number(value);
    if (port < 1 || port > 65535) throw new Error(`--cdp port must be 1-65535, got '${value}'.`);
    return { httpBase: `http://127.0.0.1:${port}` };
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("--cdp needs a port, an http URL or a ws URL.");
  }
  if (url.protocol === "ws:" || url.protocol === "wss:") {
    return { webSocketUrl: url.toString(), page: url.pathname.startsWith("/devtools/page/") };
  }
  if (url.protocol === "http:" || url.protocol === "https:") {
    return { httpBase: `${url.protocol}//${url.host}` };
  }
  throw new Error(`--cdp needs a port, an http URL or a ws URL, got ${cdpDisplay(value)}.`);
}
async function resolveCdpEndpoint(text, fetcher = fetch) {
  const parsed = parseCdpTarget(text);
  if ("webSocketUrl" in parsed) {
    return parsed.page ? { kind: "page", webSocketUrl: parsed.webSocketUrl } : { kind: "browser", webSocketUrl: parsed.webSocketUrl };
  }
  const response = await fetcher(`${parsed.httpBase}/json/version`, { signal: AbortSignal.timeout(5e3) });
  const body = await response.json();
  if (typeof body.webSocketDebuggerUrl !== "string") throw new Error("The DevTools endpoint did not report a browser WebSocket URL.");
  return { kind: "browser", webSocketUrl: body.webSocketDebuggerUrl, httpBase: parsed.httpBase };
}

// src/ci/take-store.ts
import { mkdirSync as mkdirSync2, readFileSync as readFileSync4, renameSync as renameSync2, rmSync, statSync, writeFileSync as writeFileSync2, existsSync, appendFileSync } from "node:fs";
import { homedir as homedir4 } from "node:os";
import path3 from "node:path";

// src/ci/take-logic.ts
var transitions = {
  first_frame: { from: [null], to: "recording" },
  unreachable: { from: [null], to: "failed" },
  stop: { from: ["recording"], to: "stopping" },
  encoded: { from: ["stopping"], to: "recorded" },
  no_frames: { from: ["stopping"], to: "failed" },
  share: { from: ["recorded", "failed", "uploading"], to: "uploading" },
  // uploading: only when its owner is dead
  uploaded: { from: ["uploading"], to: "rendering" },
  upload_failed: { from: ["uploading"], to: "failed" },
  render_done: { from: ["rendering"], to: "shared" },
  render_failed: { from: ["rendering"], to: "failed" }
};
function nextPhase(from, event) {
  const rule = transitions[event];
  return rule.from.includes(from) ? rule.to : void 0;
}
function decideStop(phase, ownerAlive, hasSession) {
  switch (phase) {
    case null:
      return { kind: "no_take" };
    case "recording":
      return { kind: "finalize", recorderAlive: ownerAlive };
    case "stopping":
      return ownerAlive ? { kind: "wait" } : { kind: "resume_finalize" };
    case "failed":
      return hasSession ? { kind: "report" } : { kind: "unreachable" };
    default:
      return { kind: "report" };
  }
}
function decideShare(phase, ownerAlive, hasSession) {
  switch (phase) {
    case null:
      return { kind: "no_take" };
    case "recording":
      return { kind: "stop_first" };
    case "stopping":
      return { kind: "wait_stop" };
    case "recorded":
      return { kind: "upload" };
    case "uploading":
      return ownerAlive ? { kind: "busy" } : { kind: "upload" };
    case "rendering":
      return { kind: "poll" };
    case "shared":
      return { kind: "report" };
    case "failed":
      return hasSession ? { kind: "upload" } : { kind: "not_recorded" };
  }
}
var ciTakeMaxAgeMs = 24 * 60 * 6e4;
function routeTakeCommand(command, take) {
  if (take === void 0 || take.ageMs > ciTakeMaxAgeMs) return "mac_app";
  const live = take.phase === "recording" || take.phase === "stopping";
  if (command !== "share") return live ? "ci_take" : "mac_app";
  switch (take.phase) {
    case "recording":
    case "stopping":
    case "recorded":
    case "uploading":
    case "rendering":
      return "ci_take";
    case "failed":
      return take.hasSession ? "ci_take" : "mac_app";
    case "shared":
      return "mac_app";
  }
}
function acceptsMarks(phase) {
  return phase === "recording";
}
function acceptsContent(phase) {
  return phase === "recording" || phase === "stopping" || phase === "recorded" || phase === "failed";
}
var terminalRenderStatuses = /* @__PURE__ */ new Set(["ready", "failed", "cancelled", "superseded"]);

// src/ci/take-store.ts
function tellclipHome(env = process.env) {
  if (env.TELLCLIP_HOME) return path3.resolve(env.TELLCLIP_HOME);
  if (env.RUNNER_TEMP) return path3.join(path3.resolve(env.RUNNER_TEMP), "tellclip");
  return path3.join(homedir4(), ".tellclip");
}
function takesDir(home = tellclipHome()) {
  return path3.join(home, "takes");
}
function newTakeName(now = /* @__PURE__ */ new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
  return `take-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}
function currentTakeDir(home = tellclipHome()) {
  try {
    const name = readFileSync4(path3.join(home, "current"), "utf8").trim();
    if (!/^[\w.-]+$/.test(name)) return void 0;
    const dir = path3.join(takesDir(home), name);
    return existsSync(dir) ? dir : void 0;
  } catch {
    return void 0;
  }
}
function setCurrentTake(dir, home = tellclipHome()) {
  mkdirSync2(home, { recursive: true });
  atomicWrite(path3.join(home, "current"), path3.basename(dir) + "\n");
}
function clearCurrentTake(take, home = tellclipHome()) {
  const file = path3.join(home, "current");
  try {
    if (readFileSync4(file, "utf8").trim() === take) rmSync(file, { force: true });
  } catch {
  }
}
function readState(dir) {
  try {
    return JSON.parse(readFileSync4(path3.join(dir, "state.json"), "utf8"));
  } catch {
    return void 0;
  }
}
function atomicWrite(file, data) {
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync2(temporary, data);
  renameSync2(temporary, file);
}
function appendLine(file, object) {
  appendFileSync(file, JSON.stringify(object) + "\n");
}
function readJsonLines(file) {
  let text;
  try {
    text = readFileSync4(file, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
    }
  }
  return out;
}
function isAlive(pid) {
  if (pid === void 0 || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
var lockStaleMs = 15e3;
function withLock(dir, body) {
  const lock = path3.join(dir, "state.lock");
  const deadline = Date.now() + 1e4;
  for (; ; ) {
    try {
      mkdirSync2(lock);
      writeFileSync2(path3.join(lock, "pid"), String(process.pid));
      break;
    } catch {
      let stale = false;
      try {
        const pid = Number(readFileSync4(path3.join(lock, "pid"), "utf8"));
        stale = !isAlive(pid) || Date.now() - statSync(lock).mtimeMs > lockStaleMs;
      } catch {
        try {
          stale = Date.now() - statSync(lock).mtimeMs > 1e3;
        } catch {
          stale = false;
        }
      }
      if (stale) rmSync(lock, { recursive: true, force: true });
      else if (Date.now() > deadline) throw new Error("state.json is locked by another process.");
      else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    return body();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
var TransitionRefused = class extends Error {
  constructor(current, event) {
    super(`Take is ${current?.phase ?? "not started"}; ${event} does not apply.`);
    this.current = current;
    this.event = event;
  }
};
function transition(dir, event, patch = {}, guard) {
  return withLock(dir, () => {
    const current = readState(dir);
    const to = nextPhase(current?.phase ?? null, event);
    if (to === void 0 || guard !== void 0 && !guard(current)) throw new TransitionRefused(current, event);
    const next = {
      ...current ?? { version: 1, take: path3.basename(dir) },
      ...patch,
      phase: to,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    atomicWrite(path3.join(dir, "state.json"), JSON.stringify(next, null, 2) + "\n");
    return next;
  });
}
function updateState(dir, patch, expect) {
  return withLock(dir, () => {
    const current = readState(dir);
    if (current === void 0 || expect !== void 0 && current.phase !== expect) return void 0;
    const next = { ...current, ...patch, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    atomicWrite(path3.join(dir, "state.json"), JSON.stringify(next, null, 2) + "\n");
    return next;
  });
}
function claimOwner(dir, phase) {
  return withLock(dir, () => {
    const current = readState(dir);
    if (current?.phase !== phase || isAlive(current.owner_pid)) return false;
    const next = { ...current, owner_pid: process.pid, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    atomicWrite(path3.join(dir, "state.json"), JSON.stringify(next, null, 2) + "\n");
    return true;
  });
}

// src/ci/recorder.ts
var recorderSubcommand = "__ci-recorder";
var cdpEnv = "TELLCLIP_RECORDER_CDP";
var firstFrameTimeoutMs = 15e3;
var defaultJpegQuality = 90;
function newBindingName() {
  return `__tc${randomBytes(16).toString("hex")}`;
}
function inputListenerSource(binding) {
  if (!/^__tc[0-9a-f]{32}$/.test(binding)) throw new Error("bad binding name");
  return `(() => {
  const call = window.${binding};
  if (typeof call !== "function") return;
  try { delete window.${binding}; } catch (_) {}
  if (window !== window.top) return;
  const origin = performance.timeOrigin;
  const send = (event) => { try { call(JSON.stringify(event)); } catch (_) {} };
  const where = (e) => ({ x: e.clientX / Math.max(1, innerWidth), y: e.clientY / Math.max(1, innerHeight) });
  const opts = { capture: true, passive: true };
  addEventListener("pointerdown", (e) => send({ type: "down", t: origin + e.timeStamp, button: e.button, ...where(e) }), opts);
  addEventListener("pointerup", (e) => send({ type: "up", t: origin + e.timeStamp, button: e.button, ...where(e) }), opts);
  addEventListener("pointermove", (e) => send({ type: "move", t: origin + e.timeStamp, ...where(e) }), opts);
  addEventListener("wheel", (e) => send({ type: "wheel", t: origin + e.timeStamp, dx: e.deltaX, dy: e.deltaY, ...where(e) }), opts);
  addEventListener("keydown", (e) => send({ type: "key", t: origin + e.timeStamp }), opts);
})()`;
}
function ffmpegAvailable() {
  const check = (binary) => {
    try {
      execFileSync(binary, ["-version"], { stdio: "ignore", timeout: 1e4 });
      return true;
    } catch {
      return false;
    }
  };
  return { ffmpeg: check("ffmpeg"), ffprobe: check("ffprobe") };
}
function requireFfmpeg() {
  const found = ffmpegAvailable();
  if (!found.ffmpeg || !found.ffprobe) {
    throw cliError(
      "ffmpeg_missing",
      `${!found.ffmpeg ? "ffmpeg" : "ffprobe"} is not on PATH. Recording in CI encodes the take with ffmpeg.`,
      "Install it first, e.g. sudo apt-get install -y ffmpeg, then run tellclip record again.",
      1
    );
  }
}
var sleep2 = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms));
async function startCdpRecording(options) {
  requireFfmpeg();
  const home = tellclipHome();
  const existing = currentTakeDir(home);
  if (existing !== void 0) {
    const state = readState(existing);
    if (state !== void 0 && (state.phase === "recording" || state.phase === "stopping") && isAlive(state.recorder_pid ?? state.owner_pid)) {
      throw cliError("take_active", `A take is already ${state.phase} (${state.take}).`, "Run tellclip stop first.", 1);
    }
  }
  const dir = path4.join(takesDir(home), newTakeName());
  mkdirSync3(path4.join(dir, "frames"), { recursive: true });
  const quality = Number(process.env.TELLCLIP_JPEG_QUALITY ?? defaultJpegQuality);
  const request = {
    cdp: cdpDisplay(options.cdp),
    ...options.title === void 0 ? {} : { title: options.title },
    quality: Number.isFinite(quality) && quality >= 1 && quality <= 100 ? Math.round(quality) : defaultJpegQuality,
    cli_version: (await Promise.resolve().then(() => (init_version(), version_exports))).cliVersion,
    requested_at: Date.now()
  };
  writeFileSync3(path4.join(dir, "request.json"), JSON.stringify(request, null, 2) + "\n");
  setCurrentTake(dir, home);
  const log = openSync(path4.join(dir, "recorder.log"), "a");
  const child = spawn(process.execPath, [process.argv[1], recorderSubcommand, dir], {
    detached: true,
    stdio: ["ignore", log, log],
    env: { ...process.env, [cdpEnv]: options.cdp }
  });
  child.unref();
  const deadline = Date.now() + firstFrameTimeoutMs + 2e3;
  while (Date.now() < deadline) {
    const state = readState(dir);
    if (state?.phase === "recording") {
      const page = readPage(dir);
      const result = {
        ok: true,
        recording: true,
        take: state.take,
        take_dir: dir,
        recorder_pid: state.recorder_pid,
        origin: page?.origin,
        viewport: page ? { width: page.width, height: page.height } : void 0,
        pixel_ratio: page?.dpr,
        first_frame_ms: state.first_frame_ms !== void 0 ? state.first_frame_ms - request.requested_at : void 0
      };
      if (page !== void 0 && page.dpr < 2) result.warnings = [pixelRatioWarning(page.dpr)];
      return result;
    }
    if (state?.phase === "failed") {
      const error = state.error ?? {};
      throw cliError(error.code ?? "browser_unreachable", error.message ?? "Could not record the browser.", error.next, 1);
    }
    if (child.exitCode !== null && state === void 0) break;
    await sleep2(50);
  }
  try {
    if (child.pid) process.kill(child.pid, "SIGKILL");
  } catch {
  }
  const failure2 = {
    code: "browser_unreachable",
    message: "No frame arrived from the browser.",
    next: "Check the --cdp address and that the page is open, then run tellclip record again."
  };
  try {
    transition(dir, "unreachable", { error: failure2 });
  } catch {
  }
  throw cliError(failure2.code, failure2.message, failure2.next, 1);
}
function pixelRatioWarning(dpr) {
  return {
    code: "low_pixel_ratio",
    message: `The browser renders at pixel ratio ${dpr}; zoomed steps will look soft.`,
    next: "Launch the browser with --force-device-scale-factor=2."
  };
}
function originOf(url) {
  if (url === void 0) return void 0;
  try {
    return new URL(url).origin;
  } catch {
    return "null";
  }
}
function readPage(dir) {
  try {
    return JSON.parse(readFileSync5(path4.join(dir, "page.json"), "utf8"));
  } catch {
    return void 0;
  }
}
async function pickPage(connection, httpBase) {
  const { targetInfos } = await connection.send("Target.getTargets");
  const pages = targetInfos.filter((target) => target.type === "page" && !target.url.startsWith("devtools://"));
  if (pages.length === 0) throw new Error("The browser has no open page.");
  if (httpBase !== void 0) {
    try {
      const list = await (await fetch(`${httpBase}/json/list`, { signal: AbortSignal.timeout(3e3) })).json();
      const first = list.find((entry) => entry.type === "page" && pages.some((page) => page.targetId === entry.id));
      if (first !== void 0) return first.id;
    } catch {
    }
  }
  return (pages.find((page) => page.attached) ?? pages[0]).targetId;
}
async function runRecorder(dir) {
  const request = JSON.parse(readFileSync5(path4.join(dir, "request.json"), "utf8"));
  const cdp = process.env[cdpEnv] ?? request.cdp;
  delete process.env[cdpEnv];
  const binding = newBindingName();
  const log = (message) => process.stdout.write(`${(/* @__PURE__ */ new Date()).toISOString()} ${message}
`);
  const fail = (code, message, next) => {
    log(`fail ${code}: ${message}`);
    try {
      transition(dir, "unreachable", { error: { code, message, next } });
    } catch {
    }
    process.exit(0);
  };
  let connection;
  let sessionId;
  let targetId;
  try {
    const endpoint = await resolveCdpEndpoint(cdp);
    connection = await connectCdp(endpoint.webSocketUrl);
    if (endpoint.kind === "browser") {
      let httpBase = endpoint.httpBase;
      if (httpBase === void 0) {
        const ws = new URL(endpoint.webSocketUrl);
        httpBase = `${ws.protocol === "wss:" ? "https:" : "http:"}//${ws.host}`;
      }
      targetId = await pickPage(connection, httpBase);
      sessionId = (await connection.send("Target.attachToTarget", { targetId, flatten: true })).sessionId;
    }
  } catch (error) {
    return fail(
      "browser_unreachable",
      `Tellclip could not attach to the browser at ${request.cdp}: ${error instanceof Error ? error.message : String(error)}`,
      "Start the browser with --remote-debugging-port=<port> and pass that port, or pass agent-browser get cdp-url."
    );
  }
  const framesFile = path4.join(dir, "frames.jsonl");
  const inputFile = path4.join(dir, "input.jsonl");
  const eventsFile = path4.join(dir, "events.jsonl");
  let frameCount = 0;
  let firstFrameWritten = false;
  let lastFrameTs = 0;
  let ending = false;
  const writes = /* @__PURE__ */ new Set();
  const cpuStart = process.cpuUsage();
  let rssPeak = 0;
  const send2 = (method, params = {}) => connection.send(method, params, sessionId);
  connection.on("Page.screencastFrame", (params, from) => {
    if (from !== sessionId) return;
    connection.post("Page.screencastFrameAck", { sessionId: params.sessionId }, sessionId);
    if (ending) return;
    const recv = Date.now();
    const metadata = params.metadata;
    const data = Buffer.from(params.data, "base64");
    const size = jpegSize(data) ?? { w: 0, h: 0 };
    const i = ++frameCount;
    const ts = typeof metadata.timestamp === "number" ? metadata.timestamp * 1e3 : recv;
    lastFrameTs = Math.max(lastFrameTs, ts);
    const file = path4.join(dir, "frames", `f${String(i).padStart(7, "0")}.jpg`);
    const write = writeFile2(file, data).then(() => {
      appendLine(framesFile, { i, ts, recv, bytes: data.length, w: size.w, h: size.h, vw: metadata.deviceWidth, vh: metadata.deviceHeight });
      if (!firstFrameWritten) {
        firstFrameWritten = true;
        try {
          transition(dir, "first_frame", { recorder_pid: process.pid, cdp: request.cdp, title: request.title, first_frame_ms: Date.now(), started_at: (/* @__PURE__ */ new Date()).toISOString() });
          log(`first frame ${size.w}x${size.h}`);
        } catch (error) {
          log(`first_frame refused: ${String(error)}`);
          process.exit(0);
        }
      }
    }).catch((error) => {
      log(`frame write failed: ${String(error)}`);
    }).finally(() => writes.delete(write));
    writes.add(write);
  });
  connection.on("Runtime.bindingCalled", (params, from) => {
    if (from !== sessionId || params.name !== binding || ending) return;
    try {
      const event = JSON.parse(String(params.payload));
      appendLine(inputFile, event);
    } catch {
    }
  });
  connection.on("Page.frameNavigated", (params, from) => {
    if (from !== sessionId) return;
    const frame = params.frame;
    if (frame.parentId !== void 0) return;
    appendLine(eventsFile, { type: "navigated", t: Date.now(), origin: originOf(frame.url) });
    send2("Page.startScreencast", { format: "jpeg", quality: request.quality, everyNthFrame: 1 }).catch(() => {
    });
  });
  const endTake = async (reason) => {
    if (ending) return;
    ending = true;
    log(`browser gone: ${reason}`);
    await Promise.allSettled([...writes]);
    const endMs = Math.max(lastFrameTs, Date.now() - 0);
    appendLine(eventsFile, { type: "ended", t: Date.now(), reason });
    writeStats();
    try {
      transition(dir, "stop", { owner_pid: process.pid, ending: { end_ms: endMs, reason, partial: true } }, (state) => state?.phase === "recording");
    } catch {
      process.exit(0);
    }
    try {
      await finalizeTake(dir);
    } catch (error) {
      log(`finalize after browser loss failed: ${String(error)}`);
    }
    process.exit(0);
  };
  connection.on("Target.detachedFromTarget", (params) => {
    if (params.sessionId === sessionId) void endTake("page_closed");
  });
  connection.on("Target.targetDestroyed", (params) => {
    if (params.targetId === targetId) void endTake("page_closed");
  });
  connection.on("Inspector.detached", () => void endTake("page_closed"));
  connection.onClose(() => void endTake("browser_closed"));
  const writeStats = () => {
    const cpu = process.cpuUsage(cpuStart);
    rssPeak = Math.max(rssPeak, process.memoryUsage().rss);
    try {
      atomicWrite(path4.join(dir, "alive.json"), JSON.stringify({ t: Date.now(), pid: process.pid, frames: frameCount, last_frame_ts: lastFrameTs, cpu_user_ms: cpu.user / 1e3, cpu_system_ms: cpu.system / 1e3, rss_peak_bytes: rssPeak }));
    } catch {
    }
  };
  const heartbeat = setInterval(writeStats, 1e3);
  process.on("SIGTERM", () => {
    if (ending) return;
    ending = true;
    clearInterval(heartbeat);
    void (async () => {
      await Promise.race([send2("Page.stopScreencast").catch(() => {
      }), sleep2(1e3)]);
      await Promise.allSettled([...writes]);
      writeStats();
      log("stopped");
      process.exit(0);
    })();
  });
  try {
    if (sessionId !== void 0) await connection.send("Target.setDiscoverTargets", { discover: true });
    await send2("Page.enable");
    await send2("Runtime.enable");
    await send2("Runtime.addBinding", { name: binding });
    await send2("Page.addScriptToEvaluateOnNewDocument", { source: inputListenerSource(binding) });
    await send2("Runtime.evaluate", { expression: inputListenerSource(binding) });
    const info = await send2("Runtime.evaluate", {
      expression: "JSON.stringify({origin: location.origin, width: innerWidth, height: innerHeight, dpr: devicePixelRatio})",
      returnByValue: true
    });
    atomicWrite(path4.join(dir, "page.json"), info.result.value);
    await send2("Page.startScreencast", { format: "jpeg", quality: request.quality, everyNthFrame: 1 });
  } catch (error) {
    return fail("browser_unreachable", `Could not start the screencast: ${error instanceof Error ? error.message : String(error)}`, "Check that the page is open and not a DevTools or extension page.");
  }
  writeStats();
  setTimeout(() => {
    if (!firstFrameWritten && !existsSync2(path4.join(dir, "state.json"))) {
      fail("browser_unreachable", "No frame arrived from the browser.", "Check that the page is open, then run tellclip record again.");
    }
  }, firstFrameTimeoutMs);
}

// src/ci/finalize.ts
var encodeSettings = {
  codec: "libx264",
  preset: process.env.TELLCLIP_X264_PRESET ?? "veryfast",
  crf: Number(process.env.TELLCLIP_X264_CRF ?? 16),
  keyframe_seconds: 2,
  timescale: 9e4
};
function run(binary, args, timeoutMs) {
  return new Promise((resolve2, reject) => {
    execFile3(binary, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stderr }));
      else resolve2({ stdout, stderr });
    });
  });
}
function sessionDir(dir) {
  return path5.join(dir, "session");
}
function marksLines(dir) {
  return readJsonLines(path5.join(dir, "marks.jsonl"));
}
function writeMarksFile(dir) {
  const session = sessionDir(dir);
  let base;
  try {
    base = JSON.parse(readFileSync6(path5.join(session, "frames.json"), "utf8")).take;
  } catch {
    return void 0;
  }
  const marks = buildMarks(marksLines(dir), base.first_ms, base.duration_s, { title: base.title, partial: base.partial, endedReason: base.ended_reason });
  writeFileSync4(path5.join(session, "marks.json"), JSON.stringify(marks, null, 2) + "\n");
  return marks;
}
async function finalizeTake(dir) {
  const state = readState(dir);
  if (state?.phase !== "stopping" || state.ending === void 0) {
    throw cliError("take_not_stopping", "The take is not being stopped.", void 0, 1);
  }
  const started = Date.now();
  const { reason, partial } = state.ending;
  const frames = orderFrames(readJsonLines(path5.join(dir, "frames.jsonl"))).filter((frame) => existsSync3(frameFile(dir, frame)));
  if (frames.length === 0) {
    const error = { code: "no_frames", message: "The take has no frames.", next: "Check that the browser page was visible to the recorder." };
    transition(dir, "no_frames", { error, owner_pid: void 0 });
    throw cliError(error.code, error.message, error.next, 1);
  }
  const firstMs = frames[0].ts;
  const endMs = Math.max(state.ending.end_ms, frames.at(-1).ts + 1);
  const durationSeconds = (endMs - firstMs) / 1e3;
  const page = readPage(dir);
  const width = frames[0].w - frames[0].w % 2;
  const height = frames[0].h - frames[0].h % 2;
  const viewport = { width: page?.width ?? frames[0].vw ?? width, height: page?.height ?? frames[0].vh ?? height };
  const dpr = page?.dpr ?? Math.round(width / viewport.width * 100) / 100;
  const session = sessionDir(dir);
  rmSync2(session, { recursive: true, force: true });
  mkdirSync4(session, { recursive: true });
  const listFile = path5.join(dir, "frames.ffconcat");
  writeFileSync4(listFile, concatScript(frames, endMs, (frame) => frameFile(dir, frame)));
  const display = path5.join(session, "display.mov");
  const encodeStarted = Date.now();
  try {
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      "-fps_mode",
      "passthrough",
      // Slice-threaded swscale: the full→limited, BT.601→BT.709 conversion
      // was 3× the encoder's cost single-threaded (ci/CLIMB.md round 1).
      "-filter_threads",
      String(Math.max(1, Math.min(8, availableParallelism()))),
      "-vf",
      `scale=${width}:${height}:flags=bicubic:in_range=full:out_range=limited:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p`,
      "-c:v",
      encodeSettings.codec,
      "-preset",
      encodeSettings.preset,
      "-crf",
      String(encodeSettings.crf),
      "-bf",
      "0",
      "-force_key_frames",
      `expr:gte(t,n_forced*${encodeSettings.keyframe_seconds})`,
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-colorspace",
      "bt709",
      "-color_range",
      "tv",
      "-video_track_timescale",
      String(encodeSettings.timescale),
      "-movflags",
      "+faststart",
      "-an",
      "-f",
      "mp4",
      display
    ], 30 * 6e4);
  } catch (error) {
    const missing = error.code === "ENOENT";
    const stderr = String(error.stderr ?? "").trim().split("\n").slice(-3).join(" ");
    updateState(dir, { owner_pid: void 0 }, "stopping");
    throw missing ? cliError("ffmpeg_missing", "ffmpeg is not on PATH.", "Install it, e.g. sudo apt-get install -y ffmpeg, then run tellclip stop again.", 1) : cliError("encode_failed", `ffmpeg could not encode the take: ${stderr}`, "Run tellclip stop again; the frames are kept.", 1);
  }
  const encodeMs = Date.now() - encodeStarted;
  let probedDuration;
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", display], 6e4);
    probedDuration = Number(stdout.trim());
  } catch {
  }
  const raw = readJsonLines(path5.join(dir, "input.jsonl"));
  const input = buildInput(raw, firstMs, endMs);
  const moves = raw.filter((event) => event.type === "move" && event.x !== void 0 && event.y !== void 0 && event.t >= firstMs - 1e3 && event.t <= endMs).map((event) => ({ t: Math.max(0, (event.t - firstMs) / 1e3), x: event.x, y: event.y }));
  const cursor = synthesizeCursor(input, moves, durationSeconds, defaultCursorOptions);
  const title = state.title ?? "Recording";
  const take = { first_ms: firstMs, end_ms: endMs, duration_s: durationSeconds, partial, ended_reason: reason, title };
  const metadata = {
    version: 1,
    width,
    height,
    fps: 30,
    source: "cdp",
    devicePixelRatio: dpr,
    viewport,
    durationSeconds: Math.round(durationSeconds * 1e3) / 1e3,
    cursorEdit: { isVisible: true },
    recorder: { name: "tellclip-cli", version: cliVersion }
  };
  const stats = frameStats(frames, durationSeconds);
  let recorderStats;
  try {
    recorderStats = JSON.parse(readFileSync6(path5.join(dir, "alive.json"), "utf8"));
  } catch {
  }
  writeFileSync4(path5.join(session, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n");
  writeFileSync4(path5.join(session, "cursor.json"), JSON.stringify(cursor) + "\n");
  writeFileSync4(path5.join(session, "input.json"), JSON.stringify(input) + "\n");
  writeFileSync4(path5.join(session, "frames.json"), JSON.stringify({
    take,
    stats,
    encode: { ...encodeSettings, ms: encodeMs, probed_duration_s: probedDuration },
    recorder: recorderStats,
    frames: frames.map((frame) => ({ t: Math.round(frame.ts - firstMs) / 1e3, ts: frame.ts, recv: frame.recv, bytes: frame.bytes, w: frame.w, h: frame.h }))
  }) + "\n");
  const marks = writeMarksFile(dir);
  const displayBytes = statSync2(display).size;
  const result = {
    ok: true,
    take: state.take,
    session_dir: session,
    frames: frames.length,
    duration_s: Math.round(durationSeconds * 100) / 100,
    display_duration_s: probedDuration,
    size: { width, height },
    bytes: displayBytes,
    pixel_ratio: dpr,
    viewport,
    marks: marks.marks.length,
    input_events: input.length,
    partial,
    ended_reason: reason,
    fps_busy: stats.fps_busy,
    stop_ms: Date.now() - started
  };
  if (dpr < 2) result.warnings = [pixelRatioWarning(dpr)];
  transition(dir, "encoded", { stop: result, owner_pid: void 0 });
  return result;
}
function frameFile(dir, frame) {
  return path5.join(dir, "frames", `f${String(frame.i).padStart(7, "0")}.jpg`);
}

// src/ci/commands.ts
var sleep3 = (ms) => new Promise((resolve2) => setTimeout(resolve2, ms));
var recorderExitTimeoutMs = 5e3;
var concurrentStopWaitMs = 10 * 6e4;
function ciTakeTakes(command, now = Date.now()) {
  if (!isTakeCommand(command)) return false;
  const dir = currentTakeDir();
  const state = dir === void 0 ? void 0 : readState(dir);
  if (dir === void 0 || state === void 0) return false;
  const since = Date.parse(state.started_at ?? state.updated_at);
  const ageMs = Number.isFinite(since) ? now - since : Number.POSITIVE_INFINITY;
  return routeTakeCommand(command, { phase: state.phase, ageMs, hasSession: existsSync4(sessionDir(dir)) }) === "ci_take";
}
function isTakeCommand(command) {
  return command === "mark" || command === "title" || command === "summary" || command === "stop" || command === "share";
}
function forgetFinishedCiTake() {
  const dir = currentTakeDir();
  if (dir === void 0) return;
  const phase = readState(dir)?.phase;
  if (phase === "recording" || phase === "stopping") return;
  clearCurrentTake(path6.basename(dir));
}
function neverStarted(state) {
  const error = state?.error ?? {};
  return cliError(
    error.code ?? "browser_unreachable",
    `The take never started${error.message ? `: ${error.message}` : "."}`,
    "Nothing was recorded. Fix tellclip record --cdp first.",
    1
  );
}
function parsePoint(text) {
  const parts = text.split(",");
  const [x, y] = parts.map((part) => Number(part));
  if (parts.length !== 2 || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    throw new UsageError(`--at must be 'x,y' with fractions 0-1 of the viewport, got '${text}'.`);
  }
  return { x, y };
}
function markTake(text, options, now = Date.now()) {
  if (!text.trim()) throw new UsageError('mark needs a label: tellclip mark "Open the projects page".');
  const dir = currentTakeDir();
  const state = dir === void 0 ? void 0 : readState(dir);
  if (dir === void 0 || state === void 0) {
    if (state === void 0 && dir !== void 0) throw neverStarted(state);
    throw cliError("no_take", "No take is recording; the mark was not saved.", "Run tellclip record --cdp <port> first.", 1);
  }
  if (state.phase === "failed" && !existsSync4(sessionDir(dir))) throw neverStarted(state);
  if (!acceptsMarks(state.phase)) {
    throw cliError("no_take", `The take is ${state.phase}; the mark was not saved.`, "Marks go in while a take is recording.", 1);
  }
  const line = { kind: "mark", text: text.trim() };
  if (options.t !== void 0) {
    const t2 = Number(options.t);
    if (!Number.isFinite(t2) || t2 < 0) throw new UsageError("--t must be seconds from the start of the take.");
    line.t = t2;
  }
  const epoch = options.epochMs === void 0 ? now : Number(options.epochMs);
  if (!Number.isFinite(epoch)) throw new UsageError("--epoch-ms must be a Unix time in milliseconds.");
  line.epoch_ms = epoch;
  if (options.at !== void 0) line.at = parsePoint(options.at);
  appendLine(path6.join(dir, "marks.jsonl"), line);
  const steps = readFileSync7(path6.join(dir, "marks.jsonl"), "utf8").split("\n").filter((row) => row.includes('"kind":"mark"')).length;
  const t = state.first_frame_ms === void 0 ? void 0 : Math.round(Math.max(0, epoch - firstFrameEpoch(dir, state)) / 10) / 100;
  return { ok: true, take: state.take, step: steps, ...line.t !== void 0 ? { t: line.t } : t === void 0 ? {} : { t } };
}
function firstFrameEpoch(dir, state) {
  try {
    const line = readFileSync7(path6.join(dir, "frames.jsonl"), "utf8").split("\n", 1)[0];
    return JSON.parse(line).ts;
  } catch {
    return state.first_frame_ms ?? Date.now();
  }
}
function setTakeContent(kind, text) {
  const value = text.trim();
  if (!value) throw new UsageError(`${kind} needs text.`);
  if (kind === "title" && value.length > 200) throw new UsageError("Title must contain 1\u2013200 characters.");
  if (kind === "summary" && value.length > 600) throw new UsageError("Summary must contain 1\u2013600 characters.");
  const dir = currentTakeDir();
  const state = dir === void 0 ? void 0 : readState(dir);
  if (dir === void 0 || state === void 0) throw cliError("no_take", `No take; the ${kind} was not saved.`, "Run tellclip record --cdp <port> first.", 1);
  if (!acceptsContent(state.phase)) throw cliError("take_uploaded", `The take is ${state.phase}; the ${kind} was not saved.`, "Set the title and summary before tellclip share.", 1);
  appendLine(path6.join(dir, "marks.jsonl"), { kind, text: value, epoch_ms: Date.now() });
  return { ok: true, take: state.take, [kind]: value };
}
async function waitForExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (isAlive(pid)) {
    if (Date.now() > deadline) return false;
    await sleep3(25);
  }
  return true;
}
function lastActivity(dir) {
  let latest;
  try {
    const alive = JSON.parse(readFileSync7(path6.join(dir, "alive.json"), "utf8"));
    latest = Math.max(alive.t ?? 0, alive.last_frame_ts ?? 0) || void 0;
  } catch {
  }
  return latest;
}
async function stopTake(now = Date.now()) {
  const dir = currentTakeDir();
  if (dir === void 0) throw cliError("no_take", "No take to stop.", "Run tellclip record --cdp <port> first.", 1);
  for (; ; ) {
    const state = readState(dir);
    const action = decideStop(state?.phase ?? null, isAlive(state?.phase === "recording" ? state.recorder_pid : state?.owner_pid), existsSync4(path6.join(sessionDir(dir), "display.mov")));
    switch (action.kind) {
      case "no_take":
      case "unreachable":
        throw neverStarted(state);
      case "report":
        if (state?.phase === "failed" && state.stop === void 0) throw neverStarted(state);
        return { ...state.stop ?? {}, ok: true, already_stopped: true, phase: state.phase };
      case "wait": {
        const deadline = Date.now() + concurrentStopWaitMs;
        while (readState(dir)?.phase === "stopping" && isAlive(readState(dir)?.owner_pid) && Date.now() < deadline) await sleep3(100);
        continue;
      }
      case "resume_finalize": {
        if (!claimOwner(dir, "stopping")) continue;
        return finalizeTake(dir);
      }
      case "finalize": {
        const recorderAlive = action.recorderAlive;
        const ending = recorderAlive ? { end_ms: now, reason: "stop", partial: false } : { end_ms: lastActivity(dir) ?? now, reason: "recorder_lost", partial: true };
        try {
          transition(dir, "stop", { owner_pid: process.pid, ending }, (current) => current?.phase === "recording");
        } catch (error) {
          if (error instanceof TransitionRefused) continue;
          throw error;
        }
        if (recorderAlive && state?.recorder_pid !== void 0) {
          try {
            process.kill(state.recorder_pid, "SIGTERM");
          } catch {
          }
          if (!await waitForExit(state.recorder_pid, recorderExitTimeoutMs)) {
            try {
              process.kill(state.recorder_pid, "SIGKILL");
            } catch {
            }
          }
        }
        return finalizeTake(dir);
      }
    }
  }
}

// src/ci/share.ts
import { createWriteStream, existsSync as existsSync5, readFileSync as readFileSync9, statSync as statSync3, writeFileSync as writeFileSync5, mkdirSync as mkdirSync5 } from "node:fs";
import { open as open2 } from "node:fs/promises";
import path7 from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
init_version();

// src/ci/comment.ts
import { readFileSync as readFileSync8 } from "node:fs";
function sanitizeName(name) {
  const cleaned = name.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return cleaned || "clip";
}
function pullRequestNumber(env, readEvent = (file) => readFileSync8(file, "utf8")) {
  const fromRef = /^refs\/pull\/(\d+)\//.exec(env.GITHUB_REF ?? "");
  if (fromRef) return Number(fromRef[1]);
  if (env.GITHUB_EVENT_PATH) {
    try {
      const event = JSON.parse(readEvent(env.GITHUB_EVENT_PATH));
      const number = event.pull_request?.number ?? event.number;
      if (Number.isInteger(number)) return number;
    } catch {
    }
  }
  return void 0;
}
function clipKeyFor(env, name, takeName, readEvent) {
  const repository = env.GITHUB_REPOSITORY?.trim();
  if (!repository) return takeName;
  const pr = pullRequestNumber(env, readEvent);
  const scope = pr !== void 0 ? `pr-${pr}` : sanitizeName(env.GITHUB_REF_NAME ?? "run");
  return `${repository}/${scope}/${sanitizeName(name)}`;
}
function formatClock(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}
var inline = (text) => text.replace(/\s+/g, " ").replace(/</g, "&lt;").trim();
var altText = (text) => inline(text).replace(/[[\]]/g, "");
function failureSentence(code) {
  switch (code) {
    case "browser_unreachable":
      return "No clip: Tellclip could not reach the browser.";
    case "no_credentials":
      return "Clip skipped: this run has no Tellclip credentials (fork pull request).";
    case "upload_failed":
    case "network_error":
      return "No clip: upload failed.";
    case "no_take":
    case "no_frames":
      return "No clip: nothing was recorded.";
    case "ffmpeg_missing":
      return "No clip: ffmpeg is not installed on the runner.";
    case "take_too_large":
      return "No clip: the recording is over the 30-minute or 1 GB limit.";
    default:
      return `No clip: ${code}.`;
  }
}
function renderComment(input) {
  const lines = [`<!-- tellclip:${sanitizeName(input.name)} -->`];
  const title = inline(input.title) || "Recording";
  const outcome = input.outcome;
  if (outcome.kind === "no_clip") {
    lines.push(`### ${title}`, failureSentence(outcome.code));
    return lines.join("\n") + "\n";
  }
  if (outcome.kind === "failed") {
    lines.push(`### ${title}`, `Clip failed to render (${inline(outcome.code)}). Recording kept; re-run to retry.`);
    return lines.join("\n") + "\n";
  }
  const heading = [title];
  if (outcome.durationSeconds !== void 0) heading.push(formatClock(outcome.durationSeconds));
  heading.push(`${outcome.steps.length} ${outcome.steps.length === 1 ? "step" : "steps"}`);
  lines.push(`### ${heading.join(" \xB7 ")}`);
  const thumbnail = outcome.thumbnailUrl;
  if (outcome.link && thumbnail) lines.push(`[![${altText(title)}](${thumbnail})](${outcome.link})`);
  else if (outcome.link) lines.push(`[Watch the clip](${outcome.link})`);
  else if (thumbnail) lines.push(`![${altText(title)}](${thumbnail})`);
  if (outcome.steps.length > 0) {
    lines.push(outcome.steps.map((step) => `${formatClock(step.start_s)} ${inline(step.text)}`).join(" \xB7 "));
  }
  if (outcome.status !== "ready") lines.push("Still rendering. The link shows the clip when it is ready.");
  if (outcome.partial) {
    lines.push(outcome.lastStep ? `The recording ended early, after step ${outcome.lastStep}.` : "The recording ended early.");
  }
  return lines.join("\n") + "\n";
}

// src/ci/share.ts
var sessionFiles = ["display.mov", "metadata.json", "cursor.json", "input.json", "marks.json"];
var maxTakeBytes = 1e9;
var maxTakeSeconds = 30 * 60;
var decideAgain = {};
var defaultDeps = {
  fetch: (...args) => fetch(...args),
  env: process.env,
  sleep: (ms) => new Promise((resolve2) => setTimeout(resolve2, ms)),
  backoffMs: [1e3, 3e3, 9e3],
  pollMs: 2e3
};
function parseShareArgs(args) {
  const options = { waitSeconds: 180, captions: "track", tier: "standard" };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = () => {
      const next = args[index + 1];
      if (next === void 0) throw new UsageError(`${argument} requires a value.`);
      index += 1;
      return next;
    };
    switch (argument) {
      case "--name":
        options.name = value();
        break;
      case "--out":
        options.out = value();
        break;
      case "--comment-file":
        options.commentFile = value();
        break;
      case "--wait": {
        const seconds = Number(value());
        if (!Number.isFinite(seconds) || seconds < 0) throw new UsageError("--wait needs seconds, e.g. 180.");
        options.waitSeconds = seconds;
        break;
      }
      case "--captions": {
        const mode = value();
        if (mode !== "burned" && mode !== "track") throw new UsageError("--captions must be burned or track.");
        options.captions = mode;
        break;
      }
      case "--tier": {
        const tier = value();
        if (tier !== "standard" && tier !== "high" && tier !== "preview") throw new UsageError("--tier must be standard, high or preview.");
        options.tier = tier;
        break;
      }
      case "--strict":
        break;
      default:
        throw new UsageError(`Unknown share option ${argument}. Use --name, --out, --comment-file, --wait, --captions, --tier.`);
    }
  }
  return options;
}
var ApiError = class extends Error {
  constructor(status, code, message, next) {
    super(message);
    this.status = status;
    this.code = code;
    this.next = next;
  }
};
function retryable(error) {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
}
async function withRetries(deps, body) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await body();
    } catch (error) {
      if (attempt >= deps.backoffMs.length || !retryable(error)) throw error;
      await deps.sleep(deps.backoffMs[attempt]);
    }
  }
}
function client() {
  return { name: "tellclip-cli", version: cliVersion };
}
async function shareTake(options, partialDeps = {}) {
  const deps = { ...defaultDeps, ...partialDeps };
  const dir = currentTakeDir();
  const takeName = dir === void 0 ? "no-take" : path7.basename(dir);
  const name = sanitizeName(options.name ?? deps.env.GITHUB_JOB ?? "clip");
  const clipKey = clipKeyFor(deps.env, name, takeName);
  const timings = {};
  let title = dir !== void 0 ? titleOf(dir) : "Recording";
  let outcome = { kind: "no_clip", code: "no_take" };
  const commentPath = options.commentFile === void 0 ? void 0 : path7.resolve(options.commentFile);
  const writeComment = () => {
    if (commentPath === void 0) return;
    mkdirSync5(path7.dirname(commentPath), { recursive: true });
    writeFileSync5(commentPath, renderComment({ name, title, outcome }));
  };
  try {
    if (dir === void 0) throw cliError("no_take", "No take to share.", "Run tellclip record --cdp and tellclip stop first.", 1);
    const result = await shareInner(dir, options, deps, clipKey, timings, (next) => {
      outcome = next;
    });
    title = titleOf(dir);
    return { ...result, comment_path: commentPath ?? null };
  } catch (error) {
    if (error instanceof EmitAndExit) {
      const code = error.payload.error?.code ?? "share_failed";
      if (outcome.kind !== "failed") outcome = { kind: "no_clip", code };
      if (commentPath) error.payload.comment_path = commentPath;
    }
    throw error;
  } finally {
    writeComment();
  }
}
function titleOf(dir) {
  try {
    return JSON.parse(readFileSync9(path7.join(sessionDir(dir), "marks.json"), "utf8")).title ?? "Recording";
  } catch {
    try {
      return readState(dir)?.title ?? JSON.parse(readFileSync9(path7.join(dir, "request.json"), "utf8")).title ?? "Recording";
    } catch {
      return "Recording";
    }
  }
}
function credentials(env, base) {
  const key = env.TELLCLIP_API_KEY?.trim();
  if (key) return key;
  try {
    if (env.TELLCLIP_API_KEY === void 0 && env.CI !== "true") return uploadToken(base);
  } catch {
  }
  throw cliError("no_credentials", "This run has no Tellclip credentials; nothing was uploaded.", "Set TELLCLIP_API_KEY from a repository secret. Fork pull requests get no secrets.", 1);
}
async function shareInner(dir, options, deps, clipKey, timings, setOutcome) {
  const waitDeadline = Date.now() + options.waitSeconds * 1e3;
  for (; ; ) {
    const state = readState(dir);
    const action = decideShare(state?.phase ?? null, isAlive(state?.owner_pid), existsSync5(path7.join(sessionDir(dir), "display.mov")));
    switch (action.kind) {
      case "no_take":
      case "not_recorded": {
        const error = state?.error ?? {};
        throw cliError(error.code ?? "no_take", error.message ?? "The take has no recording.", error.next, 1);
      }
      case "stop_first": {
        const started = Date.now();
        await stopTake();
        timings.stop = Date.now() - started;
        continue;
      }
      case "wait_stop":
        await deps.sleep(250);
        continue;
      case "busy":
        if (Date.now() >= waitDeadline) throw cliError("share_in_progress", "Another tellclip share is uploading this take.", "Wait for it to finish; its output has the link.", 1);
        await deps.sleep(1e3);
        continue;
      case "report":
        return reportStored(state, setOutcome);
      case "poll":
        return pollRender(dir, state, options, deps, timings, waitDeadline, setOutcome);
      case "upload": {
        const result = await uploadAndSubmit(dir, state, options, deps, clipKey, timings, waitDeadline, setOutcome);
        if (result === decideAgain) continue;
        return result;
      }
    }
  }
}
function reportStored(state, setOutcome) {
  const result = state.share?.result ?? {};
  const outcome = state.share?.outcome;
  if (outcome !== void 0) setOutcome(outcome);
  return { ...result, ok: true, deduplicated: true };
}
async function api(deps, base, token, method, route, body) {
  return withRetries(deps, async () => {
    let response;
    try {
      response = await deps.fetch(`${base}${route}`, {
        method,
        redirect: "error",
        headers: { authorization: `Bearer ${token}`, ...body === void 0 ? {} : { "content-type": "application/json" } },
        ...body === void 0 ? {} : { body: JSON.stringify(body) },
        signal: AbortSignal.timeout(6e4)
      });
    } catch (error) {
      throw new ApiError(0, "network_error", `Could not reach ${base}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = payload.error ?? {};
      throw new ApiError(response.status, error.code ?? `http_${response.status}`, error.message ?? `HTTP ${response.status} from ${route}.`, error.next);
    }
    return payload;
  });
}
async function putBytes(deps, url, bytes) {
  return withRetries(deps, async () => {
    let response;
    try {
      response = await deps.fetch(url, { method: "PUT", body: new Uint8Array(bytes), redirect: "error", signal: AbortSignal.timeout(3e4 + Math.ceil(bytes.length / 1e6) * 2e3) });
    } catch (error) {
      throw new ApiError(0, "network_error", error instanceof Error ? error.message : String(error));
    }
    await response.body?.cancel().catch(() => {
    });
    if (!response.ok) throw new ApiError(response.status, "upload_failed", `Storage answered HTTP ${response.status}.`);
    return response.headers.get("etag") ?? void 0;
  });
}
async function uploadAndSubmit(dir, state, options, deps, clipKey, timings, waitDeadline, setOutcome) {
  const base = normalizedWebBaseURL(deps.env.TELLCLIP_WEB_BASE_URL);
  assertUploadOrigin(base);
  const token = credentials(deps.env, base);
  const session = sessionDir(dir);
  const stopped = state.stop ?? {};
  if ((stopped.duration_s ?? 0) > maxTakeSeconds) {
    throw cliError("take_too_large", `The take is ${Math.round(stopped.duration_s)} s; the limit is 30 minutes.`, void 0, 1);
  }
  try {
    if (state.phase === "uploading") {
      if (!claimOwner(dir, "uploading")) return decideAgain;
    } else {
      transition(dir, "share", { owner_pid: process.pid }, (current) => current?.phase === state.phase);
    }
  } catch (error) {
    if (error instanceof TransitionRefused) return decideAgain;
    throw error;
  }
  const marks = writeMarksFile(dir);
  let sessionId = typeof state.share?.session_id === "string" ? state.share.session_id : void 0;
  try {
    if (sessionId !== void 0) {
      const existing = await api(deps, base, token, "GET", `/api/render-sessions/${sessionId}`).catch(() => void 0);
      if (existing === void 0 || existing.status === "failed") sessionId = void 0;
    }
    if (sessionId === void 0) {
      const files = sessionFiles.map((file) => ({ name: file, bytes: statSync3(path7.join(session, file)).size }));
      const total = files.reduce((sum, file) => sum + file.bytes, 0);
      if (total > maxTakeBytes) throw cliError("take_too_large", `The take is ${(total / 1e6).toFixed(0)} MB; the limit is 1 GB.`, void 0, 1);
      let started = Date.now();
      const created = await api(deps, base, token, "POST", "/api/render-sessions", { files, client: client() });
      timings.create_session = Date.now() - started;
      if (typeof created.session_id !== "string" || !Array.isArray(created.uploads)) throw cliError("bad_response", "The render service returned an invalid session.", void 0, 1);
      sessionId = created.session_id;
      started = Date.now();
      const completed = [];
      for (const target of created.uploads) {
        const file = path7.join(session, target.name);
        if (target.method === "put") {
          await putBytes(deps, target.url, readFileSync9(file));
          completed.push({ name: target.name });
        } else {
          const etags = [];
          const handle = await open2(file, "r");
          try {
            const size = (await handle.stat()).size;
            for (let part = 0; part < target.part_urls.length; part += 1) {
              const start = part * target.part_bytes;
              const length = Math.max(0, Math.min(target.part_bytes, size - start));
              const bytes = Buffer.alloc(length);
              await handle.read(bytes, 0, length, start);
              const etag = await putBytes(deps, target.part_urls[part], bytes);
              etags.push(etag ?? "");
            }
          } finally {
            await handle.close();
          }
          completed.push({ name: target.name, upload_id: target.upload_id, etags });
        }
      }
      timings.upload = Date.now() - started;
      started = Date.now();
      await api(deps, base, token, "POST", `/api/render-sessions/${sessionId}/complete`, { files: completed, client: client() });
      timings.complete = Date.now() - started;
      updateState(dir, { share: { ...state.share ?? {}, session_id: sessionId, clip_key: clipKey } });
    }
  } catch (error) {
    const failure2 = error instanceof EmitAndExit ? error.payload.error : error instanceof ApiError && error.status >= 400 ? { code: error.code, message: error.message, next: error.next } : { code: "upload_failed", message: error instanceof Error ? error.message : String(error), next: "Run tellclip share again; finished parts are not kept, the recording is." };
    try {
      transition(dir, "upload_failed", { error: failure2, owner_pid: void 0 });
    } catch {
    }
    throw cliError(String(failure2.code ?? "upload_failed"), String(failure2.message ?? "Upload failed."), failure2.next, 1);
  }
  const content = takeContent(dir);
  let job;
  const submitted = Date.now();
  try {
    job = await api(deps, base, token, "POST", "/api/renders", {
      session_id: sessionId,
      clip_key: clipKey,
      edit: "auto",
      captions: options.captions,
      output: { tier: options.tier },
      ...content
    });
  } catch (error) {
    const failure2 = error instanceof ApiError ? { code: error.code, message: error.message, next: error.next } : { code: "upload_failed", message: String(error) };
    try {
      transition(dir, "upload_failed", { error: failure2, owner_pid: void 0 });
    } catch {
    }
    throw cliError(failure2.code, failure2.message, failure2.next ?? "Run tellclip share again; the upload is reused.", 1);
  }
  timings.submit = Date.now() - submitted;
  const renderId = job.render_id ?? job.job_id;
  if (typeof renderId !== "string") throw cliError("bad_response", "The render service returned no render id.", void 0, 1);
  const fresh = transition(dir, "uploaded", {
    owner_pid: void 0,
    share: { session_id: sessionId, clip_key: clipKey, render_id: renderId, submitted_at: submitted, steps: marks?.marks.length ?? 0 }
  });
  return pollRender(dir, fresh, options, deps, timings, waitDeadline, setOutcome, job);
}
function renderStatusRecord(job) {
  return {
    render_id: job.render_id ?? null,
    clip_id: job.clip_id ?? null,
    link: job.link ?? null,
    status: job.status ?? null,
    error: job.error ?? null
  };
}
function takeContent(dir) {
  let title = readState(dir)?.title;
  let summary;
  for (const line of marksLines(dir)) {
    if (line.kind === "title" && typeof line.text === "string") title = line.text;
    if (line.kind === "summary" && typeof line.text === "string") summary = line.text;
  }
  return { ...title?.trim() ? { title: title.trim() } : {}, ...summary?.trim() ? { summary: summary.trim() } : {} };
}
async function download(deps, url, file, base, token) {
  const sameOrigin = new URL(url, base).origin === new URL(base).origin;
  await withRetries(deps, async () => {
    const response = await deps.fetch(new URL(url, base).toString(), {
      ...sameOrigin ? { headers: { authorization: `Bearer ${token}` } } : {},
      signal: AbortSignal.timeout(3e5)
    }).catch((error) => {
      throw new ApiError(0, "network_error", String(error));
    });
    if (!response.ok || response.body === null) throw new ApiError(response.status, "download_failed", `HTTP ${response.status} for ${new URL(url, base).pathname}`);
    mkdirSync5(path7.dirname(file), { recursive: true });
    await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
  });
}
async function pollRender(dir, state, options, deps, timings, waitDeadline, setOutcome, first) {
  const base = normalizedWebBaseURL(deps.env.TELLCLIP_WEB_BASE_URL);
  const token = credentials(deps.env, base);
  const share = state.share ?? {};
  if (typeof share.render_id !== "string") throw cliError("bad_response", "No render is stored for this take.", "Run tellclip share again.", 1);
  const route = `/api/renders/${encodeURIComponent(share.render_id)}`;
  const shareStarted = waitDeadline - options.waitSeconds * 1e3;
  const seen = {};
  const pollStarted = Date.now();
  let job = first ?? await api(deps, base, token, "GET", route);
  for (; ; ) {
    const stage = job.status === "rendering" && job.stack_status ? job.stack_status : job.status;
    if (stage && seen[stage] === void 0) seen[stage] = Date.now();
    if (terminalRenderStatuses.has(job.status ?? "") || Date.now() >= waitDeadline) break;
    await deps.sleep(deps.pollMs);
    try {
      job = await api(deps, base, token, "GET", route);
    } catch (error) {
      if (Date.now() >= waitDeadline) break;
      if (!(error instanceof ApiError) || error.status !== 0) throw cliError(error instanceof ApiError ? error.code : "network_error", String(error.message), void 0, 1);
    }
  }
  timings.wait = Date.now() - pollStarted;
  const order = ["queued", "preparing", "planning", "rendering", "finalizing", "ingesting"];
  const end = seen.ready ?? seen.failed ?? Date.now();
  const stages = {};
  const seenOrdered = order.filter((name) => seen[name] !== void 0);
  seenOrdered.forEach((name, index) => {
    stages[name] = (seen[seenOrdered[index + 1]] ?? end) - seen[name];
  });
  if (seen.ready !== void 0) timings.ready = seen.ready - shareStarted;
  const status = job.status ?? "unknown";
  try {
    writeFileSync5(path7.join(dir, "render-status.json"), JSON.stringify(renderStatusRecord(job), null, 2));
  } catch {
  }
  const steps = (job.edit?.steps ?? []).map((step) => ({ text: step.text ?? step.title ?? "", start_s: step.start_s ?? 0 }));
  const stopped = state.stop ?? {};
  const partial = job.edit?.partial ?? stopped.partial ?? false;
  const out = path7.resolve(options.out ?? path7.join(dir, "clip.mp4"));
  const stem = out.replace(/\.[^./]+$/, "");
  const link = job.link ?? void 0;
  const thumbnailUrl = job.thumbnail_url ?? void 0;
  const result = {
    ok: true,
    clip_id: job.clip_id,
    link,
    status,
    thumbnail_url: thumbnailUrl ?? null,
    mp4_path: null,
    duration_s: job.edit?.duration_s ?? job.output?.duration_s,
    steps: steps.length || share.steps || 0,
    partial,
    render_id: share.render_id,
    clip_key: share.clip_key,
    timings_ms: { ...timings, stages, cloud: job.timings_ms ?? void 0 }
  };
  if (status === "ready") {
    const started = Date.now();
    if (job.mp4_url) {
      try {
        await download(deps, job.mp4_url, out, base, token);
        result.mp4_path = out;
      } catch (error) {
        result.warnings = [{ code: "download_failed", message: `The clip is ready but the MP4 did not download: ${error instanceof Error ? error.message : String(error)}` }];
      }
    }
    if (thumbnailUrl) await download(deps, thumbnailUrl, `${stem}.jpg`, base, token).catch(() => {
    });
    if (job.captions_url) await download(deps, job.captions_url, `${stem}.vtt`, base, token).catch(() => {
    });
    result.thumbnail_path = existsSync5(`${stem}.jpg`) ? `${stem}.jpg` : void 0;
    result.captions_path = existsSync5(`${stem}.vtt`) ? `${stem}.vtt` : void 0;
    result.timings_ms.download = Date.now() - started;
    const outcome = { kind: "clip", status: "ready", link, thumbnailUrl, durationSeconds: result.duration_s, steps, partial, lastStep: steps.length };
    setOutcome(outcome);
    try {
      transition(dir, "render_done", { share: { ...share, result, outcome } });
    } catch {
    }
    return result;
  }
  if (terminalRenderStatuses.has(status)) {
    const error = { code: job.error?.code ?? status, message: job.error?.message || `The render is ${status}.` };
    const outcome = { kind: "failed", code: error.code, link };
    setOutcome(outcome);
    try {
      transition(dir, "render_failed", { error, share: { ...share, render_id: void 0, result, outcome } });
    } catch {
    }
    throw new EmitAndExit({ ...result, ok: false, error: { ...error, next: "Run tellclip share again to retry; the recording is kept." } }, 1);
  }
  setOutcome({ kind: "clip", status: "rendering", link, thumbnailUrl, durationSeconds: result.duration_s, steps, partial });
  return result;
}

// src/ci/cli.ts
var takeCommands = /* @__PURE__ */ new Set(["mark", "stop", "title", "summary", "share"]);
var ciOnlyShareFlags = ["--name", "--out", "--comment-file", "--wait", "--captions", "--tier"];
function isCiInvocation(command, args, platform, routesToCiTake, lenient) {
  if (command === recorderSubcommand) return true;
  if (command === "record") return args.includes("--cdp");
  if (!takeCommands.has(command)) return false;
  if (platform !== "darwin") return true;
  if (command === "share" && args.some((argument) => ciOnlyShareFlags.includes(argument))) return true;
  return lenient || routesToCiTake(command);
}
function lenientFailures(args, env) {
  return env.CI === "true" && !args.includes("--strict") && env.TELLCLIP_STRICT !== "1";
}
function scanArgs(args, valueFlags2, booleanFlags2 = ["--strict"]) {
  const positional = [];
  const values = /* @__PURE__ */ new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (valueFlags2.includes(argument)) {
      const value = args[index + 1];
      if (value === void 0) throw new UsageError(`${argument} requires a value.`);
      values.set(argument, value);
      index += 1;
    } else if (booleanFlags2.includes(argument)) {
      continue;
    } else if (argument.startsWith("--")) {
      throw new UsageError(`Unknown option ${argument}.`);
    } else {
      positional.push(argument);
    }
  }
  return { positional, values };
}
async function dispatch(command, args) {
  switch (command) {
    case "record": {
      const { positional, values } = scanArgs(args, ["--cdp", "--title"]);
      if (positional.length > 0) throw new UsageError("record --cdp takes no positional arguments.");
      return startCdpRecording({ cdp: values.get("--cdp"), title: values.get("--title") });
    }
    case "mark": {
      const { positional, values } = scanArgs(args, ["--at", "--t", "--epoch-ms"]);
      if (positional.length !== 1) throw new UsageError('mark needs one label: tellclip mark "Open the projects page".');
      return markTake(positional[0], { at: values.get("--at"), t: values.get("--t"), epochMs: values.get("--epoch-ms") });
    }
    case "title":
    case "summary": {
      const { positional } = scanArgs(args, []);
      if (positional.length !== 1) throw new UsageError(`${command} needs one text argument.`);
      return setTakeContent(command, positional[0]);
    }
    case "stop":
      scanArgs(args, [], ["--strict", "--no-auto-edit"]);
      return stopTake();
    case "share":
      return shareTake(parseShareArgs(args));
    default:
      throw new UsageError(`Unknown command '${command}'.`);
  }
}
function warn(code, message) {
  const clean = `${code}: ${message}`.replace(/\r?\n/g, " ").replace(/%/g, "%25");
  process.stderr.write(`::warning title=Tellclip::${clean}
`);
}
async function runCiCommand(command, args) {
  if (command === recorderSubcommand) {
    await runRecorder(args[0]);
    return;
  }
  const lenient = lenientFailures(args, process.env);
  try {
    if (!isCiInvocation(command, args, process.platform, ciTakeTakes, false)) {
      throw cliError("no_take", "No CI recording is open; nothing was done.", "Run tellclip record --cdp <port> first. To reach the Tellclip app, unset CI or set TELLCLIP_STRICT=1.", 1);
    }
    const result = await dispatch(command, args);
    if (process.env.CI === "true") {
      for (const warning of result.warnings ?? []) warn(warning.code, warning.message);
    }
    emit(result, 0);
  } catch (error) {
    let payload;
    let exitCode;
    if (error instanceof EmitAndExit) {
      payload = { ...error.payload };
      exitCode = error.exitCode;
    } else if (error instanceof UsageError) {
      payload = { error: { code: "usage", message: error.message } };
      exitCode = 2;
    } else {
      payload = { error: { code: "internal_error", message: error instanceof Error ? error.message : String(error) } };
      exitCode = 1;
    }
    payload.ok = false;
    const details = payload.error ?? {};
    if (lenient) {
      warn(details.code ?? "error", details.message ?? "failed");
      emit(payload, 0);
    } else {
      emit(payload, exitCode);
    }
  }
}

// src/main.ts
async function run2() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (command === void 0) {
    throw new UsageError("No command given.");
  }
  if (command === "help" || command === "-h" || command === "--help") {
    process.stdout.write(usageText + "\n");
    return;
  }
  if (command === "version" || command === "-v" || command === "--version") {
    emit({ version: cliVersion }, 0);
    return;
  }
  if (command === "guide") {
    process.stdout.write(agentGuideText + "\n");
    return;
  }
  if (isCiInvocation(command, args.slice(1), process.platform, ciTakeTakes, lenientFailures(args.slice(1), process.env))) {
    await runCiCommand(command, args.slice(1));
    return;
  }
  if (command === "upload") {
    emit(await uploadFile(args.slice(1)), 0);
    return;
  }
  if (command === "setup") {
    const result = await setup(args.slice(1));
    emit(result, result.ok ? 0 : 1);
    return;
  }
  const spec = makeRequestSpec(command, args.slice(1));
  if (process.platform !== "darwin") {
    if (command === "login" || command === "logout") {
      emit(command === "login" ? await standaloneLogin() : await standaloneLogout(), 0);
      return;
    }
    throw cliError("unsupported_platform", "Recording and editing require the Tellclip macOS app.", "Use tellclip upload for an existing MP4.", 1);
  }
  if (command === "login" || command === "logout") {
    const endpoint = readDiscoveryFile();
    if (endpoint === void 0 || !await probe(endpoint)) {
      const result = command === "login" ? await standaloneLogin() : await standaloneLogout();
      emit(result, 0);
      return;
    }
    if (command === "login") emit(await loginWithApp(endpoint), 0);
    else await sendAndEmit(spec, endpoint);
    return;
  }
  if (command === "record") forgetFinishedCiTake();
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
run2().catch((error) => {
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
