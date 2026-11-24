// Interactor CMS — the two-way sync rule shared by live-sync (one open post)
// and the mirror (every post of a workspace). Dependency-free.

/**
 * One step of a two-way sync. `base` is the CMS's file as of the last
 * successful sync; `local` is the file now; `remote` the CMS now (undefined
 * when it wasn't asked, or answered "unchanged"). The three can be the files'
 * text or hashes of it: only equality matters.
 * @returns {"idle" | "push" | "pull" | "adopt" | "conflict"}
 */
export function decide({ local, base, remote }) {
  const theirs = remote ?? base;
  const localChanged = local !== base;
  const remoteChanged = theirs !== base;
  if (!localChanged && !remoteChanged) return "idle";
  if (localChanged && !remoteChanged) return "push";
  if (!localChanged && remoteChanged) return "pull";
  return local === theirs ? "adopt" : "conflict";
}

/** Where live-sync marks a post it holds, so the mirror leaves that file alone. */
export const STATE_DIR = ".interactor-cms";
export function liveLockName(postId) {
  return `${STATE_DIR}/live/${String(postId).replace(/[^A-Za-z0-9_-]/g, "_")}.pid`;
}

/** The post id in a post file's frontmatter, or null. */
export function frontmatterId(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text ?? "");
  if (!m) return null;
  const line = /^id:\s*['"]?([^'"\r\n]+?)['"]?\s*$/m.exec(m[1]);
  return line ? line[1] : null;
}

/** True when a pid names a running process. */
export function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
