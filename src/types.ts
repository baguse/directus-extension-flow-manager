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
  color: null;
  description: null;
  status: string;
  trigger: string;
  accountability: string;
  options: { type: string; scope: string[]; collections: string[] };
  operation: string;
  date_created: "2023-06-26T17:09:53.274Z";
  user_created: "8c4a648e-110d-493f-830a-48054a1d9109";
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
