# Tellclip

**Beautiful screen recordings for agents.** Point your coding agent at a flow
and it hands back a polished clip — an authored cursor, a zoom on the moment
that matters, dead air cut — plus a share link.

This package contains the skill that teaches an agent how to shoot a take that
does not look machine-made and the hosted Tellclip MCP for working with shared
clips. Its Claude Code adapter also bundles a
[`tellclip`](https://www.npmjs.com/package/tellclip) CLI shim; Codex and Cursor
install the CLI separately.

Local recording requires the **Tellclip macOS app** — the CLI remote-controls
it. The hosted MCP works without the app.
Download the app: <https://tellclip.com/download-app>

## Two interfaces, two jobs

- The `tellclip` **CLI** controls a recording or draft on this Mac. Use it to
  record, add cursor and zoom edits, cut or speed up ranges, render, save, and
  share.
- The hosted **MCP** shows what is happening in the authenticated Tellclip
  organization. Use it for members, workspaces, uploaded clips, transcripts,
  frames, comments, and organization-side clip settings.

Do not use MCP to record or edit a local draft. Do not use the CLI to inspect
organization state.

## Install

**Claude Code**

```sh
claude plugin marketplace add Tellclip/skills && \
claude plugin install tellclip@tellclip
```

That is all: the Claude Code plugin puts `tellclip` on the Bash tool's PATH,
so there is no separate npm install. Authenticate the MCP from `/mcp`, or run
`claude mcp login tellclip` from a terminal.

**Codex**

```sh
codex plugin marketplace add Tellclip/skills && \
codex plugin add tellclip@tellclip
npm i -g tellclip
```

The plugin installs the skill and hosted MCP. Install the CLI separately for
local recording because Codex does not add plugin executables to your shell's
PATH. Run `codex mcp login tellclip` when you need organization tools.

**Cursor**

Tellclip is an Agent Plugins 1.0 package, so Cursor loads the skill from
`skills/` and the hosted MCP from `mcp.json`. Install it from Customize after
it is listed in the Cursor Marketplace. To test the public package locally:

```sh
git clone https://github.com/Tellclip/skills.git tellclip-skills
mkdir -p ~/.cursor/plugins/local
ln -s "$PWD/tellclip-skills" ~/.cursor/plugins/local/tellclip
npm i -g tellclip
```

Reload Cursor, open Customize, and confirm the Tellclip skill and MCP appear.
Approve the MCP, then run `cursor-agent mcp login tellclip` to authenticate.
The CLI remains a separate npm install and is only required for local
recording.

**Gemini CLI and other Agent-Skills runtimes**

```sh
npx skills add Tellclip/skills
npm i -g tellclip
```

`npx skills add` installs only the skill. Configure
`https://tellclip.com/mcp` separately using the client's remote HTTP MCP
settings if it does not yet support Agent Plugins 1.0.

**Anything else**

```
npm i -g tellclip
tellclip guide
```

`tellclip guide` prints the full workflow contract and is always current for
the version you have installed.

## What you get

- The `tellclip` CLI — on the agent's PATH in Claude Code and installed through
  npm for other clients. Every command prints one JSON object; errors carry a
  `next` field with the recovery step.
- The `tellclip-demo` skill — staging, rehearsal, the one-shot take, a pacing
  table, zoom restraint, and render QA, plus `tc-click` and a take template
  for driving a browser with [`agent-browser`](https://github.com/vercel/agent-browser).
- The hosted Tellclip MCP — find and inspect shared clips, read transcripts and
  frames, organize clips, change playback speed, and add comments. Claude Code,
  Codex, and Cursor connect through the plugin; other MCP clients can connect
  to `https://tellclip.com/mcp` directly.

## Notes

- In Claude Code, the enabled plugin's bundled `tellclip` shadows a global
  `npm i -g tellclip` **for commands Claude Code runs**. Your own shell is
  unaffected. This is deliberate: it keeps `tellclip guide` and the skill on
  the same version so they can never disagree. Codex and Cursor do not install
  a CLI executable from the plugin.
- MCP works with uploaded and shared clips and does not require the macOS app.
  Recording and editing a local draft still use the CLI and require the app.
- The plugin does not pre-approve MCP tools. Clients keep their normal
  confirmation policy for actions that modify a clip or add a comment.
- The CLI requires Node 20+ and macOS; the hosted MCP does not.
- Local `share` auth is separate from MCP OAuth: sign the app in once with
  `tellclip login`. `save` needs a paid plan.

## Feedback

Bugs and requests: <https://github.com/Tellclip/skills/issues>

MIT licensed.
