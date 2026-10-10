import { ExtendedField } from './types';

export const TRIGGER_TYPES = ['event', 'manual', 'operation', 'schedule', 'webhook'];
export const NPM_LINK = 'https://registry.npmjs.org/directus-extension-flow-manager';
export const ENDPOINT_EXTENSION_NAME = 'flow-manager-endpoint';

export const REQUIRED_FIELDS = [
  {
    field: 'flow_manager_category',
    type: 'string',
    schema: { default_value: null },
    meta: { interface: 'input', special: null, hidden: false },
    collection: 'flow_manager_metadata',
  },
  {
    field: 'flow_manager_order',
    type: 'integer',
    schema: { default_value: '0' },
    meta: { interface: 'input', special: null, hidden: false },
    collection: 'flow_manager_metadata',
  },
  {
    field: 'flow_manager_categories',
    type: 'json',
    meta: { interface: 'input-code', special: ['cast-json'], hidden: true },
    collection: 'directus_settings',
  },
  {
    field: 'flow_manager_last_run_at',
    type: 'dateTime',
    schema: { default_value: null },
    meta: { interface: 'input-datetime', special: null, hidden: false },
    collection: 'flow_manager_metadata',
  },
  {
    field: 'flow_manager_run_counter',
    type: 'integer',
    schema: { default_value: '0' },
    meta: { interface: 'input', special: null, hidden: false },
    collection: 'flow_manager_metadata',
  },
  {
    field: 'flow_manager_last_run_message',
    type: 'text',
    schema: { default_value: '' },
    meta: {
      interface: 'input-multiline',
      special: null,
      hidden: false,
      options: { softLength: 1024 },
    },
    collection: 'flow_manager_metadata',
  },
  {
    field: 'flow_manager_last_run_operation',
    type: 'string',
    schema: { default_value: '' },
    meta: { interface: 'input', special: null, hidden: false },
    collection: 'flow_manager_metadata',
  },
  {
    field: 'flow_manager_success_counter',
    type: 'integer',
    schema: { default_value: '0' },
    meta: { interface: 'input', special: null, hidden: false },
    collection: 'flow_manager_metadata',
  },
  {
    field: 'flow_manager_error_counter',
    type: 'integer',
    schema: { default_value: '0' },
    meta: { interface: 'input', special: null, hidden: false },
    collection: 'flow_manager_metadata',
  },
  {
    field: 'flow_manager_metadata_id',
    type: 'uuid',
    meta: { special: ['m2o', 'uuid'], interface: 'select-dropdown-m2o' },
    schema: { related_collection: 'flow_manager_metadata' },
    collection: 'directus_flows',
  },
  {
    field: 'user',
    type: 'uuid',
    meta: { special: ['m2o', 'uuid'], interface: 'select-dropdown-m2o' },
    schema: { related_collection: 'directus_users' },
    collection: 'flow_manager_credentials',
    scope: 'local',
  },
  {
    field: 'salt',
    type: 'string',
    schema: { default_value: null },
    meta: { interface: 'input', special: null, hidden: true },
    collection: 'flow_manager_credentials',
    scope: 'local',
  },
  {
    field: 'iv',
    type: 'string',
    schema: { default_value: null },
    meta: { interface: 'input', special: null, hidden: true },
    collection: 'flow_manager_credentials',
    scope: 'local',
  },
  {
    field: 'ciphertext',
    type: 'text',
    schema: { default_value: null },
    meta: { interface: 'input-multiline', special: null, hidden: true },
    collection: 'flow_manager_credentials',
    scope: 'local',
  },
  {
    field: 'version',
    type: 'integer',
    schema: { default_value: '1' },
    meta: { interface: 'input', special: null, hidden: true },
    collection: 'flow_manager_credentials',
    scope: 'local',
  },
  {
    field: 'flow',
    type: 'uuid',
    meta: { special: ['m2o', 'uuid'], interface: 'select-dropdown-m2o' },
    schema: { related_collection: 'directus_flows', on_delete: 'CASCADE' },
    collection: 'flow_manager_snapshots',
  },
  {
    field: 'version',
    type: 'string',
    schema: { default_value: 'v1.0.0' },
    meta: { interface: 'input', special: null, hidden: false },
    collection: 'flow_manager_snapshots',
  },
  {
    field: 'name',
    type: 'string',
    schema: { default_value: '' },
    meta: { interface: 'input', special: null, hidden: false },
    collection: 'flow_manager_snapshots',
  },
  {
    field: 'description',
    type: 'text',
    schema: { default_value: '' },
    meta: { interface: 'input-multiline', special: null, hidden: false },
    collection: 'flow_manager_snapshots',
  },
  {
    field: 'tag',
    type: 'string',
    schema: { default_value: 'manual' },
    meta: { interface: 'input', special: null, hidden: false },
    collection: 'flow_manager_snapshots',
  },
  {
    field: 'data',
    type: 'json',
    meta: { interface: 'input-code', special: ['cast-json'], hidden: false },
    collection: 'flow_manager_snapshots',
  },
  {
    field: 'user_created',
    type: 'uuid',
    meta: { special: ['user-created', 'm2o'], interface: 'select-dropdown-m2o', hidden: true },
    schema: { related_collection: 'directus_users' },
    collection: 'flow_manager_snapshots',
  },
] as unknown as Array<Partial<ExtendedField>>;

export const REQUIRED_COLLECTIONS: { collection: string; scope?: 'local' | 'all' }[] = [
  {
    collection: 'flow_manager_metadata',
    scope: 'all',
  },
  {
    collection: 'flow_manager_credentials',
    scope: 'local',
  },
  {
    collection: 'flow_manager_snapshots',
    scope: 'all',
  },
];
