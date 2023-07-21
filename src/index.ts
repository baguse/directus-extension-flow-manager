import { defineModule } from '@directus/extensions-sdk';
import ModuleComponent from './module.vue';

export default defineModule({
	id: 'flow-manager',
	name: 'Flow Manager',
	icon: 'bolt',
	routes: [
		{
			path: '',
			component: ModuleComponent,
		},
	],
});
