import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  clashFor,
  entryOf,
  movePostsDir,
  parseWorkspace,
  postsDirFor,
  resolveAll,
  resolvePostsDir,
  withPostsDir,
} from "../plugins/interactor-cms/scripts/posts-dir.mjs";

const home = "/home/w";
const env = {};
const A = "psdjung@gmail.com/peterjung/peterjung-site";
const B = "peter@interactor.com/interactor/cms";

test("an old plain-string entry is the folder, posts in <folder>/posts", () => {
  assert.deepEqual(entryOf("/x/site"), { folder: "/x/site" });
  assert.equal(resolvePostsDir(A, { [A]: "/x/site" }, { home, env }), "/x/site/posts");
});

test("an absolute posts_dir is used as is (~ expanded)", () => {
  assert.equal(resolvePostsDir(A, { [A]: { folder: "/x/site", posts_dir: "/w/writing" } }, { home, env }), "/w/writing");
  assert.equal(resolvePostsDir(A, { [A]: { folder: "/x/site", posts_dir: "~/Writing/site" } }, { home, env }), "/home/w/Writing/site");
});

test("a relative posts_dir is relative to the folder", () => {
  assert.equal(resolvePostsDir(A, { [A]: { folder: "/x/site", posts_dir: "content/posts" } }, { home, env }), "/x/site/content/posts");
  assert.equal(resolvePostsDir(A, { [A]: { folder: "/x/site", posts_dir: "../writing" } }, { home, env }), "/x/writing");
});

test("a relative posts_dir without a folder is refused", () => {
  assert.throws(() => resolvePostsDir(A, { [A]: { posts_dir: "posts" } }, { home, env }), /relative/);
});

test("a workspace with no bound folder defaults under ~/.interactor-cms/posts", () => {
  assert.equal(resolvePostsDir(A, {}, { home, env }), "/home/w/.interactor-cms/posts/psdjung@gmail.com/peterjung/peterjung-site");
  assert.equal(
    resolvePostsDir("psdjung@gmail.com/peterjung", {}, { home, env }),
    "/home/w/.interactor-cms/posts/psdjung@gmail.com/peterjung/_organization"
  );
  assert.equal(resolvePostsDir(A, {}, { home, env: { INTERACTOR_CMS_HOME: "/t/cms" } }), "/t/cms/posts/psdjung@gmail.com/peterjung/peterjung-site");
});

test("the session's bound folder is the fallback when folders.json has no entry", () => {
  assert.equal(resolvePostsDir(A, {}, { home, env, fallbackFolder: "/x/site" }), "/x/site/posts");
});

test("workspaces that don't parse are refused", () => {
  for (const bad of ["", "peterjung/site", "a@b", "a@b/../x", "a@b/o/s/extra"]) assert.equal(parseWorkspace(bad), null, bad);
  assert.throws(() => resolvePostsDir("nope", {}, { home, env }), /isn't a workspace/);
});

test("two workspaces resolving to the same folder are refused, saying why", () => {
  const folders = { [A]: { folder: "/x/site", posts_dir: "/w/shared" }, [B]: { folder: "/y/cms", posts_dir: "/w/shared" } };
  const message = clashFor(A, folders, { home, env });
  assert.match(message, /would both save posts in \/w\/shared/);
  assert.match(message, /overwrite each other/);
  assert.throws(() => postsDirFor(A, { folders, home, env }), /overwrite/);
});

test("one posts folder inside another is refused too", () => {
  const folders = { [A]: { folder: "/x/site", posts_dir: "/w/posts" }, [B]: { folder: "/y", posts_dir: "/w/posts/cms" } };
  assert.match(clashFor(B, folders, { home, env }), /one inside the other/);
});

test("the same folder reached by a relative and an absolute path is one folder", () => {
  const folders = { [A]: "/x/site", [B]: { folder: "/y", posts_dir: "/x/site/posts" } };
  assert.equal(resolveAll(folders, { home, env }).clashes.length, 1);
});

test("a shared folder through a symlink is caught", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "posts-dir-"));
  fs.mkdirSync(path.join(tmp, "real"));
  fs.symlinkSync(path.join(tmp, "real"), path.join(tmp, "link"));
  const folders = { [A]: { folder: tmp, posts_dir: "real" }, [B]: { folder: tmp, posts_dir: "link" } };
  assert.ok(clashFor(A, folders, { home, env }));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("separate folders are fine", () => {
  const folders = { [A]: "/x/site", [B]: "/y/cms" };
  assert.equal(clashFor(A, folders, { home, env }), null);
  assert.equal(postsDirFor(A, { folders, home, env }), "/x/site/posts");
});

test("setting posts_dir changes only that entry and keeps the others' shape", () => {
  const folders = { [A]: "/x/site", [B]: "/y/cms", "other@x.com/o/s": { folder: "/z", posts_dir: "p" } };
  const next = withPostsDir(folders, A, "/w/writing", { home, env });
  assert.deepEqual(next[A], { folder: "/x/site", posts_dir: "/w/writing" });
  assert.equal(next[B], "/y/cms");
  assert.deepEqual(next["other@x.com/o/s"], { folder: "/z", posts_dir: "p" });
  // Clearing it goes back to the plain string form.
  assert.equal(withPostsDir(next, A, null, { home, env })[A], "/x/site");
});

test("setting a posts_dir another workspace already uses is refused", () => {
  const folders = { [A]: "/x/site", [B]: "/y/cms" };
  assert.throws(() => withPostsDir(folders, A, "/y/cms/posts", { home, env }), /overwrite/);
});

test("moving a posts folder moves the files, refusing to move over existing ones", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "posts-move-"));
  const from = path.join(tmp, "a");
  fs.mkdirSync(path.join(from, ".interactor-cms"), { recursive: true });
  fs.writeFileSync(path.join(from, "hello.md"), "x");
  fs.writeFileSync(path.join(from, ".interactor-cms", "mirror.json"), "{}");
  const to = path.join(tmp, "b");
  assert.deepEqual(movePostsDir(from, to), { moved: 2 });
  assert.equal(fs.readFileSync(path.join(to, "hello.md"), "utf-8"), "x");
  assert.ok(fs.existsSync(path.join(to, ".interactor-cms", "mirror.json")));
  assert.ok(!fs.existsSync(from));

  fs.mkdirSync(from);
  fs.writeFileSync(path.join(from, "hello.md"), "y");
  assert.throws(() => movePostsDir(from, to), /already has hello.md/);
  assert.equal(fs.readFileSync(path.join(from, "hello.md"), "utf-8"), "y");
  fs.rmSync(tmp, { recursive: true, force: true });
});
