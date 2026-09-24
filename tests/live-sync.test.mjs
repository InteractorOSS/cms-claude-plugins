import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, parseArgs, sessionUrlFor } from "../plugins/interactor-cms/scripts/live-sync.mjs";

const base = "---\ntitle: A\n---\nOriginal\n";
const edited = "---\ntitle: A\n---\nEdited\n";
const theirs = "---\ntitle: B\n---\nOriginal\n";

test("idles when nothing changed (or the CMS answered 304)", () => {
  assert.equal(decide({ local: base, base }), "idle");
  assert.equal(decide({ local: base, base, remote: base }), "idle");
});

test("pushes a local edit", () => {
  assert.equal(decide({ local: edited, base }), "push");
});

test("pulls a CMS edit into an untouched file", () => {
  assert.equal(decide({ local: base, base, remote: theirs }), "pull");
});

test("adopts when both sides made the same edit", () => {
  assert.equal(decide({ local: edited, base, remote: edited }), "adopt");
});

test("flags a conflict when both changed differently", () => {
  assert.equal(decide({ local: edited, base, remote: theirs }), "conflict");
});

test("parses its two flags", () => {
  assert.deepEqual(parseArgs(["--file-url", "https://x/api/edit/file", "--out", "posts/a.md"]), {
    fileUrl: "https://x/api/edit/file",
    out: "posts/a.md",
  });
});

test("derives the session endpoint", () => {
  assert.equal(
    sessionUrlFor("https://cms.interactor.com/api/edit/file"),
    "https://cms.interactor.com/api/edit/session"
  );
});
