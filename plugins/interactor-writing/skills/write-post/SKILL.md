---
name: write-post
description: Open an Interactor CMS post or draft for live editing — a local Markdown file the writer (and Claude) edit directly, kept in two-way sync with the CMS, plus the post as an editable, formatted page beside the chat that the writer types on directly. Use whenever a writer asks to list, get, show, find, pull up, open, edit or work on posts or drafts ("get the post about X", "show me the LLM post", "open the draft on pricing"), or to start a new post, or invokes /write-post. Pulling up a post means opening it this way, not just describing it.
---

# Write a post — live editing for writers

Any request to pull up a post ("get", "show", "find", "open", "edit", "work
on") means opening it here. Don't stop at describing it in chat; the writer
wants to see it. The writer should say "open the post about X" and, a few seconds later, have
the post beside the chat, formatted, to type on directly, with every change
you make for them appearing on that same page. Do the setup quietly and quickly. The writer never runs a command.

## Which account (read this first)

The CMS tools come from this plugin's `interactor-cms` connection (tools named
`mcp__plugin_interactor-writing_interactor-cms__*`), and possibly from more
connections the writer added for other accounts or organizations, e.g.
`interactor-cms-personal` (tools `mcp__interactor-cms-personal__*`). Every
connection is **one account in one organization**, and a post written through
the wrong one lands in the wrong place, with no error.

- **Map them once per session.** Call `whoami` on every CMS connection you
  have and note each one's account (`user.email`) and organization
  (`organization.name`). Skip any that aren't signed in.
- **Pick per request.** Use the connection whose account or organization
  matches what the writer said ("on my personal blog", "for Interactor",
  "with my gmail account"). With only one signed-in connection, use it. With
  several and nothing to go on, **ask**, listing them as
  "account · organization". Don't guess.
- **Stay on it.** Every call for that post (search, open, create, checkpoint,
  workflow) goes through the same connection. Tools from different
  connections can't see each other's posts.
- **Say it.** When more than one connection exists, name the account as well
  as the organization whenever you open or create a post.

## Bind this folder

A folder can be tied to one account, organization and site, so every session
started there works in exactly that place, e.g. the `peterjung-site` repo →
psdjung@gmail.com › Peter Jung › peterjung.site. The binding is
`.interactor-cms.json` at the folder root, and the plugin reads it at session
start; when it exists, its connection is the only one to use (see the session
context).

When the writer asks to bind the folder ("use this folder for …"), or in an
unbound folder with several connections where they had to pick one (offer to
remember it):

1. `whoami` on each connection; pick the one whose account and organization
   match what they said. If none does, tell them which connection to sign in
   (see "More than one account or organization" in the plugin README) and stop.
2. `list_sites` on that connection; pick the site they named (match its name
   or slug; ask if unclear).
3. Write `.interactor-cms.json` in the folder:

   ```json
   {
     "connection": "<connection name, e.g. interactor-cms-personal>",
     "account": "<whoami user.email>",
     "organization": "<whoami organization.name>",
     "organization_id": "<whoami organization.id>",
     "site": "<site slug>"
   }
   ```

   It holds no secrets; the writer can commit it or not.
4. Confirm in one line: "This folder now always uses psdjung@gmail.com ›
   Peter Jung › peterjung.site." It applies from the next session on; in this
   session, follow it from now.

To change or remove a binding, edit or delete that file (or ask you to).

## Listing posts

Number every post, make each title a Markdown link to
`https://cms.interactor.com/write?post=<post id>`, and show its site and
status. End with: "Click a title and choose **Open in app** to edit it beside
the chat, or just say its number."

Two ways in, both fine:
- **Clicking a title.** In the Claude desktop app a chat link offers **Open in
  app** (the browser panel beside the chat) or **Default browser**; Cmd+Click
  skips the choice and goes to the default browser. The page uses the
  writer's CMS sign-in in whichever browser it opens in, so the first time in
  the app's panel they may be asked to sign in once.
- **Saying the number** ("2", "open 2") or a title: go straight to **Open a
  post** below with that post (no need to search again). This also starts the
  local file sync, so you can make changes through the file.

## Open a post

1. **Signed in?** The `whoami` calls above tell you. If no connection is
   signed in, tell the writer to sign in once. In the Claude desktop app:
   **Settings → Plugins → Interactor Writing → Connectors → interactor-cms →
   Connect**, then approve in the browser. In Claude Code in a terminal: run
   `/mcp`, choose `plugin:interactor-writing:interactor-cms`, and
   authenticate. If they want a second account or organization, point them to
   "More than one account or organization" in the plugin's README.

2. **Find the post.** Search, don't page through everything: call
   `list_posts` with `search` set to what the writer described (a title word,
   topic or slug). If they said where it's published ("on the website",
   "for product-manager"), call `list_sites` to turn that name into a slug and
   pass it as `site`. When exactly one post matches, open it, even if the match
   is loose (say briefly why it matched, e.g. "the closest is the SEO, AEO &
   GEO post, which covers LLM search"). The writer can say "not that one".
   When several match, show the few best (title, site, status) and ask which. For a **new** post:
   call `list_sites`. If the organization has one site, use it; if it has
   several and the writer didn't say, ask which site the post is for. Then call
   `create_post` with the title, `platforms` set to that site's slug, as a
   markdown draft, and use what it returns.

3. **Open it:** `open_for_editing` with the post's `id`, **once**. Each call
   ends the previous editing session for that post, so a second call cuts off
   a sync tool that's already running. Keep what it returns and reuse it
   instead of calling again: `editor_url`, `preview_url`, `edit_key`,
   `file_url` and `filename`. Treat `edit_key` and `editor_url` (which carries
   the key) as secrets: the key goes only to the sync tool below and the URL
   only into the browser pane. Never echo either in chat.

4. **Start the sync** with Bash, `run_in_background: true`, from the writer's
   working folder:

   ```
   CMS_EDIT_KEY='<edit_key>' node "${CLAUDE_PLUGIN_ROOT}/scripts/live-sync.mjs" --file-url '<file_url>' --out 'posts/<filename>'
   ```

   Read its output until the `live` line appears (a second or two). If `node`
   isn't installed (`node --version` fails or is older than 18), say the file
   editing needs Node.js from nodejs.org (a one-time install), and meanwhile
   offer the preview-only mode below.

5. **Show it.** Open **`editor_url`** in the app's built-in **browser panel**
   (the browser tool's navigate / open-URL action; in the Claude desktop app
   that is the pane behind the globe icon), then check the page loaded: a white
   page with a formatting toolbar and "Saved to CMS" at the top right. That's
   the post formatted, and the writer types on it directly, like a document; it
   saves to the CMS as they go. Don't open `preview_url` there: that's the
   read-only page for sending to reviewers.

   **Don't point the writer at the local file.** Don't link
   `posts/<filename>` in your message or open it in the file viewer: the
   app's file viewer shows Markdown as a formatted but **read-only** page that
   looks almost like the editor, and writers click it and conclude the page
   can't be edited. The file is for your own edits, not theirs.

   Then tell them in a line or two where to type, **always naming the
   organization (from `whoami`) and the post's site(s)**: e.g. "Opened *SEO,
   AEO & GEO* (Interactor · website) in the browser panel on the right (globe
   icon). Click into the text and type; it saves as you go. Or ask me for
   changes." With more than one connection, add the account: "(peter@interactor.com
   · Interactor · website)". A writer who meant a different org or site should
   be able to catch it from that one line. The org is fixed by the CMS
   connection (to use another, reconnect and pick it on the approval page), so
   don't ask for it; state it.

## While it's open

- **Make every change by editing `posts/<filename>`** (Edit/Write), and
  re-read it first: the writer may have typed on the page, and the sync pulls
  their saves into the file. Your saves appear on their page within a couple
  of seconds, applied while they pause so their cursor doesn't jump. If you
  both change the same sentence, the page asks them which version to keep;
  if they mention that prompt, explain it's their choice and neither version
  is lost until they pick. Don't use `update_post` or `edit_post_content` on this
  post while the sync runs, because they write around the file.
- **Before a sweeping change** (rewriting a whole section, restructuring,
  changing the tone throughout), call `checkpoint_post` with a short label,
  e.g. "Before rewriting the intro". Small edits don't need one: the CMS
  already keeps a checkpoint of each writing session and after each pause. If
  the writer wants an earlier version back, use `list_post_revisions` and
  `restore_post_revision`. The restored text arrives in the file on its own.
- The frontmatter is fair game (title, excerpt, tags, `meta_description`, …)
  except `id`. **Don't change `status` in the file**: the CMS refuses it.
  Submitting, approving and publishing go through `post_workflow`.
- Check the sync's output after edits and translate for the writer:
  - `saved to CMS`: nothing to say; the preview already shows it.
  - `pulled a change made in the CMS`: mention it if it affects what they're
    working on.
  - `CONFLICT`: someone changed the post in the CMS while the file had unsynced
    edits. Their version is in `posts/<filename>.cms`. Offer to merge it into the
    file (saving the merge syncs it), then delete the `.cms` copy.
  - `save FAILED`: explain the reason it gives in plain words and fix the file.
  - `kept an older local copy`: an earlier session's unsynced file was set
    aside as `posts/<filename>.local-<time>`. Offer to bring anything back.
  - `editing session ended`: the session expired (8 hours), the post was
    opened again elsewhere, or Claude was disconnected from the CMS. Run
    **Open a post** again, once; the file stays.
- **The CMS connection renews itself.** Don't warn the writer that it's about
  to expire, or ask them to reconnect because of a time you saw. `whoami`
  reports `token.kind: "connection"` with `refreshes_automatically`. Only a
  real refusal (a 401 from the CMS tools) means they need to sign in again.

## Without Node.js

The page still works: call `open_for_editing`, open `editor_url` in the
browser pane, and the writer types on it as usual. There's just no local
file, so make your changes with `edit_post_content` (small, anchored edits) or
`update_post`; they appear on the writer's page on their own.

## Finish

When the writer is done or switches posts, stop the background sync task. It
ends the session with the CMS on the way out. Every save is already in the
CMS; nothing else to upload.
