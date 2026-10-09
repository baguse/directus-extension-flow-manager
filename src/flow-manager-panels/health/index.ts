import { definePanel } from '@directus/extensions-sdk';
import PanelHealth from './panel-health.vue';

export default definePanel({
  id: 'flow-manager-health',
  name: 'Flow Health & Metrics',
  icon: 'monitoring',
  description: 'Monitor flow execution rates, success vs failure metrics, and automation health.',
  component: PanelHealth,
  options: [
    {
      field: 'scope',
      name: 'Scope',
      type: 'string',
      schema: {
        default_value: 'all',
      },
      meta: {
        interface: 'select-dropdown',
        options: {
          choices: [
            { text: 'All Flows (Global Overview)', value: 'all' },
            { text: 'Single Flow', value: 'single' },
          ],
        },
        width: 'half',
      },
    },
    {
      field: 'flowId',
      name: 'Select Flow',
      type: 'string',
      meta: {
        interface: 'system-collection',
        options: {
          collectionField: 'directus_flows',
        },
        conditions: [
          {
            rule: {
              scope: {
                _eq: 'all',
              },
            },
            hidden: true,
          },
        ],
        width: 'half',
      },
    },
    {
      field: 'viewType',
      name: 'Display Style',
      type: 'string',
      schema: {
        default_value: 'full',
      },
      meta: {
        interface: 'select-dropdown',
        options: {
          choices: [
            { text: 'Full Overview (KPIs & Donut Chart)', value: 'full' },
            { text: 'Metric Cards Only', value: 'cards' },
            { text: 'Donut Chart Only', value: 'donut' },
          ],
        },
        width: 'half',
      },
    },
    {
      field: 'failureThreshold',
      name: 'Warning Failure Threshold (%)',
      type: 'integer',
      schema: {
        default_value: 5,
      },
      meta: {
        interface: 'input',
        options: {
          placeholder: '5',
        },
        note: 'Mark health as degraded if failure rate exceeds this percentage.',
        width: 'half',
      },
    },
  ],
  minWidth: 12,
  minHeight: 8,
});
