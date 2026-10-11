import JSZip from 'jszip';
import type { IFlow, IFlowSnapshotData } from '../types';
import { slugify } from '../utils/string.util';

export interface ICanonicalFlowFile {
  $schema: string;
  version: string;
  flow: {
    name: string;
    icon: string | null;
    color: string | null;
    description: string | null;
    status: string;
    trigger: string;
    accountability: string;
    options: Record<string, unknown>;
    root_operation_key: string | null;
    category?: string | null;
  };
  operations: {
    key: string;
    name: string | null;
    type: string;
    position_x: number;
    position_y: number;
    options: Record<string, unknown> | null;
    resolve: string | null;
    reject: string | null;
  }[];
}

/**
 * Deeply sorts object keys alphabetically to ensure deterministic JSON representation
 * that minimizes spurious git diffs.
 */
export function sortKeysDeep<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep) as unknown as T;
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    sortedObj[key] = sortKeysDeep(obj[key]);
  }
  return sortedObj as T;
}

export function useFlowCanonical() {
  /**
   * Transforms an IFlow, IFlowSnapshotData, or JSON string into a clean, canonical JSON schema object.
   * Strips all database primary keys, internal timestamps, and runtime counters.
   */
  function buildCanonicalFlow(
    flowOrData: unknown,
    categoryName?: string | null,
  ): ICanonicalFlowFile {
    if (!flowOrData) {
      return {
        $schema: 'https://flow-manager.directus.app/schemas/flow.v1.json',
        version: '1.0',
        flow: {
          name: 'Unnamed Flow',
          icon: 'bolt',
          color: null,
          description: '',
          status: 'active',
          trigger: 'manual',
          accountability: 'all',
          options: {},
          root_operation_key: null,
          category: categoryName || null,
        },
        operations: [],
      };
    }

    let inputData: unknown = flowOrData;
    if (typeof inputData === 'string') {
      try {
        inputData = JSON.parse(inputData);
      } catch (e) {
        console.warn('Failed to parse input as JSON in buildCanonicalFlow:', e);
        inputData = {};
      }
    }

    let snapshotData: IFlowSnapshotData;

    const rawObj =
      inputData && typeof inputData === 'object' ? (inputData as Record<string, unknown>) : null;

    // Detect if inputData is already a snapshot or canonical structure (has nested flow object)
    if (rawObj && rawObj.flow && typeof rawObj.flow === 'object') {
      const flowObj = rawObj.flow as Record<string, unknown>;
      const ops = Array.isArray(rawObj.operations)
        ? (rawObj.operations as Record<string, unknown>[])
        : [];
      const rootKey =
        (rawObj.rootOperationKey as string | null | undefined) ||
        (flowObj.root_operation_key as string | null | undefined) ||
        (flowObj.rootOperationKey as string | null | undefined) ||
        null;
      const cat =
        categoryName ??
        ((rawObj.category as string | null | undefined) ||
          (flowObj.category as string | null | undefined) ||
          null);

      snapshotData = {
        flow: {
          name: String(flowObj.name || ''),
          icon: String(flowObj.icon || 'bolt'),
          color:
            flowObj.color &&
            flowObj.color !== 'var(--theme--primary)' &&
            flowObj.color !== 'var(--theme-primary)'
              ? String(flowObj.color)
              : null,
          description: String(flowObj.description || ''),
          status: String(flowObj.status || 'active'),
          trigger: String(flowObj.trigger || 'manual'),
          accountability: String(flowObj.accountability || 'all'),
          options:
            flowObj.options && typeof flowObj.options === 'object'
              ? (JSON.parse(JSON.stringify(flowObj.options)) as Record<string, unknown>)
              : {},
        },
        operations: ops.map((op) => ({
          key: String(op.key || ''),
          name: (op.name as string | null | undefined) ?? null,
          type: String(op.type || ''),
          position_x: Number(op.position_x || 0),
          position_y: Number(op.position_y || 0),
          options:
            op.options && typeof op.options === 'object'
              ? (JSON.parse(JSON.stringify(op.options)) as Record<string, unknown>)
              : null,
          resolve:
            typeof op.resolve === 'string'
              ? op.resolve
              : op.resolve && typeof op.resolve === 'object'
                ? String((op.resolve as Record<string, unknown>).key || '') || null
                : null,
          reject:
            typeof op.reject === 'string'
              ? op.reject
              : op.reject && typeof op.reject === 'object'
                ? String((op.reject as Record<string, unknown>).key || '') || null
                : null,
        })),
        rootOperationKey: rootKey,
        category: cat,
      };
    } else {
      // It is a live Directus IFlow object
      const flow = (inputData || {}) as IFlow;
      const ops = Array.isArray(flow.operations) ? flow.operations : [];
      const idToKeyMap = new Map<string, string>();
      for (const op of ops) {
        if (op?.id && op?.key) {
          idToKeyMap.set(String(op.id), String(op.key));
        }
      }

      const rawFlowOp = flow.operation as unknown;
      const rootOpId =
        rawFlowOp && typeof rawFlowOp === 'object'
          ? (rawFlowOp as Record<string, unknown>).id
          : rawFlowOp;
      const rootKey = rootOpId ? idToKeyMap.get(String(rootOpId)) || String(rootOpId) : null;

      snapshotData = {
        flow: {
          name: flow.name || '',
          icon: flow.icon || 'bolt',
          color:
            flow.color &&
            flow.color !== 'var(--theme--primary)' &&
            flow.color !== 'var(--theme-primary)'
              ? flow.color
              : null,
          description: flow.description || '',
          status: flow.status || 'active',
          trigger: flow.trigger || 'manual',
          accountability: flow.accountability || 'all',
          options:
            flow.options && typeof flow.options === 'object'
              ? (JSON.parse(JSON.stringify(flow.options)) as Record<string, unknown>)
              : {},
        },
        operations: ops.map((op) => {
          const rawResolve = op.resolve as unknown;
          const rawReject = op.reject as unknown;
          const resolveId =
            rawResolve && typeof rawResolve === 'object'
              ? (rawResolve as Record<string, unknown>).id
              : rawResolve;
          const rejectId =
            rawReject && typeof rawReject === 'object'
              ? (rawReject as Record<string, unknown>).id
              : rawReject;
          return {
            key: String(op.key || ''),
            name: op.name ?? null,
            type: op.type || '',
            position_x: Number(op.position_x || 0),
            position_y: Number(op.position_y || 0),
            options:
              op.options && typeof op.options === 'object'
                ? (JSON.parse(JSON.stringify(op.options)) as Record<string, unknown>)
                : null,
            resolve: resolveId ? idToKeyMap.get(String(resolveId)) || String(resolveId) : null,
            reject: rejectId ? idToKeyMap.get(String(rejectId)) || String(rejectId) : null,
          };
        }),
        rootOperationKey: rootKey,
        category: categoryName ?? flow.flow_manager_metadata_id?.flow_manager_category ?? null,
      };
    }

    // Sort operations alphabetically by key for deterministic git diffs
    const sortedOps = [...(snapshotData.operations || [])]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((op) => ({
        key: op.key,
        name: op.name ?? null,
        type: op.type,
        position_x: op.position_x,
        position_y: op.position_y,
        options: op.options ?? null,
        resolve: op.resolve ?? null,
        reject: op.reject ?? null,
      }));

    const canonical: ICanonicalFlowFile = {
      $schema: 'https://flow-manager.directus.app/schemas/flow.v1.json',
      version: '1.0',
      flow: {
        name: snapshotData.flow?.name ?? '',
        icon: snapshotData.flow?.icon ?? 'bolt',
        color:
          snapshotData.flow?.color &&
          snapshotData.flow.color !== 'var(--theme--primary)' &&
          snapshotData.flow.color !== 'var(--theme-primary)'
            ? snapshotData.flow.color
            : null,
        description: snapshotData.flow?.description ?? '',
        status: snapshotData.flow?.status ?? 'active',
        trigger: snapshotData.flow?.trigger ?? 'manual',
        accountability: snapshotData.flow?.accountability ?? 'all',
        options: snapshotData.flow?.options ?? {},
        root_operation_key: snapshotData.rootOperationKey ?? null,
        category: categoryName ?? snapshotData.category ?? null,
      },
      operations: sortedOps,
    };

    return sortKeysDeep(canonical);
  }

  /**
   * Produces formatted, deterministically indented JSON string with trailing newline.
   */
  function toCanonicalJson(flowOrData: unknown, categoryName?: string | null): string {
    const canonical = buildCanonicalFlow(flowOrData, categoryName);
    return JSON.stringify(canonical, null, 2) + '\n';
  }

  /**
   * Triggers a browser download of a given blob or string content.
   * Handles modal dialog focus traps, multi-process URL revocation, and event propagation safely.
   */
  function downloadBlob(blobOrContent: Blob | string, filename: string) {
    try {
      const blob =
        typeof blobOrContent === 'string'
          ? new Blob([blobOrContent], { type: 'application/json' })
          : blobOrContent;

      const fileObj = window.URL.createObjectURL(blob);
      const docUrl = document.createElement('a');
      docUrl.href = fileObj;
      docUrl.setAttribute('download', filename);

      // Prevent click from bubbling up to modal overlays or close handlers
      docUrl.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      // When a Directus <v-dialog> is active, focus-trap intercepts and cancels clicks on elements outside the dialog.
      // Appending docUrl inside the active dialog container ensures focus-trap treats it as an internal action.
      const targetParent =
        (document.activeElement && document.activeElement !== document.body
          ? document.activeElement.parentElement || document.activeElement
          : null) ||
        document.querySelector('#dialog-outlet') ||
        document.body;

      targetParent.appendChild(docUrl);
      docUrl.click();
      targetParent.removeChild(docUrl);

      // Defer revocation slightly so Firefox multi-process / Snap has opened the blob stream
      setTimeout(() => {
        window.URL.revokeObjectURL(fileObj);
      }, 2000);
    } catch (err) {
      console.error('Failed to trigger download:', err);
    }
  }

  /**
   * Exports a single flow as a Git-friendly `<slug>.flow.json` file.
   */
  function exportFlowAsGitJson(flow: IFlow, categoryName?: string | null) {
    try {
      const jsonStr = toCanonicalJson(flow, categoryName);
      const filename = `${slugify(flow?.name || 'flow')}.flow.json`;
      downloadBlob(jsonStr, filename);
    } catch (err) {
      console.error('Failed to export flow as git JSON:', err);
    }
  }

  /**
   * Exports multiple flows into a structured Git-ready repository ZIP bundle.
   */
  async function exportAllFlowsAsGitZip(
    flows: IFlow[],
    categoriesMap?: Map<string, string>,
  ): Promise<void> {
    const zip = new JSZip();

    // Add README documentation
    const readmeContent = `# Directus Flow Manager — Git Repository Schema Export

This repository bundle contains canonical, portable schema definitions for Directus Flows.
Generated automatically by Directus Flow Manager Extension.

## Structure
\`\`\`
flows/
  <category>/
    <flow-name>.flow.json
\`\`\`

## Features
- **Git Friendly**: Sorted keys, deterministic format, zero primary key / runtime churn.
- **CI/CD Ready**: Can be inspected, reviewed via pull requests, or imported into Directus instances.
`;
    zip.file('README.md', readmeContent);

    // Iterate through flows and organize by category folder
    const flowsFolder = zip.folder('flows');

    for (const flow of flows) {
      const rawCatId = flow.flow_manager_metadata_id?.flow_manager_category;
      const catName =
        rawCatId && categoriesMap?.has(rawCatId) ? categoriesMap.get(rawCatId)! : 'uncategorized';

      const catFolderSlug = slugify(catName);
      const flowFileSlug = slugify(flow.name);
      const jsonContent = toCanonicalJson(flow, catName);

      flowsFolder?.folder(catFolderSlug)?.file(`${flowFileSlug}.flow.json`, jsonContent);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipFilename = `directus-flows-git-bundle-${new Date().toISOString().slice(0, 10)}.zip`;
    downloadBlob(zipBlob, zipFilename);
  }

  return {
    buildCanonicalFlow,
    toCanonicalJson,
    downloadBlob,
    exportFlowAsGitJson,
    exportAllFlowsAsGitZip,
  };
}
