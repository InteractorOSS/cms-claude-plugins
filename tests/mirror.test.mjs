import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePost, parseArgs, safeFilename } from "../plugins/interactor-cms/scripts/mirror.mjs";
import { frontmatterId, liveLockName } from "../plugins/interactor-cms/scripts/sync-core.mjs";

const known = { filename: "hello.md", version: "100", hash: "base" };
const same = { kind: "present", filename: "hello.md", version: "100" };
const moved = (hash, filename = "hello.md") => ({ kind: "present", filename, version: "200", hash });

test("pull: a new post in the CMS becomes a file", () => {
  assert.equal(decidePost({ known: null, local: null, remote: moved("theirs") }), "create");
});

test("pull: a CMS change lands in an untouched file", () => {
  assert.equal(decidePost({ known, local: { hash: "base" }, remote: moved("theirs") }), "pull");
});

test("pull: nothing changed anywhere is idle, without fetching", () => {
  assert.equal(decidePost({ known, local: { hash: "base" }, remote: same }), "idle");
});

test("push: a local edit goes to the CMS when the CMS hasn't moved", () => {
  assert.equal(decidePost({ known, local: { hash: "mine" }, remote: same }), "push");
});

test("push: a version bump with identical content (e.g. our own save) is still a push of new local edits", () => {
  assert.equal(decidePost({ known, local: { hash: "mine" }, remote: moved("base") }), "push");
});

test("adopt: both sides made the same edit", () => {
  assert.equal(decidePost({ known, local: { hash: "same" }, remote: moved("same") }), "adopt");
});

test("conflict: both changed differently", () => {
  assert.equal(decidePost({ known, local: { hash: "mine" }, remote: moved("theirs") }), "conflict");
});

test("conflict: held until the file is saved again", () => {
  const after = { ...known, version: "200", hash: "theirs" };
  assert.equal(decidePost({ known: after, local: { hash: "mine" }, remote: { ...same, version: "200" }, hold: "mine" }), "held");
  // A merged save (a new hash) is pushed.
  assert.equal(decidePost({ known: after, local: { hash: "merged" }, remote: { ...same, version: "200" }, hold: null }), "push");
});

test("an older file with no record of its last sync is set aside, never overwritten", () => {
  assert.equal(decidePost({ known: null, local: { hash: "old" }, remote: moved("theirs") }), "set-aside-create");
  assert.equal(decidePost({ known: null, local: { hash: "theirs" }, remote: moved("theirs") }), "track");
});

test("remote delete: a clean file is removed", () => {
  assert.equal(decidePost({ known, local: { hash: "base" }, remote: { kind: "trashed" } }), "remove");
  assert.equal(decidePost({ known, local: { hash: "base" }, remote: { kind: "gone" } }), "remove");
});

test("remote delete: a file with unsynced edits is set aside, not deleted or uploaded", () => {
  assert.equal(decidePost({ known, local: { hash: "mine" }, remote: { kind: "trashed" } }), "set-aside-orphan");
  assert.equal(decidePost({ known, local: { hash: "mine" }, remote: { kind: "gone" } }), "set-aside-orphan");
});

test("remote delete of a file that's already gone just forgets it", () => {
  assert.equal(decidePost({ known, local: null, remote: { kind: "trashed" } }), "forget");
});

test("local delete never deletes the post: it waits, and comes back when the CMS changes", () => {
  assert.equal(decidePost({ known, local: null, remote: same }), "local-deleted");
  assert.equal(decidePost({ known, local: null, remote: moved("theirs") }), "restore");
});

test("a slug change renames a clean file; with local edits the edits go first", () => {
  assert.equal(decidePost({ known, local: { hash: "base" }, remote: { ...same, filename: "hi.md" } }), "rename");
  assert.equal(decidePost({ known, local: { hash: "mine" }, remote: { ...same, filename: "hi.md" } }), "push");
  assert.equal(decidePost({ known, local: { hash: "base" }, remote: moved("theirs", "hi.md") }), "pull");
});

test("a trashed post the mirror never had is ignored", () => {
  assert.equal(decidePost({ known: null, local: null, remote: { kind: "trashed" } }), "idle");
});

test("only plain <slug>.md names from the server are written", () => {
  assert.ok(safeFilename("hello.md"));
  for (const bad of ["../x.md", "a/b.md", ".hidden.md", "x.txt", "", null]) assert.equal(safeFilename(bad), false, String(bad));
});

test("parses its flags", () => {
  assert.deepEqual(parseArgs(["--url", "http://x/api/edit/mirror", "--workspace", "a@b.c/o/s", "--folder", "/f"]), {
    url: "http://x/api/edit/mirror",
    workspace: "a@b.c/o/s",
    folder: "/f",
  });
});

test("live-sync's lock names the post and reads the id from frontmatter", () => {
  assert.equal(frontmatterId("---\nid: cmabc123\ntitle: A\n---\nBody\n"), "cmabc123");
  assert.equal(frontmatterId("---\ntitle: A\nid: 'q1'\n---\n"), "q1");
  assert.equal(frontmatterId("no frontmatter\nid: x\n"), null);
  assert.equal(liveLockName("../x"), ".interactor-cms/live/___x.pid");
});
