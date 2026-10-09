import { definePanel } from '@directus/extensions-sdk';
import PanelActivity from './panel-activity.vue';

export default definePanel({
  id: 'flow-manager-activity',
  name: 'Flow Activity Feed',
  icon: 'history',
  description: 'Live feed of recent flow execution logs, status, and error messages.',
  component: PanelActivity,
  options: [
    {
      field: 'limit',
      name: 'Item Limit',
      type: 'integer',
      schema: {
        default_value: 5,
      },
      meta: {
        interface: 'select-dropdown',
        options: {
          choices: [
            { text: '5 runs', value: 5 },
            { text: '10 runs', value: 10 },
            { text: '15 runs', value: 15 },
            { text: '20 runs', value: 20 },
          ],
        },
        width: 'half',
      },
    },
    {
      field: 'statusFilter',
      name: 'Filter by Status',
      type: 'string',
      schema: {
        default_value: 'all',
      },
      meta: {
        interface: 'select-dropdown',
        options: {
          choices: [
            { text: 'All Executions', value: 'all' },
            { text: 'Errors Only (Failing Runs)', value: 'errors_only' },
            { text: 'Success Only', value: 'success_only' },
          ],
        },
        width: 'half',
      },
    },
    {
      field: 'flowId',
      name: 'Filter by Specific Flow (Optional)',
      type: 'string',
      meta: {
        interface: 'system-collection',
        options: {
          collectionField: 'directus_flows',
        },
        width: 'full',
      },
    },
  ],
  minWidth: 12,
  minHeight: 8,
});
