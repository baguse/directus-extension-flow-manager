import { Field } from "@directus/types";

export interface IOperation {
  id: string;
  name: string;
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
  };
  operation: string;
  date_created?: string;
  user_created?: string;
  operations: IOperation[];
  flow_manager_category?: string;
  flow_manager_order?: number;
  flow_manager_run_counter?: number;
  flow_manager_last_run_at?: Date;
}

export interface IFolder {
  id: string;
  name: string;
  icon: string;
  type: string;
  color: string;
  flow_manager_order?: number;
  flow_manager_category?: string;
}

export interface ICredential {
  id: string;
  name: string;
  staticToken: string;
  url: string;
}

export type ProcessingItem = {
  status: "success" | "error" | "processing" | "skipped";
  message: string;
};
