#!/usr/bin/env node
// Interactor CMS — live sync between one local Markdown file and one CMS
// post. Started by the /write-post skill after `open_for_editing`; the writer
// never runs it by hand.
//
//   CMS_EDIT_KEY=cms_edit_... node live-sync.mjs --file-url <url> --workspace <workspace> --filename <filename> [--folder <bound folder>]
//   CMS_EDIT_KEY=cms_edit_... node live-sync.mjs --file-url <url> --out <path>      (older form)
//
// With --workspace, the file goes in that workspace's posts folder
// (posts-dir.mjs), the same place the mirror keeps it. While it runs it holds
// a lock (.interactor-cms/live/<post id>.pid in that folder), so the mirror
// leaves this one post to it and picks it up again when it stops.
//
// Every second it reads the file; every other second it asks the CMS whether
// the post changed (a 304 when it hasn't). A saved edit to the file — by the
// writer, or by Claude editing it for them — is uploaded; an edit made
// elsewhere (the CMS editor, another client) is written into the file when the
// file has nothing unsynced of its own. When both changed differently, the
// writer's version stays in the file and the CMS version is saved beside it as
// <file>.cms until the two are merged.
//
// Deliberately dependency-free (Node 18+ only: global fetch), so the plugin
// needs no install step. The edit key reaches only this one post; the CMS
// ends the session when the key expires or the Claude connection is revoked,
// and this tool exits when that happens.

import * as fs from "node:fs";
import * as path from "node:path";
import { decide, frontmatterId, liveLockName } from "./sync-core.mjs";
import { postsDirFor } from "./posts-dir.mjs";

export { decide };

export const TICK_MS = 1000;
export const REMOTE_EVERY_TICKS = 2;

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file-url") out.fileUrl = argv[++i];
    else if (argv[i] === "--out") out.out = argv[++i];
    else if (argv[i] === "--workspace") out.workspace = argv[++i];
    else if (argv[i] === "--filename") out.filename = argv[++i];
    else if (argv[i] === "--folder") out.folder = argv[++i];
  }
  return out;
}

/** The file path: the workspace's posts folder + filename, or --out as given. */
export function outPathFor(args, opts = {}) {
  if (args.workspace) {
    if (!args.filename || path.basename(args.filename) !== args.filename) throw new Error("--filename must be a plain file name");
    return path.join(postsDirFor(args.workspace, { fallbackFolder: args.folder, ...opts }), args.filename);
  }
  return args.out ? path.resolve(args.out) : null;
}

/** The session endpoint that sits beside the file endpoint. */
export function sessionUrlFor(fileUrl) {
  return fileUrl.replace(/\/file\/?$/, "/session");
}

const log = (msg) => process.stdout.write(`[interactor] ${msg}\n`);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { fileUrl } = args;
  const key = process.env.CMS_EDIT_KEY;
  let filePath = null;
  try {
    filePath = outPathFor(args);
  } catch (err) {
    log(`not started — ${err instanceof Error ? err.message : String(err)}`);
    process.exit(65);
  }
  if (!fileUrl || !filePath || !key) {
    process.stderr.write(
      "Usage: CMS_EDIT_KEY=... node live-sync.mjs --file-url <url> --workspace <workspace> --filename <name> [--folder <dir>]\n"
    );
    process.exit(64);
  }
  const auth = { Authorization: `Bearer ${key}` };
  let lockFile = null;
  const unlock = () => {
    if (lockFile) fs.rmSync(lockFile, { force: true });
  };

  const ended = async (res) => {
    let reason = "";
    try {
      reason = (await res.json()).error ?? "";
    } catch {
      /* not JSON */
    }
    log(`editing session ended${reason ? ` — ${reason}` : ""}`);
    process.exit(3);
  };

  // ── initial download ──────────────────────────────────────────────────────
  const first = await fetch(fileUrl, { headers: auth, cache: "no-store" });
  if (first.status === 401) return ended(first);
  if (!first.ok) {
    log(`could not open the post: ${first.status} ${await first.text()}`);
    process.exit(1);
  }
  let base = await first.text();
  let etag = first.headers.get("etag");

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // Tell the mirror this post is ours while we run.
  const postId = frontmatterId(base);
  if (postId) {
    lockFile = path.join(path.dirname(filePath), liveLockName(postId));
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    fs.writeFileSync(lockFile, String(process.pid));
    process.on("exit", unlock);
  }
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf-8") !== base) {
    // An earlier session's file that never reached the CMS — keep the words.
    const kept = `${filePath}.local-${Date.now()}`;
    fs.renameSync(filePath, kept);
    log(`kept an older local copy that differed from the CMS as ${kept}`);
  }
  fs.writeFileSync(filePath, base);
  log(`file: ${filePath}`);
  log("live — saves sync to the CMS automatically");

  // While a conflict is open: the file as it stood when it was found. Nothing
  // is uploaded until the file changes from this (someone merged and saved).
  let hold = null;
  let tick = 0;
  let busy = false;

  const step = async () => {
    if (busy) return;
    busy = true;
    try {
      tick++;
      if (!fs.existsSync(filePath)) return;
      const local = fs.readFileSync(filePath, "utf-8");
      if (hold !== null) {
        if (local === hold) return;
        hold = null;
        log("new version saved — syncing it");
      }

      let remote;
      if (tick % REMOTE_EVERY_TICKS === 0) {
        const res = await fetch(fileUrl, {
          headers: { ...auth, ...(etag && { "If-None-Match": etag }) },
          cache: "no-store",
        });
        if (res.status === 401) return ended(res);
        if (res.status === 200) {
          remote = await res.text();
          etag = res.headers.get("etag");
        } else if (res.status !== 304) {
          log(`couldn't check the CMS (${res.status}) — retrying`);
          return;
        }
      }

      switch (decide({ local, base, remote })) {
        case "idle":
          return;
        case "adopt":
          base = remote;
          return;
        case "pull":
          fs.writeFileSync(filePath, remote);
          base = remote;
          log("pulled a change made in the CMS");
          return;
        case "conflict":
          fs.writeFileSync(`${filePath}.cms`, remote);
          base = remote;
          hold = local;
          log(
            `CONFLICT — the post was changed in the CMS while this file had unsynced edits. ` +
              `Your version is still in the file; the CMS version is in ${filePath}.cms. ` +
              `Merge what you want to keep into the file and save it; that version will then sync.`
          );
          return;
        case "push": {
          const res = await fetch(fileUrl, {
            method: "PUT",
            headers: { ...auth, "Content-Type": "text/markdown; charset=utf-8", ...(etag && { "If-Match": etag }) },
            body: local,
          });
          if (res.status === 401) return ended(res);
          if (res.status === 409) {
            // Someone else's edit landed since the last check; fetch it next
            // tick, which takes the conflict path above.
            etag = null;
            tick = REMOTE_EVERY_TICKS - 1;
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
            log(`save FAILED — ${reason.replace(/\.+$/, "")}. Fix the file and save again.`);
            hold = local; // don't resend the same bytes every second
            return;
          }
          const saved = await res.text();
          etag = res.headers.get("etag");
          base = saved;
          // The CMS may normalise the frontmatter (YAML formatting, trailing
          // newline). Write that back once — only if nobody typed meanwhile.
          if (saved !== local && fs.readFileSync(filePath, "utf-8") === local) fs.writeFileSync(filePath, saved);
          const warning = res.headers.get("x-cms-warning");
          log(`saved to CMS${warning ? ` (note: ${warning})` : ""}`);
          return;
        }
      }
    } catch (err) {
      log(`sync error — ${err instanceof Error ? err.message : String(err)} (retrying)`);
    } finally {
      busy = false;
    }
  };

  const timer = setInterval(() => void step(), TICK_MS);
  const stop = async () => {
    clearInterval(timer);
    // End the session server-side so the key doesn't stay live until expiry.
    await fetch(sessionUrlFor(fileUrl), { method: "DELETE", headers: auth }).catch(() => {});
    log("stopped live sync");
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
