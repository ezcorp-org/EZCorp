#!/usr/bin/env bun
/**
 * Merge per-shard lcov.info files into a single coverage/lcov.info.
 *
 * Usage: bun scripts/merge-lcov.ts <glob-for-lcov-files> <output-path>
 * Sums DA per (SF,line) and FNDA per (SF,name); re-emits SF/FNF/FNH/LF/LH.
 * Bun 1.3.x emits no BRDA records, so branch data is intentionally not handled.
 *
 * SF path canonicalisation: Bun's lcov reporter writes `SF:` paths relative
 * to whatever `process.cwd()` is at flush time. Tests that call
 * `process.chdir(...)` (21 callsites at time of writing) cause subsequent
 * coverage to be emitted with paths like
 *   SF:../home/dev/work/EZCorp/ez-corp-ai/src/runtime/goal-host.ts
 * instead of
 *   SF:src/runtime/goal-host.ts
 * Both refer to the same source file. We resolve every incoming SF to an
 * absolute path (interpreting non-absolute strings as relative to the repo
 * root), then key by repo-root-relative path so the hit counts merge into
 * one record per source file.
 */
import { Glob } from "bun";
import { resolve, relative, isAbsolute } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..");

/** Normalise an incoming SF path to a repo-root-relative key. Robust to:
 *  - Plain absolute paths (`/home/dev/.../src/foo.ts`).
 *  - Bun's chdir artefacts. When a test calls `process.chdir("/tmp/xyz")`,
 *    bun emits SF paths as `../home/dev/work/EZCorp/ez-corp-ai/src/foo.ts`
 *    (relative-to-chdir'd-CWD, with leading `../` segments hopping up to
 *    `/` and then descending the absolute path with leading slash dropped).
 *    We detect this by stripping leading `../` segments and checking
 *    whether the remainder, when prefixed with `/`, is an absolute path
 *    that lives under the repo root.
 *  - Already-relative paths (`src/foo.ts`, `web/src/...`).
 *  - Paths outside the repo (kept as-is so they don't collide with repo
 *    files of the same suffix).
 */
function canonicaliseSF(sf: string): string {
  // Strip leading `../` segments — these come from chdir'd shards.
  let stripped = sf;
  while (stripped.startsWith("../")) stripped = stripped.slice(3);

  // Promote a now-rootless absolute path (e.g. `home/dev/work/...` after
  // strip) back to absolute IF the original had a `..` prefix AND the
  // result lives under the repo.
  if (stripped !== sf) {
    const promoted = "/" + stripped;
    if (promoted.startsWith(REPO_ROOT + "/") || promoted === REPO_ROOT) {
      return relative(REPO_ROOT, promoted);
    }
    // Otherwise: still climbing out of the repo — keep promoted as absolute key.
    return promoted;
  }

  const abs = isAbsolute(sf) ? sf : resolve(REPO_ROOT, sf);
  const rel = relative(REPO_ROOT, abs);
  if (rel.startsWith("..")) return abs;
  return rel;
}

type FileRec = {
  fn: Map<string, number>; // fn name -> declared line
  fnda: Map<string, number>; // fn name -> summed hits
  da: Map<number, number>; // line -> summed hits
};

const [globPat, outPath] = Bun.argv.slice(2);
if (!globPat || !outPath) {
  console.error("usage: merge-lcov.ts <glob> <output>");
  process.exit(2);
}

const files = new Map<string, FileRec>();
const rec = (sf: string): FileRec => {
  const existing = files.get(sf);
  if (existing) return existing;
  const r: FileRec = { fn: new Map(), fnda: new Map(), da: new Map() };
  files.set(sf, r);
  return r;
};

const glob = new Glob(globPat);
for await (const path of glob.scan({ absolute: true })) {
  const text = await Bun.file(path).text();
  let cur: FileRec | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("SF:")) {
      cur = rec(canonicaliseSF(line.slice(3)));
    } else if (!cur || line === "end_of_record") {
      cur = null;
    } else if (line.startsWith("FN:")) {
      const [lineNo, name] = line.slice(3).split(",");
      if (lineNo && name) cur.fn.set(name, Number(lineNo));
    } else if (line.startsWith("FNDA:")) {
      const [hits, name] = line.slice(5).split(",");
      if (hits === undefined || name === undefined) continue;
      cur.fnda.set(name, (cur.fnda.get(name) ?? 0) + Number(hits));
    } else if (line.startsWith("DA:")) {
      const [lineNo, hits] = line.slice(3).split(",");
      if (lineNo === undefined || hits === undefined) continue;
      const n = Number(lineNo);
      cur.da.set(n, (cur.da.get(n) ?? 0) + Number(hits));
    }
  }
}

const out: string[] = [];
for (const [sf, r] of files) {
  out.push("TN:");
  out.push(`SF:${sf}`);
  for (const [name, lineNo] of r.fn) out.push(`FN:${lineNo},${name}`);
  let fnh = 0;
  for (const [name, hits] of r.fnda) {
    out.push(`FNDA:${hits},${name}`);
    if (hits > 0) fnh++;
  }
  out.push(`FNF:${r.fn.size}`);
  out.push(`FNH:${fnh}`);
  const sortedDa = [...r.da.entries()].sort((a, b) => a[0] - b[0]);
  let lh = 0;
  for (const [lineNo, hits] of sortedDa) {
    out.push(`DA:${lineNo},${hits}`);
    if (hits > 0) lh++;
  }
  out.push(`LF:${r.da.size}`);
  out.push(`LH:${lh}`);
  out.push("end_of_record");
}

await Bun.write(outPath, out.join("\n") + "\n");
console.log(`merged ${files.size} source files → ${outPath}`);
