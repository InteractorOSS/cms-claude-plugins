import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { validateSkill, bumpPatch } from "../scripts/sync-humanizer.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const SKILL = "plugins/interactor-cms/skills/humanizer/";

test("the humanizer skill is exactly what sync-humanizer vendored", () => {
  const upstream = JSON.parse(read(SKILL + "UPSTREAM.json"));
  const skill = read(SKILL + "SKILL.md");
  assert.equal(createHash("sha256").update(skill).digest("hex"), upstream.skill_sha256);
  assert.equal(validateSkill(skill).version, upstream.version);
  assert.match(read(SKILL + "LICENSE"), /MIT License/);
});

test("refuses text that isn't the skill", () => {
  assert.throws(() => validateSkill("# nope"), /frontmatter/);
  assert.throws(() => validateSkill('---\nname: other\n---\n'), /humanizer/);
});

test("the plugin and the marketplace carry the same version", () => {
  const plugin = JSON.parse(read("plugins/interactor-cms/.claude-plugin/plugin.json"));
  const market = JSON.parse(read(".claude-plugin/marketplace.json"));
  assert.equal(market.plugins.find((p) => p.name === "interactor-cms").version, plugin.version);
  assert.equal(bumpPatch("1.2.0"), "1.2.1");
});

test("the writing skills and the session context send prose through humanizer", () => {
  for (const p of [
    "plugins/interactor-cms/skills/write-post/SKILL.md",
    "plugins/interactor-cms/skills/optimize-post/SKILL.md",
    "plugins/interactor-cms/hooks/session-context.md",
  ]) assert.match(read(p), /humanizer/, p);
});
