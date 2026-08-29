import { describe, expect, it } from 'vitest';
import {
  AiDirectionSet,
  AiPatchPlan,
  AiRecommendationSet,
  AiRetrievalPlan,
  AiScreenSpecDraft,
  AiVariantDraft,
} from '../ai-contracts.js';
import { StrictSchemaError, toStrictJsonSchema } from '../json-schema.js';
import { z } from 'zod';

type JsonObject = Record<string, unknown>;

/** Walks every object node in a JSON Schema so invariants can be asserted globally. */
function eachSchemaObject(node: unknown, visit: (node: JsonObject, path: string) => void, path = ''): void {
  if (Array.isArray(node)) {
    node.forEach((entry, index) => eachSchemaObject(entry, visit, `${path}[${index}]`));
    return;
  }
  if (node === null || typeof node !== 'object') return;

  const object = node as JsonObject;
  visit(object, path);
  for (const [key, value] of Object.entries(object)) {
    eachSchemaObject(value, visit, path ? `${path}.${key}` : key);
  }
}

const CONTRACTS: ReadonlyArray<readonly [string, z.ZodType]> = [
  ['AiScreenSpecDraft', AiScreenSpecDraft],
  ['AiRetrievalPlan', AiRetrievalPlan],
  ['AiDirectionSet', AiDirectionSet],
  ['AiRecommendationSet', AiRecommendationSet],
  ['AiPatchPlan', AiPatchPlan],
];

describe('strict JSON Schema conversion', () => {
  for (const [name, schema] of CONTRACTS) {
    describe(name, () => {
      const converted = toStrictJsonSchema(schema);

      it('converts without hitting an unrepresentable construct', () => {
        expect(converted['type']).toBe('object');
      });

      it('closes every object and requires every property', () => {
        eachSchemaObject(converted, (node, path) => {
          if (!node['properties']) return;
          expect(node['additionalProperties'], `additionalProperties at ${path}`).toBe(false);

          const propertyKeys = Object.keys(node['properties'] as JsonObject).sort();
          const required = [...((node['required'] as string[] | undefined) ?? [])].sort();
          expect(required, `required at ${path}`).toEqual(propertyKeys);
        });
      });

      it('emits no keyword strict mode rejects', () => {
        const banned = [
          'default',
          'format',
          'pattern',
          'minLength',
          'maxLength',
          'minimum',
          'maximum',
          'minItems',
          'maxItems',
          '$schema',
        ];
        eachSchemaObject(converted, (node, path) => {
          for (const keyword of banned) {
            expect(Object.hasOwn(node, keyword), `${keyword} at ${path}`).toBe(false);
          }
        });
      });
    });
  }

  it('moves a stripped constraint into the description so the model still sees it', () => {
    const converted = toStrictJsonSchema(z.object({ title: z.string().max(12) }));
    const properties = converted['properties'] as JsonObject;
    const title = properties['title'] as JsonObject;
    expect(String(title['description'])).toContain('at most 12 characters');
  });

  it('keeps manifest-compatible direction limits in the AI schema description', () => {
    const converted = toStrictJsonSchema(AiDirectionSet);
    const variants = ((converted['properties'] as JsonObject)['variants'] as JsonObject)['items'] as JsonObject;
    const genome = (variants['properties'] as JsonObject)['genome'] as JsonObject;

    expect(String(genome['description'])).toContain('at most 140 characters');
    expect(AiVariantDraft.shape.genome.safeParse('x'.repeat(141)).success).toBe(false);
  });

  it('refuses an optional property rather than silently promoting it', () => {
    const schema = z.object({ required: z.string(), sometimes: z.string().optional() });
    expect(() => toStrictJsonSchema(schema)).toThrow(StrictSchemaError);
  });

  it('refuses a defaulted property, which is also optional on input', () => {
    const schema = z.object({ items: z.array(z.string()).default([]) });
    expect(() => toStrictJsonSchema(schema)).toThrow(StrictSchemaError);
  });

  it('refuses an unrepresentable construct instead of widening it to any JSON value', () => {
    const schema = z.object({ lookup: z.map(z.string(), z.string()) });
    expect(() => toStrictJsonSchema(schema)).toThrow();
  });

  it('keeps nullable properties required, which is the supported way to say "may be absent"', () => {
    const converted = toStrictJsonSchema(z.object({ note: z.string().nullable() }));
    expect(converted['required']).toEqual(['note']);
    const properties = converted['properties'] as JsonObject;
    expect((properties['note'] as JsonObject)['type']).toEqual(['string', 'null']);
  });
});
