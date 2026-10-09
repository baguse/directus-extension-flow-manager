import type { IFlow } from '../../types';

export interface FlowWithMetadata {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  description?: string;
  status: 'active' | 'inactive';
  trigger: string;
  options?: IFlow['options'];
  flow_manager_metadata?: {
    id?: string;
    flow_manager_run_counter?: number;
    flow_manager_success_counter?: number;
    flow_manager_error_counter?: number;
    flow_manager_last_run_at?: string | null;
    flow_manager_last_run_message?: string;
    flow_manager_last_run_operation?: string;
    flow_manager_category?: string;
  };
}

export interface FlowHealthStats {
  totalRuns: number;
  successRuns: number;
  errorRuns: number;
  successRate: number;
  lastRunAt: string | null;
  lastRunStatus: 'success' | 'error' | 'none';
  lastRunMessage: string;
  healthStatus: 'healthy' | 'degraded' | 'failing' | 'idle';
  flowsCount: number;
  activeFlowsCount: number;
  failingFlows: { id: string; name: string; errorCount: number; lastMessage?: string }[];
}

export interface PanelHealthProps {
  showHeader?: boolean;
  dashboard?: string;
  width?: number;
  height?: number;
  now?: Date;
  scope?: 'all' | 'single';
  flowId?: string | null;
  viewType?: 'cards' | 'donut' | 'full';
  failureThreshold?: number;
}

export interface PanelTriggerProps {
  showHeader?: boolean;
  dashboard?: string;
  width?: number;
  height?: number;
  now?: Date;
  flowId?: string | null;
  customLabel?: string;
  customIcon?: string;
  customColor?: string;
  buttonSize?: 'medium' | 'large';
  showDetails?: boolean;
}

export interface ActivityRunItem {
  id: number | string;
  flowId: string;
  flowName: string;
  flowIcon?: string;
  flowColor?: string;
  timestamp: string;
  status: 'success' | 'error' | 'running';
  durationMs?: number;
  errorMessage?: string;
  user?: string;
}

export interface PanelActivityProps {
  showHeader?: boolean;
  dashboard?: string;
  width?: number;
  height?: number;
  now?: Date;
  limit?: number;
  statusFilter?: 'all' | 'errors_only' | 'success_only';
  flowId?: string | null;
}
