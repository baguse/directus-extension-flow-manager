import { defineModule } from '@directus/extensions-sdk';
import ModuleComponent from './module.vue';
import DashboardComponent from './dashboard.vue';
import FlowDashboardDetailComponent from './flow-dashboard-detail.vue';
import type { ExtendedUser } from '../types';

interface PolicyAccessItem {
  admin_access?: boolean;
  policy?: { admin_access?: boolean };
}

export default defineModule({
  id: 'flow-manager',
  name: 'Flow Manager',
  icon: 'bolt',
  routes: [
    {
      path: '',
      component: ModuleComponent,
    },
    {
      path: 'dashboard',
      component: DashboardComponent,
    },
    {
      path: 'dashboard/:flowId',
      component: FlowDashboardDetailComponent,
      props: (route) => ({ flowId: route.params.flowId }),
    },
    {
      path: ':parentId',
      component: ModuleComponent,
      props: (route) => {
        return {
          parentId: route.params.parentId,
        };
      },
    },
  ],
  preRegisterCheck(user) {
    if (!user) return false;
    const adminUser = user as unknown as ExtendedUser;

    const hasAdminAccess = (val: unknown): boolean => {
      return val === true || val === 1 || val === 'true' || val === '1';
    };

    if (hasAdminAccess(adminUser.admin_access)) return true;
    if (hasAdminAccess(adminUser.role?.admin_access)) return true;

    const userPolicies = adminUser.policies as unknown as PolicyAccessItem[] | undefined;
    if (Array.isArray(userPolicies)) {
      if (
        userPolicies.some(
          (p) => hasAdminAccess(p?.admin_access) || hasAdminAccess(p?.policy?.admin_access),
        )
      ) {
        return true;
      }
    }

    const rolePolicies = (adminUser.role as unknown as { policies?: PolicyAccessItem[] })?.policies;
    if (Array.isArray(rolePolicies)) {
      if (
        rolePolicies.some(
          (p) => hasAdminAccess(p?.admin_access) || hasAdminAccess(p?.policy?.admin_access),
        )
      ) {
        return true;
      }
    }

    return false;
  },
});
