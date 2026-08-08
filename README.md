# Tellclip

**Beautiful screen recordings for agents.** Point your coding agent at a flow
and it hands back a polished clip — an authored cursor, a zoom on the moment
that matters, dead air cut — plus a share link.

This plugin bundles the [`tellclip`](https://www.npmjs.com/package/tellclip)
CLI and the skill that teaches an agent how to shoot a take that does not look
machine-made.

Requires the **Tellclip macOS app** — the CLI remote-controls it.
Download: <https://tellclip.com/download-app>

## Install

**Claude Code**

```
/plugin marketplace add Tellclip/skills
/plugin install tellclip@tellclip
```

That is all: the plugin puts `tellclip` on the Bash tool's PATH, so there is
no separate npm install.

**Codex CLI, Cursor, Gemini CLI, and other Agent-Skills runtimes**

```
npx skills add Tellclip/skills
npm i -g tellclip
```

**Anything else**

```
npm i -g tellclip
tellclip guide
```

`tellclip guide` prints the full workflow contract and is always current for
the version you have installed.

## What you get

- `tellclip` on PATH — every command prints one JSON object; errors carry a
  `next` field with the recovery step.
- The `tellclip-demo` skill — staging, rehearsal, the one-shot take, a pacing
  table, zoom restraint, and render QA, plus `tc-click` and a take template
  for driving a browser with [`agent-browser`](https://github.com/vercel/agent-browser).

## Notes

- While the plugin is enabled, its bundled `tellclip` shadows a global
  `npm i -g tellclip` **for commands the agent runs**. Your own shell is
  unaffected. This is deliberate: it keeps `tellclip guide` and the skill on
  the same version so they can never disagree.
- Node 20+ is required; macOS only.
- `share` needs the app signed in once (`tellclip login`); `save` needs a paid
  plan.

## Feedback

Bugs and requests: <https://github.com/Tellclip/skills/issues>

MIT licensed.
