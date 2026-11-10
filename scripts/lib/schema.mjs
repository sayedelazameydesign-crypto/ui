// Minimal, fail-closed schema validator — no dependencies.
//
// Design rules:
//  • Closed by default: an object with `properties` rejects unknown keys unless
//    `additionalProperties: true` is set explicitly. A typo must fail, not pass.
//  • Every error carries a JSON path, so a message points at the offending key.
//  • Supported keywords only: type · nullable · enum · minLength · pattern ·
//    minimum · items · minItems · required · properties · additionalProperties.
//    Anything else is ignored deliberately rather than half-implemented (a
//    validator that silently skips rules is worse than none).

const typeOf = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
};

function matchesType(value, expected) {
  const actual = typeOf(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  if (expected === "integer") return actual === "integer";
  return actual === expected;
}

/**
 * @returns {string[]} list of human-readable violations (empty ⇒ valid)
 */
export function validate(value, schema, path = "$") {
  const errors = [];

  // `nullable: true` is the only way to accept null: a field whose absence is
  // meaningful (an unpinned checksum) must say so instead of looking optional.
  if (value === null && schema.nullable) return errors;

  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(`${path}: expected ${schema.type}, got ${typeOf(value)}`);
    return errors; // further keywords would only produce noise
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: expected one of [${schema.enum.join(", ")}], got ${JSON.stringify(value)}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: shorter than ${schema.minLength} characters`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: does not match /${schema.pattern}/`);
    }
  }

  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path}: below minimum ${schema.minimum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: fewer than ${schema.minItems} item(s)`);
    }
    if (schema.items) {
      value.forEach((item, i) => errors.push(...validate(item, schema.items, `${path}[${i}]`)));
    }
  }

  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${path}.${key}: required key is missing`);
    }

    const properties = schema.properties ?? {};
    const additional = schema.additionalProperties;
    const declaresShape = Object.keys(properties).length > 0;

    for (const [key, child] of Object.entries(value)) {
      if (properties[key]) {
        errors.push(...validate(child, properties[key], `${path}.${key}`));
      } else if (additional && typeof additional === "object") {
        // Map-style objects (e.g. mcpServers, per-server schemas): every value is validated.
        errors.push(...validate(child, additional, `${path}.${key}`));
      } else if (additional !== true && declaresShape) {
        errors.push(`${path}.${key}: unknown key (fail-closed — add it to the schema or remove it)`);
      }
    }
  }

  return errors;
}

/** Throws on the first invalid document batch; used by scripts/validate-json.mjs. */
export function assertValid(value, schema, label) {
  const errors = validate(value, schema);
  if (errors.length) {
    const error = new Error(`${label} violates its schema:\n  ${errors.join("\n  ")}`);
    error.violations = errors;
    throw error;
  }
}
