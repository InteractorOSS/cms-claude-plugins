# Interactor CMS plugins for Claude

The **Interactor CMS** plugin lets you write and edit [Interactor CMS](https://cms.interactor.com)
posts from Claude. Say *"open the post about …"* and you get:

- the post beside the chat, formatted, and you type right on it like a document: it saves to
  the CMS as you go,
- Claude making the changes you ask for, which appear on the same page within a couple of
  seconds,
- your post list in the panel too: click a post to open it in the editor, with a way back to the
  list,
- and a copy of the post as a Markdown file in your folder, kept in sync.

Claude also writes every post to be found: by search engines (SEO), by answer boxes and AI
Overviews (AEO), and by AI assistants that cite sources (GEO). It leads with the answer,
uses real evidence and sources, fills in the title and meta description, and tells you what
still needs a source before you submit. Ask *"optimize this post"* any time.

Every save syncs to the CMS. Changes made in the CMS come back into your file. If both
change at once, nothing is overwritten: you get both versions to merge. Publishing and
review still go through the CMS workflow.

Works in the **Claude desktop app (Code tab)** and **Claude Code**.

## Install

Type these in Claude's message box, one at a time (they're Claude commands, not
terminal commands):

```
/plugin marketplace add InteractorOSS/cms-claude-plugins
/plugin install interactor-cms@interactor
```

Or run the same thing from a terminal:

```
claude plugin marketplace add InteractorOSS/cms-claude-plugins
claude plugin install interactor-cms@interactor
```

Then sign in to the CMS once:

- **Claude desktop app:** Settings → Plugins → Interactor CMS → Connectors →
  **interactor-cms** → Connect.
- **Claude Code in a terminal:** run `/mcp`, pick `plugin:interactor-cms:interactor-cms`,
  and authenticate.

Approve in the browser and choose the organization Claude may write in. That's all. The
CMS connection comes with the plugin.

Then say *"open the post about …"*, *"start a new post about …"*, or run
`/interactor-cms:write-post`.

Editing in a local file needs [Node.js](https://nodejs.org) 18 or later. Without it, the
plugin still opens the live preview and makes changes for you through the CMS.

> Already added `https://cms.interactor.com/api/mcp` to Claude Code by hand? Remove it
> (`claude mcp remove <name>`) once the plugin is installed, or the same tools appear twice.

## Several accounts, organizations and sites

One sign-in covers all of them. On the CMS sign-in page:

- keep **All my organizations** selected, and
- click **Add another account** for each other CMS account you write under (a work and a
  personal one, say). You sign in as that account, come back to the same page, and repeat.

Or sign in to each account separately, from whichever folder uses it: each new sign-in
**adds** that account to the connection, and the approval page lists the accounts that stay
on. (Don't Disconnect in between: that removes them.)

That's all: no extra connections to add. Every account's organizations and sites are
reachable from the one connection, and each folder picks where it works (below).

Signed in before this existed? Reconnect once. In the desktop app: **Settings → Plugins →
Interactor CMS → Connectors → interactor-cms → Disconnect**, then **Connect**. In a
terminal: `/mcp` → `plugin:interactor-cms:interactor-cms` → **Re-authenticate**.

## One folder, one place

Each folder works in one account › organization › site. The first time you ask for a post in a
new folder, Claude lists where you can write and asks which one this folder is for, then remembers
it in `.interactor-cms.json` (no secrets in it). You can also say it outright:

> use this folder for psdjung@gmail.com, Peter Jung, peterjung.site

From then on, sessions there work only in that place: lists show that site's posts and new posts
go on it. Claude also keeps a list of your folders (`~/.interactor-cms/folders.json`), so if
you ask for peterjung.site from another folder, it tells you where that lives and offers to
switch there.

## Set it up for your whole team (admins)

To skip the install commands for everyone, pre-configure the plugin with
[`managed-settings/interactor-cms.json`](managed-settings/interactor-cms.json):

- **Claude Team or Enterprise:** an Owner pastes it into the organization's Claude Code
  managed settings in the claude.ai admin settings. It reaches everyone at their next start.
- **Your own device management (MDM):** install it as `managed-settings.json` at
  - macOS: `/Library/Application Support/ClaudeCode/managed-settings.json`
  - Windows: `C:\Program Files\ClaudeCode\managed-settings.json`
  - Linux: `/etc/claude-code/managed-settings.json`

  If your organization already has a managed settings file, merge the two keys into it
  instead of replacing it.
- **Just you:** add the same two keys to `~/.claude/settings.json`.

Each writer still signs in to the CMS once, the first time they use it, keeping **All my
organizations** and adding any other accounts they write under.

## How it works

`open_for_editing` gives the plugin a one-post edit key: it can only read and save that
one post, expires after 8 hours, and stops working when the Claude connection is revoked
under **API Tokens** in the CMS. The sync tool (`plugins/interactor-cms/scripts/live-sync.mjs`)
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
