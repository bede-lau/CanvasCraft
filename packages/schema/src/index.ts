/**
 * @canvascraft/schema
 *
 * Every contract crossing a layer boundary lives here, and nothing here imports
 * from `apps/*`. If a type is shared between the client and the orchestrator, or
 * between the orchestrator and the AI generator, this is where it is defined.
 */

export * from './primitives.js';
export * from './canvas.js';
export * from './screen-spec.js';
export * from './registry.js';
export * from './manifest.js';
export * from './accessibility.js';
export * from './layout-risk.js';
export * from './director.js';
export * from './branch.js';
export * from './events.js';
export * from './run.js';
export * from './ai-contracts.js';
export * from './json-schema.js';
export * from './canonical.js';
