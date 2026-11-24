#!/usr/bin/env node
// Interactor CMS — the always-on mirror: every post of one workspace as a
// Markdown file in that workspace's posts folder (scripts/posts-dir.mjs),
// kept in two-way sync with the CMS for as long as the session runs. Started
// by Claude at session start in a bound folder, after `open_mirror`; the
// writer never runs it by hand.
//
//   CMS_MIRROR_KEY=cms_mirror_... node mirror.mjs --url <mirror_url> --workspace <workspace> [--folder <bound folder>]
//
// Cheap by design: every few seconds ONE list call (a 304 when nothing in the
// workspace changed), and a post's file is fetched only when its version
// moved. Local files are checked by size and mtime every second and hashed
// only when those change.
//
// The rules are live-sync's (sync-core.mjs decide()):
//   - unsynced local edits are never overwritten;
//   - both sides changed differently → the local version stays in the file,
//     the CMS one is saved beside it as <file>.cms, and nothing is uploaded
//     until the file is saved again;
//   - a file that differs from the CMS with no record of its last sync is set
//     aside as <file>.local-<time> before the CMS version is written.
// And the mirror's own:
//   - a post trashed (or moved off this site) in the CMS: a clean file is
//     removed (the CMS keeps the post in its trash for 30 days; restoring it
//     brings the file back); a file with unsynced edits is set aside as
//     <file>.local-<time> and never uploaded;
//   - a file deleted here never deletes the post: it comes back when the post
//     changes in the CMS, or at the next session;
//   - a .md file that isn't one of the workspace's posts is left alone;
//   - a post open in live-sync (its lock in .interactor-cms/live/) is left to
//     live-sync.
//
// State (no secrets: ids, filenames, versions, hashes) is kept in
// <posts folder>/.interactor-cms/mirror.json. The key is only ever in this
// process's environment. Dependency-free, Node 18+.

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { alive, decide, liveLockName, STATE_DIR } from "./sync-core.mjs";
import { parseWorkspace, postsDirFor } from "./posts-dir.mjs";

export const TICK_MS = 1000;
export const REMOTE_EVERY_TICKS = 5;

export const hashOf = (text) => createHash("sha256").update(text).digest("hex");

/** A filename the server sent is a plain `<slug>.md` in the folder itself. */
export function safeFilename(name) {
  return typeof name === "string" && /^[^/\\]+\.md$/.test(name) && !name.startsWith(".") && path.basename(name) === name;
}

/**
 * What to do with one post. Pure.
 *
 *   known   the last sync: { filename, version, hash } or null (never synced)
 *   local   the file now: { hash } or null (no file)
 *   remote  { kind: "present", filename, version, hash? } (hash only when its
 *           file was fetched, i.e. when its version isn't known.version),
 *           { kind: "trashed" } or { kind: "gone" } (left the workspace)
 *   hold    the local hash set aside after a conflict or a failed save, or null
 *
 * @returns {"idle"|"create"|"track"|"set-aside-create"|"push"|"pull"|"adopt"|"conflict"|"rename"
 *   |"held"|"local-deleted"|"restore"|"remove"|"set-aside-orphan"|"forget"}
 */
export function decidePost({ known, local, remote, hold = null }) {
  if (!known) {
    if (remote?.kind !== "present") return "idle";
    if (!local) return "create";
    return local.hash === remote.hash ? "track" : "set-aside-create";
  }
  if (!remote || remote.kind !== "present") {
    if (!local) return "forget";
    return local.hash === known.hash ? "remove" : "set-aside-orphan";
  }
  if (!local) return remote.version === known.version ? "local-deleted" : "restore";
  if (hold !== null && local.hash === hold) return "held";
  const theirs = remote.version === known.version ? known.hash : remote.hash;
  const step = decide({ local: local.hash, base: known.hash, remote: theirs });
  if (step === "idle" && remote.filename !== known.filename) return "rename";
  return step;
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--url") out.url = argv[++i];
    else if (argv[i] === "--workspace") out.workspace = argv[++i];
    else if (argv[i] === "--folder") out.folder = argv[++i];
    else if (argv[i] === "--dir") out.dir = argv[++i];
  }
  return out;
}

const log = (msg) => process.stdout.write(`[interactor] mirror: ${msg}\n`);

function writeAtomic(file, text) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp-${process.pid}`);
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** The git repository a folder is inside, or null. */
export function gitRoot(dir) {
  let at = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(at, ".git"))) return at;
    const up = path.dirname(at);
    if (up === at) return null;
    at = up;
  }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const key = process.env.CMS_MIRROR_KEY;
  if (!args.url || !args.workspace || !key) {
    process.stderr.write("Usage: CMS_MIRROR_KEY=... node mirror.mjs --url <mirror_url> --workspace <workspace> [--folder <dir>]\n");
    process.exit(64);
  }
  const ws = parseWorkspace(args.workspace);
  if (!ws) {
    log(`"${args.workspace}" isn't a workspace`);
    process.exit(64);
  }
  let dir;
  try {
    dir = args.dir ? path.resolve(args.dir) : postsDirFor(args.workspace, { fallbackFolder: args.folder });
  } catch (err) {
    log(`not started — ${err.message}`);
    process.exit(65);
  }
  const repo = gitRoot(dir);
  const base = args.url.replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${key}` };
  const stateDir = path.join(dir, STATE_DIR);
  const stateFile = path.join(stateDir, "mirror.json");
  const pidFile = path.join(stateDir, "mirror.pid");
  fs.mkdirSync(stateDir, { recursive: true });

  // One mirror per folder: a second session in the same folder leaves it to the first.
  if (fs.existsSync(pidFile)) {
    const other = Number(fs.readFileSync(pidFile, "utf-8").trim());
    if (other !== process.pid && alive(other)) {
      log(`already running for ${dir} (process ${other}); this one is not needed`);
      process.exit(0);
    }
  }
  fs.writeFileSync(pidFile, String(process.pid));

  let state = { workspace: args.workspace, posts: {} };
  if (fs.existsSync(stateFile)) {
    try {
      state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    } catch {
      log("its record of the last sync was unreadable; starting fresh (no file is overwritten without being set aside)");
    }
    if (state.workspace && state.workspace !== args.workspace) {
      log(`not started — ${dir} holds the posts of ${state.workspace}, not ${args.workspace}`);
      fs.rmSync(pidFile, { force: true });
      process.exit(65);
    }
    state.workspace = args.workspace;
    state.posts ??= {};
  }
  let stateDirty = false;
  const saveState = () => {
    if (!stateDirty) return;
    writeAtomic(stateFile, JSON.stringify(state, null, 2) + "\n");
    stateDirty = false;
  };

  const ended = async (res) => {
    let reason = "";
    try {
      reason = (await res.json()).error ?? "";
    } catch {
      /* not JSON */
    }
    log(`ended${reason ? ` — ${reason}` : ""}`);
    saveState();
    fs.rmSync(pidFile, { force: true });
    process.exit(3);
  };

  // ── remote ────────────────────────────────────────────────────────────────
  let remote = null; // id -> { kind, filename, version }
  const listEtags = new Map(); // cursor -> etag
  const listPages = new Map(); // cursor -> data
  const fetched = new Map(); // id -> { version, text, hash }

  async function list() {
    const posts = [];
    let trashed = [];
    let cursor = "";
    for (;;) {
      const url = `${base}/posts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
      const etag = listEtags.get(cursor);
      const res = await fetch(url, { headers: { ...auth, ...(etag && { "If-None-Match": etag }) }, cache: "no-store" });
      if (res.status === 401) return ended(res);
      let data;
      if (res.status === 304 && listPages.has(cursor)) data = listPages.get(cursor);
      else if (res.ok) {
        data = (await res.json()).data;
        listEtags.set(cursor, res.headers.get("etag"));
        listPages.set(cursor, data);
      } else {
        log(`couldn't check the CMS (${res.status}) — retrying`);
        return null;
      }
      if (!cursor) {
        const theirs = `${data.account}/${data.organization}${data.site ? `/${data.site}` : ""}`;
        if (theirs.toLowerCase() !== args.workspace.toLowerCase()) {
          log(`stopped — the key is for ${theirs}, not ${args.workspace}; nothing was written`);
          fs.rmSync(pidFile, { force: true });
          process.exit(65);
        }
        trashed = data.trashed ?? [];
      }
      posts.push(...data.posts);
      if (!data.next_cursor) break;
      cursor = data.next_cursor;
    }
    const map = new Map();
    for (const p of posts) map.set(p.id, { kind: "present", filename: p.filename, version: p.version });
    for (const id of trashed) if (!map.has(id)) map.set(id, { kind: "trashed" });
    return map;
  }

  async function fetchFile(id, version) {
    const have = fetched.get(id);
    if (have && have.version === version) return have;
    const res = await fetch(`${base}/file?id=${encodeURIComponent(id)}`, { headers: auth, cache: "no-store" });
    if (res.status === 401) return ended(res);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`couldn't fetch a post (${res.status})`);
    const text = await res.text();
    const got = { version: String(res.headers.get("etag") ?? "").replace(/^W\//, "").replace(/"/g, "") || version, text, hash: hashOf(text) };
    fetched.set(id, got);
    return got;
  }

  // ── local ─────────────────────────────────────────────────────────────────
  const seen = new Map(); // filename -> { mtimeMs, size, hash }
  function localOf(filename) {
    const file = path.join(dir, filename);
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      seen.delete(filename);
      return null;
    }
    if (!st.isFile()) return null;
    const prev = seen.get(filename);
    if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) return { hash: prev.hash };
    const text = fs.readFileSync(file, "utf-8");
    const hash = hashOf(text);
    seen.set(filename, { mtimeMs: st.mtimeMs, size: st.size, hash });
    return { hash, text };
  }
  const readLocal = (filename) => fs.readFileSync(path.join(dir, filename), "utf-8");
  function writeLocal(filename, text) {
    const file = path.join(dir, filename);
    writeAtomic(file, text);
    const st = fs.statSync(file);
    seen.set(filename, { mtimeMs: st.mtimeMs, size: st.size, hash: hashOf(text) });
  }
  function setAside(filename) {
    const kept = `${filename}.local-${stamp()}`;
    fs.renameSync(path.join(dir, filename), path.join(dir, kept));
    seen.delete(filename);
    return kept;
  }
  const lockedByLiveSync = (id) => {
    const lock = path.join(dir, liveLockName(id));
    if (!fs.existsSync(lock)) return false;
    return alive(Number(fs.readFileSync(lock, "utf-8").trim()));
  };

  // ── the loop ──────────────────────────────────────────────────────────────
  const holds = new Map(); // id -> local hash held after a conflict / failed save
  const quiet = new Set(); // per-post notices already given
  const notifiedStrays = new Set();
  let first = true;
  let tick = 0;
  let busy = false;
  const counts = { created: 0, pulled: 0, pushed: 0 };

  const record = (id, entry) => {
    if (entry) state.posts[id] = entry;
    else delete state.posts[id];
    stateDirty = true;
  };

  async function push(id, known, filename) {
    const text = readLocal(filename);
    const res = await fetch(`${base}/file?id=${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "text/markdown; charset=utf-8", "If-Match": `"${known.version}"` },
      body: text,
    });
    if (res.status === 401) return ended(res);
    if (res.status === 409) {
      // Changed in the CMS since the last sync: the next list shows it, and
      // decidePost takes the conflict path.
      listEtags.clear();
      return;
    }
    if (!res.ok) {
      let reason = `${res.status}`;
      try {
        const body = await res.json();
        reason = [body.error, body.details].filter(Boolean).join(" — ") || reason;
      } catch {
        /* not JSON */
      }
      log(`save FAILED ${filename} — ${String(reason).replace(/\.+$/, "")}. Fix the file and save again.`);
      holds.set(id, hashOf(text));
      return;
    }
    const saved = await res.text();
    const version = String(res.headers.get("etag") ?? "").replace(/^W\//, "").replace(/"/g, "");
    fetched.set(id, { version, text: saved, hash: hashOf(saved) });
    // The CMS may normalise the frontmatter; write that back once if nobody typed meanwhile.
    if (saved !== text && readLocal(filename) === text) writeLocal(filename, saved);
    record(id, { filename, version, hash: hashOf(saved) });
    if (remote?.has(id)) remote.set(id, { ...remote.get(id), version });
    const warning = res.headers.get("x-cms-warning");
    counts.pushed++;
    log(`saved ${filename} to CMS${warning ? ` (note: ${warning})` : ""}`);
  }

  async function step(id) {
    if (lockedByLiveSync(id)) return;
    const known = state.posts[id] ?? null;
    const r = remote.get(id) ?? (known ? { kind: "gone" } : undefined);
    if (r?.kind === "present" && !safeFilename(r.filename)) return;
    const filename = known?.filename ?? r?.filename;
    if (!filename) return;
    const local = localOf(filename);

    let rem = r;
    if (r?.kind === "present" && (!known || r.version !== known.version)) {
      const got = await fetchFile(id, r.version);
      if (got === undefined) return; // ended
      rem = got ? { ...r, version: got.version, hash: got.hash } : { kind: "gone" };
    }
    const hold = holds.get(id) ?? null;
    if (hold !== null && local && local.hash !== hold) {
      holds.delete(id);
      log(`new version of ${filename} saved — syncing it`);
    }
    const action = decidePost({ known, local, remote: rem, hold: holds.get(id) ?? null });
    const text = () => fetched.get(id).text;

    switch (action) {
      case "idle":
      case "held":
        return;
      case "local-deleted":
        if (!quiet.has(`deleted:${id}`)) {
          quiet.add(`deleted:${id}`);
          log(`${filename} was deleted here — the post stays in the CMS; the file comes back when the post changes there, or at the next session`);
        }
        return;
      case "create":
      case "restore":
        writeLocal(rem.filename, text());
        record(id, { filename: rem.filename, version: rem.version, hash: rem.hash });
        if (action === "restore") log(`restored ${rem.filename} (changed in the CMS)`);
        else if (first) counts.created++;
        else log(`added ${rem.filename} (new in the CMS)`);
        return;
      case "track":
        record(id, { filename: rem.filename, version: rem.version, hash: rem.hash });
        return;
      case "set-aside-create": {
        const kept = setAside(filename);
        writeLocal(rem.filename, text());
        record(id, { filename: rem.filename, version: rem.version, hash: rem.hash });
        log(`kept an older local copy of ${filename} that differed from the CMS as ${kept}`);
        return;
      }
      case "adopt":
        record(id, { filename: known.filename, version: rem.version, hash: rem.hash });
        return;
      case "pull": {
        writeLocal(rem.filename, text());
        if (rem.filename !== known.filename) fs.rmSync(path.join(dir, known.filename), { force: true });
        record(id, { filename: rem.filename, version: rem.version, hash: rem.hash });
        if (first) counts.pulled++;
        else log(`pulled ${rem.filename} (changed in the CMS)`);
        return;
      }
      case "rename": {
        const to = rem.filename;
        if (fs.existsSync(path.join(dir, to))) {
          if (!quiet.has(`rename:${id}`)) {
            quiet.add(`rename:${id}`);
            log(`the post in ${filename} is now ${to}, but ${to} already exists here; leaving it as ${filename}`);
          }
          return;
        }
        fs.renameSync(path.join(dir, filename), path.join(dir, to));
        seen.delete(filename);
        record(id, { ...known, filename: to });
        log(`renamed ${filename} → ${to} (its slug changed in the CMS)`);
        return;
      }
      case "conflict":
        writeAtomic(path.join(dir, `${filename}.cms`), text());
        record(id, { filename, version: rem.version, hash: rem.hash });
        holds.set(id, local.hash);
        log(
          `CONFLICT ${filename} — the post was changed in the CMS while this file had unsynced edits. ` +
            `Your version is still in the file; the CMS version is in ${filename}.cms. ` +
            `Merge what you want to keep into the file and save it; that version will then sync.`
        );
        return;
      case "push":
        return push(id, known, filename);
      case "remove": {
        fs.rmSync(path.join(dir, filename), { force: true });
        seen.delete(filename);
        record(id, null);
        log(
          r.kind === "trashed"
            ? `removed ${filename} — the post was moved to the CMS trash (restore it there to bring the file back)`
            : `removed ${filename} — the post is no longer in this workspace (deleted, or moved to another site)`
        );
        return;
      }
      case "set-aside-orphan": {
        const kept = setAside(filename);
        record(id, null);
        log(
          `${filename} had unsynced edits, but the post was ${r.kind === "trashed" ? "moved to the CMS trash" : "removed from this workspace"}. ` +
            `Nothing was uploaded; your version is kept as ${kept}.`
        );
        return;
      }
      case "forget":
        record(id, null);
        return;
    }
  }

  function strays() {
    const mine = new Set(Object.values(state.posts).map((p) => p.filename));
    for (const r of remote.values()) if (r.kind === "present") mine.add(r.filename);
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (!name.endsWith(".md") || name.startsWith(".") || mine.has(name) || notifiedStrays.has(name)) continue;
      notifiedStrays.add(name);
      log(`left ${name} alone — it isn't one of this workspace's posts (new posts are created in the CMS, or by asking Claude)`);
    }
  }

  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      if (tick % REMOTE_EVERY_TICKS === 0 || remote === null) {
        const next = await list();
        if (next) remote = next;
        if (remote) strays();
      }
      tick++;
      if (!remote) return;
      const ids = new Set([...Object.keys(state.posts), ...[...remote.entries()].filter(([, r]) => r.kind === "present").map(([id]) => id)]);
      for (const id of ids) {
        try {
          await step(id);
        } catch (err) {
          log(`sync error on ${state.posts[id]?.filename ?? id} — ${err instanceof Error ? err.message : String(err)} (retrying)`);
        }
      }
      saveState();
      if (first) {
        first = false;
        const n = Object.keys(state.posts).length;
        const parts = [
          counts.created && `${counts.created} new`,
          counts.pulled && `${counts.pulled} updated from the CMS`,
          counts.pushed && `${counts.pushed} saved to the CMS`,
        ].filter(Boolean);
        log(`folder: ${dir}`);
        if (repo) log(`the folder is inside the git repository ${repo}; the mirror doesn't commit or ignore anything there`);
        log(`live — ${n} post${n === 1 ? "" : "s"} of ${args.workspace}${parts.length ? ` (${parts.join(", ")})` : ""}; changes sync both ways`);
      }
    } catch (err) {
      log(`sync error — ${err instanceof Error ? err.message : String(err)} (retrying)`);
    } finally {
      busy = false;
    }
  };

  await run();
  const timer = setInterval(() => void run(), TICK_MS);
  const stop = async () => {
    clearInterval(timer);
    saveState();
    fs.rmSync(pidFile, { force: true });
    await fetch(`${base}/session`, { method: "DELETE", headers: auth }).catch(() => {});
    log("stopped");
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().catch((err) => {
    log(`fatal — ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
