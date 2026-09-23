# Interactor CMS plugins for Claude

**Interactor Writing** lets you write and edit [Interactor CMS](https://cms.interactor.com)
posts from Claude. Say *"open the post about …"* and you get:

- the post as a Markdown file in your folder, which you can type in directly,
- a live preview beside the chat that updates within a couple of seconds of every save,
- Claude making the changes you ask for in that same file.

Every save syncs to the CMS. Changes made in the CMS come back into your file. If both
change at once, nothing is overwritten: you get both versions to merge. Publishing and
review still go through the CMS workflow.

Works in the **Claude desktop app (Code tab)** and **Claude Code**.

## Install

In Claude, run:

```
/plugin marketplace add InteractorOSS/cms-claude-plugins
/plugin install interactor-writing@interactor
```

The first time you use it, sign in to the CMS when asked (or run `/mcp` and pick the
Interactor CMS), and choose the organization Claude may write in. That's all. The CMS
connection comes with the plugin.

Then say *"open the post about …"*, *"start a new post about …"*, or run
`/interactor-writing:write-post`.

Editing in a local file needs [Node.js](https://nodejs.org) 18 or later. Without it, the
plugin still opens the live preview and makes changes for you through the CMS.

> Already added `https://cms.interactor.com/api/mcp` to Claude Code by hand? Remove it
> (`claude mcp remove <name>`) once the plugin is installed, or the same tools appear twice.

## Set it up for your whole team (admins)

To skip the install commands for everyone, pre-configure the plugin with
[`managed-settings/interactor-writing.json`](managed-settings/interactor-writing.json):

- **Claude Team or Enterprise:** an Owner pastes it into the organization's Claude Code
  managed settings in the claude.ai admin settings. It reaches everyone at their next start.
- **Your own device management (MDM):** install it as `managed-settings.json` at
  - macOS: `/Library/Application Support/ClaudeCode/managed-settings.json`
  - Windows: `C:\Program Files\ClaudeCode\managed-settings.json`
  - Linux: `/etc/claude-code/managed-settings.json`

  If your organization already has a managed settings file, merge the two keys into it
  instead of replacing it.
- **Just you:** add the same two keys to `~/.claude/settings.json`.

Each writer still signs in to the CMS once, the first time they use it: that sign-in is
what decides which organization and sites Claude may write to.

## How it works

`open_for_editing` gives the plugin a one-post edit key: it can only read and save that
one post, expires after 8 hours, and stops working when the Claude connection is revoked
under **API Tokens** in the CMS. The sync tool (`plugins/interactor-writing/scripts/live-sync.mjs`)
has no dependencies and talks only to the CMS.

## Development

```
node --test tests/live-sync.test.mjs
claude plugin validate .
```

`INTERACTOR_CMS_URL` points the plugin at another CMS (e.g. `http://localhost:4021`).
