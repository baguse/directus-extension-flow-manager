import { defineModule } from "@directus/extensions-sdk";
import ModuleComponent from "./module.vue";
import { User } from "@directus/types";

export default defineModule({
  id: "flow-manager",
  name: "Flow Manager",
  icon: "bolt",
  routes: [
    {
      path: "",
      component: ModuleComponent,
    },
    {
      path: ":parentId",
      component: ModuleComponent,
      props: (route) => {
        return {
          parentId: route.params.parentId,
        };
      },
    },
  ],
  preRegisterCheck(user: User & { admin_access?: boolean }) {
    let adminAccess
    if (typeof user.role?.admin_access !== "undefined") {
      adminAccess = user.role?.admin_access;
    } else if (typeof user.admin_access !== "undefined") {
      // v11 case
      adminAccess = user.admin_access;
    }
    return !!adminAccess;
  },
});
