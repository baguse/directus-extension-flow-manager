import { ref } from 'vue';
import type { AxiosInstance } from 'axios';
import type { DirectusExtensionInfo } from '../types';
import { ENDPOINT_EXTENSION_NAME, NPM_LINK } from '../constants';

export function useExtensionVersion(api: AxiosInstance) {
  const installedVersion = ref('');
  const latestVersion = ref('');

  async function getLatestVersion(): Promise<void> {
    try {
      const {
        data: { data: installedExtensions },
      } = await api.get<{ data: DirectusExtensionInfo[] }>('/extensions');

      const extension = installedExtensions.find(
        (ext: DirectusExtensionInfo) =>
          (ext.name === 'directus-extension-flow-manager' ||
            ext.schema?.name === 'directus-extension-flow-manager') &&
          ext.schema?.type === 'bundle',
      );

      installedVersion.value = extension?.schema?.version || '';

      if (installedVersion.value) {
        const { data } = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
          url: NPM_LINK,
        });

        const latestTag = data?.['dist-tags']?.latest;

        if (latestTag && latestTag !== installedVersion.value) {
          latestVersion.value = latestTag;
        }
      }
    } catch {}
  }

  return {
    installedVersion,
    latestVersion,
    getLatestVersion,
  };
}
