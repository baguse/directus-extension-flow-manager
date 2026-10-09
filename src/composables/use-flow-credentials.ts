import { ref, computed } from 'vue';
import type { AxiosInstance } from 'axios';
import type { Field } from '@directus/types';
import type {
  ExtendedField,
  ExtendedPolicy,
  ExtendedUser,
  ICredential,
  IFolder,
  IServerInfo,
  IVaultRecord,
  VaultStatus,
} from '../types';
import { ENDPOINT_EXTENSION_NAME } from '../constants';
import { formatConnectionError } from '../utils/error.util';
import { normalizeDirectusUrl } from '../utils/string.util';
import {
  encryptCredentials,
  decryptCredentials,
  readLegacySecureLSCredentials,
  purgeLegacySecureLS,
  base64ToBuffer,
} from '../utils/vault.util';

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

  const vaultStatus = ref<VaultStatus>('loading');
  const vaultRecord = ref<IVaultRecord | null>(null);
  const cachedPin = ref<string | null>(null);
  const localUserId = ref<string | null>(null);
  const legacyCredentials = ref<ICredential[] | null>(readLegacySecureLSCredentials());
  const storedCredentials = ref<ICredential[]>([]);
  const isVaultOperationLoading = ref(false);
  const vaultErrorMessage = ref<string | null>(null);

  const credentials = computed({
    get() {
      return storedCredentials.value;
    },
    set(value: ICredential[]) {
      storedCredentials.value = value;
      if (vaultStatus.value === 'unlocked' && cachedPin.value) {
        saveCredentialsToVault(value).catch((err) => {
          console.error('[FLOW MANAGER] Failed to save credentials to vault:', err);
        });
      }
    },
  });

  async function loadVault(): Promise<void> {
    vaultStatus.value = 'loading';
    vaultErrorMessage.value = null;

    try {
      if (!localUserId.value) {
        const { data: userRes } = await api.get<{ data: { id: string } }>('/users/me?fields[]=id');
        localUserId.value = userRes?.data?.id || null;
      }

      if (!localUserId.value) {
        vaultStatus.value = 'unconfigured';
        return;
      }

      const { data: vaultRes } = await api.get<{ data: IVaultRecord[] }>(
        '/items/flow_manager_credentials',
        {
          params: {
            'filter[user][_eq]': localUserId.value,
            limit: 1,
          },
        },
      );

      const record = vaultRes?.data?.[0];

      if (record && record.ciphertext) {
        vaultRecord.value = record;
        const sessionPin = sessionStorage.getItem(`fm_vault_pin_${localUserId.value}`);
        if (sessionPin) {
          try {
            const creds = await decryptCredentials(record, sessionPin);
            storedCredentials.value = creds;
            cachedPin.value = sessionPin;
            vaultStatus.value = 'unlocked';
            purgeLegacySecureLS();
            legacyCredentials.value = null;
            return;
          } catch {
            sessionStorage.removeItem(`fm_vault_pin_${localUserId.value}`);
          }
        }
        vaultStatus.value = 'locked';
      } else {
        vaultRecord.value = null;
        vaultStatus.value = 'unconfigured';
        legacyCredentials.value = readLegacySecureLSCredentials();
      }
    } catch {
      vaultRecord.value = null;
      vaultStatus.value = 'unconfigured';
      legacyCredentials.value = readLegacySecureLSCredentials();
    }
  }

  async function unlockVault(pin: string): Promise<{ success: boolean; error?: string }> {
    if (!vaultRecord.value) {
      return { success: false, error: 'Vault has not been set up yet.' };
    }
    isVaultOperationLoading.value = true;
    vaultErrorMessage.value = null;
    try {
      const creds = await decryptCredentials(vaultRecord.value, pin);
      storedCredentials.value = creds;
      cachedPin.value = pin;
      if (localUserId.value) {
        sessionStorage.setItem(`fm_vault_pin_${localUserId.value}`, pin);
      }
      vaultStatus.value = 'unlocked';
      purgeLegacySecureLS();
      legacyCredentials.value = null;
      return { success: true };
    } catch {
      const error = 'Incorrect Master PIN. Please try again.';
      vaultErrorMessage.value = error;
      return { success: false, error };
    } finally {
      isVaultOperationLoading.value = false;
    }
  }

  async function setupVault(
    pin: string,
    initialCreds?: ICredential[],
  ): Promise<{ success: boolean; error?: string }> {
    if (!localUserId.value) {
      const { data: userRes } = await api.get<{ data: { id: string } }>('/users/me?fields[]=id');
      localUserId.value = userRes?.data?.id || null;
    }
    if (!localUserId.value) {
      return { success: false, error: 'Failed to identify the current logged-in user.' };
    }

    isVaultOperationLoading.value = true;
    vaultErrorMessage.value = null;

    try {
      const credsToEncrypt = initialCreds || legacyCredentials.value || [];
      const encrypted = await encryptCredentials(credsToEncrypt, pin);

      let record: IVaultRecord;
      if (vaultRecord.value?.id) {
        const { data: updateRes } = await api.patch<{ data: IVaultRecord }>(
          `/items/flow_manager_credentials/${vaultRecord.value.id}`,
          {
            salt: encrypted.salt,
            iv: encrypted.iv,
            ciphertext: encrypted.ciphertext,
            version: encrypted.version,
          },
        );
        record = updateRes.data;
      } else {
        const { data: createRes } = await api.post<{ data: IVaultRecord }>(
          '/items/flow_manager_credentials',
          {
            user: localUserId.value,
            salt: encrypted.salt,
            iv: encrypted.iv,
            ciphertext: encrypted.ciphertext,
            version: encrypted.version,
          },
        );
        record = createRes.data;
      }

      vaultRecord.value = record;
      storedCredentials.value = credsToEncrypt;
      cachedPin.value = pin;
      sessionStorage.setItem(`fm_vault_pin_${localUserId.value}`, pin);
      vaultStatus.value = 'unlocked';
      purgeLegacySecureLS();
      legacyCredentials.value = null;

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vaultErrorMessage.value = msg;
      return { success: false, error: msg };
    } finally {
      isVaultOperationLoading.value = false;
    }
  }

  async function saveCredentialsToVault(creds: ICredential[]): Promise<void> {
    if (vaultStatus.value !== 'unlocked' || !cachedPin.value) {
      return;
    }
    if (!vaultRecord.value?.id) {
      await setupVault(cachedPin.value, creds);
      return;
    }

    const saltBytes = base64ToBuffer(vaultRecord.value.salt);
    const encrypted = await encryptCredentials(creds, cachedPin.value, saltBytes);

    await api.patch(`/items/flow_manager_credentials/${vaultRecord.value.id}`, {
      salt: encrypted.salt,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
      version: encrypted.version,
    });

    vaultRecord.value.ciphertext = encrypted.ciphertext;
    vaultRecord.value.iv = encrypted.iv;
  }

  async function changeVaultPin(
    oldPin: string,
    newPin: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!vaultRecord.value) {
      return { success: false, error: 'Vault record does not exist.' };
    }

    isVaultOperationLoading.value = true;
    vaultErrorMessage.value = null;

    try {
      const creds = await decryptCredentials(vaultRecord.value, oldPin);
      const encrypted = await encryptCredentials(creds, newPin);

      await api.patch(`/items/flow_manager_credentials/${vaultRecord.value.id}`, {
        salt: encrypted.salt,
        iv: encrypted.iv,
        ciphertext: encrypted.ciphertext,
        version: encrypted.version,
      });

      vaultRecord.value.salt = encrypted.salt;
      vaultRecord.value.iv = encrypted.iv;
      vaultRecord.value.ciphertext = encrypted.ciphertext;
      cachedPin.value = newPin;
      if (localUserId.value) {
        sessionStorage.setItem(`fm_vault_pin_${localUserId.value}`, newPin);
      }

      return { success: true };
    } catch {
      const error = 'Incorrect current Master PIN.';
      vaultErrorMessage.value = error;
      return { success: false, error };
    } finally {
      isVaultOperationLoading.value = false;
    }
  }

  function lockVault(): void {
    if (localUserId.value) {
      sessionStorage.removeItem(`fm_vault_pin_${localUserId.value}`);
    }
    cachedPin.value = null;
    storedCredentials.value = [];
    vaultStatus.value = 'locked';
  }

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

  // Trigger initial vault load
  loadVault();

  return {
    selectedCredential,
    currentUser,
    serverInfo,
    storedCredentials,
    credentials,
    vaultStatus,
    vaultRecord,
    isVaultOperationLoading,
    vaultErrorMessage,
    legacyCredentials,
    loadVault,
    unlockVault,
    setupVault,
    changeVaultPin,
    lockVault,
    saveCredentialsToVault,
    reloadFields,
    reloadFolders,
    getUser,
    getServerInfo,
    getUserPermission,
    checkCredentialConnection,
  };
}
