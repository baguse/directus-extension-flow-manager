/* eslint-disable @typescript-eslint/no-explicit-any */
declare module '*.vue' {
  import { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
