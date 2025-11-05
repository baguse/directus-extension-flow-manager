import type { Field } from "@directus/types";

export const TRIGGER_TYPES = ["event", "manual", "operation", "schedule", "webhook"];
export const NPM_LINK = "https://registry.npmjs.org/directus-extension-flow-manager";
export const ENDPOINT_EXTENSION_NAME = "flow-manager-endpoint";

export const REQUIRED_FIELDS = [
  {
    field: "flow_manager_category",
    type: "string",
    schema: { default_value: null },
    meta: { interface: "input", special: null, hidden: true },
    collection: "directus_flows",
  },
  {
    field: "flow_manager_order",
    type: "integer",
    schema: { default_value: "0" },
    meta: { interface: "input", special: null, hidden: true },
    collection: "directus_flows",
  },
  {
    field: "flow_manager_categories",
    type: "json",
    meta: { interface: "input-code", special: ["cast-json"], hidden: true },
    collection: "directus_settings",
  },
  {
    field: "flow_manager_last_run_at",
    type: "dateTime",
    schema: { default_value: null },
    meta: { interface: "input-datetime", special: null, hidden: true },
    collection: "directus_flows",
  },
  {
    field: "flow_manager_run_counter",
    type: "integer",
    schema: { default_value: "0" },
    meta: { interface: "input", special: null, hidden: true },
    collection: "directus_flows",
  },
  {
    field: "flow_manager_last_run_message",
    type: "string",
    schema: { default_value: "" },
    meta: { interface: "input", special: null, hidden: true },
    collection: "directus_flows",
  },
  {
    field: "flow_manager_last_run_operation",
    type: "string",
    schema: { default_value: "" },
    meta: { interface: "input", special: null, hidden: true },
    collection: "directus_flows",
  },
] as Array<Partial<Field>>;
