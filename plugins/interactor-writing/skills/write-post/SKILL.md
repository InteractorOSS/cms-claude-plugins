---
name: write-post
description: Open an Interactor CMS post or draft for live editing — a local Markdown file the writer (and Claude) edit directly, kept in two-way sync with the CMS, plus a live preview in the browser pane that updates on every save. Use when a writer says "open/edit/work on the post about X", "start a new post about Y", or invokes /write-post.
---

# Write a post — live editing for writers

The writer should say "open the post about X" and, a few seconds later, have
the post as a file they can type in **and** a preview beside the chat that
updates by itself, with every change you make for them landing in that same
file. Do the setup quietly and quickly. The writer never runs a command.

The CMS tools come from this plugin's `interactor-cms` connector (named
`mcp__plugin_interactor-writing_interactor-cms__*`). If the writer also added
`https://cms.interactor.com/api/mcp` by hand, the same tools exist under that
server's name too. Either works; prefer the plugin's.

## Open a post

1. **Signed in?** Call `whoami`. If it fails because the CMS isn't connected,
   tell the writer to sign in once. In the Claude desktop app: **Settings →
   Plugins → Interactor Writing → Connectors → interactor-cms → Connect**, then
   approve in the browser. In Claude Code in a terminal: run `/mcp`, choose
   `plugin:interactor-writing:interactor-cms`, and authenticate. Then continue.
   Say which organization `whoami` reports if the writer belongs to more than
   one, so a post never lands in the wrong one.

2. **Find the post.** Search, don't page through everything: call
   `list_posts` with `search` set to what the writer described (a title word,
   topic or slug). If they said where it's published ("on the website",
   "for product-manager"), call `list_sites` to turn that name into a slug and
   pass it as `site`. When exactly one post matches, go ahead; when several do,
   show the few best (title, site, status) and ask which. For a **new** post:
   call `list_sites`. If the organization has one site, use it; if it has
   several and the writer didn't say, ask which site the post is for. Then call
   `create_post` with the title, `platforms` set to that site's slug, as a
   markdown draft, and use what it returns.

3. **Open it:** `open_for_editing` with the post's `id`. It returns
   `preview_url`, `edit_key`, `file_url` and `filename`. Treat `edit_key` as a
   secret: pass it only to the sync tool below, never echo it to the writer.

4. **Start the sync** with Bash, `run_in_background: true`, from the writer's
   working folder:

   ```
   CMS_EDIT_KEY='<edit_key>' node "${CLAUDE_PLUGIN_ROOT}/scripts/live-sync.mjs" --file-url '<file_url>' --out 'posts/<filename>'
   ```

   Read its output until the `live` line appears (a second or two). If `node`
   isn't installed (`node --version` fails or is older than 18), say the file
   editing needs Node.js from nodejs.org (a one-time install), and meanwhile
   offer the preview-only mode below.

5. **Show it.** Open `preview_url` in the built-in browser pane, and open
   `posts/<filename>` for the writer if the app can show files. Then tell them
   in a line or two: the post is open, they can type in the file or ask you
   for changes, and the preview updates on its own.

## While it's open

- **Make every change by editing `posts/<filename>`** (Edit/Write), and
  re-read it first: the writer may have typed, or the sync may have pulled a
  change from the CMS. Don't use `update_post` or `edit_post_content` on this
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
  - `editing session ended`: the session expired (8 hours) or Claude was
    disconnected from the CMS. Run **Open a post** again; the file stays.

## Preview-only mode (no Node.js)

Call `open_for_editing` just for the `preview_url`, open it in the browser
pane, and make changes with `edit_post_content` (small, anchored edits) or
`update_post`. The preview still updates on its own within a couple of
seconds. The writer can't type in a local file in this mode, so they type in
the CMS editor instead.

## Finish

When the writer is done or switches posts, stop the background sync task. It
ends the session with the CMS on the way out. Every save is already in the
CMS; nothing else to upload.
