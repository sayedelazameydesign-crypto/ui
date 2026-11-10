#!/usr/bin/env node
// AI code provenance report — who (or what) authored each commit in a range.
//
//   node scripts/provenance.mjs                        # default: baseline..HEAD
//   node scripts/provenance.mjs --range origin/main..HEAD --json
//   node scripts/provenance.mjs --strict               # exit 1 on missing trailers
//
// Policy: docs/agents/provenance.md
// Every commit after the provenance baseline must declare exactly one of:
//   Human-Authored: true            (written by a person, no model involved)
//   AI-Assisted-By: <tool/model>    (written or co-written by an agent)
// Commits before the baseline are grandfathered, so adoption costs nothing.

import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);

function arg(name, fallback = undefined) {
  const i = argv.findIndex((a) => a === `--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

const STRICT = argv.includes("--strict");
const JSON_OUT = argv.includes("--json");
const DCO = argv.includes("--require-dco");

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch (error) {
    if (allowFail) return "";
    throw error;
  }
}

/** The commit that introduced the policy. Everything before it is grandfathered. */
function baselineCommit() {
  const explicit = arg("baseline");
  if (typeof explicit === "string") return explicit;
  const introduced = git(
    ["log", "--diff-filter=A", "--format=%H", "--", "docs/agents/provenance.md"],
    { allowFail: true },
  )
    .split("\n")
    .filter(Boolean)
    .pop();
  return introduced ?? "";
}

/**
 * An explicit range must not resurrect pre-policy history: when the requested
 * start is older than the baseline, clamp to the baseline. CI passes
 * `origin/main..HEAD`, which otherwise includes commits that predate the policy.
 */
function clampToBaseline(range) {
  const baseline = baselineCommit();
  if (!baseline || !range.includes("..")) return range;
  const [start, end] = range.split("..");
  if (!start || !end) return range;
  const isAncestor = (ancestor, descendant) => {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };
  // The baseline is inside the requested range only if start is its ancestor.
  return isAncestor(start, baseline) ? `${baseline}..${end}` : range;
}

function resolveRange() {
  const explicit = arg("range");
  if (typeof explicit === "string") return clampToBaseline(explicit);
  const base = baselineCommit();
  if (base) return `${base}..HEAD`;
  const upstream = git(["rev-parse", "--verify", "--quiet", "origin/main"], { allowFail: true });
  return upstream ? `origin/main..HEAD` : "HEAD~10..HEAD";
}

function trailer(body, key) {
  const re = new RegExp(`^${key}:\\s*(.+)$`, "im");
  const m = re.exec(body);
  return m ? m[1].trim() : "";
}

const range = resolveRange();

// Metadata and stats are read separately: with --numstat, git appends the stats
// after the record separator, which silently corrupts single-pass parsing.
const FS = "\x1f";
const RS = "\x1e";

const metaRaw = git(["log", range, `--format=%H${FS}%an${FS}%ae${FS}%aI${FS}%s${FS}%b${RS}`]);

function statsFor(sha) {
  const raw = git(["show", "--numstat", "--format=", sha]);
  let added = 0;
  let removed = 0;
  const files = [];
  for (const line of raw.split("\n")) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line.trim());
    if (!m) continue;
    added += m[1] === "-" ? 0 : Number(m[1]);
    removed += m[2] === "-" ? 0 : Number(m[2]);
    files.push(m[3]);
  }
  return { files, added, removed };
}

const commits = metaRaw
  .split(RS)
  .map((entry) => entry.replace(/^\n+|\n+$/g, ""))
  .filter(Boolean)
  .map((entry) => {
    const [sha, author, email, date, subject, ...bodyParts] = entry.split(FS);
    const body = bodyParts.join(FS);

    const ai = trailer(body, "AI-Assisted-By");
    const model = trailer(body, "Model");
    const humanAuthored = /^true$/i.test(trailer(body, "Human-Authored"));
    const reviewed = trailer(body, "Human-Reviewed-By");
    const signedOff = trailer(body, "Signed-off-by");

    const kind = ai ? "ai-assisted" : humanAuthored ? "human" : "undeclared";

    // `problems` block a merge. `warnings` are true gaps that a human closes by
    // reviewing the commit — CI reports them without failing an open PR.
    const problems = [];
    const warnings = [];
    if (kind === "undeclared") problems.push("missing `AI-Assisted-By:` or `Human-Authored: true`");
    if (kind === "ai-assisted" && !reviewed) {
      warnings.push("AI commit not yet reviewed — add `Human-Reviewed-By:` before merge");
    }
    if (DCO && !signedOff) problems.push("missing `Signed-off-by:` (DCO)");

    return {
      sha: (sha || "").slice(0, 8),
      date,
      author,
      email,
      subject,
      provenance: kind,
      tool: ai || (humanAuthored ? "human" : ""),
      model,
      reviewed_by: reviewed,
      dco: Boolean(signedOff),
      stats: statsFor(sha),
      problems,
      warnings,
    };
  });

const summary = commits.reduce(
  (acc, c) => {
    acc.total++;
    acc[c.provenance] = (acc[c.provenance] ?? 0) + 1;
    if (c.problems.length) acc.withProblems++;
    if (c.warnings.length) acc.withWarnings++;
    if (c.provenance === "ai-assisted") {
      acc.aiAdded += c.stats.added;
    }
    acc.added += c.stats.added;
    return acc;
  },
  { total: 0, human: 0, "ai-assisted": 0, undeclared: 0, withProblems: 0, withWarnings: 0, added: 0, aiAdded: 0 },
);

const aiShare = summary.added ? Math.round((summary.aiAdded / summary.added) * 100) : 0;

if (JSON_OUT) {
  console.log(JSON.stringify({ range, baseline: baselineCommit() || "none", strict: STRICT, summary, commits }, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`provenance range: ${range}`);
  console.log(`baseline commit : ${baselineCommit() || "none (whole history checked)"}\n`);
  console.log(`${pad("commit", 10)}${pad("provenance", 14)}${pad("tool/model", 28)}review`);
  console.log("-".repeat(72));
  for (const c of commits.length ? commits : []) {
    const tool = c.model ? `${c.tool} · ${c.model}` : c.tool;
    console.log(
      `${pad(c.sha, 10)}${pad(c.provenance, 14)}${pad(tool.slice(0, 26), 28)}${c.reviewed_by ? "yes" : c.provenance === "human" ? "n/a" : "NO"}`,
    );
  }
  if (!commits.length) console.log("(no commits in range)");
  console.log(
    `\n${summary.total} commit(s) · human ${summary.human} · ai-assisted ${summary["ai-assisted"]} · undeclared ${summary.undeclared}`,
  );
  console.log(`AI-authored lines: ${summary.aiAdded}/${summary.added} (${aiShare}%)`);
  const problems = commits.flatMap((c) => c.problems.map((p) => `${c.sha} — ${p}`));
  if (problems.length) {
    console.log("\nblocking findings:");
    for (const p of problems) console.log(`  ✗ ${p}`);
  }
  const warnings = commits.flatMap((c) => c.warnings.map((w) => `${c.sha} — ${w}`));
  if (warnings.length) {
    console.log("\nreview warnings (must be closed before merge):");
    for (const w of warnings) console.log(`  ! ${w}`);
  }
}

if (STRICT && summary.withProblems > 0) process.exit(1);
