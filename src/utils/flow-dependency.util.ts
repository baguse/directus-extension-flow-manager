import dagre from '@dagrejs/dagre';
import type { IFlow, IFolder, IOperation } from '../types';

/* ==========================================================================
   1. Dependency Graph Data Models
   ========================================================================== */

export type DependencyNodeType = 'flowNode' | 'collectionNode';

export interface DependencyNodeData {
  nodeType: 'flow' | 'collection';
  id: string;
  label: string;
  flow?: IFlow;
  collectionName?: string;
  triggerType?: string;
  status?: string;
  icon?: string;
  color?: string;
  categoryName?: string;
  writers: string[]; // Flow IDs that write to this collection
  listeners: string[]; // Flow IDs that listen to this collection
  isCycleParticipant: boolean;
  upstreamCount: number;
  downstreamCount: number;
  operationsCount?: number;
}

export interface DependencyGraphNode {
  id: string;
  type: DependencyNodeType;
  data: DependencyNodeData;
  position: { x: number; y: number };
}

export interface DependencyEdge {
  id: string;
  source: string;
  target: string;
  type: 'flow-to-flow' | 'flow-to-collection' | 'collection-to-flow';
  label: string;
  action?: string; // 'create' | 'update' | 'delete' | 'event' | 'trigger' | 'manual'
  isCycle: boolean;
  sourceFlowId?: string;
  targetFlowId?: string;
  collection?: string;
}

export interface FlowImpactSummary {
  flowId: string;
  flowName: string;
  upstreamFlows: { id: string; name: string; via: string }[];
  upstreamCollections: string[];
  downstreamFlows: { id: string; name: string; via: string }[];
  downstreamCollections: string[];
  isCycleParticipant: boolean;
  cyclePaths: string[][];
}

export interface BuildGraphOptions {
  includeCollections?: boolean;
  filterStatus?: 'all' | 'active' | 'inactive';
  filterCategory?: string;
  searchQuery?: string;
  onlyConnected?: boolean;
  direction?: 'LR' | 'TB';
  flowCategories?: IFolder[];
}

export interface DependencyGraphResult {
  nodes: DependencyGraphNode[];
  edges: DependencyEdge[];
  cycles: string[][];
  cycleNodeIds: Set<string>;
  stats: {
    totalFlows: number;
    totalCollections: number;
    totalEdges: number;
    cycleCount: number;
    isolatedFlowsCount: number;
  };
}

/* ==========================================================================
   2. Operation & Trigger Analysis Helpers
   ========================================================================== */

const WRITE_OPERATION_TYPES = new Set([
  'item-create',
  'create-data',
  'item-update',
  'update-data',
  'item-delete',
  'delete-data',
]);

const TRIGGER_FLOW_OPERATION_TYPES = new Set(['trigger-flow', 'trigger']);

function getOperationAction(type: string): string {
  if (type.includes('create')) return 'create';
  if (type.includes('update')) return 'update';
  if (type.includes('delete')) return 'delete';
  return 'mutate';
}

function extractTargetFlowId(op: IOperation): string | null {
  if (!op.options || typeof op.options !== 'object') return null;
  const opts = op.options as Record<string, unknown>;
  const candidate = opts.flow || opts.flow_id || opts.flowId || opts.target_flow;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

function extractTargetCollection(op: IOperation): string | null {
  if (!op.options || typeof op.options !== 'object') return null;
  const opts = op.options as Record<string, unknown>;
  const candidate = opts.collection;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

function extractTriggerCollections(flow: IFlow): string[] {
  if (!flow.options || typeof flow.options !== 'object') return [];
  const opts = flow.options as Record<string, unknown>;
  if (Array.isArray(opts.collections)) {
    return opts.collections.filter((c): c is string => typeof c === 'string' && c.length > 0);
  }
  if (typeof opts.collection === 'string' && opts.collection.length > 0) {
    return [opts.collection];
  }
  return [];
}

/* ==========================================================================
   3. Cycle Detection Algorithm (DFS)
   ========================================================================== */

function findCycles(adjacency: Map<string, string[]>): string[][] {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const currentPath: string[] = [];
  const cycles: string[][] = [];
  const seenCycleSignatures = new Set<string>();

  function dfs(node: string) {
    visited.add(node);
    recursionStack.add(node);
    currentPath.push(node);

    const neighbors = adjacency.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recursionStack.has(neighbor)) {
        // Cycle detected: extract path from neighbor to current
        const cycleStartIndex = currentPath.indexOf(neighbor);
        if (cycleStartIndex !== -1) {
          const cycle = currentPath.slice(cycleStartIndex).concat(neighbor);
          // Normalize cycle representation to prevent duplicates with different start offsets
          const nodeSet = [...new Set(cycle.slice(0, -1))].sort().join('->');
          if (!seenCycleSignatures.has(nodeSet)) {
            seenCycleSignatures.add(nodeSet);
            cycles.push(cycle);
          }
        }
      }
    }

    currentPath.pop();
    recursionStack.delete(node);
  }

  for (const node of adjacency.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

/* ==========================================================================
   4. Main Dependency Graph Builder
   ========================================================================== */

export function buildFlowDependencyGraph(
  flows: IFlow[],
  options: BuildGraphOptions = {},
): DependencyGraphResult {
  const {
    includeCollections = true,
    filterStatus = 'all',
    filterCategory = 'all',
    searchQuery = '',
    onlyConnected = false,
    direction = 'LR',
    flowCategories = [],
  } = options;

  const categoryMap = new Map<string, string>();
  for (const cat of flowCategories) {
    if (cat.id && cat.name) {
      categoryMap.set(cat.id, cat.name);
    }
  }
  for (const f of flows) {
    if (f.id && f.name && !categoryMap.has(f.id)) {
      categoryMap.set(f.id, f.name);
    }
  }

  const flowMap = new Map<string, IFlow>();
  for (const f of flows) {
    if (f.id) {
      flowMap.set(f.id, f);
    }
  }

  // Resolve category filter (handles folders, parent flows, and nested flows)
  let allowedCategoryFlowIds: Set<string> | null = null;
  if (filterCategory && filterCategory !== 'all') {
    allowedCategoryFlowIds = new Set<string>();

    // If filterCategory is a flow ID, include the parent flow itself
    const targetFlow = flows.find((f) => f.id === filterCategory);
    if (targetFlow) {
      allowedCategoryFlowIds.add(targetFlow.id);
    }

    // Collect all descendant flows whose category is filterCategory (or nested under it)
    const queue = [filterCategory];
    const visited = new Set<string>([filterCategory]);

    while (queue.length > 0) {
      const currentParentId = queue.shift()!;
      for (const flow of flows) {
        const cat = flow.flow_manager_metadata_id?.flow_manager_category;
        if (cat === currentParentId) {
          allowedCategoryFlowIds.add(flow.id);
          if (!visited.has(flow.id)) {
            visited.add(flow.id);
            queue.push(flow.id);
          }
        }
      }
      for (const folder of flowCategories) {
        const cat = folder.flow_manager_metadata_id?.flow_manager_category;
        if (cat === currentParentId && !visited.has(folder.id)) {
          visited.add(folder.id);
          queue.push(folder.id);
        }
      }
    }
  }

  // Pre-filter flows based on options
  const query = searchQuery.trim().toLowerCase();
  const eligibleFlows = flows.filter((flow) => {
    if (filterStatus !== 'all' && flow.status !== filterStatus) return false;
    if (allowedCategoryFlowIds && !allowedCategoryFlowIds.has(flow.id)) return false;
    if (query.length > 0) {
      const name = (flow.name || '').toLowerCase();
      const id = (flow.id || '').toLowerCase();
      const trigger = (flow.trigger || '').toLowerCase();
      if (!name.includes(query) && !id.includes(query) && !trigger.includes(query)) {
        return false;
      }
    }
    return true;
  });

  const eligibleFlowIds = new Set(eligibleFlows.map((f) => f.id));

  // Map collections: writer flow IDs & listener flow IDs
  const collectionWriters = new Map<string, Set<string>>();
  const collectionListeners = new Map<string, Set<string>>();

  // Raw edges to construct
  const rawEdges: DependencyEdge[] = [];
  const edgeDedupe = new Set<string>();

  function addEdge(edge: DependencyEdge) {
    const key = `${edge.source}->${edge.target}:${edge.type}:${edge.action || ''}`;
    if (!edgeDedupe.has(key)) {
      edgeDedupe.add(key);
      rawEdges.push(edge);
    }
  }

  // 1. Analyze every eligible flow
  for (const flow of eligibleFlows) {
    const flowNodeId = `flow:${flow.id}`;

    // A. Check Event / Manual triggers (Flow is listener of collections)
    if (flow.trigger === 'event' || flow.trigger === 'manual') {
      const collections = extractTriggerCollections(flow);
      for (const col of collections) {
        if (!collectionListeners.has(col)) {
          collectionListeners.set(col, new Set());
        }
        collectionListeners.get(col)!.add(flow.id);

        if (includeCollections) {
          const colNodeId = `col:${col}`;
          const scope = Array.isArray(flow.options?.scope)
            ? (flow.options?.scope as string[]).join(', ')
            : flow.trigger;

          addEdge({
            id: `edge:${colNodeId}->${flowNodeId}`,
            source: colNodeId,
            target: flowNodeId,
            type: 'collection-to-flow',
            label: `on ${scope}`,
            action: 'event',
            isCycle: false,
            targetFlowId: flow.id,
            collection: col,
          });
        }
      }
    }

    // B. Analyze flow operations
    const operations = Array.isArray(flow.operations) ? flow.operations : [];
    for (const op of operations) {
      // 1) Explicit Sub-flow trigger (Flow A -> Flow B)
      if (TRIGGER_FLOW_OPERATION_TYPES.has(op.type)) {
        const targetFlowId = extractTargetFlowId(op);
        if (targetFlowId && eligibleFlowIds.has(targetFlowId)) {
          const targetNodeId = `flow:${targetFlowId}`;
          addEdge({
            id: `edge:${flowNodeId}->${targetNodeId}:${op.key}`,
            source: flowNodeId,
            target: targetNodeId,
            type: 'flow-to-flow',
            label: op.name ? `Triggers: ${op.name}` : 'Triggers flow',
            action: 'trigger',
            isCycle: false,
            sourceFlowId: flow.id,
            targetFlowId,
          });
        }
      }

      // 2) Collection write operations (Flow A -> Collection X)
      if (WRITE_OPERATION_TYPES.has(op.type)) {
        const targetCol = extractTargetCollection(op);
        if (targetCol) {
          if (!collectionWriters.has(targetCol)) {
            collectionWriters.set(targetCol, new Set());
          }
          collectionWriters.get(targetCol)!.add(flow.id);

          if (includeCollections) {
            const colNodeId = `col:${targetCol}`;
            const action = getOperationAction(op.type);
            addEdge({
              id: `edge:${flowNodeId}->${colNodeId}:${action}`,
              source: flowNodeId,
              target: colNodeId,
              type: 'flow-to-collection',
              label: `${action}s`,
              action,
              isCycle: false,
              sourceFlowId: flow.id,
              collection: targetCol,
            });
          }
        }
      }
    }
  }

  // 2. If collections are not included as separate nodes, create direct flow-to-flow edges via shared collections
  if (!includeCollections) {
    for (const [col, writers] of collectionWriters.entries()) {
      const listeners = collectionListeners.get(col);
      if (listeners) {
        for (const writerId of writers) {
          for (const listenerId of listeners) {
            if (
              writerId !== listenerId &&
              eligibleFlowIds.has(writerId) &&
              eligibleFlowIds.has(listenerId)
            ) {
              addEdge({
                id: `edge:flow:${writerId}->flow:${listenerId}:via:${col}`,
                source: `flow:${writerId}`,
                target: `flow:${listenerId}`,
                type: 'flow-to-flow',
                label: `via ${col}`,
                action: 'event',
                isCycle: false,
                sourceFlowId: writerId,
                targetFlowId: listenerId,
                collection: col,
              });
            }
          }
        }
      }
    }
  }

  // 3. Build Adjacency List for Cycle Detection
  const adjacency = new Map<string, string[]>();
  for (const edge of rawEdges) {
    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, []);
    }
    adjacency.get(edge.source)!.push(edge.target);
    if (!adjacency.has(edge.target)) {
      adjacency.set(edge.target, []);
    }
  }

  // Detect Cycles
  const detectedCycles = findCycles(adjacency);
  const cycleNodeIds = new Set<string>();
  const cycleEdgePairs = new Set<string>();

  for (const cycle of detectedCycles) {
    for (let i = 0; i < cycle.length - 1; i++) {
      const from = cycle[i]!;
      const to = cycle[i + 1]!;
      cycleNodeIds.add(from);
      cycleNodeIds.add(to);
      cycleEdgePairs.add(`${from}->${to}`);
    }
  }

  // Mark cycle edges
  const edges: DependencyEdge[] = rawEdges.map((edge) => {
    const isCycle = cycleEdgePairs.has(`${edge.source}->${edge.target}`);
    return {
      ...edge,
      isCycle,
    };
  });

  // Calculate in/out degree for each node
  const upstreamCounts = new Map<string, number>();
  const downstreamCounts = new Map<string, number>();

  for (const edge of edges) {
    downstreamCounts.set(edge.source, (downstreamCounts.get(edge.source) || 0) + 1);
    upstreamCounts.set(edge.target, (upstreamCounts.get(edge.target) || 0) + 1);
  }

  // 4. Construct Nodes
  const nodes: DependencyGraphNode[] = [];

  // A. Flow Nodes
  for (const flow of eligibleFlows) {
    const nodeId = `flow:${flow.id}`;
    const up = upstreamCounts.get(nodeId) || 0;
    const down = downstreamCounts.get(nodeId) || 0;
    const isConnected = up > 0 || down > 0;

    if (onlyConnected && !isConnected) {
      continue;
    }

    const catId = flow.flow_manager_metadata_id?.flow_manager_category;
    const categoryName = catId ? categoryMap.get(catId) || catId : undefined;

    nodes.push({
      id: nodeId,
      type: 'flowNode',
      data: {
        nodeType: 'flow',
        id: flow.id,
        label: flow.name || 'Untitled Flow',
        flow,
        triggerType: flow.trigger || 'manual',
        status: flow.status || 'inactive',
        icon: flow.icon || 'bolt',
        color: flow.color || undefined,
        categoryName,
        writers: [],
        listeners: [],
        isCycleParticipant: cycleNodeIds.has(nodeId),
        upstreamCount: up,
        downstreamCount: down,
        operationsCount: Array.isArray(flow.operations) ? flow.operations.length : 0,
      },
      position: { x: 0, y: 0 },
    });
  }

  // B. Collection Nodes (only if includeCollections is true)
  if (includeCollections) {
    const allCollections = new Set([...collectionWriters.keys(), ...collectionListeners.keys()]);

    for (const col of allCollections) {
      const nodeId = `col:${col}`;
      const writers = Array.from(collectionWriters.get(col) || []).filter((id) =>
        eligibleFlowIds.has(id),
      );
      const listeners = Array.from(collectionListeners.get(col) || []).filter((id) =>
        eligibleFlowIds.has(id),
      );

      if (writers.length === 0 && listeners.length === 0) {
        continue;
      }

      const up = upstreamCounts.get(nodeId) || 0;
      const down = downstreamCounts.get(nodeId) || 0;

      nodes.push({
        id: nodeId,
        type: 'collectionNode',
        data: {
          nodeType: 'collection',
          id: col,
          label: col,
          collectionName: col,
          writers,
          listeners,
          isCycleParticipant: cycleNodeIds.has(nodeId),
          upstreamCount: up,
          downstreamCount: down,
        },
        position: { x: 0, y: 0 },
      });
    }
  }

  // Filter edges to only keep those whose source and target nodes exist in the final nodes list
  const activeNodeIds = new Set(nodes.map((n) => n.id));
  const activeEdges = edges.filter(
    (e) => activeNodeIds.has(e.source) && activeNodeIds.has(e.target),
  );

  // 5. Layout with Dagre
  const positionedNodes = layoutNodes(nodes, activeEdges, direction);

  // 6. Compute Stats
  const totalFlows = nodes.filter((n) => n.type === 'flowNode').length;
  const totalCollections = nodes.filter((n) => n.type === 'collectionNode').length;
  const isolatedFlowsCount = nodes.filter(
    (n) => n.type === 'flowNode' && n.data.upstreamCount === 0 && n.data.downstreamCount === 0,
  ).length;

  return {
    nodes: positionedNodes,
    edges: activeEdges,
    cycles: detectedCycles,
    cycleNodeIds,
    stats: {
      totalFlows,
      totalCollections,
      totalEdges: activeEdges.length,
      cycleCount: detectedCycles.length,
      isolatedFlowsCount,
    },
  };
}

/* ==========================================================================
   5. Dagre Layout Calculation
   ========================================================================== */

function layoutNodes(
  nodes: DependencyGraphNode[],
  edges: DependencyEdge[],
  direction: 'LR' | 'TB' = 'LR',
): DependencyGraphNode[] {
  if (nodes.length === 0) return [];

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 45,
    ranksep: 90,
    marginx: 50,
    marginy: 50,
  });

  for (const node of nodes) {
    const width = node.type === 'flowNode' ? 260 : 200;
    const height = node.type === 'flowNode' ? 90 : 60;
    dagreGraph.setNode(node.id, { width, height });
  }

  for (const edge of edges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }

  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const width = node.type === 'flowNode' ? 260 : 200;
    const height = node.type === 'flowNode' ? 90 : 60;

    return {
      ...node,
      position: {
        x: nodeWithPosition ? Math.round(nodeWithPosition.x - width / 2) : 0,
        y: nodeWithPosition ? Math.round(nodeWithPosition.y - height / 2) : 0,
      },
    };
  });
}

/* ==========================================================================
   6. Flow Impact Summary (Upstream Triggers & Downstream Blast Radius)
   ========================================================================== */

export function getFlowImpact(
  flowId: string,
  graph: DependencyGraphResult,
  flows: IFlow[],
): FlowImpactSummary {
  const flowMap = new Map(flows.map((f) => [f.id, f]));
  const targetNodeId = `flow:${flowId}`;
  const targetFlow = flowMap.get(flowId);

  // Upstream: nodes that lead to targetNodeId
  const upstreamFlows: { id: string; name: string; via: string }[] = [];
  const upstreamCollections = new Set<string>();

  // Downstream: nodes reachable from targetNodeId
  const downstreamFlows: { id: string; name: string; via: string }[] = [];
  const downstreamCollections = new Set<string>();

  // Direct incoming edges
  for (const edge of graph.edges) {
    if (edge.target === targetNodeId) {
      if (edge.source.startsWith('flow:')) {
        const id = edge.source.replace('flow:', '');
        const flow = flowMap.get(id);
        upstreamFlows.push({
          id,
          name: flow?.name || id,
          via: edge.label,
        });
      } else if (edge.source.startsWith('col:')) {
        const col = edge.source.replace('col:', '');
        upstreamCollections.add(col);
        // Find flows that write to this collection
        for (const writeEdge of graph.edges) {
          if (writeEdge.target === edge.source && writeEdge.source.startsWith('flow:')) {
            const writerId = writeEdge.source.replace('flow:', '');
            const writerFlow = flowMap.get(writerId);
            if (writerId !== flowId) {
              upstreamFlows.push({
                id: writerId,
                name: writerFlow?.name || writerId,
                via: `Collection: ${col} (${writeEdge.label})`,
              });
            }
          }
        }
      }
    }

    if (edge.source === targetNodeId) {
      if (edge.target.startsWith('flow:')) {
        const id = edge.target.replace('flow:', '');
        const flow = flowMap.get(id);
        downstreamFlows.push({
          id,
          name: flow?.name || id,
          via: edge.label,
        });
      } else if (edge.target.startsWith('col:')) {
        const col = edge.target.replace('col:', '');
        downstreamCollections.add(col);
        // Find flows triggered by this collection
        for (const trigEdge of graph.edges) {
          if (trigEdge.source === edge.target && trigEdge.target.startsWith('flow:')) {
            const trigFlowId = trigEdge.target.replace('flow:', '');
            const trigFlow = flowMap.get(trigFlowId);
            if (trigFlowId !== flowId) {
              downstreamFlows.push({
                id: trigFlowId,
                name: trigFlow?.name || trigFlowId,
                via: `Collection: ${col} (${trigEdge.label})`,
              });
            }
          }
        }
      }
    }
  }

  // Deduplicate flows
  const uniqueUpstream: { id: string; name: string; via: string }[] = [];
  const seenUp = new Set<string>();
  for (const item of upstreamFlows) {
    if (!seenUp.has(item.id)) {
      seenUp.add(item.id);
      uniqueUpstream.push(item);
    }
  }

  const uniqueDownstream: { id: string; name: string; via: string }[] = [];
  const seenDown = new Set<string>();
  for (const item of downstreamFlows) {
    if (!seenDown.has(item.id)) {
      seenDown.add(item.id);
      uniqueDownstream.push(item);
    }
  }

  // Cycles containing this flow
  const relevantCycles = graph.cycles.filter((c) => c.includes(targetNodeId));

  return {
    flowId,
    flowName: targetFlow?.name || flowId,
    upstreamFlows: uniqueUpstream,
    upstreamCollections: Array.from(upstreamCollections),
    downstreamFlows: uniqueDownstream,
    downstreamCollections: Array.from(downstreamCollections),
    isCycleParticipant: graph.cycleNodeIds.has(targetNodeId),
    cyclePaths: relevantCycles,
  };
}
