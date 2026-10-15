/**
 * High-performance line and word diff generator for Raw JSON comparison.
 * Implements Myers diff algorithm with prefix/suffix trimming and aligned side-by-side / unified formatting.
 */

export type DiffType = 'unchanged' | 'added' | 'removed' | 'empty';

export interface DiffWordPart {
  text: string;
  changed: boolean;
}

export interface DiffLineItem {
  type: DiffType;
  text: string;
  lineNum?: number;
  wordParts?: DiffWordPart[];
}

export interface SideBySideRow {
  rowIndex: number;
  isDiff: boolean;
  diffIndex?: number;
  left: DiffLineItem;
  right: DiffLineItem;
}

export interface UnifiedRow {
  rowIndex: number;
  isDiff: boolean;
  diffIndex?: number;
  type: 'unchanged' | 'added' | 'removed';
  leftLineNum?: number;
  rightLineNum?: number;
  text: string;
  wordParts?: DiffWordPart[];
}

export interface DiffStats {
  addedLines: number;
  removedLines: number;
  totalDiffChunks: number;
  hasChanges: boolean;
}

export interface HighlightedJsonDiff {
  sideBySideRows: SideBySideRow[];
  unifiedRows: UnifiedRow[];
  stats: DiffStats;
  diffRowIndices: number[]; // row indices for quick jumping
}

interface RawDiffItem {
  type: 'unchanged' | 'added' | 'removed';
  textA?: string;
  textB?: string;
  lineA?: number;
  lineB?: number;
}

/**
 * Computes intra-line word/character differences between two paired lines.
 */
export function computeWordDiff(
  strA: string,
  strB: string,
): { leftParts: DiffWordPart[]; rightParts: DiffWordPart[] } {
  if (strA === strB) {
    return {
      leftParts: [{ text: strA, changed: false }],
      rightParts: [{ text: strB, changed: false }],
    };
  }

  // Find common prefix
  let start = 0;
  while (start < strA.length && start < strB.length && strA[start] === strB[start]) {
    start++;
  }

  // Find common suffix
  let endA = strA.length - 1;
  let endB = strB.length - 1;
  while (endA >= start && endB >= start && strA[endA] === strB[endB]) {
    endA--;
    endB--;
  }

  const prefix = strA.slice(0, start);
  const midA = strA.slice(start, endA + 1);
  const midB = strB.slice(start, endB + 1);
  const suffix = strA.slice(endA + 1);

  const leftParts: DiffWordPart[] = [];
  if (prefix) leftParts.push({ text: prefix, changed: false });
  if (midA) leftParts.push({ text: midA, changed: true });
  if (suffix) leftParts.push({ text: suffix, changed: false });

  const rightParts: DiffWordPart[] = [];
  if (prefix) rightParts.push({ text: prefix, changed: false });
  if (midB) rightParts.push({ text: midB, changed: true });
  if (suffix) rightParts.push({ text: suffix, changed: false });

  return { leftParts, rightParts };
}

/**
 * Myers diff algorithm with middle-out graph search and path backtracking.
 */
function computeMyers(a: string[], b: string[], offset: number): RawDiffItem[] {
  const n = a.length;
  const m = b.length;
  if (n === 0) {
    return b.map((text, j) => ({ type: 'added', textB: text, lineB: offset + j + 1 }));
  }
  if (m === 0) {
    return a.map((text, i) => ({ type: 'removed', textA: text, lineA: offset + i + 1 }));
  }

  const max = n + m;
  const v: Record<number, number> = { 1: 0 };
  const trace: Record<number, number>[] = [];

  for (let d = 0; d <= max; d++) {
    trace.push({ ...v });
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v[k - 1] ?? -1) < (v[k + 1] ?? -1))) {
        x = v[k + 1] ?? 0;
      } else {
        x = (v[k - 1] ?? 0) + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[k] = x;
      if (x >= n && y >= m) {
        // Backtrack
        const result: RawDiffItem[] = [];
        let currX = n;
        let currY = m;
        for (let step = d; step > 0; step--) {
          const prevV = trace[step];
          if (!prevV) break;
          const currK = currX - currY;
          let prevK: number;
          if (
            currK === -step ||
            (currK !== step && (prevV[currK - 1] ?? -1) < (prevV[currK + 1] ?? -1))
          ) {
            prevK = currK + 1;
          } else {
            prevK = currK - 1;
          }
          const prevX = prevV[prevK] ?? 0;
          const prevY = prevX - prevK;

          while (currX > prevX && currY > prevY) {
            currX--;
            currY--;
            result.unshift({
              type: 'unchanged',
              textA: a[currX],
              textB: b[currY],
              lineA: offset + currX + 1,
              lineB: offset + currY + 1,
            });
          }
          if (currX > prevX) {
            currX--;
            result.unshift({
              type: 'removed',
              textA: a[currX],
              lineA: offset + currX + 1,
            });
          } else if (currY > prevY) {
            currY--;
            result.unshift({
              type: 'added',
              textB: b[currY],
              lineB: offset + currY + 1,
            });
          }
        }
        while (currX > 0 && currY > 0) {
          currX--;
          currY--;
          result.unshift({
            type: 'unchanged',
            textA: a[currX],
            textB: b[currY],
            lineA: offset + currX + 1,
            lineB: offset + currY + 1,
          });
        }
        return result;
      }
    }
  }
  return [];
}

/**
 * Line diffing engine that normalizes input and runs optimized Myers diff with prefix/suffix trimming.
 */
function lineDiff(aLines: string[], bLines: string[]): RawDiffItem[] {
  const n = aLines.length;
  const m = bLines.length;
  if (n === 0 && m === 0) return [];

  // Prefix trim optimization
  let start = 0;
  while (start < n && start < m && aLines[start] === bLines[start]) {
    start++;
  }

  // Suffix trim optimization
  let endA = n - 1;
  let endB = m - 1;
  while (endA >= start && endB >= start && aLines[endA] === bLines[endB]) {
    endA--;
    endB--;
  }

  const prefix: RawDiffItem[] = [];
  for (let i = 0; i < start; i++) {
    prefix.push({
      type: 'unchanged',
      textA: aLines[i],
      textB: bLines[i],
      lineA: i + 1,
      lineB: i + 1,
    });
  }

  const suffix: RawDiffItem[] = [];
  for (let i = endA + 1, j = endB + 1; i < n && j < m; i++, j++) {
    suffix.push({
      type: 'unchanged',
      textA: aLines[i],
      textB: bLines[j],
      lineA: i + 1,
      lineB: j + 1,
    });
  }

  const trimmedA = aLines.slice(start, endA + 1);
  const trimmedB = bLines.slice(start, endB + 1);
  const midDiff = computeMyers(trimmedA, trimmedB, start);

  return [...prefix, ...midDiff, ...suffix];
}

/**
 * Generates both side-by-side aligned rows and unified inline rows with word-level highlight parts.
 */
export function generateHighlightedJsonDiff(
  sourceJson?: string | null,
  targetJson?: string | null,
): HighlightedJsonDiff {
  const src = (sourceJson || '').trimEnd();
  const tgt = (targetJson || '').trimEnd();

  if (!src && !tgt) {
    return {
      sideBySideRows: [],
      unifiedRows: [],
      stats: { addedLines: 0, removedLines: 0, totalDiffChunks: 0, hasChanges: false },
      diffRowIndices: [],
    };
  }

  const aLines = src ? src.split('\n') : [];
  const bLines = tgt ? tgt.split('\n') : [];

  // Fast path: exact match
  if (src === tgt) {
    const sbs: SideBySideRow[] = aLines.map((line, i) => ({
      rowIndex: i,
      isDiff: false,
      left: { type: 'unchanged', text: line, lineNum: i + 1 },
      right: { type: 'unchanged', text: line, lineNum: i + 1 },
    }));

    const unified: UnifiedRow[] = aLines.map((line, i) => ({
      rowIndex: i,
      isDiff: false,
      type: 'unchanged',
      leftLineNum: i + 1,
      rightLineNum: i + 1,
      text: line,
    }));

    return {
      sideBySideRows: sbs,
      unifiedRows: unified,
      stats: { addedLines: 0, removedLines: 0, totalDiffChunks: 0, hasChanges: false },
      diffRowIndices: [],
    };
  }

  const rawDiff = lineDiff(aLines, bLines);

  const sideBySideRows: SideBySideRow[] = [];
  const unifiedRows: UnifiedRow[] = [];
  const diffRowIndices: number[] = [];

  let idx = 0;
  let rowIndex = 0;
  let uRowIndex = 0;
  let addedCount = 0;
  let removedCount = 0;
  let diffChunkCount = 0;

  while (idx < rawDiff.length) {
    const item = rawDiff[idx];
    if (!item) {
      idx++;
      continue;
    }

    if (item.type === 'unchanged') {
      sideBySideRows.push({
        rowIndex: rowIndex++,
        isDiff: false,
        left: { type: 'unchanged', text: item.textA ?? '', lineNum: item.lineA },
        right: { type: 'unchanged', text: item.textB ?? '', lineNum: item.lineB },
      });

      unifiedRows.push({
        rowIndex: uRowIndex++,
        isDiff: false,
        type: 'unchanged',
        leftLineNum: item.lineA,
        rightLineNum: item.lineB,
        text: item.textA ?? item.textB ?? '',
      });

      idx++;
    } else {
      // Changed block (consecutive removals and/or additions)
      const currentChunkIndex = diffChunkCount++;
      const chunkStartRow = rowIndex;
      diffRowIndices.push(chunkStartRow);

      const removed: RawDiffItem[] = [];
      const added: RawDiffItem[] = [];

      while (idx < rawDiff.length && rawDiff[idx]?.type !== 'unchanged') {
        const d = rawDiff[idx];
        if (d?.type === 'removed') {
          removed.push(d);
          removedCount++;
        } else if (d?.type === 'added') {
          added.push(d);
          addedCount++;
        }
        idx++;
      }

      // Add unified rows
      for (const rem of removed) {
        unifiedRows.push({
          rowIndex: uRowIndex++,
          isDiff: true,
          diffIndex: currentChunkIndex,
          type: 'removed',
          leftLineNum: rem.lineA,
          text: rem.textA ?? '',
          wordParts: [{ text: rem.textA ?? '', changed: true }],
        });
      }
      for (const add of added) {
        unifiedRows.push({
          rowIndex: uRowIndex++,
          isDiff: true,
          diffIndex: currentChunkIndex,
          type: 'added',
          rightLineNum: add.lineB,
          text: add.textB ?? '',
          wordParts: [{ text: add.textB ?? '', changed: true }],
        });
      }

      // Add side-by-side rows (pair removed and added lines where possible)
      const maxCount = Math.max(removed.length, added.length);
      for (let k = 0; k < maxCount; k++) {
        const rem = removed[k];
        const add = added[k];

        let leftLine: DiffLineItem;
        let rightLine: DiffLineItem;

        if (rem && add) {
          // Both lines exist at this offset -> compute intra-line word diff!
          const { leftParts, rightParts } = computeWordDiff(rem.textA ?? '', add.textB ?? '');
          leftLine = {
            type: 'removed',
            text: rem.textA ?? '',
            lineNum: rem.lineA,
            wordParts: leftParts,
          };
          rightLine = {
            type: 'added',
            text: add.textB ?? '',
            lineNum: add.lineB,
            wordParts: rightParts,
          };
        } else if (rem) {
          leftLine = {
            type: 'removed',
            text: rem.textA ?? '',
            lineNum: rem.lineA,
            wordParts: [{ text: rem.textA ?? '', changed: true }],
          };
          rightLine = {
            type: 'empty',
            text: '',
          };
        } else if (add) {
          leftLine = {
            type: 'empty',
            text: '',
          };
          rightLine = {
            type: 'added',
            text: add.textB ?? '',
            lineNum: add.lineB,
            wordParts: [{ text: add.textB ?? '', changed: true }],
          };
        } else {
          leftLine = { type: 'empty', text: '' };
          rightLine = { type: 'empty', text: '' };
        }

        sideBySideRows.push({
          rowIndex: rowIndex++,
          isDiff: true,
          diffIndex: currentChunkIndex,
          left: leftLine,
          right: rightLine,
        });
      }
    }
  }

  return {
    sideBySideRows,
    unifiedRows,
    stats: {
      addedLines: addedCount,
      removedLines: removedCount,
      totalDiffChunks: diffChunkCount,
      hasChanges: addedCount > 0 || removedCount > 0,
    },
    diffRowIndices,
  };
}
