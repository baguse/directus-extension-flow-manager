import type { Ref } from 'vue';
import type { AppCollection, Field, Policy, Role, User } from '@directus/types';

/* ==========================================================================
   1. Flow & Operation Domain Models
   ========================================================================== */

export interface IOperationOptions extends Record<string, unknown> {
  collection?: string;
  [key: string]: unknown;
}

export interface IOperation {
  id: string;
  name: string | null;
  key: string;
  type: string;
  position_x: number;
  position_y: number;
  options: IOperationOptions | null;
  resolve: string | null;
  reject: string | null;
  flow: string;
}

export interface IPayload {
  id?: string;
  name?: string | null;
  key: string;
  type: string;
  position_x: number;
  position_y: number;
  options: IOperationOptions | null;
  resolve: IPayload | null;
  reject: IPayload | null;
  flow: string;
}

export interface IFlowOptions extends Record<string, unknown> {
  type?: string;
  scope?: string[];
  collections: string[];
  return?: string;
  requireSelection?: boolean;
  requireConfirmation?: boolean;
  confirmationDescription?: string;
  fields?: Field[];
  method?: string;
  [key: string]: unknown;
}

export interface IFlowMetadata {
  id?: string;
  flow_manager_category?: string;
  flow_manager_order?: number;
  flow_manager_run_counter?: number;
  flow_manager_last_run_at?: Date;
  flow_manager_last_run_message?: string;
  flow_manager_last_run_operation?: string;
  flow_manager_error_counter?: number;
  flow_manager_success_counter?: number;
  [key: string]: unknown;
}

export interface IFlow {
  id: string;
  type?: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  status: string;
  trigger: string;
  accountability: string;
  options: IFlowOptions;
  operation: string;
  date_created?: string;
  user_created?: string;
  operations: IOperation[];

  /**
   * @deprecated moved to flow_manager_metadata_id
   */
  flow_manager_category?: string;
  /**
   * @deprecated moved to flow_manager_metadata_id
   */
  flow_manager_order?: number;
  /**
   * @deprecated moved to flow_manager_metadata_id
   */
  flow_manager_run_counter?: number;
  /**
   * @deprecated moved to flow_manager_metadata_id
   */
  flow_manager_last_run_at?: Date;
  /**
   * @deprecated moved to flow_manager_metadata_id
   */
  flow_manager_last_run_message?: string;
  /**
   * @deprecated moved to flow_manager_metadata_id
   */
  flow_manager_last_run_operation?: string;
  /**
   * @deprecated moved to flow_manager_metadata_id
   */
  flow_manager_error_counter?: number;
  /**
   * @deprecated moved to flow_manager_metadata_id
   */
  flow_manager_success_counter?: number;

  flow_manager_metadata_id?: IFlowMetadata;
}

export interface IFolder {
  id: string;
  name: string;
  icon: string;
  type: string;
  color: string;

  /**
   * @deprecated moved to flow_manager_metadata_id
   */
  flow_manager_category?: string;
  /**
   * @deprecated moved to flow_manager_metadata_id
   */
  flow_manager_order?: number;

  flow_manager_metadata_id?: {
    id?: string;
    flow_manager_category?: string;
    flow_manager_order?: number;
  };
}

/* ==========================================================================
   2. Directus Extended Types
   ========================================================================== */

export type ExtendedPolicy = Policy & { policy: Policy };

export type ExtendedUser = User & {
  role?: (Role & { policies?: ExtendedPolicy[]; admin_access?: boolean }) | null;
  policies?: ExtendedPolicy[];
  admin_access?: boolean;
};

export type ExtendedField = Field & {
  schema?: Field['schema'] & {
    related_collection?: string;
  };
};

export interface DirectusFilter {
  _and?: Record<string, unknown>[];
  _or?: Record<string, unknown>[];
  [key: string]: unknown;
}

export interface DirectusExtensionInfo {
  name?: string;
  version?: string;
  schema?: {
    name?: string;
    type?: string;
    version?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/* ==========================================================================
   3. Store & Context Types
   ========================================================================== */

export interface CollectionsStore {
  getCollection(collection: string): AppCollection | Record<string, unknown> | null | undefined;
  allCollections?: AppCollection[];
  [key: string]: unknown;
}

export interface FieldsStore {
  getFieldsForCollection(collection: string): ExtendedField[];
  [key: string]: unknown;
}

export interface ICredential {
  id: string;
  name: string;
  staticToken: string;
  url: string;
}

export type ProcessingItem = {
  id?: string;
  status: 'success' | 'error' | 'processing' | 'skipped';
  message: string;
};

export interface IServerInfo {
  version?: string;
}

export interface Header {
  text: string;
  value: string;
  sortable: boolean;
  width: number;
}

export interface ISyncFlowCounter {
  type: 'local' | 'remote';
  url?: string;
  staticToken?: string;
}

export interface FlowManagerUtilsContext {
  duplicate: (item: IFlow, isDuplicate?: boolean) => Promise<void> | void;
  backup: (item: IFlow) => Promise<void> | void;
  pushToCloud: (item: IFlow) => Promise<void> | void;
  showPushToCloud: (item: IFlow) => Promise<void> | void;
  showDeleteItemDialog: (item: IFlow | IFolder) => Promise<void> | void;
  showRunDialog: (item: IFlow) => Promise<void> | void;
  duplicateFolder: (item: IFolder) => Promise<void> | void;
  showEditFolderDialog: (item: IFolder) => Promise<void> | void;
  parentId?: Ref<string | null> | string | null;
  onSort: (event: (IFlow | IFolder)[], parentId?: string | null) => void | Promise<void>;
  selectedItems?: Ref<string[]>;
  selectItem: (item: IFlow) => void;
  selectItemKey: (key: string, isSelected: boolean) => void;
  selectedCredential: Ref<string>;
  showRunWebhookDialog: (item: IFlow) => Promise<void> | void;
  credentials: Ref<ICredential[]>;
  setCredential: (credential: string) => void;
  createFlow: (item: Omit<IFlow, 'id'> & { id?: string }) => Promise<void>;
  reloadFlow: () => Promise<void> | void;
  reloadTabularFlow: () => Promise<void> | void;
}

/* ==========================================================================
   4. Hook & Activity Execution Types
   ========================================================================== */

export interface RevisionCreateActionData extends Record<string, unknown> {
  payload?: {
    activity?: string | number;
    item?: string;
    data?: unknown;
    [key: string]: unknown;
  };
  key?: string | number;
  collection?: string;
  [key: string]: unknown;
}

export interface FlowStepExecution {
  key: string;
  status: string;
  operation: string;
  options?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface FlowExecutionData {
  steps?: FlowStepExecution[];
  data?: {
    $last?: { message?: string } | { message?: string }[] | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ActivityHistory {
  id: number;
  type: 'success' | 'error';
  date: string;
  operation?: string;
  message?: string;
  data: {
    data: {
      $env?: Record<string, unknown>;
      $last?: unknown;
      $trigger: {
        body?: unknown;
        path?: string;
        query?: Record<string, unknown>;
        method?: string;
        headers?: Record<string, unknown>;
      };
      $accountability: {
        ip: string;
        app: boolean;
        role: string;
        user: string;
        admin: boolean;
        roles: string[];
        origin: string;
        session: string;
        userAgent: string;
      } | null;
      [key: string]: unknown;
    };
    steps: FlowStepExecution[];
    [key: string]: unknown;
  };
}
