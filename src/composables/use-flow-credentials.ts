import { ref, computed } from 'vue';
import SecureLS from 'secure-ls';
import type { AxiosInstance } from 'axios';
import type { Field } from '@directus/types';
import type {
  ExtendedField,
  ExtendedPolicy,
  ExtendedUser,
  ICredential,
  IFolder,
  IServerInfo,
} from '../types';
import { ENDPOINT_EXTENSION_NAME } from '../constants';
import { formatConnectionError } from '../utils/error.util';
import { normalizeDirectusUrl } from '../utils/string.util';

export interface CredentialConnectionResult {
  success: boolean;
  user?: ExtendedUser;
  serverInfo?: IServerInfo;
  error?: string;
}

export interface UseFlowCredentialsOptions {
  api: AxiosInstance;
  settingsStore: {
    settings?: {
      flow_manager_categories?: (string | IFolder)[];
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  fieldsStore: {
    getFieldsForCollection: (collection: string) => ExtendedField[];
    [key: string]: unknown;
  };
}

export function useFlowCredentials(options: UseFlowCredentialsOptions) {
  const { api, settingsStore, fieldsStore } = options;

  const selectedCredential = ref('local');
  const currentUser = ref<ExtendedUser | null>(null);
  const serverInfo = ref<IServerInfo>();
  const ls = new SecureLS({ encodingType: 'aes' });
  const storedCredentials = ref<ICredential[]>(ls.get('flow_manager_credentials') || []);

  const credentials = computed({
    get() {
      return storedCredentials.value;
    },
    set(value: ICredential[]) {
      ls.set('flow_manager_credentials', value);
      storedCredentials.value = value;
    },
  });

  async function reloadFields(collectionName: string): Promise<ExtendedField[]> {
    if (selectedCredential.value === 'local') {
      return fieldsStore.getFieldsForCollection(collectionName);
    } else {
      const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
      const {
        data: { data },
      } = await api.post<{ data: ExtendedField[] }>(
        `/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`,
        {
          url: `${credential?.url}/fields/${collectionName}`,
          staticToken: credential?.staticToken,
          method: 'GET',
        },
      );
      return data;
    }
  }

  async function reloadFolders(): Promise<IFolder[]> {
    if (selectedCredential.value === 'local') {
      return (settingsStore.settings?.flow_manager_categories || []).map(
        (category: string | IFolder) => {
          if (typeof category === 'string') {
            return {
              id: category,
              name: category,
              type: 'category',
              icon: 'folder',
              color: '',
              flow_manager_metadata_id: {
                flow_manager_order: 0,
              },
            };
          }

          return category;
        },
      );
    } else {
      const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
      const {
        data: { data },
      } = await api.post<{ data?: { flow_manager_categories?: (string | IFolder)[] } }>(
        `/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`,
        {
          url: `${credential?.url}/settings`,
          staticToken: credential?.staticToken,
          method: 'GET',
        },
      );
      return (data?.flow_manager_categories || []).map((category: string | IFolder) => {
        if (typeof category === 'string') {
          return {
            id: category,
            name: category,
            type: 'category',
            icon: 'folder',
            color: '',
            flow_manager_metadata_id: {
              flow_manager_order: 0,
            },
          };
        }

        return category;
      });
    }
  }

  async function getUser(isHasPolicyField = false): Promise<void> {
    const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
    const queries: string[] = ['fields[]=*'];
    if (isHasPolicyField) {
      queries.push('fields[]=policies.policy.*');
      queries.push('fields[]=role.policies.policy.*');
    } else {
      queries.push('fields[]=role.*');
    }
    if (selectedCredential.value === 'local') {
      const {
        data: { data },
      } = await api.get<{ data: ExtendedUser }>(`/users/me?${queries.join('&')}`);
      currentUser.value = data;
    } else {
      if (credential) {
        const {
          data: { data },
        } = await api.post<{ data: ExtendedUser }>(
          `/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`,
          {
            url: `${credential.url}/users/me?${queries.join('&')}`,
            staticToken: credential.staticToken,
            method: 'GET',
          },
        );
        currentUser.value = data;
      }
    }
  }

  async function getServerInfo(): Promise<void> {
    try {
      if (selectedCredential.value === 'local') {
        const {
          data: { data },
        } = await api.get<{ data: IServerInfo }>(`/server/info`);
        serverInfo.value = data;
      } else {
        const credential = credentials.value.find((cred) => cred.id === selectedCredential.value);
        if (credential) {
          const {
            data: { data },
          } = await api.post<{ data: IServerInfo }>(
            `/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`,
            {
              url: `${credential.url}/server/info`,
              staticToken: credential.staticToken,
              method: 'GET',
            },
          );
          serverInfo.value = data;
        }
      }
    } catch {
      serverInfo.value = undefined;
    }
  }

  async function getUserPermission(): Promise<boolean | undefined> {
    const permissionFields = (await reloadFields('directus_permissions')) as Field[];
    const permissionHasPolicy = permissionFields.some((f: Field) => f.field === 'policy');
    await getUser(permissionHasPolicy);
    if (permissionHasPolicy) {
      const policies: ExtendedPolicy[] = [
        ...(currentUser.value?.policies || []),
        ...(currentUser.value?.role?.policies || []),
      ];

      return policies.some((policy) => policy.admin_access || policy.policy.admin_access);
    } else {
      return currentUser.value?.role?.admin_access;
    }
  }

  async function checkCredentialConnection(cred: ICredential): Promise<CredentialConnectionResult> {
    const rawUrl = cred?.url || '';
    const cleanUrl = normalizeDirectusUrl(rawUrl);
    const token = cred?.staticToken?.trim() || '';

    if (!cleanUrl || !token) {
      return {
        success: false,
        error: 'Credential URL and static token cannot be empty.',
      };
    }

    try {
      // 1. Fetch directus_permissions fields to check for policy field support (Directus 10.10+)
      const { data: fieldsRes } = await api.post<{ data: ExtendedField[] }>(
        `/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`,
        {
          url: `${cleanUrl}/fields/directus_permissions`,
          staticToken: token,
          method: 'GET',
        },
      );

      const hasPolicyField =
        Array.isArray(fieldsRes?.data) &&
        fieldsRes.data.some((f: ExtendedField) => f.field === 'policy');

      // 2. Fetch current user with appropriate policy fields
      const queries: string[] = ['fields[]=*'];
      if (hasPolicyField) {
        queries.push('fields[]=policies.policy.*');
        queries.push('fields[]=role.policies.policy.*');
      } else {
        queries.push('fields[]=role.*');
      }

      const { data: userRes } = await api.post<{ data: ExtendedUser }>(
        `/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`,
        {
          url: `${cleanUrl}/users/me?${queries.join('&')}`,
          staticToken: token,
          method: 'GET',
        },
      );

      const userData = userRes?.data;
      if (!userData) {
        return {
          success: false,
          error: 'No user data returned from the remote Directus instance.',
        };
      }

      // 3. Check for admin access
      let isAdmin = false;
      if (hasPolicyField) {
        const policies: ExtendedPolicy[] = [
          ...(userData.policies || []),
          ...(userData.role?.policies || []),
        ];
        isAdmin = policies.some((policy) => policy?.admin_access || policy?.policy?.admin_access);
      } else {
        isAdmin = Boolean(userData.role?.admin_access);
      }

      if (!isAdmin) {
        const nameParts = [userData.first_name, userData.last_name].filter(Boolean);
        const displayName =
          nameParts.length > 0
            ? nameParts.join(' ')
            : (userData.email as string) || (userData.id as string) || 'User';
        const roleName = userData.role?.name ? ` (${userData.role.name})` : '';

        return {
          success: false,
          error: `Authenticated as ${displayName}${roleName}, but this user does not have Admin access. Flow Manager requires Admin privileges on the remote instance.`,
        };
      }

      // 4. Optionally fetch server info
      let sInfo: IServerInfo | undefined;
      try {
        const { data: serverRes } = await api.post<{ data: IServerInfo }>(
          `/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`,
          {
            url: `${cleanUrl}/server/info`,
            staticToken: token,
            method: 'GET',
          },
        );
        sInfo = serverRes?.data;
      } catch {
        // server info is optional
      }

      return {
        success: true,
        user: userData,
        serverInfo: sInfo,
      };
    } catch (err: unknown) {
      const errorMsg = formatConnectionError(
        err,
        'Failed to connect to the remote Directus instance.',
      );
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  return {
    selectedCredential,
    currentUser,
    serverInfo,
    storedCredentials,
    credentials,
    reloadFields,
    reloadFolders,
    getUser,
    getServerInfo,
    getUserPermission,
    checkCredentialConnection,
  };
}
