import get from 'lodash/get';
import cloneDeep from 'lodash/cloneDeep';
import isEqual from 'lodash/isEqual';
import type { IFlow, IOperation } from '../types';

/* ==========================================================================
   1. Domain Interfaces for Sandbox Simulation
   ========================================================================== */

export interface MutationDiffDetail {
  field: string;
  from: unknown;
  to: unknown;
}

export interface SimulationStepResult {
  stepIndex: number;
  operationId: string;
  operationKey: string;
  operationName: string;
  operationType: string;
  category: 'read' | 'mutation' | 'network' | 'logic' | 'transform' | 'control' | 'other';
  status: 'executed' | 'intercepted' | 'failed' | 'skipped';
  inputContext: {
    last: unknown;
    trigger: unknown;
  };
  interpolatedOptions: Record<string, unknown>;
  outputState: unknown;
  mutationPreview?: {
    action: 'create' | 'update' | 'delete';
    collection: string;
    key?: unknown;
    before?: unknown;
    after?: unknown;
    diff?: MutationDiffDetail[];
  };
  networkCallPreview?: {
    url: string;
    method: string;
    headers?: Record<string, unknown>;
    body?: unknown;
    mockResponse: unknown;
  };
  emailPreview?: {
    to: unknown;
    subject: unknown;
    body: unknown;
  };
  subflowPreview?: {
    flowId: unknown;
    payload: unknown;
  };
  conditionResult?: boolean;
  branchTaken?: 'resolve' | 'reject' | 'end';
  durationMs: number;
  error?: string;
}

export interface SimulationSummary {
  totalStepsExecuted: number;
  readsCount: number;
  writesInterceptedCount: number;
  networkCallsSuppressedCount: number;
  emailsSuppressedCount: number;
  subflowsSuppressedCount: number;
  creates: Array<{ collection: string; payload: unknown }>;
  updates: Array<{
    collection: string;
    key: unknown;
    before: unknown;
    after: unknown;
    diff: MutationDiffDetail[];
  }>;
  deletes: Array<{ collection: string; key: unknown; record: unknown }>;
  networkCalls: Array<{
    key: string;
    name: string;
    url: string;
    method: string;
    body: unknown;
  }>;
  emails: Array<{
    key: string;
    name: string;
    to: unknown;
    subject: unknown;
    body: unknown;
  }>;
  subflows: Array<{
    key: string;
    name: string;
    flowId: unknown;
    payload: unknown;
  }>;
  errors: Array<{ stepKey: string; stepName: string; error: string }>;
}

export interface SimulationResult {
  flowId: string;
  flowName: string;
  success: boolean;
  durationMs: number;
  steps: SimulationStepResult[];
  summary: SimulationSummary;
  finalOutput: unknown;
  error?: string;
}

export interface SimulationReaderService {
  readItem?: (
    collection: string,
    key: string | number,
    query?: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
  readItems?: (
    collection: string,
    query?: Record<string, unknown>,
    keys?: Array<string | number>,
  ) => Promise<Record<string, unknown>[]>;
}

export interface FlowSimulationOptions {
  triggerPayload?: Record<string, unknown>;
  readerService?: SimulationReaderService;
  mockResponses?: Record<string, unknown>; // Map of operationKey -> mock response
  accountability?: Record<string, unknown>;
  maxSteps?: number;
}

/* ==========================================================================
   2. Template Interpolation Engine
   ========================================================================== */

/**
 * Resolves dot-notation path in execution context with smart aliasing
 * (e.g. $trigger.collection <-> $trigger.body.collection, trigger vs $trigger).
 */
export function resolveContextPath(context: Record<string, unknown>, path: string): unknown {
  let normalizedPath = path.trim();
  if (/^(trigger|last|accountability|env)(\.|$)/.test(normalizedPath)) {
    normalizedPath = `$${normalizedPath}`;
  }

  // 1. Direct path lookup
  let val = get(context, normalizedPath);
  if (val !== undefined) return val;

  // 2. Try raw path if different
  if (normalizedPath !== path) {
    val = get(context, path);
    if (val !== undefined) return val;
  }

  // 3. Fallback between $trigger and $trigger.body
  if (normalizedPath.startsWith('$trigger.') && !normalizedPath.startsWith('$trigger.body.')) {
    const subPath = normalizedPath.slice('$trigger.'.length);
    val = get(context, `$trigger.body.${subPath}`);
    if (val !== undefined) return val;
  }
  if (normalizedPath.startsWith('$trigger.body.')) {
    const subPath = normalizedPath.slice('$trigger.body.'.length);
    val = get(context, `$trigger.${subPath}`);
    if (val !== undefined) return val;
  }

  // 4. Try without leading $
  if (normalizedPath.startsWith('$')) {
    val = get(context, normalizedPath.slice(1));
    if (val !== undefined) return val;
  }

  return undefined;
}

/**
 * Resolves Directus double-bracket template syntax, e.g. `{{$trigger.body.id}}`,
 * against the accumulated execution context.
 */
export function interpolateValue(value: unknown, context: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    // Check if the entire string is a single expression, e.g. "{{$last}}"
    const singleMatch = trimmed.match(/^\{\{\s*([$\w.[\]]+)\s*\}\}$/);
    if (singleMatch && singleMatch[1]) {
      const path = singleMatch[1];
      const resolved = resolveContextPath(context, path);
      return resolved !== undefined ? cloneDeep(resolved) : null;
    }

    // Otherwise, replace embedded occurrences inside a string
    return value.replace(/\{\{\s*([$\w.[\]]+)\s*\}\}/g, (_match, path) => {
      const resolved = resolveContextPath(context, path);
      if (resolved === null || resolved === undefined) return '';
      if (typeof resolved === 'object') return JSON.stringify(resolved);
      return String(resolved);
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolateValue(item, context));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = interpolateValue(v, context);
    }
    return result;
  }

  return value;
}

/* ==========================================================================
   3. Diff Computation Utility
   ========================================================================== */

export function computeObjectDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): MutationDiffDetail[] {
  const diffs: MutationDiffDetail[] = [];
  const allKeys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);

  for (const key of allKeys) {
    const fromVal = before?.[key];
    const toVal = after?.[key];
    if (!isEqual(fromVal, toVal)) {
      diffs.push({
        field: key,
        from: fromVal,
        to: toVal,
      });
    }
  }

  return diffs;
}

/**
 * Normalizes keys option into an array of string | number IDs.
 */
export function extractKeysFromOption(rawKey: unknown): Array<string | number> {
  if (rawKey === null || rawKey === undefined) return [];
  if (Array.isArray(rawKey)) {
    return rawKey
      .flatMap((k) => (typeof k === 'string' ? k.split(',') : k))
      .map((k) => (typeof k === 'string' ? (k as string).trim() : k))
      .filter((k) => k !== '' && k !== null && k !== undefined);
  }
  if (typeof rawKey === 'string') {
    const trimmed = rawKey.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return extractKeysFromOption(parsed);
      } catch {
        // ignore JSON parse error
      }
    }
    return trimmed
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k !== '');
  }
  if (typeof rawKey === 'number') {
    return [rawKey];
  }
  return [];
}

/**
 * Resolves target collection name for an operation, using interpolated options
 * with intelligent fallback to trigger context and flow configuration.
 */
export function resolveOperationCollection(
  interpolatedOptions: Record<string, unknown>,
  rawOptions: unknown,
  context: Record<string, unknown>,
  flow: IFlow,
): string {
  const rawOpts =
    rawOptions && typeof rawOptions === 'object' ? (rawOptions as Record<string, unknown>) : {};
  const rawCol =
    interpolatedOptions.collection ||
    interpolatedOptions.collections ||
    rawOpts.collection ||
    rawOpts.collections;

  let col = '';
  if (typeof rawCol === 'string') {
    col = rawCol.trim();
  } else if (Array.isArray(rawCol) && rawCol.length > 0) {
    col = String(rawCol[0] || '').trim();
  }

  // If col is still empty or an unresolved mustache template, fall back to trigger context & flow options
  if (!col || col.startsWith('{{')) {
    const triggerObj = context.$trigger as Record<string, unknown> | undefined;
    const triggerBody = triggerObj?.body as Record<string, unknown> | undefined;
    const triggerPayload = triggerObj?.payload as Record<string, unknown> | undefined;

    const candidate =
      triggerObj?.collection ||
      triggerBody?.collection ||
      triggerPayload?.collection ||
      (Array.isArray(flow.options?.collections)
        ? flow.options.collections[0]
        : flow.options?.collections) ||
      flow.options?.collection ||
      '';

    if (candidate) {
      col = String(candidate).trim();
    }
  }

  return col;
}

/* ==========================================================================
   4. Sample Payload Generator
   ========================================================================== */

/**
 * Crafts realistic sample trigger payloads for the Sandbox Editor based on flow configuration.
 */
export function generateSampleTriggerPayload(flow: IFlow): Record<string, unknown> {
  const targetCol =
    (Array.isArray(flow.options?.collections)
      ? flow.options.collections[0]
      : flow.options?.collections) ||
    (flow.options?.collection as string) ||
    'orders';

  switch (flow.trigger) {
    case 'manual': {
      const col = targetCol;
      const sampleKeys = ['sim_record_001', 'sim_record_002'];
      const bodyObj: Record<string, unknown> = {
        collection: col,
        keys: sampleKeys,
      };

      // Include confirmation fields if configured on the flow
      if (Array.isArray(flow.options?.fields)) {
        for (const field of flow.options.fields as Array<{
          field?: string;
          schema?: { default_value?: unknown };
        }>) {
          if (field?.field) {
            bodyObj[field.field] = field.schema?.default_value ?? 'Sample Input';
          }
        }
      }

      return {
        body: bodyObj,
        path: `/trigger/${flow.id}`,
        query: {},
        method: 'POST',
        headers: {
          host: 'localhost:8055',
          accept: 'application/json, text/plain, */*',
          'user-agent': 'DirectusFlowSimulation/1.0',
        },
      };
    }

    case 'event': {
      const scope = Array.isArray(flow.options?.scope)
        ? flow.options?.scope[0]
        : flow.options?.scope || 'items.create';
      return {
        event: scope,
        collection: targetCol,
        key: 'sim_record_001',
        keys: ['sim_record_001'],
        payload: {
          status: 'pending',
          title: 'Simulated Order #1001',
          amount: 149.99,
          user_created: 'sim_user_admin',
        },
        body: {
          collection: targetCol,
          key: 'sim_record_001',
          keys: ['sim_record_001'],
        },
      };
    }

    case 'webhook':
      return {
        method: flow.options?.method || 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'DirectusFlowSimulation/1.0',
        },
        query: {
          source: 'sandbox',
        },
        body: {
          event: 'payment.succeeded',
          transaction_id: 'tx_sim_884129',
          amount: 2500,
          currency: 'usd',
          customer_email: 'customer@example.com',
        },
      };

    case 'schedule':
      return {
        timestamp: new Date().toISOString(),
        cron: flow.options?.cron || '0 0 * * *',
      };

    default:
      return {
        message: 'Simulated trigger input',
        timestamp: new Date().toISOString(),
      };
  }
}

/* ==========================================================================
   5. Simulation Core Runner
   ========================================================================== */

/**
 * Classifies operation type into high-level sandbox categories.
 */
export function getOperationCategory(
  type: string,
): 'read' | 'mutation' | 'network' | 'logic' | 'transform' | 'control' | 'other' {
  switch (type) {
    case 'item-read':
      return 'read';
    case 'item-create':
    case 'item-update':
    case 'item-delete':
      return 'mutation';
    case 'request':
    case 'mail':
    case 'trigger-flow':
      return 'network';
    case 'condition':
      return 'logic';
    case 'transform':
    case 'exec':
    case 'run-script':
      return 'transform';
    case 'sleep':
    case 'log':
      return 'control';
    default:
      return 'other';
  }
}

/**
 * Runs a deterministic dry-run sandbox simulation of a Directus Flow.
 */
export async function simulateFlow(
  flow: IFlow,
  options: FlowSimulationOptions = {},
): Promise<SimulationResult> {
  const startTime = Date.now();
  const maxSteps = options.maxSteps || 50;

  const rawTrigger = (options.triggerPayload || generateSampleTriggerPayload(flow)) as Record<
    string,
    unknown
  >;
  const normalizedTrigger = cloneDeep(rawTrigger) || {};

  const triggerBody =
    normalizedTrigger.body && typeof normalizedTrigger.body === 'object'
      ? (normalizedTrigger.body as Record<string, unknown>)
      : {};

  const detectedCol =
    normalizedTrigger.collection ||
    triggerBody.collection ||
    (Array.isArray(flow.options?.collections)
      ? flow.options.collections[0]
      : flow.options?.collections) ||
    flow.options?.collection ||
    '';

  const detectedKeys = normalizedTrigger.keys ||
    triggerBody.keys ||
    (normalizedTrigger.key ? [normalizedTrigger.key] : undefined) ||
    (triggerBody.key ? [triggerBody.key] : undefined) || ['sim_record_001'];

  if (detectedCol) {
    normalizedTrigger.collection = detectedCol;
    if (!triggerBody.collection && flow.trigger === 'manual') {
      triggerBody.collection = detectedCol;
    }
  }

  if (detectedKeys) {
    normalizedTrigger.keys = detectedKeys;
    if (!triggerBody.keys && flow.trigger === 'manual') {
      triggerBody.keys = detectedKeys;
    }
    if (!normalizedTrigger.key && Array.isArray(detectedKeys) && detectedKeys.length > 0) {
      normalizedTrigger.key = detectedKeys[0];
    }
  }

  // Only copy custom form input fields from triggerBody to normalizedTrigger (unidirectional)
  // This allows condition/filter operations or expressions to check $trigger.<customField> as shorthand
  for (const [k, v] of Object.entries(triggerBody)) {
    if (!(k in normalizedTrigger)) {
      normalizedTrigger[k] = v;
    }
  }

  normalizedTrigger.body = triggerBody;

  const defaultAccountability: Record<string, unknown> = {
    ip: '127.0.0.1',
    app: true,
    role: 'd9dd9128-193d-4ebd-a5f2-1b3f5eebd34f',
    user: 'ee9de02b-3509-4a73-8c40-db22040198f4',
    admin: true,
    roles: ['d9dd9128-193d-4ebd-a5f2-1b3f5eebd34f'],
    origin: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8057',
  };

  const accountability = options.accountability
    ? { ...defaultAccountability, ...options.accountability }
    : defaultAccountability;

  // Initialize execution context matching Directus runtime
  const context: Record<string, unknown> = {
    $trigger: normalizedTrigger,
    $last: cloneDeep(normalizedTrigger),
    $accountability: accountability,
    $env: {},
  };

  const steps: SimulationStepResult[] = [];
  const operationsMap = new Map<string, IOperation>();
  for (const op of flow.operations || []) {
    operationsMap.set(op.id, op);
  }

  // Find root operation
  let currentOp: IOperation | undefined = flow.operation
    ? operationsMap.get(flow.operation)
    : flow.operations?.[0];

  let stepCount = 0;
  let hasError = false;
  let rootErrorMessage: string | undefined;

  const summary: SimulationSummary = {
    totalStepsExecuted: 0,
    readsCount: 0,
    writesInterceptedCount: 0,
    networkCallsSuppressedCount: 0,
    emailsSuppressedCount: 0,
    subflowsSuppressedCount: 0,
    creates: [],
    updates: [],
    deletes: [],
    networkCalls: [],
    emails: [],
    subflows: [],
    errors: [],
  };

  while (currentOp && stepCount < maxSteps) {
    stepCount++;
    const stepStart = Date.now();
    const op = currentOp;
    const category = getOperationCategory(op.type);

    const stepResult: SimulationStepResult = {
      stepIndex: stepCount,
      operationId: op.id,
      operationKey: op.key,
      operationName: op.name || op.key,
      operationType: op.type,
      category,
      status: 'executed',
      inputContext: {
        last: cloneDeep(context.$last),
        trigger: cloneDeep(context.$trigger),
      },
      interpolatedOptions: {},
      outputState: null,
      durationMs: 0,
    };

    try {
      // 1. Ensure op.options is an object before interpolating
      let opOptions = op.options || {};
      if (typeof opOptions === 'string') {
        try {
          opOptions = JSON.parse(opOptions);
        } catch {
          opOptions = {};
        }
      }

      const interpolatedOptions = (interpolateValue(opOptions, context) || {}) as Record<
        string,
        unknown
      >;
      stepResult.interpolatedOptions = interpolatedOptions;

      // 2. Execute or Intercept based on operation type
      switch (op.type) {
        /* ----------------------------------------------------
           SAFE: Read Operations (Executes real queries if reader provided)
           ---------------------------------------------------- */
        case 'item-read': {
          summary.readsCount++;
          const col = resolveOperationCollection(interpolatedOptions, opOptions, context, flow);

          const rawKey =
            interpolatedOptions.key ??
            interpolatedOptions.keys ??
            (opOptions as Record<string, unknown>).key ??
            (opOptions as Record<string, unknown>).keys;

          let targetKeys = extractKeysFromOption(rawKey);

          // If no key specified in operation, but trigger provided keys and there is no query filter,
          // check if we should read trigger keys
          if (
            targetKeys.length === 0 &&
            (!interpolatedOptions.query ||
              Object.keys(interpolatedOptions.query as object).length === 0)
          ) {
            const triggerKeys =
              (context.$trigger as Record<string, unknown>)?.keys ||
              ((context.$trigger as Record<string, unknown>)?.body as Record<string, unknown>)
                ?.keys;
            if (triggerKeys) {
              targetKeys = extractKeysFromOption(triggerKeys);
            }
          }

          let readData: unknown = null;

          if (options.readerService?.readItems && col) {
            try {
              if (targetKeys.length > 0) {
                const items = await options.readerService.readItems(
                  col,
                  interpolatedOptions.query as Record<string, unknown>,
                  targetKeys,
                );
                readData = targetKeys.length === 1 ? (items[0] ?? null) : items;
              } else {
                readData = await options.readerService.readItems(
                  col,
                  interpolatedOptions.query as Record<string, unknown>,
                );
              }
            } catch {
              readData =
                targetKeys.length > 0
                  ? targetKeys.length === 1
                    ? {
                        id: targetKeys[0],
                        collection: col,
                        _simulated: true,
                        note: 'Simulated record for selected key',
                      }
                    : targetKeys.map((k) => ({
                        id: k,
                        collection: col,
                        _simulated: true,
                        note: 'Simulated record for selected key',
                      }))
                  : [
                      {
                        id: 'sim_sample_1',
                        collection: col,
                        _simulated: true,
                        note: 'Mock read record (service read failed or offline)',
                      },
                    ];
            }
          } else {
            readData =
              targetKeys.length > 0
                ? targetKeys.length === 1
                  ? {
                      id: targetKeys[0],
                      collection: col,
                      status: 'published',
                      _simulated: true,
                    }
                  : targetKeys.map((k) => ({
                      id: k,
                      collection: col,
                      status: 'published',
                      _simulated: true,
                    }))
                : [
                    {
                      id: 'sim_sample_1',
                      collection: col,
                      status: 'published',
                      _simulated: true,
                    },
                  ];
          }

          stepResult.outputState = readData;
          stepResult.status = 'executed';
          context[op.key] = readData;
          context.$last = readData;
          stepResult.branchTaken = op.resolve ? 'resolve' : 'end';
          currentOp = op.resolve ? operationsMap.get(op.resolve) : undefined;
          break;
        }

        /* ----------------------------------------------------
           MUTATION: Create Operation (INTERCEPTED)
           ---------------------------------------------------- */
        case 'item-create': {
          summary.writesInterceptedCount++;
          stepResult.status = 'intercepted';
          const col =
            resolveOperationCollection(interpolatedOptions, opOptions, context, flow) || 'unknown';
          const payload = (interpolatedOptions.payload || {}) as Record<string, unknown>;

          const simulatedRecord = {
            id: `sim_record_${Math.random().toString(36).substring(2, 9)}`,
            ...payload,
            date_created: new Date().toISOString(),
            user_created: 'sim_user_admin',
            _simulated: true,
          };

          stepResult.mutationPreview = {
            action: 'create',
            collection: col,
            after: simulatedRecord,
          };

          summary.creates.push({ collection: col, payload });

          stepResult.outputState = simulatedRecord;
          context[op.key] = simulatedRecord;
          context.$last = simulatedRecord;
          stepResult.branchTaken = op.resolve ? 'resolve' : 'end';
          currentOp = op.resolve ? operationsMap.get(op.resolve) : undefined;
          break;
        }

        /* ----------------------------------------------------
           MUTATION: Update Operation (INTERCEPTED with Diff)
           ---------------------------------------------------- */
        case 'item-update': {
          summary.writesInterceptedCount++;
          stepResult.status = 'intercepted';
          const col =
            resolveOperationCollection(interpolatedOptions, opOptions, context, flow) || 'unknown';
          const rawKey =
            interpolatedOptions.key ||
            (context.$trigger as Record<string, unknown>)?.key ||
            ((context.$trigger as Record<string, unknown>)?.keys as unknown[])?.[0] ||
            'sim_record_001';
          const targetKey = typeof rawKey === 'object' ? JSON.stringify(rawKey) : rawKey;
          const payload = (interpolatedOptions.payload || {}) as Record<string, unknown>;

          let beforeRecord: Record<string, unknown> = {
            id: targetKey,
            status: 'draft',
            title: 'Existing Record Prior to Simulation',
          };

          if (
            options.readerService?.readItem &&
            col &&
            (typeof targetKey === 'string' || typeof targetKey === 'number')
          ) {
            try {
              const realBefore = await options.readerService.readItem(col, targetKey);
              if (realBefore) beforeRecord = realBefore;
            } catch {
              // fallback to simulated before
            }
          }

          const afterRecord = {
            ...beforeRecord,
            ...payload,
            date_updated: new Date().toISOString(),
            user_updated: 'sim_user_admin',
            _simulated: true,
          };

          const diff = computeObjectDiff(beforeRecord, afterRecord);

          stepResult.mutationPreview = {
            action: 'update',
            collection: col,
            key: targetKey,
            before: beforeRecord,
            after: afterRecord,
            diff,
          };

          summary.updates.push({
            collection: col,
            key: targetKey,
            before: beforeRecord,
            after: afterRecord,
            diff,
          });

          stepResult.outputState = afterRecord;
          context[op.key] = afterRecord;
          context.$last = afterRecord;
          stepResult.branchTaken = op.resolve ? 'resolve' : 'end';
          currentOp = op.resolve ? operationsMap.get(op.resolve) : undefined;
          break;
        }

        /* ----------------------------------------------------
           MUTATION: Delete Operation (INTERCEPTED)
           ---------------------------------------------------- */
        case 'item-delete': {
          summary.writesInterceptedCount++;
          stepResult.status = 'intercepted';
          const col =
            resolveOperationCollection(interpolatedOptions, opOptions, context, flow) || 'unknown';
          const rawKey =
            interpolatedOptions.key ||
            (context.$trigger as Record<string, unknown>)?.key ||
            ((context.$trigger as Record<string, unknown>)?.keys as unknown[])?.[0] ||
            'sim_record_001';
          const targetKey = typeof rawKey === 'object' ? JSON.stringify(rawKey) : rawKey;

          let beforeRecord: Record<string, unknown> = {
            id: targetKey,
            status: 'archived',
            _simulated: true,
          };

          if (
            options.readerService?.readItem &&
            col &&
            (typeof targetKey === 'string' || typeof targetKey === 'number')
          ) {
            try {
              const realBefore = await options.readerService.readItem(col, targetKey);
              if (realBefore) beforeRecord = realBefore;
            } catch {
              // fallback
            }
          }

          stepResult.mutationPreview = {
            action: 'delete',
            collection: col,
            key: targetKey,
            before: beforeRecord,
          };

          summary.deletes.push({
            collection: col,
            key: targetKey,
            record: beforeRecord,
          });

          const deleteOutput = { success: true, deleted: targetKey, _simulated: true };
          stepResult.outputState = deleteOutput;
          context[op.key] = deleteOutput;
          context.$last = deleteOutput;
          stepResult.branchTaken = op.resolve ? 'resolve' : 'end';
          currentOp = op.resolve ? operationsMap.get(op.resolve) : undefined;
          break;
        }

        /* ----------------------------------------------------
           NETWORK: Request / Webhook (SUPPRESSED & MOCKED)
           ---------------------------------------------------- */
        case 'request': {
          summary.networkCallsSuppressedCount++;
          stepResult.status = 'intercepted';

          const url = String(interpolatedOptions.url || '');
          const method = String(interpolatedOptions.method || 'GET').toUpperCase();
          const headers = interpolatedOptions.headers as Record<string, unknown> | undefined;
          const body = interpolatedOptions.body;

          const customMock = options.mockResponses?.[op.key];
          const mockResponse = customMock || {
            status: 200,
            statusText: 'OK (Sandbox Simulated)',
            data: {
              success: true,
              simulated: true,
              timestamp: new Date().toISOString(),
            },
          };

          stepResult.networkCallPreview = {
            url,
            method,
            headers,
            body,
            mockResponse,
          };

          summary.networkCalls.push({
            key: op.key,
            name: op.name || op.key,
            url,
            method,
            body,
          });

          stepResult.outputState = mockResponse;
          context[op.key] = mockResponse;
          context.$last = mockResponse;
          stepResult.branchTaken = op.resolve ? 'resolve' : 'end';
          currentOp = op.resolve ? operationsMap.get(op.resolve) : undefined;
          break;
        }

        /* ----------------------------------------------------
           NETWORK: Mail Dispatch (SUPPRESSED)
           ---------------------------------------------------- */
        case 'mail': {
          summary.emailsSuppressedCount++;
          stepResult.status = 'intercepted';
          const to = interpolatedOptions.to;
          const subject = interpolatedOptions.subject;
          const body = interpolatedOptions.body || interpolatedOptions.template;

          stepResult.emailPreview = { to, subject, body };
          summary.emails.push({
            key: op.key,
            name: op.name || op.key,
            to,
            subject,
            body,
          });

          const mailOutput = { success: true, delivered: false, simulated: true };
          stepResult.outputState = mailOutput;
          context[op.key] = mailOutput;
          context.$last = mailOutput;
          stepResult.branchTaken = op.resolve ? 'resolve' : 'end';
          currentOp = op.resolve ? operationsMap.get(op.resolve) : undefined;
          break;
        }

        /* ----------------------------------------------------
           NETWORK: Sub-Flow Trigger (SUPPRESSED)
           ---------------------------------------------------- */
        case 'trigger-flow': {
          summary.subflowsSuppressedCount++;
          stepResult.status = 'intercepted';
          const targetFlow = interpolatedOptions.flow;
          const payload = interpolatedOptions.payload;

          stepResult.subflowPreview = { flowId: targetFlow, payload };
          summary.subflows.push({
            key: op.key,
            name: op.name || op.key,
            flowId: targetFlow,
            payload,
          });

          const subflowOutput = {
            success: true,
            flow: targetFlow,
            simulated: true,
            note: 'Subflow execution paused in sandbox mode to prevent cascade loops',
          };
          stepResult.outputState = subflowOutput;
          context[op.key] = subflowOutput;
          context.$last = subflowOutput;
          stepResult.branchTaken = op.resolve ? 'resolve' : 'end';
          currentOp = op.resolve ? operationsMap.get(op.resolve) : undefined;
          break;
        }

        /* ----------------------------------------------------
           LOGIC: Condition Branching
           ---------------------------------------------------- */
        case 'condition': {
          let conditionPass = false;

          let rawFilter: unknown =
            interpolatedOptions.filter ?? (opOptions as Record<string, unknown>).filter;
          if (typeof rawFilter === 'string') {
            try {
              rawFilter = JSON.parse(rawFilter);
            } catch {
              // ignore
            }
          }

          // If no outer `filter` property, op.options or interpolatedOptions itself might be the filter object
          if (!rawFilter || typeof rawFilter !== 'object') {
            const candidate =
              interpolatedOptions && Object.keys(interpolatedOptions).length > 0
                ? interpolatedOptions
                : (opOptions as Record<string, unknown>);
            if (candidate && typeof candidate === 'object') {
              const keys = Object.keys(candidate);
              const looksLikeFilter = keys.some(
                (k) =>
                  k.startsWith('$') ||
                  k.startsWith('_') ||
                  typeof (candidate as Record<string, unknown>)[k] === 'object',
              );
              if (looksLikeFilter) {
                rawFilter = candidate;
              }
            }
          }

          if (rawFilter && typeof rawFilter === 'object') {
            conditionPass = evaluateDirectusFilter(rawFilter, context, context);
          } else if (interpolatedOptions.rule !== undefined) {
            conditionPass = Boolean(interpolatedOptions.rule);
          } else {
            conditionPass = Boolean(context.$last);
          }

          stepResult.conditionResult = conditionPass;
          stepResult.outputState = { conditionResult: conditionPass };
          context[op.key] = conditionPass;
          context.$last = conditionPass;

          if (conditionPass) {
            stepResult.branchTaken = op.resolve ? 'resolve' : 'end';
            currentOp = op.resolve ? operationsMap.get(op.resolve) : undefined;
          } else {
            stepResult.branchTaken = op.reject ? 'reject' : 'end';
            currentOp = op.reject ? operationsMap.get(op.reject) : undefined;
          }
          break;
        }

        /* ----------------------------------------------------
           TRANSFORM: Script Execution (Safely Sandboxed)
           ---------------------------------------------------- */
        case 'transform':
        case 'exec':
        case 'run-script': {
          const rawCode = String(
            interpolatedOptions.code ??
              (opOptions as Record<string, unknown>).code ??
              interpolatedOptions.script ??
              (opOptions as Record<string, unknown>).script ??
              '',
          );
          let transformedOutput: unknown = null;

          if (rawCode.trim()) {
            transformedOutput = await executeSandboxedScript(rawCode, context);
          } else {
            transformedOutput = context.$last;
          }

          stepResult.outputState = transformedOutput;
          context[op.key] = transformedOutput;
          context.$last = transformedOutput;
          stepResult.branchTaken = op.resolve ? 'resolve' : 'end';
          currentOp = op.resolve ? operationsMap.get(op.resolve) : undefined;
          break;
        }

        /* ----------------------------------------------------
           CONTROL: Sleep & Log
           ---------------------------------------------------- */
        case 'sleep': {
          const sleepDuration =
            interpolatedOptions.milliseconds || interpolatedOptions.seconds || 0;
          stepResult.outputState = {
            slept: true,
            simulatedDuration: `${sleepDuration}ms (Skipped in Sandbox)`,
          };
          stepResult.branchTaken = op.resolve ? 'resolve' : 'end';
          currentOp = op.resolve ? operationsMap.get(op.resolve) : undefined;
          break;
        }

        case 'log': {
          const message = interpolatedOptions.message;
          stepResult.outputState = { loggedMessage: message };
          stepResult.branchTaken = op.resolve ? 'resolve' : 'end';
          currentOp = op.resolve ? operationsMap.get(op.resolve) : undefined;
          break;
        }

        default: {
          stepResult.outputState = { note: `Generic simulation for operation type ${op.type}` };
          stepResult.branchTaken = op.resolve ? 'resolve' : 'end';
          currentOp = op.resolve ? operationsMap.get(op.resolve) : undefined;
          break;
        }
      }
    } catch (stepErr) {
      hasError = true;
      const errorMsg = stepErr instanceof Error ? stepErr.message : String(stepErr);
      stepResult.status = 'failed';
      stepResult.error = errorMsg;
      stepResult.branchTaken = op.reject ? 'reject' : 'end';
      summary.errors.push({
        stepKey: op.key,
        stepName: op.name || op.key,
        error: errorMsg,
      });

      // Follow reject path if defined, otherwise stop
      currentOp = op.reject ? operationsMap.get(op.reject) : undefined;
      if (!currentOp) {
        rootErrorMessage = errorMsg;
      }
    } finally {
      stepResult.durationMs = Date.now() - stepStart;
      steps.push(stepResult);
    }
  }

  summary.totalStepsExecuted = steps.length;
  const totalDuration = Date.now() - startTime;

  return {
    flowId: flow.id,
    flowName: flow.name,
    success: !hasError || summary.errors.length === 0,
    durationMs: totalDuration,
    steps,
    summary,
    finalOutput: context.$last,
    error: rootErrorMessage,
  };
}

/* ==========================================================================
   6. Comprehensive Directus Rule Evaluator
   ========================================================================== */

function isEqualLoose(val1: unknown, val2: unknown): boolean {
  if (isEqual(val1, val2)) return true;
  if (val1 === null || val1 === undefined || val2 === null || val2 === undefined) return false;
  if (typeof val1 === 'boolean' || typeof val2 === 'boolean') return val1 === val2;
  if (
    (typeof val1 === 'number' || typeof val1 === 'string') &&
    (typeof val2 === 'number' || typeof val2 === 'string')
  ) {
    return String(val1) === String(val2);
  }
  return false;
}

export function evaluateDirectusOperator(
  operator: string,
  value: unknown,
  targetVal: unknown,
): boolean {
  switch (operator) {
    case '_eq':
      return isEqualLoose(value, targetVal);

    case '_neq':
      return !isEqualLoose(value, targetVal);

    case '_contains': {
      if (Array.isArray(value)) {
        return value.some((item) => isEqualLoose(item, targetVal));
      }
      return String(value ?? '').includes(String(targetVal ?? ''));
    }

    case '_ncontains': {
      if (Array.isArray(value)) {
        return !value.some((item) => isEqualLoose(item, targetVal));
      }
      return !String(value ?? '').includes(String(targetVal ?? ''));
    }

    case '_icontains': {
      if (Array.isArray(value)) {
        const lowerTarget = String(targetVal ?? '').toLowerCase();
        return value.some((item) =>
          String(item ?? '')
            .toLowerCase()
            .includes(lowerTarget),
        );
      }
      return String(value ?? '')
        .toLowerCase()
        .includes(String(targetVal ?? '').toLowerCase());
    }

    case '_starts_with':
      return String(value ?? '').startsWith(String(targetVal ?? ''));

    case '_nstarts_with':
      return !String(value ?? '').startsWith(String(targetVal ?? ''));

    case '_istarts_with':
      return String(value ?? '')
        .toLowerCase()
        .startsWith(String(targetVal ?? '').toLowerCase());

    case '_nistarts_with':
      return !String(value ?? '')
        .toLowerCase()
        .startsWith(String(targetVal ?? '').toLowerCase());

    case '_ends_with':
      return String(value ?? '').endsWith(String(targetVal ?? ''));

    case '_nends_with':
      return !String(value ?? '').endsWith(String(targetVal ?? ''));

    case '_iends_with':
      return String(value ?? '')
        .toLowerCase()
        .endsWith(String(targetVal ?? '').toLowerCase());

    case '_niends_with':
      return !String(value ?? '')
        .toLowerCase()
        .endsWith(String(targetVal ?? '').toLowerCase());

    case '_in': {
      if (Array.isArray(targetVal)) {
        return targetVal.some((t) => isEqualLoose(value, t));
      }
      if (Array.isArray(value)) {
        return value.some((v) => isEqualLoose(v, targetVal));
      }
      return isEqualLoose(value, targetVal);
    }

    case '_nin':
      return !evaluateDirectusOperator('_in', value, targetVal);

    case '_gt': {
      const numVal = Number(value);
      const numTarget = Number(targetVal);
      if (!Number.isNaN(numVal) && !Number.isNaN(numTarget)) {
        return numVal > numTarget;
      }
      const dateVal = new Date(String(value)).getTime();
      const dateTarget = new Date(String(targetVal)).getTime();
      if (!Number.isNaN(dateVal) && !Number.isNaN(dateTarget)) {
        return dateVal > dateTarget;
      }
      return false;
    }

    case '_gte': {
      const numVal = Number(value);
      const numTarget = Number(targetVal);
      if (!Number.isNaN(numVal) && !Number.isNaN(numTarget)) {
        return numVal >= numTarget;
      }
      const dateVal = new Date(String(value)).getTime();
      const dateTarget = new Date(String(targetVal)).getTime();
      if (!Number.isNaN(dateVal) && !Number.isNaN(dateTarget)) {
        return dateVal >= dateTarget;
      }
      return false;
    }

    case '_lt': {
      const numVal = Number(value);
      const numTarget = Number(targetVal);
      if (!Number.isNaN(numVal) && !Number.isNaN(numTarget)) {
        return numVal < numTarget;
      }
      const dateVal = new Date(String(value)).getTime();
      const dateTarget = new Date(String(targetVal)).getTime();
      if (!Number.isNaN(dateVal) && !Number.isNaN(dateTarget)) {
        return dateVal < dateTarget;
      }
      return false;
    }

    case '_lte': {
      const numVal = Number(value);
      const numTarget = Number(targetVal);
      if (!Number.isNaN(numVal) && !Number.isNaN(numTarget)) {
        return numVal <= numTarget;
      }
      const dateVal = new Date(String(value)).getTime();
      const dateTarget = new Date(String(targetVal)).getTime();
      if (!Number.isNaN(dateVal) && !Number.isNaN(dateTarget)) {
        return dateVal <= dateTarget;
      }
      return false;
    }

    case '_null': {
      const wantNull = targetVal !== false;
      const isNull = value === null || value === undefined;
      return wantNull ? isNull : !isNull;
    }

    case '_nnull': {
      const wantNotNull = targetVal !== false;
      const isNotNull = value !== null && value !== undefined;
      return wantNotNull ? isNotNull : !isNotNull;
    }

    case '_empty': {
      const wantEmpty = targetVal !== false;
      const isEmpty = value === '' || (Array.isArray(value) && value.length === 0);
      return wantEmpty ? isEmpty : !isEmpty;
    }

    case '_nempty': {
      const wantNotEmpty = targetVal !== false;
      const isNotEmpty = value !== '' && (!Array.isArray(value) || value.length > 0);
      return wantNotEmpty ? isNotEmpty : !isNotEmpty;
    }

    case '_between': {
      if (Array.isArray(targetVal) && targetVal.length === 2) {
        const numVal = Number(value);
        const min = Number(targetVal[0]);
        const max = Number(targetVal[1]);
        if (!Number.isNaN(numVal) && !Number.isNaN(min) && !Number.isNaN(max)) {
          return numVal >= min && numVal <= max;
        }
      }
      return false;
    }

    case '_nbetween':
      return !evaluateDirectusOperator('_between', value, targetVal);

    default:
      return true;
  }
}

export function evaluateDirectusFilter(
  filter: unknown,
  targetData: unknown,
  rootContext?: Record<string, unknown>,
): boolean {
  if (!filter || typeof filter !== 'object') return true;
  const filterObj = filter as Record<string, unknown>;

  // Logical operators at top level
  if (Array.isArray(filterObj._and)) {
    if (filterObj._and.length === 0) return true;
    return filterObj._and.every((sub) => evaluateDirectusFilter(sub, targetData, rootContext));
  }
  if (Array.isArray(filterObj._or)) {
    if (filterObj._or.length === 0) return true;
    return filterObj._or.some((sub) => evaluateDirectusFilter(sub, targetData, rootContext));
  }

  for (const [key, rule] of Object.entries(filterObj)) {
    if (key === '_and' && Array.isArray(rule)) {
      if (!rule.every((sub) => evaluateDirectusFilter(sub, targetData, rootContext))) return false;
      continue;
    }
    if (key === '_or' && Array.isArray(rule)) {
      if (!rule.some((sub) => evaluateDirectusFilter(sub, targetData, rootContext))) return false;
      continue;
    }

    // Resolve value for this field or path
    let value: unknown = undefined;

    if (key.includes('.')) {
      value = get(targetData, key);
      if (value === undefined && rootContext) {
        value = resolveContextPath(rootContext, key);
      }
    } else if (targetData && typeof targetData === 'object') {
      value = (targetData as Record<string, unknown>)[key];

      // If data is $trigger and key not found directly, check body / payload
      if (value === undefined) {
        const targetRecord = targetData as Record<string, unknown>;
        if (targetRecord.body && typeof targetRecord.body === 'object') {
          value = (targetRecord.body as Record<string, unknown>)[key];
        }
        if (
          value === undefined &&
          targetRecord.payload &&
          typeof targetRecord.payload === 'object'
        ) {
          value = (targetRecord.payload as Record<string, unknown>)[key];
        }
      }
    }

    // If targetData is root context and field wasn't found at root, check $last and $trigger
    if (value === undefined && rootContext && targetData === rootContext) {
      if (rootContext.$last && typeof rootContext.$last === 'object') {
        value = (rootContext.$last as Record<string, unknown>)[key];
      }
      if (value === undefined && rootContext.$trigger && typeof rootContext.$trigger === 'object') {
        const trg = rootContext.$trigger as Record<string, unknown>;
        value = trg[key];
        if (value === undefined && trg.body && typeof trg.body === 'object') {
          value = (trg.body as Record<string, unknown>)[key];
        }
        if (value === undefined && trg.payload && typeof trg.payload === 'object') {
          value = (trg.payload as Record<string, unknown>)[key];
        }
      }
    }

    // Evaluate rule against resolved value
    if (rule && typeof rule === 'object' && !Array.isArray(rule)) {
      const ruleObj = rule as Record<string, unknown>;
      const ruleKeys = Object.keys(ruleObj);
      const isOperatorBlock = ruleKeys.length > 0 && ruleKeys.some((k) => k.startsWith('_'));

      if (isOperatorBlock) {
        for (const [op, targetVal] of Object.entries(ruleObj)) {
          if (op === '_and' && Array.isArray(targetVal)) {
            if (!targetVal.every((sub) => evaluateDirectusFilter(sub, value, rootContext))) {
              return false;
            }
          } else if (op === '_or' && Array.isArray(targetVal)) {
            if (!targetVal.some((sub) => evaluateDirectusFilter(sub, value, rootContext))) {
              return false;
            }
          } else {
            const pass = evaluateDirectusOperator(op, value, targetVal);
            if (!pass) return false;
          }
        }
      } else {
        // Nested field filter (e.g. { category: { _eq: "Example" } })
        const pass = evaluateDirectusFilter(ruleObj, value, rootContext);
        if (!pass) return false;
      }
    } else {
      // Primitive shorthand: { category: "Example" }
      const pass = evaluateDirectusOperator('_eq', value, rule);
      if (!pass) return false;
    }
  }

  return true;
}

/* ==========================================================================
   7. Sandboxed Script Runner (Run Script / Transform / Exec)
   ========================================================================== */

/**
 * Safely executes Run Script / Transform / Exec operations within a sandboxed context,
 * replicating Directus isolated execution environment with module.exports, async resolution,
 * and context data injection.
 */
export async function executeSandboxedScript(
  code: string,
  contextData: Record<string, unknown>,
  timeoutMs = 5000,
): Promise<unknown> {
  const trimmed = code.trim();
  if (!trimmed) return contextData.$last;

  const moduleObj: { exports: unknown } = { exports: null };
  const exportsObj: Record<string, unknown> = {};
  moduleObj.exports = exportsObj;

  const mockConsole = {
    log: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    trace: () => {},
  };

  const processObj = {
    env: (contextData.$env as Record<string, unknown>) || {},
  };

  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

    const executionPromise = (async () => {
      // 1. CommonJS style: module.exports = async function(data) { ... }
      if (trimmed.includes('module.exports') || trimmed.includes('exports.')) {
        const runner = new AsyncFunction(
          'data',
          'module',
          'exports',
          'console',
          'process',
          `"use strict";
           ${trimmed};
           if (typeof module.exports === 'function') {
             return await module.exports(data);
           }
           return module.exports;`,
        );
        return await runner(cloneDeep(contextData), moduleObj, exportsObj, mockConsole, processObj);
      }

      // 2. Direct return or expression style
      const runner = new AsyncFunction(
        'data',
        'console',
        'process',
        `"use strict";
         ${trimmed.includes('return') ? trimmed : `return (${trimmed});`}`,
      );
      let result = await runner(cloneDeep(contextData), mockConsole, processObj);
      if (typeof result === 'function') {
        result = await result(cloneDeep(contextData));
      }
      return result;
    })();

    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Script execution timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });

    const result = await Promise.race([executionPromise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    return result;
  } catch (err) {
    if (timer) clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Script Error: ${msg}`);
  }
}
