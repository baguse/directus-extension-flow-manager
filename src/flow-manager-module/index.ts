import { defineModule } from '@directus/extensions-sdk';
import ModuleComponent from './module.vue';
import DashboardComponent from './dashboard.vue';
import FlowDashboardDetailComponent from './flow-dashboard-detail.vue';
import RecipesComponent from './recipes.vue';
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
      path: 'recipes',
      component: RecipesComponent,
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
  preRegisterCheck(user, permissions) {
    if (!user) return false;
    const adminUser = user as unknown as ExtendedUser;

    const hasAdminAccess = (val: unknown): boolean => {
      return val === true || val === 1 || val === 'true' || val === '1';
    };

    // 1. Direct admin_access flag on user (Directus 11+)
    if (hasAdminAccess(adminUser.admin_access)) return true;

    // 2. Direct admin_access flag on role object (Directus 9/10)
    if (typeof adminUser.role === 'object' && adminUser.role !== null) {
      if (hasAdminAccess(adminUser.role.admin_access)) return true;

      // 3. Admin role by name
      const roleName = adminUser.role.name?.toLowerCase();
      if (roleName === 'administrator' || roleName === 'admin') return true;

      // 4. Policies with admin access on role
      const rolePolicies = (adminUser.role as { policies?: PolicyAccessItem[] }).policies;
      if (Array.isArray(rolePolicies)) {
        if (
          rolePolicies.some(
            (p) => hasAdminAccess(p?.admin_access) || hasAdminAccess(p?.policy?.admin_access),
          )
        ) {
          return true;
        }
      }
    }

    // 5. Policies with admin access on user
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

    // 6. Check permissions parameter (Directus 10 array & Directus 11 object)
    if (permissions) {
      // Directus 11 format: Record<string, Record<string, { access: string }>>
      if (typeof permissions === 'object' && !Array.isArray(permissions)) {
        const permsRecord = permissions as Record<string, { read?: { access?: string } }>;
        const flowPerms = permsRecord['directus_flows'];
        if (flowPerms) {
          const readAccess = flowPerms.read?.access;
          if (readAccess && readAccess !== 'none') return true;
        }
      }
      // Directus 10 format: Array<{ collection: string; action: string }>
      if (Array.isArray(permissions)) {
        const hasFlowAccess = (permissions as Array<{ collection?: string; action?: string }>).some(
          (p) => p?.collection === 'directus_flows' && p?.action === 'read',
        );
        if (hasFlowAccess) return true;
      }
    }

    // 7. If user has app_access and role is undefined or string UUID, allow registration
    // (permissions will be enforced at API endpoint and collection level)
    if (
      hasAdminAccess(adminUser.app_access) &&
      (!adminUser.role || typeof (adminUser.role as unknown) === 'string')
    ) {
      return true;
    }

    return false;
  },
});
