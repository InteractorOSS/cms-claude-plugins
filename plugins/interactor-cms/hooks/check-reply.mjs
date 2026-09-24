#!/usr/bin/env node
// Interactor CMS: the reply check. Runs as a Stop hook, just before Claude
// finishes a reply, and sends the reply back when a part the writer relies on
// is missing. These used to be instructions only, and instructions get
// skipped now and then; this makes them hold every time.
//
//   - A post was opened or created this turn: the reply must link its title
//     to <cms>/write?post=<id>, so the writer can find it again.
//   - The post list was opened this turn: the reply must give a numbered list
//     and say they can answer with a number.
//
// It only looks at this turn's CMS tool calls (from the session transcript)
// and the final reply text (last_assistant_message, which the hook input
// carries; the transcript can lag behind it). It never blocks twice for the
// same turn, and anything unexpected lets the reply through: a missing check
// is better than a stuck session.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOOL = /__(open_for_editing|create_post|open_post_list)$/;

/** Entries of the current turn: everything after the last real user prompt. */
export function currentTurn(entries) {
  let start = 0;
  entries.forEach((e, i) => {
    if (e?.type !== "user" || e.isSidechain) return;
    const c = e.message?.content;
    const isPrompt = typeof c === "string" || (Array.isArray(c) && c.some((b) => b?.type === "text") && !c.some((b) => b?.type === "tool_result"));
    if (isPrompt) start = i + 1;
  });
  return entries.slice(start).filter((e) => !e?.isSidechain);
}

function resultText(block) {
  const c = block?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b) => (typeof b?.text === "string" ? b.text : "")).join("");
  return "";
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** This turn's successful CMS calls: { kind, post?: {id, title}, origin? }. */
export function cmsCalls(turn) {
  const uses = new Map();
  const calls = [];
  for (const e of turn) {
    const content = e?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b?.type === "tool_use" && TOOL.test(b.name ?? "")) uses.set(b.id, b.name.match(TOOL)[1]);
      if (b?.type === "tool_result" && uses.has(b.tool_use_id) && !b.is_error) {
        const kind = uses.get(b.tool_use_id);
        const body = parseJson(resultText(b));
        const data = body?.data;
        if (!data) continue; // a refusal or an error text: nothing to check
        if (kind === "open_for_editing" && data.post?.id) {
          calls.push({ kind, post: { id: data.post.id, title: data.post.title }, origin: originOf(data.editor_url) });
        } else if (kind === "create_post" && data.id) {
          calls.push({ kind, post: { id: data.id, title: data.title } });
        } else if (kind === "open_post_list" && data.list_url) {
          calls.push({ kind, origin: originOf(data.list_url) });
        }
      }
    }
  }
  return calls;
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * What the reply is missing, as one message for Claude, or null when it is
 * fine. Pure, so the tests can drive it.
 */
export function missingParts(calls, reply) {
  const text = reply ?? "";
  const problems = [];
  const origin = calls.find((c) => c.origin)?.origin ?? "https://cms.interactor.com";

  // Every post this turn opened or created, the last of each once.
  const posts = new Map();
  for (const c of calls) if (c.post) posts.set(c.post.id, c.post);
  for (const post of posts.values()) {
    if (!text.includes(`write?post=${post.id}`)) {
      problems.push(
        `link the post's title to its editor, exactly like [${post.title || "the post"}](${origin}/write?post=${post.id}), so the writer can find it again`
      );
    }
  }

  if (calls.some((c) => c.kind === "open_post_list")) {
    if (!/^\s*1[.)]\s+\S/m.test(text)) {
      problems.push("give the posts as a numbered list in the chat (1., 2., 3., …: plain titles with site and status)");
    }
    if (!/\bnumber\b/i.test(text)) {
      problems.push('end with: "Click a post in the panel on the right, or tell me its number."');
    }
  }

  if (problems.length === 0) return null;
  return `Interactor CMS: before finishing, rewrite your last reply so it also does the following (keep everything else it says): ${problems
    .map((p, i) => `(${i + 1}) ${p}`)
    .join("; ")}. Reply with the complete corrected message only; don't mention this check.`;
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }
  if (input.stop_hook_active) return;

  // Never block the same turn twice.
  const marker = join(tmpdir(), "interactor-cms-reply-check");
  const key = `${input.session_id ?? "s"}-${input.prompt_id ?? ""}`.replace(/[^\w.-]/g, "_");
  const flag = join(marker, key);
  if (input.prompt_id && existsSync(flag)) return;

  let entries = [];
  try {
    entries = readFileSync(input.transcript_path, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => parseJson(l))
      .filter(Boolean);
  } catch {
    return;
  }

  const calls = cmsCalls(currentTurn(entries));
  if (calls.length === 0) return;
  const reason = missingParts(calls, input.last_assistant_message);
  if (!reason) return;

  try {
    mkdirSync(marker, { recursive: true });
    if (input.prompt_id) writeFileSync(flag, "1");
  } catch {
    /* best effort */
  }
  // Exit code 2 holds the reply back and hands the reason to Claude.
  process.stderr.write(reason);
  process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch {
    /* never break the session */
  }
}
