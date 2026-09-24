import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmsCalls, currentTurn, missingParts } from "../plugins/interactor-cms/hooks/check-reply.mjs";

const SCRIPT = new URL("../plugins/interactor-cms/hooks/check-reply.mjs", import.meta.url).pathname;
const T = "mcp__plugin_interactor-cms_interactor-cms__";

// Shaped like Claude Code's session transcript: a prompt, tool calls, results.
const prompt = (text) => ({ type: "user", message: { role: "user", content: text } });
const use = (id, name, input = {}) => ({
  type: "assistant",
  message: { role: "assistant", content: [{ type: "tool_use", id, name: T + name, input }] },
});
const result = (id, body, is_error = false) => ({
  type: "user",
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, is_error, content: [{ type: "text", text: JSON.stringify(body) }] }] },
});
const opened = (id, title) => ({
  data: { post: { id, slug: "s", title }, editor_url: `https://cms.interactor.com/write#key=cms_edit_x&list=cms_list_y` },
});
const list = { data: { list_url: "https://cms.interactor.com/write/posts#key=cms_list_z", site: "website" } };

test("an opened post needs its title linked", () => {
  const turn = currentTurn([prompt("1"), use("t1", "open_for_editing"), result("t1", opened("p1", "The Quiet Promotion"))]);
  const calls = cmsCalls(turn);
  const reason = missingParts(calls, "The Quiet Promotion is open in the browser panel on the right.");
  assert.match(reason, /\[The Quiet Promotion\]\(https:\/\/cms\.interactor\.com\/write\?post=p1\)/);
  assert.equal(missingParts(calls, "Opened [The Quiet Promotion](https://cms.interactor.com/write?post=p1)."), null);
});

test("a created post needs its title linked too", () => {
  const calls = cmsCalls(currentTurn([prompt("new post"), use("c", "create_post"), result("c", { data: { id: "p9", title: "Motherhood" } })]));
  assert.match(missingParts(calls, "Created Motherhood."), /write\?post=p9/);
});

test("a post list needs a numbered list and the number prompt", () => {
  const calls = cmsCalls(currentTurn([prompt("list drafts"), use("l", "open_post_list"), result("l", list)]));
  const reason = missingParts(calls, "The browser panel shows the list.");
  assert.match(reason, /numbered list/);
  assert.match(reason, /tell me its number/);
  assert.equal(
    missingParts(calls, "Here they are:\n\n1. The Quiet Promotion\n2. Train Later\n\nClick a post in the panel on the right, or tell me its number."),
    null
  );
});

test("only this turn counts, and failed or refused calls don't", () => {
  const entries = [
    prompt("open it"),
    use("old", "open_for_editing"),
    result("old", opened("p-old", "Old")),
    prompt("thanks"),
    use("x", "open_for_editing"),
    result("x", { error: "Not found" }, true),
    use("y", "open_post_list"),
    result("y", { error: "workspace required" }),
  ];
  assert.deepEqual(cmsCalls(currentTurn(entries)), []);
});

test("a turn without CMS calls is never touched", () => {
  assert.deepEqual(cmsCalls(currentTurn([prompt("hello"), { type: "assistant", message: { content: [{ type: "text", text: "hi" }] } }])), []);
});

// The hook itself, as Claude Code runs it: JSON on stdin, exit 2 + reason to block.
function runHook(entries, lastMessage, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "cms-hook-"));
  const transcript = join(dir, "t.jsonl");
  writeFileSync(transcript, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  const input = { session_id: "s1", prompt_id: `p-${Math.random()}`, transcript_path: transcript, hook_event_name: "Stop", last_assistant_message: lastMessage, ...extra };
  return spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(input), encoding: "utf8" });
}

test("the hook blocks a reply missing the link, with the reason for Claude", () => {
  const r = runHook([prompt("1"), use("t1", "open_for_editing"), result("t1", opened("p1", "The Quiet Promotion"))], "It's open on the right.");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /write\?post=p1/);
});

test("the hook lets a complete reply through, and never blocks twice", () => {
  const entries = [prompt("1"), use("t1", "open_for_editing"), result("t1", opened("p1", "T"))];
  assert.equal(runHook(entries, "Opened [T](https://cms.interactor.com/write?post=p1).").status, 0);
  assert.equal(runHook(entries, "still no link", { stop_hook_active: true }).status, 0);
});

test("the hook never breaks on bad input", () => {
  const r = spawnSync(process.execPath, [SCRIPT], { input: "not json", encoding: "utf8" });
  assert.equal(r.status, 0);
  const missing = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ transcript_path: "/nope/missing.jsonl", last_assistant_message: "x" }),
    encoding: "utf8",
  });
  assert.equal(missing.status, 0);
});
