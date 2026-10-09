import { definePanel } from '@directus/extensions-sdk';
import PanelTrigger from './panel-trigger.vue';

export default definePanel({
  id: 'flow-manager-trigger',
  name: 'Rapid Flow Trigger',
  icon: 'bolt',
  description:
    'Trigger manual flows directly from your dashboard with parameters and confirmation.',
  component: PanelTrigger,
  options: [
    {
      field: 'flowId',
      name: 'Flow to Trigger',
      type: 'string',
      meta: {
        interface: 'system-collection',
        options: {
          collectionField: 'directus_flows',
        },
        width: 'full',
      },
    },
    {
      field: 'customLabel',
      name: 'Button Label',
      type: 'string',
      meta: {
        interface: 'input',
        options: {
          placeholder: 'Leave blank to use Flow name',
        },
        width: 'half',
      },
    },
    {
      field: 'customIcon',
      name: 'Button Icon',
      type: 'string',
      meta: {
        interface: 'icon',
        options: {
          placeholder: 'bolt',
        },
        width: 'half',
      },
    },
    {
      field: 'customColor',
      name: 'Button Color',
      type: 'string',
      meta: {
        interface: 'select-color',
        width: 'half',
      },
    },
    {
      field: 'buttonSize',
      name: 'Button Size',
      type: 'string',
      schema: {
        default_value: 'large',
      },
      meta: {
        interface: 'select-dropdown',
        options: {
          choices: [
            { text: 'Large (Hero Button)', value: 'large' },
            { text: 'Medium (Standard)', value: 'medium' },
          ],
        },
        width: 'half',
      },
    },
    {
      field: 'showDetails',
      name: 'Show Execution Details',
      type: 'boolean',
      schema: {
        default_value: true,
      },
      meta: {
        interface: 'boolean',
        options: {
          label: 'Display last run time and status under button',
        },
        width: 'full',
      },
    },
  ],
  minWidth: 6,
  minHeight: 4,
});
