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
  options: { type?: string; scope?: string[]; collections: string[] };
  operation: string;
  date_created?: string;
  user_created?: string;
  operations: IOperation[];
  flow_manager_category?: string;
  flow_manager_order?: number;
}

export interface IFolder {
  id: string;
  name: string;
  icon: string;
  type: string;
}

export interface ICredential {
  id: string;
  name: string;
  staticToken: string;
  url: string;
}
