// Property-based testing primitives — deterministic, seeded, shrinking.
// Kept separate from the CLI so test files can import it without a cycle.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let random = mulberry32(20260101);
export function seedRng(seed) {
  random = mulberry32(seed);
}

const randInt = (min, max) => min + Math.floor(random() * (max - min + 1));

/** Generators expose generate() plus shrink(value) → candidate smaller values. */
export const gen = {
  int: (min = -50, max = 50) => ({
    generate: () => randInt(min, max),
    shrink: (n) => (n === 0 ? [] : [0, Math.trunc(n / 2)]),
  }),

  float: (min = -10, max = 10) => ({
    generate: () => Number((min + random() * (max - min)).toFixed(4)),
    shrink: (n) => (Math.abs(n) < 1e-6 ? [] : [0, n / 2]),
  }),

  bool: () => ({
    generate: () => random() > 0.5,
    shrink: (b) => (b ? [false] : []),
  }),

  pick: (items) => ({
    generate: () => items[randInt(0, items.length - 1)],
    shrink: (v) => (items.indexOf(v) > 0 ? [items[0]] : []),
  }),

  text: ({ maxLength = 24, alphabet = "abcdefghijklmnopqrstuvwxyz -_" } = {}) => ({
    generate: () => {
      const len = randInt(0, maxLength);
      let out = "";
      for (let i = 0; i < len; i++) out += alphabet[randInt(0, alphabet.length - 1)];
      return out;
    },
    shrink: (s) => (s.length === 0 ? [] : ["", s.slice(0, Math.floor(s.length / 2))]),
  }),

  arabicText: ({ maxWords = 4 } = {}) => {
    const words = ["صلاحيات", "الوكيل", "الأسرار", "المستودع", "تزامن", "أمان", "المستودعات", "الحماية"];
    return {
      generate: () => {
        const n = randInt(1, maxWords);
        return Array.from({ length: n }, () => words[randInt(0, words.length - 1)]).join(" ");
      },
      shrink: (s) => (s.includes(" ") ? [s.split(" ")[0]] : []),
    };
  },

  arrayOf: (inner, { maxLength = 5 } = {}) => ({
    generate: () => Array.from({ length: randInt(0, maxLength) }, () => inner.generate()),
    shrink: (arr) =>
      arr.length === 0
        ? []
        : [arr.slice(0, Math.floor(arr.length / 2)), []].filter((a) => a.length < arr.length),
  }),

  lineRange: ({ maxLines = 80 } = {}) => ({
    generate: () => {
      const total = randInt(1, maxLines);
      return { total, start: randInt(1, total) };
    },
    shrink: (v) => (v.total > 1 ? [{ total: 1, start: 1 }] : []),
  }),
};

const MAX_SHRINKS = 200;

function attempt(definition, sample) {
  try {
    return definition.property(sample) !== false;
  } catch {
    return false;
  }
}

export function shrink(definition, sample) {
  let current = sample;
  let steps = 0;
  let improved = true;

  while (improved && steps < MAX_SHRINKS) {
    improved = false;
    for (const [key, generator] of Object.entries(definition.generators)) {
      for (const candidate of generator.shrink(current[key])) {
        steps++;
        const next = { ...current, [key]: candidate };
        if (!attempt(definition, next)) {
          current = next;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }
  return current;
}

export function runProperty(definition, runs) {
  for (let i = 0; i < runs; i++) {
    const sample = {};
    for (const [key, generator] of Object.entries(definition.generators)) sample[key] = generator.generate();
    if (!attempt(definition, sample)) return { ok: false, failure: shrink(definition, sample) };
  }
  return { ok: true };
}
