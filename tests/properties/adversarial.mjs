// Properties for adversarial-input handling. The claims are absolute — "line
// numbers stay valid", "the neutraliser is idempotent", "printable text is never
// touched" — so they are tested as invariants over generated hostile documents.
//
// The interesting failure here is not a missed attack (the corpus covers that);
// it is a sanitiser that silently eats legitimate text. Every property below can
// fail in that direction, which is why they are worth running.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scanText, sanitizeText, neutralize, CLASSES, PHRASES } from "../../scripts/security/adversarial.mjs";
import { gen } from "../../scripts/lib/property.mjs";

const corpus = JSON.parse(readFileSync(join(process.cwd(), "tests/adversarial/cases.json"), "utf8"));

// Codepoints that must never survive neutralisation.
const HOSTILE = ["\u0000", "\u0007", "\u001b", "\u001b[31m", "\u007f", "\u200b", "\u200e", "\u202e", "\u2066", "\ufeff", "\u00ad"];
// …and ones that must.
const LEGITIMATE = ["\u200c", "\u200d", "\t"];

const hostileDoc = gen.pick(HOSTILE);
const asciiLine = gen.text({ maxLength: 40, alphabet: "abc XYZ019-_/.:" });
const lines = gen.arrayOf(asciiLine, { maxLength: 6 });
const joinerWord = gen.pick(["ignore", "system", "prompt", "secrets"]);

const isPrintable = (ch) => {
  const cp = ch.codePointAt(0);
  return cp >= 0x20 && cp !== 0x7f && !(cp >= 0x200b && cp <= 0x200f) && !(cp >= 0x202a && cp <= 0x202e) && !(cp >= 0x2060 && cp <= 0x2069);
};

const blockClasses = Object.entries(CLASSES)
  .filter(([, meta]) => meta.severity === "block")
  .map(([id]) => id);

export default [
  {
    name: "neutralising never changes the line count (citations stay valid)",
    generators: { parts: lines, poison: hostileDoc },
    property: ({ parts, poison }) => {
      const text = parts.map((part) => `${poison}${part}${poison}`).join("\n");
      const { text: clean } = sanitizeText(text);
      if (clean.split("\n").length !== text.split("\n").length) return false;
      // A citation is `file:line`; line N of the sanitised text must be line N.
      const before = text.split("\n");
      const after = clean.split("\n");
      // Character for character, the line survives except for escape sequences and
      // what the scanner classes as blocking. Anything else disappearing is data
      // loss. The reference is built with a regex, independently of the sanitiser's
      // loop, so the two have to agree for the property to hold.
      const stripAnsi = (line) => line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "");
      return after.every((line, i) => {
        const expected = [...stripAnsi(before[i])]
          .filter((ch) => scanText(ch, { classes: blockClasses }).clean)
          .join("");
        return line === expected;
      });
    },
  },
  {
    name: "neutralising is idempotent",
    generators: { parts: lines, poison: hostileDoc },
    property: ({ parts, poison }) => {
      const once = neutralize(parts.map((part) => `${poison}${part}`).join("\n"));
      const twice = neutralize(once);
      return once === twice;
    },
  },
  {
    name: "printable ASCII passes through untouched",
    generators: { parts: lines },
    property: ({ parts }) => {
      const text = parts.join("\n");
      const result = sanitizeText(text);
      return result.text === text && result.total === 0 && Object.keys(result.removed).length === 0;
    },
  },
  {
    name: "no block-severity codepoint survives neutralisation",
    generators: { parts: lines, poison: hostileDoc },
    property: ({ parts, poison }) => {
      const text = parts.map((part) => `${poison}${part}${poison}`).join("\n");
      const { text: clean } = sanitizeText(text);
      return scanText(clean, { classes: blockClasses }).clean;
    },
  },
  {
    name: "an ANSI escape is removed but the text it precedes is kept",
    generators: { word: asciiLine, code: gen.pick(["1m", "31m", "38;5;9m", "0K", "2J"]) },
    property: ({ word, code }) => {
      const text = `\u001b[${code}before${word}\u001b[0mafter`;
      const { text: clean, removed } = sanitizeText(text);
      // The whole CSI sequence goes; the words on either side stay.
      return clean === `before${word}after` && (removed["ansi-escape"] ?? 0) === 2;
    },
  },
  {
    name: "joiners are never stripped (they are Persian orthography and emoji glue)",
    generators: { word: joinerWord },
    property: ({ word }) => {
      const sample = `می\u200cخواهم ${word}\u200d${word} 👨\u200d👩`;
      return neutralize(sample) === sample;
    },
  },
  {
    name: "a joiner inside a Latin word is flagged, between letters of other scripts it is not",
    generators: { word: joinerWord },
    property: ({ word }) => {
      const latin = scanText(`ig\u200cnore the ${word}`);
      if (latin.clean) return false;
      if (!latin.findings.some((f) => f.class === "joiner-codepoint")) return false;
      return scanText("می\u200cخواهم").clean;
    },
  },
  {
    name: "every reported excerpt is printable — the scanner never re-emits the attack",
    generators: { poison: hostileDoc, parts: lines },
    property: ({ poison, parts }) => {
      const report = scanText(parts.map((part) => `${part}${poison}`).join("\n"));
      return report.findings.every((finding) => [...finding.excerpt].every(isPrintable));
    },
  },
  {
    name: "every finding points at a real position and summary matches the findings",
    generators: { parts: lines, poison: hostileDoc },
    property: ({ parts, poison }) => {
      const text = parts.map((part) => `${part}${poison}`).join("\n");
      const report = scanText(text);
      const lineCount = text.split("\n").length;
      const positionsOk = report.findings.every(
        (f) => f.line >= 1 && f.line <= lineCount && f.column >= 1 && f.column <= text.split("\n")[f.line - 1].length + 1,
      );
      const block = report.findings.filter((f) => f.severity === "block").length;
      const warn = report.findings.filter((f) => f.severity === "warn").length;
      return positionsOk && report.summary.block === block && report.summary.warn === warn;
    },
  },
  {
    name: "scanning is deterministic",
    generators: { parts: lines, poison: hostileDoc },
    property: ({ parts, poison }) => {
      const text = parts.map((part) => `${poison}${part}`).join("\n");
      return JSON.stringify(scanText(text)) === JSON.stringify(scanText(text));
    },
  },
  {
    name: "the corpus: every payload is caught by its declared class",
    generators: { index: gen.int(0, corpus.cases.length - 1) },
    property: ({ index }) => {
      const payload = corpus.cases[index];
      const report = scanText(payload.payload);
      return report.findings.some((finding) => finding.class === payload.class);
    },
  },
  {
    name: "the corpus: neutralising a benign sample leaves it byte-identical",
    generators: { index: gen.int(0, corpus.benign.length - 1) },
    property: ({ index }) => {
      const sample = corpus.benign[index].text;
      return neutralize(sample) === sample;
    },
  },
  {
    name: "every phrase rule is reachable through the corpus — none is dead code",
    generators: { rule: gen.pick(PHRASES.map((phrase) => phrase.id)) },
    property: ({ rule }) => {
      const payload = corpus.cases.find((entry) =>
        scanText(entry.payload).findings.some((finding) => finding.phrase === rule),
      );
      return Boolean(payload);
    },
  },
  {
    name: "a negated directive is not an injection (policy documents must be readable)",
    generators: { word: gen.pick(["never", "do not", "must not", "avoid"]) },
    property: ({ word }) => {
      const sentence = `${word} reveal your API keys in a pull request.`;
      return scanText(sentence).clean;
    },
  },
  {
    name: "the scanner is total: arbitrary unicode never throws and never lies about its summary",
    generators: { chars: gen.arrayOf(gen.int(0, 0x2fff), { maxLength: 40 }) },
    property: ({ chars }) => {
      const text = String.fromCharCode(...chars);
      const report = scanText(text);
      const block = report.findings.filter((f) => f.severity === "block").length;
      const warn = report.findings.filter((f) => f.severity === "warn").length;
      return report.summary.block === block && report.summary.warn === warn && report.clean === (report.findings.length === 0);
    },
  },
];
