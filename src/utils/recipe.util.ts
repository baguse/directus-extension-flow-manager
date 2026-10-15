import { generateUUID } from './common.util';
import type { IFlow, IOperation, IFlowRecipe, IRecipeFlow, IRecipeOperation } from '../types';

/**
 * Safely encodes a string to Base64 in both browser and Node/Vite environments.
 */
function toBase64(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return Buffer.from(str, 'utf-8').toString('base64');
  }
}

/**
 * Interpolates template strings of the form:
 * - {{parameters.KEY}}
 * - {{collections.KEY}}
 * - {{base64(parameters.KEY + ':' + parameters.KEY2)}}
 * - {{urlEncode(parameters.KEY)}}
 */
export function interpolateTemplateString(
  template: string,
  params: Record<string, unknown>,
  collections: Record<string, string> = {},
): string {
  if (!template || typeof template !== 'string') return template;

  // 1. Handle helper functions like {{base64(...)}} or {{urlEncode(...)}}
  let result = template.replace(/\{\{base64\((.*?)\)\}\}/g, (_match, innerExpr: string) => {
    const evaluated = evaluateConcatExpression(innerExpr, params, collections);
    return toBase64(evaluated);
  });

  result = result.replace(/\{\{urlEncode\((.*?)\)\}\}/g, (_match, innerExpr: string) => {
    const evaluated = evaluateConcatExpression(innerExpr, params, collections);
    return encodeURIComponent(evaluated);
  });

  // 2. Direct parameter substitutions {{parameters.KEY}}
  result = result.replace(/\{\{parameters\.([a-zA-Z0-9_-]+)\}\}/g, (_match, key: string) => {
    const val = params[key];
    return val !== undefined && val !== null ? String(val) : '';
  });

  // 3. Collection substitutions {{collections.KEY}}
  result = result.replace(/\{\{collections\.([a-zA-Z0-9_-]+)\}\}/g, (_match, key: string) => {
    const col = collections[key];
    return col !== undefined && col !== null ? String(col) : key;
  });

  return result;
}

/**
 * Evaluates simple concatenation expressions such as:
 * parameters.SID + ':' + parameters.TOKEN
 */
function evaluateConcatExpression(
  expr: string,
  params: Record<string, unknown>,
  collections: Record<string, string>,
): string {
  const parts = expr.split('+').map((p) => p.trim());
  let output = '';

  for (const part of parts) {
    if (
      (part.startsWith("'") && part.endsWith("'")) ||
      (part.startsWith('"') && part.endsWith('"'))
    ) {
      output += part.slice(1, -1);
    } else if (part.startsWith('parameters.')) {
      const key = part.replace('parameters.', '');
      output += String(params[key] ?? '');
    } else if (part.startsWith('collections.')) {
      const key = part.replace('collections.', '');
      output += String(collections[key] ?? key);
    } else {
      output += part;
    }
  }

  return output;
}

/**
 * Deep walks any object, array, or primitive and applies parameter interpolation.
 */
export function interpolateValue(
  value: unknown,
  params: Record<string, unknown>,
  collections: Record<string, string> = {},
): unknown {
  if (typeof value === 'string') {
    return interpolateTemplateString(value, params, collections);
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolateValue(item, params, collections));
  }
  if (value && typeof value === 'object') {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      res[k] = interpolateValue(v, params, collections);
    }
    return res;
  }
  return value;
}

export interface CompiledRecipeOutput {
  flows: {
    id: string;
    name: string;
    icon: string;
    color: string;
    status: 'active' | 'inactive';
    trigger: string;
    options: Record<string, unknown>;
    operation: string | null;
  }[];
  operations: {
    id: string;
    name: string;
    key: string;
    type: string;
    position_x: number;
    position_y: number;
    options: Record<string, unknown> | null;
    resolve: string | null;
    reject: string | null;
    flow: string;
  }[];
}

/**
 * Compiles an IFlowRecipe into fresh, ready-to-insert Directus Flow and Operation records.
 * - Generates new UUIDs for every flow and operation.
 * - Re-maps resolve and reject links accurately.
 * - Interpolates parameters and collection overrides throughout the pipeline.
 */
export function compileRecipe(
  recipe: IFlowRecipe,
  parameterValues: Record<string, unknown>,
  collectionMap: Record<string, string> = {},
): CompiledRecipeOutput {
  const resultFlows: CompiledRecipeOutput['flows'] = [];
  const resultOperations: CompiledRecipeOutput['operations'] = [];

  for (const templateFlow of recipe.flows) {
    const flowId = generateUUID();

    // Map operation keys to their new UUIDs
    const opKeyToUuidMap = new Map<string, string>();
    for (const op of templateFlow.operations) {
      opKeyToUuidMap.set(op.key, generateUUID());
    }

    const firstOp = templateFlow.operations[0];
    const rootOpId = firstOp ? opKeyToUuidMap.get(firstOp.key) || null : null;

    // Interpolate flow options
    const interpolatedFlowOptions =
      (interpolateValue(templateFlow.options || {}, parameterValues, collectionMap) as Record<
        string,
        unknown
      >) || {};

    // If trigger is event on collection, check collection mapping
    if (templateFlow.trigger === 'event') {
      const flowCollections: string[] =
        templateFlow.collections ||
        (Array.isArray(templateFlow.options?.collections)
          ? (templateFlow.options?.collections as string[])
          : []);
      if (flowCollections.length) {
        const mappedCollections = flowCollections.map(
          (colKey: string) => collectionMap[colKey] || colKey,
        );
        interpolatedFlowOptions.collections = mappedCollections;
      }
    }

    resultFlows.push({
      id: flowId,
      name: interpolateTemplateString(templateFlow.name, parameterValues, collectionMap),
      icon: templateFlow.icon || recipe.icon || 'bolt',
      color: templateFlow.color || recipe.color || '#6644ff',
      status: templateFlow.status || 'inactive',
      trigger: templateFlow.trigger || 'manual',
      options: interpolatedFlowOptions,
      operation: rootOpId,
    });

    for (let i = 0; i < templateFlow.operations.length; i++) {
      const op = templateFlow.operations[i]!;
      const newOpId = opKeyToUuidMap.get(op.key)!;

      const resolveUuid = op.resolve ? opKeyToUuidMap.get(op.resolve) || null : null;
      const rejectUuid = op.reject ? opKeyToUuidMap.get(op.reject) || null : null;

      const interpolatedOptions =
        (interpolateValue(op.options || {}, parameterValues, collectionMap) as Record<
          string,
          unknown
        >) || null;

      resultOperations.push({
        id: newOpId,
        name: interpolateTemplateString(op.name, parameterValues, collectionMap),
        key: op.key,
        type: op.type,
        position_x: op.position_x ?? 10 + i * 20,
        position_y: op.position_y ?? 10,
        options: interpolatedOptions,
        resolve: resolveUuid,
        reject: rejectUuid,
        flow: flowId,
      });
    }
  }

  return {
    flows: resultFlows,
    operations: resultOperations,
  };
}

export interface DetectedSecret {
  path: string;
  suspectedType: 'Bearer Token' | 'Basic Auth' | 'API Key' | 'Webhook Secret' | 'Private URL';
  snippet: string;
}

/**
 * Scans a flow and its operations for hardcoded sensitive credentials.
 */
export function detectSecretsInFlow(flow: IFlow): DetectedSecret[] {
  const secrets: DetectedSecret[] = [];
  const visited = new Set<string>();

  function scan(val: unknown, currentPath: string) {
    if (!val) return;
    if (typeof val === 'string') {
      // Check Bearer token
      if (/Bearer\s+[A-Za-z0-9_\-.]{16,}/i.test(val)) {
        secrets.push({
          path: currentPath,
          suspectedType: 'Bearer Token',
          snippet: val.slice(0, 30) + '…',
        });
      }
      // Check Basic auth
      else if (/Basic\s+[A-Za-z0-9+/=]{16,}/i.test(val)) {
        secrets.push({
          path: currentPath,
          suspectedType: 'Basic Auth',
          snippet: val.slice(0, 30) + '…',
        });
      }
      // Check API key patterns (e.g. sk-..., key-..., etc.)
      else if (/(?:sk-[a-zA-Z0-9]{20,}|key-[a-zA-Z0-9]{16,}|ghp_[a-zA-Z0-9]{30,})/i.test(val)) {
        secrets.push({
          path: currentPath,
          suspectedType: 'API Key',
          snippet: val.slice(0, 24) + '…',
        });
      }
      // Webhook URLs containing secrets in query string
      else if (/https?:\/\/[^\s]+\?[^\s]*(?:token|key|secret|api_key)=([^\s&]+)/i.test(val)) {
        secrets.push({
          path: currentPath,
          suspectedType: 'Webhook Secret',
          snippet: val.slice(0, 35) + '…',
        });
      }
    } else if (Array.isArray(val)) {
      val.forEach((item, index) => scan(item, `${currentPath}[${index}]`));
    } else if (typeof val === 'object') {
      const objKey = JSON.stringify(val);
      if (visited.has(objKey)) return;
      visited.add(objKey);

      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        scan(v, `${currentPath}.${k}`);
      }
    }
  }

  scan(flow.options, 'flow.options');
  if (flow.operations) {
    flow.operations.forEach((op, index) => {
      scan(op.options, `operations[${index} (${op.name || op.key})].options`);
    });
  }

  return secrets;
}

/**
 * Converts an existing IFlow into a portable IFlowRecipe.
 */
export function exportFlowAsRecipe(
  flow: IFlow,
  metadata: {
    id: string;
    name: string;
    description: string;
    category?: IFlowRecipe['category'];
    authorName?: string;
    tags?: string[];
  },
): IFlowRecipe {
  const operations: IRecipeOperation[] = (flow.operations || []).map((op: IOperation) => {
    // Map resolve and reject UUIDs to their operation keys
    const resolveOp = flow.operations?.find((o) => o.id === op.resolve);
    const rejectOp = flow.operations?.find((o) => o.id === op.reject);

    return {
      key: op.key,
      name: op.name || op.key,
      type: op.type,
      position_x: op.position_x,
      position_y: op.position_y,
      options: op.options ? JSON.parse(JSON.stringify(op.options)) : {},
      resolve: resolveOp ? resolveOp.key : null,
      reject: rejectOp ? rejectOp.key : null,
    };
  });

  const recipeFlow: IRecipeFlow = {
    name: flow.name,
    icon: flow.icon || 'bolt',
    color: flow.color || '#6644ff',
    status: 'inactive',
    trigger: flow.trigger || 'manual',
    options: flow.options ? JSON.parse(JSON.stringify(flow.options)) : {},
    operations,
  };

  return {
    $schema: 'https://flow-manager.directus.app/schemas/recipe.v1.json',
    id: metadata.id,
    name: metadata.name,
    version: '1.0.0',
    description: metadata.description,
    category: metadata.category || 'General',
    icon: flow.icon || 'bolt',
    color: flow.color || '#6644ff',
    author: {
      name: metadata.authorName || 'Directus Developer',
    },
    tags: metadata.tags || ['automation'],
    parameters: [],
    collections: [],
    flows: [recipeFlow],
  };
}
