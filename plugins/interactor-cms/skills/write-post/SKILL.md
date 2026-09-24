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

## Where to work: workspaces (read this first)

The CMS tools come from this plugin's one connection, `interactor-cms` (tools
named `mcp__plugin_interactor-cms_interactor-cms__*`). Signed in with
**All my organizations**, that one connection reaches every organization and
site of every account the writer added on the sign-in page ("Add another
account"). Each call says where it acts with its `workspace` argument:

    <account email>/<organization slug>/<site slug>
    e.g. psdjung@gmail.com/peter-jung/peterjung-site

`list_workspaces` lists every workspace the connection can reach, with the
organization's name and the writer's role there. A post written in the wrong
workspace lands in the wrong place, so:

- **This folder decides.** Each folder is bound to one workspace (see "Bind
  this folder"). The session context shows the binding. When there is one,
  pass that `workspace` on **every** CMS call (search, open, create,
  checkpoint, workflow, social, trash) and never another, unless the writer
  explicitly asks to cross over.
- **Unbound folder:** before the first CMS call, `list_workspaces` and ask
  which one this folder is for. List them as "account · organization ·
  site"; skip the organization-wide entries when the organization has sites.
  Then bind the folder to the answer. If a matching workspace is already
  bound to another folder (the session context lists them), say so and offer
  to switch there first (see "Another folder already has it").
- **Old connection:** if `whoami` or `list_workspaces` shows
  `all_organizations: false`, the writer signed in before this existed and
  the connection covers one organization only. Say so, and ask them to
  reconnect once: in the Claude desktop app, **Settings → Plugins →
  Interactor CMS → Connectors → interactor-cms → Disconnect, then
  Connect**; in a terminal, `/mcp` → `plugin:interactor-cms:interactor-cms`
  → **Re-authenticate**. On the sign-in page keep **All my organizations**,
  and use **Add another account** for each other CMS account they write under.
- **Missing account:** if the writer means an account `list_workspaces`
  doesn't show, they sign in to the connection again **as that account**
  (Settings → Plugins → Interactor CMS → Connectors → interactor-cms →
  Connect or Re-authenticate; in a terminal, `/mcp` → Re-authenticate). A new
  sign-in ADDS the account: every account already on the connection stays
  (the approval page lists them as "already connected, stays on"). Tell them
  not to Disconnect first, which removes the others. Don't suggest adding
  connections by hand.
- **Say it.** Whenever you open or create a post, name the account,
  organization and site it's in.

## Bind this folder

A folder is bound to one workspace, so every session started there works in
exactly that place, e.g. `~/…/peterjung-site` → psdjung@gmail.com ›
Peter Jung › peterjung.site. Bind when the writer asks ("use this folder for
…"), or when an unbound folder's writer picks a workspace (do it; just say
so):

1. `list_workspaces`; pick the one matching what they said (account,
   organization name or slug, site name or slug). Ask if unclear.
2. Write `.interactor-cms.json` at the folder root:

   ```json
   {
     "workspace": "<the workspace, e.g. psdjung@gmail.com/peter-jung/peterjung-site>",
     "account": "<account email>",
     "organization": "<organization name>",
     "site": "<site slug>"
   }
   ```

   It holds no secrets; the writer can commit it or not.
3. Record the folder in the writer's folder list,
   `~/.interactor-cms/folders.json` (create it if missing): a JSON object
   mapping each workspace to its folder's absolute path, e.g.
   `{"psdjung@gmail.com/peter-jung/peterjung-site": "/Users/…/peterjung-site"}`.
   Replace an older entry for the same workspace; keep the others. If only
   the old `~/.interactor-writing/folders.json` exists (from before the
   plugin was renamed), move its entries into the new file.
4. Confirm in one line: "This folder now works in psdjung@gmail.com ›
   Peter Jung › peterjung.site."

A binding file from an older version has `connection` and `organization_id`
but no `workspace`: `list_workspaces`, find the entry with that account,
organization and site, and rewrite the file with its `workspace` (step 2-3).
To change or remove a binding, edit or delete the file (or ask you to).

## Another folder already has it

The session context lists the writer's bound folders. When the writer asks
for something in a workspace that another folder is bound to (by site,
organization or account), or picks one in an unbound folder that another
folder already has, say where it lives and offer to move there:
"You work on peterjung.site in ~/…/peterjung-site. Switch there?"

- **Yes:** if you have a tool that changes this session's working folder (in
  the Claude desktop app, a "change directory" tool), use it with that path,
  then carry on with the request there. Otherwise tell them to start a new
  session in that folder (give the path) and repeat the request there.
- **No:** do it from here, passing that workspace explicitly for this
  request, and don't bind this folder to it.
- The folder no longer exists: drop it from `folders.json` and treat the
  workspace as unbound.

## Listing posts

Put the list where clicks work: in the app's **browser panel**.

1. Call `open_post_list`, with `site` set to the folder's bound site (if the
   folder is bound) and `search` if the writer described what they're after.
2. Open the returned `list_url` in the browser panel the same way (the
   open-a-URL action, `preview_start` with `url` in the desktop app, not
   `navigate`), so the writer gets the "Opened in Browser" card.
   It's the writer's post list: search, status, sites, last updated. Clicking
   a post opens the editor in the same panel, with "← All posts" to come back.
   `list_url` carries a short-lived key (list and open only, 8 hours): open
   it, never paste it in chat.
3. In the chat, give a short numbered list (plain titles, site, status; no
   links: a chat link opens the system browser, not the panel) and end with:
   "Click a post in the panel on the right, or tell me its number."

When the writer answers with a number or a title, go straight to **Open a
post** below with that post. That also starts the local file sync, so you
can make changes through the file. If they opened a post by clicking in the
panel and then ask you for a change, open it the usual way too (their page
and yours stay in step) or use `edit_post_content` for a small change.

## Open a post

1. **Signed in, and where?** If the connection isn't signed in, tell the
   writer to sign in once. In the Claude desktop app: **Settings → Plugins →
   Interactor CMS → Connectors → interactor-cms → Connect**; in Claude Code
   in a terminal: `/mcp` → `plugin:interactor-cms:interactor-cms` →
   authenticate. On the sign-in page: keep **All my organizations**, and use
   **Add another account** for each other CMS account they write under. Know
   the workspace (see "Where to work") before going on, and pass it as
   `workspace` on every call below.

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
   markdown draft, and use what it returns. If a post with that title
   already exists, don't make a duplicate: use the existing one.

   Either way, **continue straight to step 3 and open it.** Creating a post
   (or finding it already exists) is never the end of the request, and never
   a reason to ask "want me to open it?".

3. **Open it:** `open_for_editing` with the post's `id` (and `site` set to
   the folder's bound site, if any: the editor's "All posts" link then lists
   that site), **once**. Each call
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
   with the action that OPENS A URL IN THE PANEL (in the Claude desktop app:
   `preview_start` with `url`), not `navigate`: opening shows the writer an
   "Opened in Browser" card in the chat that brings the panel back when
   clicked, and `navigate` shows none. Then check the page loaded: a white
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
   account, organization and the post's site(s)** (from the workspace), and **always make the
   post's title a link** to `https://cms.interactor.com/write?post=<post id>`
   (safe to show: no key in it; it reopens the editor with their CMS sign-in,
   in their web browser). Never put `editor_url` in chat, since it carries the key.
   E.g. "Opened [SEO, AEO & GEO](https://cms.interactor.com/write?post=…)
   (Interactor · website) in the browser panel on the right (globe icon).
   Click into the text and type; it saves as you go. Or ask me for changes."
   The same goes for a post you just created. With more than one account on
   the connection, add the account: "(peter@interactor.com · Interactor ·
   website)". A writer who meant a different place should be able to catch it
   from that one line.

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
- The frontmatter is fair game (title, excerpt, slug, category, tags,
  `platforms`, `featured_image`, `featured_image_alt`, `meta_description`,
  `meta_keywords`) except `id`. **Don't change `status` in the file**: the CMS
  refuses it. Submitting, approving and publishing go through `post_workflow`.
  The writer sees and edits the same fields in the page's **Details** panel
  (button at the top right), so when they ask where to set the image, URL,
  category, tags, sites or search description, point them there.
- **Images.** The writer adds a picture by pasting or dropping it into the
  text, or with the image button in the toolbar; the featured image (top of
  the post, its thumbnail in lists, its share image) is in **Details**:
  Upload, or "Generate title card" for a free one. To add an image yourself,
  `upload_media` it, then put `![what it shows](<url>)` on its own line in the
  file, or set `featured_image` (and `featured_image_alt`) in the frontmatter.
  `generate_featured_image` makes the title card.
- **Social posts.** When the writer asks for LinkedIn, X or Facebook copy,
  write it with `save_social_draft` (one call per network) rather than only in
  chat: it appears in the page's **Social** tab within seconds, where they can
  edit it. `list_social_drafts` shows what's there. Keep to the limits
  (LinkedIn 2800, Facebook 1500, X 280 per tweet; separate the tweets of a
  thread with a line containing only `---`). Scheduling happens in the CMS's
  Social queue; say so if they ask to post it.
- **Write it to be found.** When you draft a new post or rewrite a large part
  of one, follow the `optimize-post` skill (answer first, question headings,
  real evidence, title and meta description). Before any `post_workflow`
  submit or publish, run its checklist and give the writer its short report.
  Never invent a statistic, quote or source to satisfy it: ask the writer.
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
