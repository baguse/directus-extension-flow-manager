import { defineModule } from "@directus/extensions-sdk";
import ModuleComponent from "./module.vue";

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
  preRegisterCheck(user) {
    return !!user.role?.admin_access;
  },
});
