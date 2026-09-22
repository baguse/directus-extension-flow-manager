import type { Field, Policy, Role, User } from "@directus/types";

export interface IOperation {
  id: string;
  name: string | null;
  key: string;
  type: string;
  position_x: number;
  position_y: number;
  options: any;
  resolve: string | null;
  reject: string | null;
  flow: string;
}

export interface IPayload {
  id?: string;
  name: string;
  key: string;
  type: string;
  position_x: number;
  position_y: number;
  options: any;
  resolve: IPayload | null;
  reject: IPayload | null;
  flow: string;
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
  options: {
    type?: string;
    scope?: string[];
    collections: string[];
    return?: string;
    requireSelection?: boolean;
    requireConfirmation?: boolean;
    confirmationDescription?: string;
    fields?: Field[];
    method?: string;
  };
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
  flow_manager_metadata_id: {
    id?: string;
    flow_manager_category?: string;
    flow_manager_order?: number;
    flow_manager_run_counter?: number;
    flow_manager_last_run_at?: Date;
    flow_manager_last_run_message?: string;
    flow_manager_last_run_operation?: string;
    flow_manager_error_counter?: number;
    flow_manager_success_counter?: number;
  }
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
  }
}

export interface ICredential {
  id: string;
  name: string;
  staticToken: string;
  url: string;
}

export type ProcessingItem = {
  id?: string;
  status: "success" | "error" | "processing" | "skipped";
  message: string;
};

export interface IServerInfo {
  version?: string;
}

export type ExtendedPolicy = Policy & { policy: Policy };
export type ExtendedUser = User & {
  role: Role & { policies: ExtendedPolicy[]; admin_access: boolean };
  policies: ExtendedPolicy[];
};
export type ExtendedField = Field & {
  schema?: Field["schema"] & {
    related_collection?: string
  }
}

export interface Header {
  text: string;
  value: string;
  sortable: boolean;
  width: number;
}

export interface ISyncFlowCounter {
  type: "local" | "remote";
  url?: string;
  staticToken?: string;
}
