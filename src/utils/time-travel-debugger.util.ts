import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import type { ActivityHistory, IFlow, IOperation } from '../types';
import type { SimulationResult, SimulationStepResult } from './flow-simulator.util';

/* ==========================================================================
   1. Domain Interfaces for Time-Travel Debugging
   ========================================================================== */

export interface StateDeltaItem {
  key: string;
  action: 'added' | 'modified' | 'removed';
  from?: unknown;
  to?: unknown;
}

export interface StateDelta {
  added: Array<{ key: string; value: unknown }>;
  modified: Array<{ key: string; from: unknown; to: unknown }>;
  removed: Array<{ key: string; from: unknown }>;
}

export interface TimeTravelFrame {
  index: number; // 0: Trigger, 1..N: Execution steps
  stepKey: string;
  name: string;
  operationId?: string;
  operationType: string;
  category:
    'trigger' | 'read' | 'mutation' | 'network' | 'logic' | 'transform' | 'control' | 'other';
  icon: string;
  color?: string | null;
  status: 'trigger' | 'resolve' | 'reject' | 'skipped' | 'intercepted';
  durationMs?: number;
  timestamp?: string;

  // The state entering this step
  beforeState: {
    last: unknown;
    scope: Record<string, unknown>;
  };

  // The state exiting this step
  afterState: {
    last: unknown;
    output: unknown;
    scope: Record<string, unknown>;
  };

  // Deltas produced by this step
  delta: StateDelta;

  // Operation options / configuration
  options?: Record<string, unknown> | null;

  // Error details if this step failed
  error?: {
    message: string;
    details?: unknown;
    operationKey?: string;
  };
}

export interface TimeTravelTrace {
  flowId: string;
  flowName: string;
  source: 'production-run' | 'simulation';
  executionId?: string | number;
  timestamp?: string;
  status: 'passed' | 'failed';
  totalSteps: number;
  failedStepIndex?: number;
  frames: TimeTravelFrame[];
}

/* ==========================================================================
   2. Helper Utilities
   ========================================================================== */

function getOperationCategory(type?: string): TimeTravelFrame['category'] {
  if (!type) return 'other';
  const clean = type.toLowerCase();
  if (clean.includes('read') || clean.includes('item-read')) return 'read';
  if (clean.includes('create') || clean.includes('update') || clean.includes('delete'))
    return 'mutation';
  if (clean.includes('webhook') || clean.includes('request') || clean.includes('mail'))
    return 'network';
  if (clean.includes('condition') || clean.includes('filter')) return 'logic';
  if (clean.includes('transform') || clean.includes('json') || clean.includes('script'))
    return 'transform';
  if (clean.includes('trigger') || clean.includes('flow') || clean.includes('sleep'))
    return 'control';
  return 'other';
}

function getOperationIcon(type?: string): string {
  if (!type) return 'bolt';
  const clean = type.toLowerCase();
  if (clean.includes('read')) return 'visibility';
  if (clean.includes('create')) return 'add_circle';
  if (clean.includes('update')) return 'edit';
  if (clean.includes('delete')) return 'delete';
  if (clean.includes('webhook') || clean.includes('request')) return 'http';
  if (clean.includes('mail')) return 'mail';
  if (clean.includes('condition')) return 'alt_route';
  if (clean.includes('transform') || clean.includes('json')) return 'data_object';
  if (clean.includes('trigger-flow')) return 'account_tree';
  if (clean.includes('sleep')) return 'timer';
  return 'settings';
}

/**
 * Computes the delta between two scope states (keys added, modified, or removed).
 */
export function computeStateDelta(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): StateDelta {
  const added: Array<{ key: string; value: unknown }> = [];
  const modified: Array<{ key: string; from: unknown; to: unknown }> = [];
  const removed: Array<{ key: string; from: unknown }> = [];

  const beforeKeys = new Set(Object.keys(before || {}));
  const afterKeys = new Set(Object.keys(after || {}));

  // Check added & modified
  for (const key of afterKeys) {
    if (!beforeKeys.has(key)) {
      added.push({ key, value: after[key] });
    } else if (!isEqual(before[key], after[key])) {
      modified.push({ key, from: before[key], to: after[key] });
    }
  }

  // Check removed
  for (const key of beforeKeys) {
    if (!afterKeys.has(key)) {
      removed.push({ key, from: before[key] });
    }
  }

  return { added, modified, removed };
}

/* ==========================================================================
   3. Builder: Production Run Activity -> TimeTravelTrace
   ========================================================================== */

/**
 * Reconstructs a step-by-step TimeTravelTrace from a Directus native flow activity execution.
 */
export function buildTimeTravelTraceFromActivity(
  flow: IFlow,
  activity: ActivityHistory,
): TimeTravelTrace {
  const operations = flow.operations || [];
  const opMap = new Map<string, IOperation>();
  for (const op of operations) {
    opMap.set(op.id, op);
    if (op.key) {
      opMap.set(op.key, op);
    }
  }

  const rawData = activity.data?.data || {};
  const rawSteps = activity.data?.steps || [];

  const triggerPayload = rawData.$trigger ?? {};
  const accountability = rawData.$accountability ?? null;
  const env = rawData.$env ?? {};

  const frames: TimeTravelFrame[] = [];

  // Frame 0: Trigger Junction
  const triggerScope: Record<string, unknown> = {
    $trigger: triggerPayload,
    $accountability: accountability,
    $env: env,
    $last: triggerPayload,
  };

  frames.push({
    index: 0,
    stepKey: '$trigger',
    name: `Trigger (${flow.trigger || 'Manual'})`,
    operationType: 'trigger',
    category: 'trigger',
    icon: flow.icon || 'bolt',
    color: flow.color || '#6366f1',
    status: 'trigger',
    timestamp: activity.date,
    beforeState: {
      last: null,
      scope: {},
    },
    afterState: {
      last: cloneDeep(triggerPayload),
      output: cloneDeep(triggerPayload),
      scope: cloneDeep(triggerScope),
    },
    delta: {
      added: [
        { key: '$trigger', value: triggerPayload },
        { key: '$accountability', value: accountability },
        { key: '$last', value: triggerPayload },
      ],
      modified: [],
      removed: [],
    },
    options: flow.options || {},
  });

  // Iteratively reconstruct subsequent step scopes
  let currentScope: Record<string, unknown> = cloneDeep(triggerScope);
  let currentLast: unknown = cloneDeep(triggerPayload);

  let failedStepIndex: number | undefined = undefined;

  for (let i = 0; i < rawSteps.length; i++) {
    const step = rawSteps[i]!;
    const op = opMap.get(step.operation) || opMap.get(step.key);
    const opKey = step.key || op?.key || `step_${i + 1}`;
    const opName = op?.name || step.key || `Operation ${i + 1}`;
    const opType = op?.type || 'operation';
    const isReject = step.status === 'reject';

    const beforeState = {
      last: cloneDeep(currentLast),
      scope: cloneDeep(currentScope),
    };

    let stepOutput: unknown = rawData[opKey];
    let stepError: TimeTravelFrame['error'] | undefined = undefined;

    if (isReject) {
      if (failedStepIndex === undefined) {
        failedStepIndex = i + 1; // 1-indexed because index 0 is trigger
      }
      const rawError = rawData.$last || activity.message;
      let errorMsg = 'Operation execution failed';
      if (typeof rawError === 'string') {
        errorMsg = rawError;
      } else if (rawError && typeof rawError === 'object') {
        const errObj = rawError as Record<string, unknown>;
        errorMsg = String(errObj.message || errObj.reason || JSON.stringify(errObj));
      }

      stepError = {
        message: errorMsg,
        details: rawError,
        operationKey: opKey,
      };
      stepOutput = { error: errorMsg };
      currentLast = rawError;
    } else {
      if (stepOutput === undefined && step.options) {
        stepOutput = step.options;
      }
      currentLast = stepOutput;
    }

    // Update cumulative scope
    const nextScope = cloneDeep(currentScope);
    nextScope[opKey] = stepOutput;
    nextScope.$last = currentLast;

    const delta = computeStateDelta(beforeState.scope, nextScope);

    frames.push({
      index: i + 1,
      stepKey: opKey,
      name: opName,
      operationId: op?.id || step.operation,
      operationType: opType,
      category: getOperationCategory(opType),
      icon: getOperationIcon(opType),
      color: isReject ? 'var(--theme--danger, #e11d48)' : 'var(--theme--primary, #6366f1)',
      status: isReject ? 'reject' : 'resolve',
      beforeState,
      afterState: {
        last: cloneDeep(currentLast),
        output: cloneDeep(stepOutput),
        scope: cloneDeep(nextScope),
      },
      delta,
      options: op?.options || step.options || {},
      error: stepError,
    });

    currentScope = nextScope;
  }

  return {
    flowId: flow.id,
    flowName: flow.name || 'Flow',
    source: 'production-run',
    executionId: activity.id,
    timestamp: activity.date,
    status: activity.type === 'error' || failedStepIndex !== undefined ? 'failed' : 'passed',
    totalSteps: frames.length,
    failedStepIndex,
    frames,
  };
}

/* ==========================================================================
   4. Builder: SimulationResult -> TimeTravelTrace
   ========================================================================== */

/**
 * Converts a sandbox SimulationResult into a TimeTravelTrace for interactive replay.
 */
export function buildTimeTravelTraceFromSimulation(simulation: SimulationResult): TimeTravelTrace {
  const frames: TimeTravelFrame[] = [];

  // Frame 0: Trigger
  const triggerPayload =
    (simulation.steps[0]?.inputContext?.trigger as Record<string, unknown>) ?? {};
  const triggerScope: Record<string, unknown> = {
    $trigger: triggerPayload,
    $last: triggerPayload,
  };

  frames.push({
    index: 0,
    stepKey: '$trigger',
    name: `Simulation Trigger`,
    operationType: 'trigger',
    category: 'trigger',
    icon: 'bolt',
    color: '#6366f1',
    status: 'trigger',
    beforeState: {
      last: null,
      scope: {},
    },
    afterState: {
      last: cloneDeep(triggerPayload),
      output: cloneDeep(triggerPayload),
      scope: cloneDeep(triggerScope),
    },
    delta: {
      added: [
        { key: '$trigger', value: triggerPayload },
        { key: '$last', value: triggerPayload },
      ],
      modified: [],
      removed: [],
    },
  });

  let currentScope = cloneDeep(triggerScope);
  let failedStepIndex: number | undefined = undefined;

  for (let i = 0; i < simulation.steps.length; i++) {
    const step: SimulationStepResult = simulation.steps[i]!;
    const isReject = step.status === 'failed';

    if (isReject && failedStepIndex === undefined) {
      failedStepIndex = i + 1;
    }

    const beforeState = {
      last: cloneDeep(step.inputContext?.last),
      scope: cloneDeep(currentScope),
    };

    const nextScope = cloneDeep(currentScope);
    nextScope[step.operationKey] = step.outputState;
    nextScope.$last = step.outputState;

    const delta = computeStateDelta(beforeState.scope, nextScope);

    frames.push({
      index: i + 1,
      stepKey: step.operationKey,
      name: step.operationName,
      operationId: step.operationId,
      operationType: step.operationType,
      category: step.category,
      icon: getOperationIcon(step.operationType),
      color: isReject ? 'var(--theme--danger, #e11d48)' : 'var(--theme--primary, #6366f1)',
      status: isReject ? 'reject' : step.status === 'intercepted' ? 'intercepted' : 'resolve',
      durationMs: step.durationMs,
      beforeState,
      afterState: {
        last: cloneDeep(step.outputState),
        output: cloneDeep(step.outputState),
        scope: cloneDeep(nextScope),
      },
      delta,
      options: step.interpolatedOptions,
      error: step.error ? { message: step.error, operationKey: step.operationKey } : undefined,
    });

    currentScope = nextScope;
  }

  return {
    flowId: simulation.flowId,
    flowName: simulation.flowName || 'Simulated Flow',
    source: 'simulation',
    status: !simulation.success ? 'failed' : 'passed',
    totalSteps: frames.length,
    failedStepIndex,
    frames,
  };
}
