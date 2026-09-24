# Interactor CMS plugins for Claude

**Interactor Writing** lets you write and edit [Interactor CMS](https://cms.interactor.com)
posts from Claude. Say *"open the post about …"* and you get:

- the post beside the chat, formatted, and you type right on it like a document: it saves to
  the CMS as you go,
- Claude making the changes you ask for, which appear on the same page within a couple of
  seconds,
- post lists where every title is a link that opens the post in the editor,
- and a copy of the post as a Markdown file in your folder, kept in sync.

Every save syncs to the CMS. Changes made in the CMS come back into your file. If both
change at once, nothing is overwritten: you get both versions to merge. Publishing and
review still go through the CMS workflow.

Works in the **Claude desktop app (Code tab)** and **Claude Code**.

## Install

Type these in Claude's message box, one at a time (they're Claude commands, not
terminal commands):

```
/plugin marketplace add InteractorOSS/cms-claude-plugins
/plugin install interactor-writing@interactor
```

Or run the same thing from a terminal:

```
claude plugin marketplace add InteractorOSS/cms-claude-plugins
claude plugin install interactor-writing@interactor
```

Then sign in to the CMS once:

- **Claude desktop app:** Settings → Plugins → Interactor Writing → Connectors →
  **interactor-cms** → Connect.
- **Claude Code in a terminal:** run `/mcp`, pick `plugin:interactor-writing:interactor-cms`,
  and authenticate.

Approve in the browser and choose the organization Claude may write in. That's all. The
CMS connection comes with the plugin.

Then say *"open the post about …"*, *"start a new post about …"*, or run
`/interactor-writing:write-post`.

Editing in a local file needs [Node.js](https://nodejs.org) 18 or later. Without it, the
plugin still opens the live preview and makes changes for you through the CMS.

> Already added `https://cms.interactor.com/api/mcp` to Claude Code by hand? Remove it
> (`claude mcp remove <name>`) once the plugin is installed, or the same tools appear twice.

## More than one account or organization

The plugin brings one CMS connection, and a connection is one account in one
organization. To also write as another account (say a personal one), or in another
organization, add a second connection under its own name:

1. In a terminal:

   ```
   claude mcp add --transport http -s user interactor-cms-personal https://cms.interactor.com/api/mcp
   ```

   Keep `-s user`: without it the connection is saved only for the folder you ran the
   command in, and your writing folder won't see it.

2. **Make sure your browser is signed in to cms.interactor.com as that other account**
   first. Signing in goes through whichever account the browser is using, and the approval
   page shows it ("… as you@example.com"). Sign out there first, or open the sign-in link in
   a private window.
3. In an interactive `claude` terminal, run `/mcp`, pick `interactor-cms-personal`, choose
   **Authenticate**, approve, and pick the organization.

Claude then checks which account and organization each connection belongs to, uses the one
that matches what you ask for ("open the draft on my personal blog"), asks when it can't
tell, and names the account whenever it opens a post. Repeat with another name
(`interactor-cms-<something>`) for each further account or organization.

## One folder, one account

Tie a folder to one account, organization and site, so every session there works in exactly
that place. In a Claude session in that folder, say for example:

> use this folder for psdjung@gmail.com, Peter Jung, peterjung.site

Claude checks the connection really is that account and organization, finds the site, and saves
`.interactor-cms.json` in the folder (no secrets in it). From then on, sessions there use only that
connection, list only that site's posts, put new posts on it, and stop and tell you if the
connection is signed in as someone else.

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

The connector URL is written out as `https://cms.interactor.com/api/mcp` on purpose. With
an environment-variable template in its place, the Claude desktop app refused to start
sign-in ("points at a different server URL than the one shown here"). To test against a local CMS, add it separately with
`claude mcp add --transport http local-cms http://localhost:4021/api/mcp` and disable the
plugin while you do.
