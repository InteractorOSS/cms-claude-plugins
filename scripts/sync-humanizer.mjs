#!/usr/bin/env node
// Keeps the plugin's `humanizer` skill a verbatim copy of upstream
// https://github.com/blader/humanizer (MIT). The Interactor CMS server vendors
// the same file (content-manager: scripts/humanizer-sync.mjs), so the rules a
// writer's Claude follows match the ones the CMS's own generation uses.
//
//   node scripts/sync-humanizer.mjs --check   report whether upstream changed (exit 10 if so)
//   node scripts/sync-humanizer.mjs           copy it in and bump the plugin's patch version
//   node scripts/sync-humanizer.mjs --ref <sha|branch|tag>
//
// Compared by SKILL.md's content hash, so upstream README-only commits are not
// an update. The version bump is what makes installed plugins pick it up.
// Set GITHUB_TOKEN to lift the GitHub API's anonymous rate limit.

import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "blader/humanizer";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_DIR = join(ROOT, "plugins/interactor-cms/skills/humanizer");
const UPSTREAM_JSON = join(SKILL_DIR, "UPSTREAM.json");
const PLUGIN_JSON = join(ROOT, "plugins/interactor-cms/.claude-plugin/plugin.json");
const MARKETPLACE_JSON = join(ROOT, ".claude-plugin/marketplace.json");

const args = process.argv.slice(2);
const check = args.includes("--check");
const refIdx = args.indexOf("--ref");
const ref = refIdx >= 0 ? args[refIdx + 1] : "HEAD";

async function get(url, accept) {
  const headers = { "User-Agent": "interactor-cms-humanizer-sync", Accept: accept };
  if (process.env.GITHUB_TOKEN && url.startsWith("https://api.github.com/")) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} answered ${res.status} ${res.statusText}`);
  return res;
}

const raw = async (sha, path) =>
  (await get(`https://raw.githubusercontent.com/${REPO}/${sha}/${path}`, "text/plain")).text();

/** Refuse anything that doesn't look like the skill, before a writer's Claude loads it. */
export function validateSkill(md) {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(md);
  if (!fm) throw new Error("SKILL.md has no YAML frontmatter");
  if (!/^name:\s*humanizer\s*$/m.test(fm[1])) throw new Error("SKILL.md frontmatter is not named humanizer");
  const version = /^\s+version:\s*"?([^"\n]+)"?\s*$/m.exec(fm[1])?.[1];
  if (!version) throw new Error("SKILL.md frontmatter has no metadata.version");
  const patterns = md.match(/^### \d+\. .+$/gm) ?? [];
  if (patterns.length < 10) throw new Error(`SKILL.md has only ${patterns.length} numbered patterns`);
  if (md.length > 80_000) throw new Error(`SKILL.md is ${md.length} characters; expected under 80,000`);
  return { version, patternCount: patterns.length };
}

export function bumpPatch(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`Can't bump version "${version}"`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

function changesSince(changelog, fromVersion) {
  const sections = changelog.split(/^(?=## )/m).filter((s) => s.startsWith("## "));
  const out = [];
  for (const s of sections) {
    if (fromVersion && s.startsWith(`## ${fromVersion}`)) break;
    out.push(s.trim());
    if (!fromVersion) break;
  }
  return out.join("\n\n");
}

function output(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<__EOF__\n${value}\n__EOF__\n`);
}

async function main() {
  const current = existsSync(UPSTREAM_JSON) ? JSON.parse(readFileSync(UPSTREAM_JSON, "utf8")) : null;
  const commit = await (await get(`https://api.github.com/repos/${REPO}/commits/${ref}`, "application/vnd.github+json")).json();
  const sha = commit.sha;
  const skill = await raw(sha, "SKILL.md");
  const { version, patternCount } = validateSkill(skill);
  const skillSha256 = createHash("sha256").update(skill).digest("hex");
  const changed = current?.skill_sha256 !== skillSha256;
  const changes = changed ? changesSince(await raw(sha, "CHANGELOG.md").catch(() => ""), current?.version) : "";

  output("changed", String(changed));
  output("version", version);
  output("previous_version", current?.version ?? "none");
  output("commit", sha);
  output("changes", changes);

  if (!changed) {
    console.log(`Humanizer is up to date: v${version} (${REPO}@${sha.slice(0, 7)}).`);
    return;
  }
  console.log(`Humanizer update: v${current?.version ?? "none"} -> v${version} (${REPO}@${sha.slice(0, 7)}, ${patternCount} patterns).`);
  if (changes) console.log(`\n${changes}\n`);
  if (check) process.exit(10);

  writeFileSync(join(SKILL_DIR, "SKILL.md"), skill);
  writeFileSync(join(SKILL_DIR, "LICENSE"), await raw(sha, "LICENSE"));
  writeFileSync(
    UPSTREAM_JSON,
    JSON.stringify({ repo: REPO, commit: sha, version, pattern_count: patternCount, skill_sha256: skillSha256 }, null, 2) + "\n"
  );

  // A first vendoring ships with the release that adds the skill; only a
  // later upstream change needs its own plugin version.
  if (current) {
    const plugin = JSON.parse(readFileSync(PLUGIN_JSON, "utf8"));
    const next = bumpPatch(plugin.version);
    plugin.version = next;
    writeFileSync(PLUGIN_JSON, JSON.stringify(plugin, null, 2) + "\n");
    const market = JSON.parse(readFileSync(MARKETPLACE_JSON, "utf8"));
    for (const p of market.plugins) if (p.name === "interactor-cms") p.version = next;
    writeFileSync(MARKETPLACE_JSON, JSON.stringify(market, null, 2) + "\n");
    output("plugin_version", next);
    console.log(`Plugin version -> ${next}.`);
  }
  console.log("Wrote plugins/interactor-cms/skills/humanizer/{SKILL.md,LICENSE,UPSTREAM.json}.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`sync-humanizer: ${err.message}`);
    process.exit(1);
  });
}
