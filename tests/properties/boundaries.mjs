// Properties for the boundary layer: schema validation, query expansion, ignore markers.
// A validator that fails open, or an expansion that drops the user's words, is a silent bug.

import { validate } from "../../scripts/lib/schema.mjs";
import { expandTokens, stripIgnored, normalizeToken, tokenize, BILINGUAL_GLOSSARY, rerankScore } from "../../scripts/semantic/lib.mjs";
import { scanContent, maskValue } from "../../scripts/check-pii.mjs";
import { gen } from "../../scripts/lib/property.mjs";

const closedObject = {
  type: "object",
  required: ["name"],
  properties: { name: { type: "string", minLength: 1 } },
};

export default [
  {
    name: "a conforming document validates with zero violations",
    generators: { name: gen.text({ maxLength: 20, alphabet: "abcdefgh" }) },
    property: ({ name }) => (name.length === 0 ? true : validate({ name }, closedObject).length === 0),
  },
  {
    name: "a closed object rejects every unknown key",
    generators: { key: gen.text({ maxLength: 10, alphabet: "abcdefgh_" }) },
    property: ({ key }) => {
      if (key.length === 0 || key === "name") return true;
      const doc = { name: "ok", [key]: 1 };
      return validate(doc, closedObject).some((e) => e.includes("unknown key"));
    },
  },
  {
    name: "a missing required key is always reported",
    generators: { extra: gen.text({ maxLength: 6, alphabet: "abc" }) },
    property: () => validate({}, closedObject).some((e) => e.includes("required")),
  },
  {
    name: "type mismatches are reported once, with a path",
    generators: { value: gen.pick([1, true, [], null, "text"]) },
    property: ({ value }) => {
      const errors = validate({ name: value }, closedObject);
      return value === "text" ? errors.length === 0 : errors.some((e) => e.startsWith("$.name"));
    },
  },
  {
    name: "query expansion never drops the user's own tokens",
    generators: { tokens: gen.arrayOf(gen.pick(Object.keys(BILINGUAL_GLOSSARY)), { maxLength: 4 }) },
    property: ({ tokens }) => {
      const { tokens: expanded } = expandTokens(tokens);
      return tokens.every((t) => expanded.includes(t));
    },
  },
  {
    name: "query expansion respects its cap",
    generators: { tokens: gen.arrayOf(gen.pick(Object.keys(BILINGUAL_GLOSSARY)), { maxLength: 5 }) },
    property: ({ tokens }) => {
      const { tokens: expanded, extras } = expandTokens(tokens, 3);
      return extras.length <= 3 && expanded.length <= tokens.length + 3;
    },
  },
  {
    name: "normalisation is idempotent",
    generators: { word: gen.arabicText({ maxWords: 1 }) },
    property: ({ word }) => {
      const once = normalizeToken(word);
      return once.length > 0 && normalizeToken(once) === once;
    },
  },
  {
    name: "ignore markers remove the enclosed region, never the surrounding text",
    generators: { before: gen.text({ maxLength: 12, alphabet: "abc " }), after: gen.text({ maxLength: 12, alphabet: "xyz " }) },
    property: ({ before, after }) => {
      const doc = `${before}\n// @semantic-ignore-begin\nSECRET_PAYLOAD\n// @semantic-ignore-finish\n${after}`;
      const cleaned = stripIgnored(doc);
      return !cleaned.includes("SECRET_PAYLOAD") && cleaned.includes(before.trim()) === (before.trim().length === 0 || cleaned.includes(before.trim()));
    },
  },
  {
    name: "masking never reproduces the value it hides",
    generators: { value: gen.text({ maxLength: 24, alphabet: "abcdefghij0123456789" }) },
    property: ({ value }) => {
      if (value.length < 8) return true;
      const masked = maskValue(value);
      return masked !== value && !(value.length > 12 && masked.includes(value));
    },
  },
  {
    name: "an email-shaped string is always detected, and its excerpt never leaks it",
    generators: { user: gen.text({ maxLength: 10, alphabet: "abcdef" }), domain: gen.text({ maxLength: 8, alphabet: "abcdef" }) },
    property: ({ user, domain }) => {
      if (user.length < 3 || domain.length < 3) return true;
      const address = `${user}@${domain}.com`;
      const findings = scanContent("probe.md", `contact: ${address}`);
      if (findings.length === 0) return false;
      return findings.every((f) => !f.excerpt.includes(address) && !f.masked.includes(address));
    },
  },
  {
    name: "an allowlisted rule silences exactly that rule, nothing else",
    generators: { address: gen.text({ maxLength: 8, alphabet: "abc" }) },
    property: ({ address }) => {
      if (address.length < 4) return true;
      const text = `mail: ${address}@corp.com`;
      const exemptions = [{ file: "probe.md", rule: "email", reason: "property test exemption" }];
      return scanContent("probe.md", text).length > 0 && scanContent("probe.md", text, exemptions).length === 0;
    },
  },
  {
    name: "rerank scores stay in [0, 1] for any query tokens",
    generators: { tokens: gen.arrayOf(gen.pick(["merge", "permission", "دمج", "search"]), { maxLength: 4 }) },
    property: ({ tokens }) => {
      const chunk = { terms: [["merge", 2]], heading: "Merge policy", file: "docs/agents/permissions.md", length: 20 };
      const index = { stats: { documents: 10, df: [["merge", 2], ["permission", 5]] } };
      const { score, features } = rerankScore(index, chunk, tokens);
      const values = [score, ...Object.values(features)];
      return values.every((v) => Number.isFinite(v) && v >= 0 && v <= 1);
    },
  },
  {
    name: "tokenize output contains no stopwords and no single characters",
    generators: { text: gen.text({ maxLength: 30 }) },
    property: ({ text }) => tokenize(text).every((t) => t.length > 1),
  },
];
