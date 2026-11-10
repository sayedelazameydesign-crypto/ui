// Adversarial-input detection — the half of the threat model a deterministic
// scanner can actually hold.
//
// The threat is asymmetric by construction: an agent reads the bytes, a human
// reviews the rendered page. Every class below exploits that difference — text
// that is invisible, reordered, or phrased as an instruction addressed at the
// reader. None of it is semantic: this module never claims to understand intent,
// it recognises shapes that have no legitimate reason to appear in repository
// text, and it says so precisely.
//
// Pure: no Node APIs, no I/O, no dependencies. The CLI wrapper is
// scripts/adversarial-scan.mjs, so the same code can run in a browser.
//
// Policy: docs/security/adversarial-inputs.md · docs/adr/0019-adversarial-inputs.md

/* ------------------------------------------------------------------ */
/* Classes: what each one is, and what a finding means                */
/* ------------------------------------------------------------------ */

/**
 * `block` — deterministic, no legitimate use in prose or source. A hit is a defect.
 * `warn`  — has legitimate uses (a policy document quoting an attack, a Persian
 *           ZWNJ, a markdown image with a tracking parameter). A hit needs review,
 *           which is what the allowlist is for.
 */
export const CLASSES = Object.freeze({
  "invisible-codepoint": {
    severity: "block",
    why: "zero-width and soft-hyphen codepoints hide text from a reviewer while an agent still reads it",
  },
  "bidi-control": {
    severity: "block",
    why: "bidirectional overrides reorder displayed text without changing bytes (Trojan Source, CVE-2021-42574)",
  },
  "ansi-escape": {
    severity: "block",
    why: "terminal escape sequences rewrite what a reviewer sees on screen after the file is printed",
  },
  "control-char": {
    severity: "block",
    why: "C0/C1 control characters cannot appear in legitimate prose or source and break naive parsers",
  },
  "joiner-codepoint": {
    severity: "warn",
    why: "ZWNJ/ZWJ are legitimate (Persian orthography, emoji sequences) and also usable to split a trigger word",
  },
  "mixed-script-word": {
    severity: "warn",
    why: "a single word mixing Latin with Cyrillic or Greek is the classic homoglyph spoof (pаypal)",
  },
  "injection-phrase": {
    severity: "warn",
    why: "an imperative addressed at the reader: legitimate in a policy document, suspicious in retrieved content",
  },
  "exfil-link": {
    severity: "warn",
    why: "a markdown image or link that carries data in its query string is how context leaves the machine",
  },
});

export const SEVERITIES = Object.freeze(["block", "warn"]);

/* ------------------------------------------------------------------ */
/* Character classes                                                   */
/* ------------------------------------------------------------------ */

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Codepoints that render as nothing (or as a typographic soft hyphen) at all.
const INVISIBLE = new Set([
  0x00ad, 0x034f, 0x115f, 0x1160, 0x17b4, 0x17b5, 0x180e, 0x200b,
  ...range(0x2060, 0x2064), 0xfeff, 0xffa0,
]);

// Directional overrides and marks. Removing them cannot change meaning; keeping
// them lets a file display one thing and mean another.
const BIDI = new Set([0x061c, 0x200e, 0x200f, ...range(0x202a, 0x202e), ...range(0x2066, 0x2069)]);

// Control characters minus tab (09), newline (0a) and carriage return (0d).
const CONTROL = new Set([...range(0x00, 0x08), 0x0b, 0x0c, ...range(0x0e, 0x1f), 0x7f]);

// ZWNJ / ZWJ: flagged, never stripped. Removing them would corrupt Persian text
// and break emoji sequences — a sanitiser that edits legitimate language is a
// bigger defect than the one it was fixing.
const JOINERS = new Set([0x200c, 0x200d]);

const TABLE = new Map();
for (const cp of INVISIBLE) TABLE.set(cp, "invisible-codepoint");
for (const cp of BIDI) TABLE.set(cp, "bidi-control");
for (const cp of CONTROL) TABLE.set(cp, "control-char");
for (const cp of JOINERS) TABLE.set(cp, "joiner-codepoint");

/* ------------------------------------------------------------------ */
/* Phrase and structure detectors                                      */
/* ------------------------------------------------------------------ */

/**
 * Imperative phrasing addressed at the reader. Deliberately narrow: each pattern
 * needs a directive verb *and* an object that refers to the instructions
 * themselves or to the assistant reading them. "Ignore the cache" is not a hit.
 */
export const PHRASES = [
  { id: "ignore-instructions", test: /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:the\s+|your\s+)?(?:previous|prior|above|earlier|preceding)\s+(?:instructions?|prompts?|rules?|directions?)/iu },
  { id: "ignore-system", test: /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:the\s+|your\s+)?system\s+(?:prompt|message|instructions?)/iu },
  { id: "new-role", test: /\byou\s+are\s+now\s+(?:a|an|the|in|no longer)\b/iu },
  { id: "role-override", test: /\b(?:from\s+now\s+on|henceforth)\s*,?\s*you\s+(?:are|will|must|should)\b/iu },
  // "print the secret" is ordinary engineering prose; "reveal your system prompt"
  // is a directive about the reader's own instructions. The possessive is the signal.
  { id: "reveal-instructions", test: /\b(?:reveal|print|output|leak|dump)\s+(?:your\s+|the\s+)(?:system\s+prompt|hidden\s+instructions)\b/iu },
  { id: "reveal-secrets", test: /\b(?:reveal|leak|dump|exfiltrate)\s+your\s+(?:api\s*keys?|secrets?|credentials?|tokens?)/iu },
  { id: "arabic-ignore", test: /(?:تجاهل|تناسَ|انسَ|اهمل)\s+(?:كل\s+)?(?:التعليمات|الأوامر|القواعد)\s*(?:السابقة|أعلاه|السالفة)?/u },
  { id: "arabic-role", test: /(?:أنت\s+الآن|من\s+الآن\s+فصاعدا)\s+(?:مساعد|وكيل|نظام|بوت)/u },
  { id: "exfiltrate-arabic", test: /(?:أرسل|ارسل|سرب|سریب|اكشف)\s+(?:كل\s+)?(?:المفاتيح|الأسرار|بيانات)/u },
];

/**
 * A directive that is itself forbidden ("never reveal your API keys") appears in
 * every security policy ever written. Reading that as an injection would make the
 * scanner useless on exactly the documents that need to discuss the attack, so a
 * negated imperative is suppressed. The suppression is deliberately narrow: it
 * needs a negation word immediately before the verb, not somewhere in the line.
 */
const NEGATION = /\b(?:never|not|avoid|refrain\s+from|must\s+not|should\s+not|do\s+not|does\s+not|don'?t|doesn'?t)\s*$/iu;

const negated = (line, index) => NEGATION.test(line.slice(Math.max(0, index - 28), index));

/** A markdown image or link whose query string carries data. */
const EXFIL = [
  { id: "image-query", test: /!\[[^\]]*\]\(\s*https?:\/\/[^)\s]*\?[^)\s]*\)/u },
  { id: "link-data-uri", test: /\]\(\s*data:[a-z]+\/[a-z0-9.+-]+;base64,/iu },
  { id: "link-javascript", test: /\]\(\s*javascript:/iu },
];

const SCRIPT_OF = (ch) => {
  if (/[A-Za-z]/.test(ch)) return "latin";
  if (/[\u0370-\u03ff\u1f00-\u1fff]/u.test(ch)) return "greek";
  if (/[\u0400-\u052f]/u.test(ch)) return "cyrillic";
  return null;
};

/* ------------------------------------------------------------------ */
/* Scanning                                                           */
/* ------------------------------------------------------------------ */

const escapeForReport = (ch) => {
  const cp = ch.codePointAt(0);
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
};

/** Findings carry an excerpt with every non-printable escaped, never raw bytes. */
function excerptOf(line, column, width = 60) {
  const start = Math.max(0, column - 1 - Math.floor(width / 2));
  const slice = line.slice(start, start + width);
  return slice.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\u00ad]/gu, (c) => escapeForReport(c));
}

/**
 * Scan one document.
 *
 * @param {string} text
 * @param {{ file?: string, classes?: string[] }} [options]
 * @returns {{ file: string, findings: Array, summary: Record<string, number>, clean: boolean }}
 */
export function scanText(text, { file = "<input>", classes = null } = {}) {
  const source = String(text ?? "");
  const lines = source.split("\n");
  const findings = [];
  const wanted = classes ? new Set(classes) : null;
  const keep = (id) => !wanted || wanted.has(id);

  // 1. Character sweep. Reported per run, not per character: three zero-widths
  //    in a row are one defect, and a hundred are not a hundred findings.
  lines.forEach((line, lineIndex) => {
    let run = null;
    const flush = () => {
      if (!run) return;
      findings.push({
        class: run.cls,
        severity: CLASSES[run.cls].severity,
        line: lineIndex + 1,
        column: run.column,
        count: run.count,
        excerpt: excerptOf(line, run.column),
        detail: `${run.count} × ${run.chars.join(" ")}`,
      });
      run = null;
    };

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      const cp = ch.codePointAt(0);
      let cls = TABLE.get(cp) ?? null;
      if (cp === 0x1b) cls = line[i + 1] === "[" ? "ansi-escape" : "control-char";
      // A joiner is only interesting inside a Latin word: there it can split a
      // trigger word ("ig\u200cnore"). Between Arabic letters it is orthography,
      // and between emoji it is how a family is spelled. Flag nothing else.
      if (cls === "joiner-codepoint" && !/[A-Za-z]/.test(line[i - 1] ?? "") && !/[A-Za-z]/.test(line[i + 1] ?? "")) cls = null;
      if (!cls || !keep(cls)) {
        flush();
        continue;
      }
      if (run && run.cls === cls && run.column + run.count === i + 1) {
        run.count += 1;
        run.chars.push(escapeForReport(ch));
      } else {
        flush();
        run = { cls, column: i + 1, count: 1, chars: [escapeForReport(ch)] };
      }
    }
    flush();
  });

  // 2. Phrase sweep. One finding per pattern per line, at the first match.
  if (keep("injection-phrase")) {
    lines.forEach((line, lineIndex) => {
      for (const phrase of PHRASES) {
        const match = phrase.test.exec(line);
        if (!match || negated(line, match.index)) continue;
        findings.push({
          class: "injection-phrase",
          severity: CLASSES["injection-phrase"].severity,
          line: lineIndex + 1,
          column: match.index + 1,
          phrase: phrase.id,
          excerpt: excerptOf(line, match.index + 1),
          detail: phrase.id,
        });
      }
    });
  }

  // 3. Data-carrying links.
  if (keep("exfil-link")) {
    lines.forEach((line, lineIndex) => {
      for (const rule of EXFIL) {
        const match = rule.test.exec(line);
        if (!match) continue;
        findings.push({
          class: "exfil-link",
          severity: CLASSES["exfil-link"].severity,
          line: lineIndex + 1,
          column: match.index + 1,
          phrase: rule.id,
          excerpt: excerptOf(line, match.index + 1),
          detail: rule.id,
        });
      }
    });
  }

  // 4. Mixed-script words. Latin + Cyrillic/Greek inside one token is a spoof;
  //    Latin + Arabic is ordinary bilingual prose and must stay silent.
  if (keep("mixed-script-word")) {
    lines.forEach((line, lineIndex) => {
      const words = line.match(/[\p{L}\p{M}]+/gu) ?? [];
      for (const word of words) {
        const scripts = new Set();
        for (const ch of word) {
          const script = SCRIPT_OF(ch);
          if (script) scripts.add(script);
        }
        if (scripts.has("latin") && (scripts.has("cyrillic") || scripts.has("greek"))) {
          const column = line.indexOf(word) + 1;
          findings.push({
            class: "mixed-script-word",
            severity: CLASSES["mixed-script-word"].severity,
            line: lineIndex + 1,
            column: Math.max(1, column),
            word,
            excerpt: excerptOf(line, Math.max(1, column)),
            detail: [...scripts].sort().join("+"),
          });
        }
      }
    });
  }

  findings.sort((a, b) => a.line - b.line || a.column - b.column || a.class.localeCompare(b.class));
  const summary = { block: 0, warn: 0 };
  for (const finding of findings) summary[finding.severity] += 1;
  return { file, findings, summary, clean: findings.length === 0 };
}

/* ------------------------------------------------------------------ */
/* Neutralisation                                                      */
/* ------------------------------------------------------------------ */

/**
 * Remove the codepoints that cannot be displayed, preserving line structure.
 *
 * Contract (property-tested):
 *  - the number of lines never changes, so a citation `file:line` stays valid;
 *  - visible text is untouched: printable ASCII in, identical printable ASCII out;
 *  - idempotent;
 *  - ZWNJ/ZWJ survive, because they are part of real languages and real emoji.
 *
 * @returns {{ text: string, removed: Record<string, number>, total: number }}
 */
export function sanitizeText(text) {
  const source = String(text ?? "");
  const removed = {};
  let out = "";
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const cp = ch.codePointAt(0);
    if (ch === "\n" || ch === "\t") {
      out += ch;
      continue;
    }
    let cls = TABLE.get(cp) ?? null;
    // Escape sequences are removed whole. Dropping only the ESC byte would leave
    // "[31m" in the context: still invisible to a reader, still noise to an agent.
    if (cp === 0x1b) {
      const isCsi = source[i + 1] === "[";
      removed[isCsi ? "ansi-escape" : "control-char"] = (removed[isCsi ? "ansi-escape" : "control-char"] ?? 0) + 1;
      if (isCsi) {
        let j = i + 2;
        while (j < source.length && source.charCodeAt(j) >= 0x20 && source.charCodeAt(j) <= 0x3f) j += 1;
        const final = source.charCodeAt(j);
        i = final >= 0x40 && final <= 0x7e ? j : j - 1;
      }
      continue;
    }
    if (cls && CLASSES[cls].severity === "block") {
      removed[cls] = (removed[cls] ?? 0) + 1;
      continue;
    }
    out += ch;
  }
  const total = Object.values(removed).reduce((sum, n) => sum + n, 0);
  return { text: out, removed, total };
}

/** Convenience for call sites that only need the text. */
export const neutralize = (text) => sanitizeText(text).text;
