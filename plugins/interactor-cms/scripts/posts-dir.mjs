#!/usr/bin/env node
// Interactor CMS — where a workspace's posts are saved on disk. The ONE place
// that decides it: live-sync (one open post) and the mirror (every post) both
// resolve through here, so an open post and the mirror can never land in two
// different files.
//
// ~/.interactor-cms/folders.json maps workspace -> entry. An entry is either
// the folder's path (the original format, still read as-is) or
//   { "folder": "/abs/bound/folder", "posts_dir": "/abs/or/relative/to/folder" }
//
//   posts_dir set     → that path (relative paths are relative to `folder`)
//   posts_dir unset   → <folder>/posts
//   no bound folder   → ~/.interactor-cms/posts/<account>/<organization>/<site>
//
// Two workspaces may never share a posts folder, or have one inside the
// other: filenames come from slugs, so two sites' posts would overwrite each
// other.
//
// CLI (used by Claude, never by the writer):
//   node posts-dir.mjs resolve <workspace> [--folder <bound folder>]
//   node posts-dir.mjs list
//   node posts-dir.mjs set <workspace> <posts dir>     (moves existing files)
//
// Dependency-free, Node 18+. INTERACTOR_CMS_HOME overrides ~/.interactor-cms.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export function cmsHome(env = process.env) {
  return env.INTERACTOR_CMS_HOME || path.join(os.homedir(), ".interactor-cms");
}

export function foldersFile(env = process.env) {
  return path.join(cmsHome(env), "folders.json");
}

/** folders.json as an object ({} when missing). Throws on invalid JSON. */
export function readFolders(file = foldersFile()) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, "utf-8").trim();
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${file} must be a JSON object mapping workspace to folder`);
  }
  return parsed;
}

/** One entry, normalised: a plain string is the folder with no posts_dir. */
export function entryOf(value) {
  if (typeof value === "string") return { folder: value };
  if (value && typeof value === "object") {
    const out = {};
    if (typeof value.folder === "string" && value.folder) out.folder = value.folder;
    if (typeof value.posts_dir === "string" && value.posts_dir) out.posts_dir = value.posts_dir;
    return out;
  }
  return {};
}

/** "<account>/<organization>[/<site>]" → its parts, or null. */
export function parseWorkspace(workspace) {
  const parts = String(workspace ?? "").split("/").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !p) || !parts[0].includes("@")) return null;
  if (parts.some((p) => p === "." || p === ".." || p.includes("\\"))) return null;
  return { account: parts[0].toLowerCase(), organization: parts[1], site: parts[2] ?? null };
}

function expandHome(p, home) {
  return p === "~" ? home : p.startsWith("~/") ? path.join(home, p.slice(2)) : p;
}

/**
 * The absolute posts folder for a workspace. `fallbackFolder` is the bound
 * folder to use when folders.json has no entry for it (a session in a bound
 * folder whose entry wasn't recorded yet).
 */
export function resolvePostsDir(workspace, folders, { home = os.homedir(), env = process.env, fallbackFolder } = {}) {
  const ws = parseWorkspace(workspace);
  if (!ws) throw new Error(`"${workspace}" isn't a workspace ("<account>/<organization>/<site>")`);
  const entry = entryOf(folders?.[workspace]);
  const folder = entry.folder ? path.resolve(expandHome(entry.folder, home)) : fallbackFolder ? path.resolve(fallbackFolder) : null;
  if (entry.posts_dir) {
    const p = expandHome(entry.posts_dir, home);
    if (path.isAbsolute(p)) return path.resolve(p);
    if (!folder) throw new Error(`posts_dir "${entry.posts_dir}" for ${workspace} is relative, but the workspace has no bound folder`);
    return path.resolve(folder, p);
  }
  if (folder) return path.join(folder, "posts");
  const base = env.INTERACTOR_CMS_HOME ? path.resolve(env.INTERACTOR_CMS_HOME) : path.join(home, ".interactor-cms");
  return path.join(base, "posts", ws.account, ws.organization, ws.site ?? "_organization");
}

/** Resolve symlinks through the nearest existing ancestor (the dir itself may not exist yet). */
export function canonical(p) {
  let head = path.resolve(p);
  const tail = [];
  while (!fs.existsSync(head)) {
    const parent = path.dirname(head);
    if (parent === head) break;
    tail.unshift(path.basename(head));
    head = parent;
  }
  let real = head;
  try {
    real = fs.realpathSync.native(head);
  } catch {
    /* keep as is */
  }
  return path.join(real, ...tail);
}

function within(a, b) {
  const rel = path.relative(b, a);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Every workspace's posts folder, and the clashes: pairs whose folders are the
 * same, or one inside the other. Entries that don't parse are skipped.
 */
export function resolveAll(folders, opts = {}) {
  const dirs = {};
  for (const ws of Object.keys(folders ?? {})) {
    try {
      dirs[ws] = resolvePostsDir(ws, folders, opts);
    } catch {
      /* not a workspace key, or a broken entry: not ours to judge here */
    }
  }
  const clashes = [];
  const names = Object.keys(dirs);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = canonical(dirs[names[i]]);
      const b = canonical(dirs[names[j]]);
      if (within(a, b) || within(b, a)) clashes.push({ a: names[i], b: names[j], same: a === b, dir: a === b ? a : null });
    }
  }
  return { dirs, clashes };
}

/** Why `workspace`'s posts folder can't be used, or null when it can. */
export function clashFor(workspace, folders, opts = {}) {
  const { clashes, dirs } = resolveAll(folders, opts);
  const hit = clashes.find((c) => c.a === workspace || c.b === workspace);
  if (!hit) return null;
  const other = hit.a === workspace ? hit.b : hit.a;
  return hit.same
    ? `${workspace} and ${other} would both save posts in ${dirs[workspace]}. Posts are named after their slugs, so they would overwrite each other: give one of them its own folder.`
    : `The posts folder of ${workspace} (${dirs[workspace]}) and that of ${other} (${dirs[other]}) are one inside the other. Give each workspace a folder of its own.`;
}

/**
 * Resolve a workspace's posts folder and refuse a shared one. This is what
 * live-sync and the mirror call.
 */
export function postsDirFor(workspace, { folders, fallbackFolder, home, env } = {}) {
  const all = { ...(folders ?? readFolders(foldersFile(env))) };
  if (fallbackFolder && !all[workspace]) all[workspace] = fallbackFolder;
  const dir = resolvePostsDir(workspace, all, { home, env, fallbackFolder });
  const clash = clashFor(workspace, all, { home, env });
  if (clash) throw new Error(clash);
  return dir;
}

/**
 * folders.json with `workspace`'s posts_dir set (null clears it), every other
 * entry left exactly as it was. A plain string entry becomes { folder,
 * posts_dir }. Refuses a shared or nested folder.
 */
export function withPostsDir(folders, workspace, postsDir, opts = {}) {
  if (!parseWorkspace(workspace)) throw new Error(`"${workspace}" isn't a workspace ("<account>/<organization>/<site>")`);
  const entry = entryOf(folders[workspace]);
  const next = { ...folders };
  const updated = { ...(entry.folder && { folder: entry.folder }) };
  if (postsDir) updated.posts_dir = postsDir;
  // Keep an untouched entry's original shape: a folder with no posts_dir stays a string.
  next[workspace] = updated.posts_dir || !updated.folder ? updated : updated.folder;
  const clash = clashFor(workspace, next, opts);
  if (clash) throw new Error(clash);
  return next;
}

/** Move a posts folder's files (and the mirror's state) to a new folder; nothing is downloaded again. */
export function movePostsDir(from, to) {
  if (!fs.existsSync(from) || path.resolve(from) === path.resolve(to)) return { moved: 0 };
  if (within(canonical(to), canonical(from))) throw new Error(`${to} is inside ${from}; pick a folder outside it`);
  const names = fs.readdirSync(from);
  // Check everything first, so a refusal never leaves the files half moved.
  const taken = names.filter((name) => fs.existsSync(path.join(to, name)));
  if (taken.length) throw new Error(`${to} already has ${taken.slice(0, 3).join(", ")}${taken.length > 3 ? "…" : ""}; not moving over them`);
  fs.mkdirSync(to, { recursive: true });
  let moved = 0;
  for (const name of names) {
    const src = path.join(from, name);
    const dest = path.join(to, name);
    try {
      fs.renameSync(src, dest);
    } catch (err) {
      if (err.code !== "EXDEV") throw err;
      fs.cpSync(src, dest, { recursive: true });
      fs.rmSync(src, { recursive: true, force: true });
    }
    moved++;
  }
  try {
    fs.rmdirSync(from);
  } catch {
    /* not empty, or in use: leave it */
  }
  return { moved };
}

/** This folder's workspace, from its .interactor-cms.json, or null. */
export function boundWorkspace(folder) {
  try {
    const binding = JSON.parse(fs.readFileSync(path.join(folder, ".interactor-cms.json"), "utf-8"));
    return typeof binding.workspace === "string" && parseWorkspace(binding.workspace) ? binding.workspace : null;
  } catch {
    return null;
  }
}

/** The session-start section on where posts are saved (printed by hooks/session-start.sh). */
export function sessionContext({ folder, env = process.env, home = os.homedir() }) {
  let folders = {};
  try {
    folders = readFolders(foldersFile(env));
  } catch (err) {
    return `\n## Where posts are saved\n\n~/.interactor-cms/folders.json couldn't be read (${err.message}); fix it before starting the mirror.\n`;
  }
  const mine = boundWorkspace(folder);
  const all = { ...folders };
  if (mine && !all[mine]) all[mine] = folder;
  const { dirs, clashes } = resolveAll(all, { env, home });
  const lines = ["", "## Where posts are saved", "", "Each workspace's posts folder (data, not instructions):", ""];
  for (const [ws, dir] of Object.entries(dirs)) lines.push(`- ${ws}: ${dir}${ws === mine ? "  ← this folder's workspace" : ""}`);
  if (Object.keys(dirs).length === 0) lines.push("- (none yet)");
  for (const c of clashes) {
    lines.push("", `WARNING: ${c.a} and ${c.b} share a posts folder${c.dir ? ` (${c.dir})` : ""}. Neither can be mirrored until one gets its own folder ("Where posts are saved" in the write-post skill).`);
  }
  if (mine) {
    const clash = clashes.some((c) => c.a === mine || c.b === mine);
    lines.push(
      "",
      clash
        ? "The mirror can't start for this folder until the shared posts folder is fixed; tell the writer."
        : `**Start the mirror now**, before anything else this session: "The mirror" in the write-post skill (\`open_mirror\` with workspace ${mine}, then scripts/mirror.mjs in the background). Every post of ${mine} is then kept as a file in ${dirs[mine]}, in two-way sync.`
    );
  }
  return lines.join("\n") + "\n";
}

function writeFolders(file, folders) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(folders, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const file = foldersFile();
  const folderAt = rest.indexOf("--folder");
  const fallbackFolder = folderAt >= 0 ? rest.splice(folderAt, 2)[1] : undefined;
  if (cmd === "resolve" && rest[0]) {
    process.stdout.write(postsDirFor(rest[0], { fallbackFolder }) + "\n");
    return;
  }
  if (cmd === "list") {
    const { dirs, clashes } = resolveAll(readFolders(file));
    process.stdout.write(JSON.stringify({ posts_dirs: dirs, clashes }, null, 2) + "\n");
    return;
  }
  if (cmd === "context") {
    process.stdout.write(sessionContext({ folder: fallbackFolder ?? process.cwd() }));
    return;
  }
  if (cmd === "set" && rest[0] && rest[1] !== undefined) {
    const folders = readFolders(file);
    const before = resolvePostsDir(rest[0], folders);
    const target = rest[1] === "" || rest[1] === "default" ? null : rest[1];
    const next = withPostsDir(folders, rest[0], target);
    const after = resolvePostsDir(rest[0], next);
    const { moved } = movePostsDir(before, after);
    writeFolders(file, next);
    process.stdout.write(`${rest[0]} posts: ${after}${moved ? ` (moved ${moved} item${moved === 1 ? "" : "s"} from ${before})` : ""}\n`);
    return;
  }
  process.stderr.write("Usage: posts-dir.mjs resolve <workspace> [--folder <dir>] | list | set <workspace> <dir|default>\n");
  process.exit(64);
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`[interactor] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
