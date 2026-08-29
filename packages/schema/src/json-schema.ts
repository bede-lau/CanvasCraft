import { z } from 'zod';

/**
 * Zod -> JSON Schema for OpenAI-compatible structured outputs.
 *
 * Strict structured-output mode is much narrower than JSON Schema. It requires
 * `additionalProperties: false` on every object and every property listed in
 * `required`, and it rejects most validation keywords outright. Providers other
 * than OpenAI implement subtly different subsets, so this converter targets the
 * intersection: types, enums, anyOf, $defs/$ref, descriptions, and nothing else.
 *
 * The constraints are not thrown away — they move into `description`, so the
 * model is still told about them, and Zod still enforces them on the way back
 * in. See ADR 0002.
 */

export type JsonSchemaObject = Record<string, unknown>;

/**
 * Keywords strict mode does not accept. Stripped from the emitted schema and
 * summarised into the description instead.
 */
const UNSUPPORTED_KEYWORDS = [
  'default',
  'format',
  'pattern',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'contentEncoding',
  'contentMediaType',
  'examples',
] as const;

/** Renders a stripped keyword as a phrase the model can act on. */
function describeConstraint(keyword: string, value: unknown): string | null {
  switch (keyword) {
    case 'minLength':
      return `at least ${String(value)} characters`;
    case 'maxLength':
      return `at most ${String(value)} characters`;
    case 'minItems':
      return `at least ${String(value)} items`;
    case 'maxItems':
      return `at most ${String(value)} items`;
    case 'minimum':
      return `at least ${String(value)}`;
    case 'maximum':
      return `at most ${String(value)}`;
    case 'pattern':
      return `matching ${String(value)}`;
    case 'format':
      return `in ${String(value)} format`;
    case 'default':
      return `defaults to ${JSON.stringify(value)}`;
    default:
      return null;
  }
}

export class StrictSchemaError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(`${message} (at ${path || '<root>'})`);
    this.name = 'StrictSchemaError';
  }
}

function tighten(node: unknown, path: string): unknown {
  if (Array.isArray(node)) {
    return node.map((entry, index) => tighten(entry, `${path}[${index}]`));
  }
  if (node === null || typeof node !== 'object') {
    return node;
  }

  const source = node as JsonSchemaObject;
  const result: JsonSchemaObject = {};
  const constraintPhrases: string[] = [];

  for (const [key, value] of Object.entries(source)) {
    if ((UNSUPPORTED_KEYWORDS as readonly string[]).includes(key)) {
      const phrase = describeConstraint(key, value);
      if (phrase) constraintPhrases.push(phrase);
      continue;
    }
    if (key === '$schema') continue;
    result[key] = tighten(value, path ? `${path}.${key}` : key);
  }

  if (constraintPhrases.length > 0) {
    const existing = typeof result['description'] === 'string' ? `${result['description']} ` : '';
    result['description'] = `${existing}(${constraintPhrases.join(', ')})`.trim();
  }

  const properties = result['properties'];
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    const keys = Object.keys(properties as JsonSchemaObject);
    const required = Array.isArray(result['required']) ? (result['required'] as string[]) : [];
    const missing = keys.filter((key) => !required.includes(key));

    if (missing.length > 0) {
      // Optional properties cannot be expressed in strict mode. Rather than
      // silently promoting them — which would make the model invent values Zod
      // then rejects — fail loudly so the AI-facing schema gets fixed to use
      // `.nullable()` instead of `.optional()`.
      throw new StrictSchemaError(
        `strict schemas cannot contain optional properties: ${missing.join(', ')}. Use .nullable() and keep the key required.`,
        path,
      );
    }

    result['required'] = keys;
    result['additionalProperties'] = false;
  }

  return result;
}

/**
 * Converts a Zod schema into a strict-mode JSON Schema.
 *
 * Throws `StrictSchemaError` if the schema contains anything strict mode cannot
 * represent. That is deliberate: it turns a runtime provider error into a
 * development-time failure.
 */
export function toStrictJsonSchema(schema: z.ZodType): JsonSchemaObject {
  const raw = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'throw',
    reused: 'inline',
  }) as JsonSchemaObject;

  return tighten(raw, '') as JsonSchemaObject;
}

/** The `response_format` payload for an OpenAI-compatible chat completion. */
export function responseFormat(
  name: string,
  schema: z.ZodType,
  description?: string,
): {
  type: 'json_schema';
  json_schema: { name: string; description?: string; strict: true; schema: JsonSchemaObject };
} {
  return {
    type: 'json_schema',
    json_schema: {
      name,
      ...(description ? { description } : {}),
      strict: true,
      schema: toStrictJsonSchema(schema),
    },
  };
}

/**
 * Formats Zod issues into a short, model-readable repair brief.
 *
 * Only the first `limit` issues are included: a model handed forty errors tends
 * to rewrite everything, which loses the parts that were already correct.
 */
export function formatIssuesForRepair(error: z.ZodError, limit = 12): string {
  const lines = error.issues.slice(0, limit).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    return `- ${path}: ${issue.message}`;
  });
  const remaining = error.issues.length - lines.length;
  if (remaining > 0) {
    lines.push(`- …and ${remaining} more of the same kind.`);
  }
  return lines.join('\n');
}
