
import type { Constraint } from '../../../src/lib/types.js';
import type { BuilderContext } from '../types.js';
import { dispatchConstraint, type ConstraintNode } from './handlers.js';

export type ConstraintNodes = {
  time: ConstraintNode[];
  space: ConstraintNode[];
};

export function buildAllConstraints(
  constraints: Constraint[],
  ctx: BuilderContext,
): ConstraintNodes {
  const time: ConstraintNode[] = [];
  const space: ConstraintNode[] = [];

  for (const c of constraints) {
    const result = dispatchConstraint(c, ctx);
    if (!result) continue;
    for (const node of result) {
      if (node.section === 'time') time.push(node);
      else space.push(node);
    }
  }

  return { time, space };
}

export function buildTimeConstraints(
  constraints: Constraint[],
  ctx: BuilderContext,
): ConstraintNode[] {
  return buildAllConstraints(constraints, ctx).time;
}

export function buildSpaceConstraints(
  constraints: Constraint[],
  ctx: BuilderContext,
): ConstraintNode[] {
  return buildAllConstraints(constraints, ctx).space;
}

export type { ConstraintNode } from './handlers.js';
