import type { IFlowDiffResult, IFlowSnapshotData, IOperationDiffItem } from '../types';

export function useFlowDiff() {
  /**
   * Compares two snapshots (or a live flow converted to snapshot data vs a snapshot)
   * and produces a structured difference report.
   */
  function compareSnapshots(
    sourceData: IFlowSnapshotData,
    targetData: IFlowSnapshotData,
  ): IFlowDiffResult {
    // Compare Flow Metadata
    const metadataChanges: { field: string; from: unknown; to: unknown }[] = [];
    const fieldsToCompare = [
      'name',
      'icon',
      'color',
      'description',
      'status',
      'trigger',
      'accountability',
    ] as const;

    for (const field of fieldsToCompare) {
      const fromVal = sourceData.flow[field];
      const toVal = targetData.flow[field];
      if (fromVal !== toVal) {
        metadataChanges.push({ field, from: fromVal, to: toVal });
      }
    }

    if (sourceData.category !== targetData.category) {
      metadataChanges.push({
        field: 'category',
        from: sourceData.category ?? null,
        to: targetData.category ?? null,
      });
    }

    if (sourceData.rootOperationKey !== targetData.rootOperationKey) {
      metadataChanges.push({
        field: 'rootOperationKey',
        from: sourceData.rootOperationKey ?? null,
        to: targetData.rootOperationKey ?? null,
      });
    }

    // Options deep comparison
    const srcOptions = JSON.stringify(sourceData.flow.options || {});
    const tgtOptions = JSON.stringify(targetData.flow.options || {});
    if (srcOptions !== tgtOptions) {
      metadataChanges.push({
        field: 'options',
        from: sourceData.flow.options,
        to: targetData.flow.options,
      });
    }

    // Compare Operations
    const srcOpsMap = new Map(sourceData.operations.map((op) => [op.key, op]));
    const tgtOpsMap = new Map(targetData.operations.map((op) => [op.key, op]));

    const allKeys = Array.from(new Set([...srcOpsMap.keys(), ...tgtOpsMap.keys()])).sort();
    const operationsDiff: IOperationDiffItem[] = [];

    for (const key of allKeys) {
      const srcOp = srcOpsMap.get(key);
      const tgtOp = tgtOpsMap.get(key);

      if (!srcOp && tgtOp) {
        operationsDiff.push({
          key,
          name: tgtOp.name,
          type: tgtOp.type,
          changeType: 'added',
        });
      } else if (srcOp && !tgtOp) {
        operationsDiff.push({
          key,
          name: srcOp.name,
          type: srcOp.type,
          changeType: 'removed',
        });
      } else if (srcOp && tgtOp) {
        const details: { field: string; from: unknown; to: unknown }[] = [];

        if (srcOp.name !== tgtOp.name) {
          details.push({ field: 'name', from: srcOp.name, to: tgtOp.name });
        }
        if (srcOp.type !== tgtOp.type) {
          details.push({ field: 'type', from: srcOp.type, to: tgtOp.type });
        }
        if (srcOp.position_x !== tgtOp.position_x || srcOp.position_y !== tgtOp.position_y) {
          details.push({
            field: 'position',
            from: `(${srcOp.position_x}, ${srcOp.position_y})`,
            to: `(${tgtOp.position_x}, ${tgtOp.position_y})`,
          });
        }
        if (srcOp.resolve !== tgtOp.resolve) {
          details.push({ field: 'resolve', from: srcOp.resolve, to: tgtOp.resolve });
        }
        if (srcOp.reject !== tgtOp.reject) {
          details.push({ field: 'reject', from: srcOp.reject, to: tgtOp.reject });
        }

        const srcOpOpts = JSON.stringify(srcOp.options || {});
        const tgtOpOpts = JSON.stringify(tgtOp.options || {});
        if (srcOpOpts !== tgtOpOpts) {
          details.push({ field: 'options', from: srcOp.options, to: tgtOp.options });
        }

        operationsDiff.push({
          key,
          name: tgtOp.name || srcOp.name,
          type: tgtOp.type,
          changeType: details.length > 0 ? 'modified' : 'unchanged',
          details: details.length > 0 ? details : undefined,
        });
      }
    }

    const hasChanges =
      metadataChanges.length > 0 || operationsDiff.some((op) => op.changeType !== 'unchanged');

    return {
      hasChanges,
      metadataChanges,
      operationsDiff,
      rawSourceJson: JSON.stringify(sourceData, null, 2),
      rawTargetJson: JSON.stringify(targetData, null, 2),
    };
  }

  return {
    compareSnapshots,
  };
}
