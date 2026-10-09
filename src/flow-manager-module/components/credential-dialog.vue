<script setup lang="ts">
import { type PropType, computed, inject, ref, toRefs, watch } from 'vue';
import type { ICredential, IFlow } from '../../types';
import { generateRandomString } from '../../utils/string.util';
import { formatConnectionError } from '../../utils/error.util';
import { useApi } from '@directus/extensions-sdk';
import { ENDPOINT_EXTENSION_NAME } from '../../constants';
const props = withDefaults(
  defineProps<{
    value: boolean;
  }>(),
  {},
);

const emit = defineEmits(['update:modelValue']);

const credentials = defineModel('credentials', {
  type: Array as PropType<ICredential[]>,
  default: () => [],
});

const api = useApi();

const { value } = toRefs(props);

const credentialName = ref('');
const credentialUrl = ref('');
const credentialStaticToken = ref('');
const flows = ref<IFlow[]>([]);
const selectedFlows = ref<IFlow[]>([]);
const flowDuplicatedName = ref('');
const pullingProgressValue = ref(0);

const isEdit = ref(false);
const pullFlowsDialog = ref(false);
const isPreviousIdPersisted = ref(false);
const isPullingFlows = ref(false);
const isPullingFlowError = ref(false);
const pullingFlowErrorMessage = ref('');

const errors = ref<string[]>([]);

const selectedCredential = ref<ICredential>({
  id: '',
  name: '',
  url: '',
  staticToken: '',
});
const credentialHeaders = ref([
  {
    text: 'Name',
    value: 'name',
    width: 180,
  },
  {
    text: 'URL',
    value: 'url',
    width: 180,
  },
]);

export interface TestResult {
  success: boolean;
  status: 'success' | 'warning' | 'error';
  message: string;
}

const isTesting = ref(false);
const testResult = ref<TestResult | null>(null);
const testingRowId = ref<string | null>(null);
const rowTestResults = ref<Record<string, TestResult>>({});

watch(
  [selectedFlows],
  ([value]) => {
    if (value.length === 1) {
      flowDuplicatedName.value = `${value[0]?.name} - Copy`;
    } else if (value.length > 1) {
      flowDuplicatedName.value = '{{original_name}} - Copy';
    } else {
      flowDuplicatedName.value = '';
    }
  },
  {
    immediate: true,
  },
);

watch([credentialUrl, credentialStaticToken], () => {
  if (testResult.value) {
    testResult.value = null;
  }
});

watch(value, (isOpen) => {
  if (!isOpen) {
    testResult.value = null;
    errors.value = [];
  }
});

const isValid = computed(() => {
  if (isEdit.value) {
    return !!credentialName.value && !!credentialUrl.value;
  }
  return !!credentialName.value && !!credentialUrl.value && !!credentialStaticToken.value;
});

const canTest = computed(() => {
  if (isEdit.value) {
    return (
      !!credentialUrl.value &&
      (!!credentialStaticToken.value || !!selectedCredential.value.staticToken)
    );
  }
  return !!credentialUrl.value && !!credentialStaticToken.value;
});

interface PolicyAccessItem {
  admin_access?: boolean | number | string;
  policy?: { admin_access?: boolean | number | string };
}

function checkAdminAccess(userData: Record<string, unknown>): boolean {
  const hasAdmin = (val: unknown): boolean =>
    val === true || val === 1 || val === 'true' || val === '1';

  if (hasAdmin(userData.admin_access)) return true;

  const role = userData.role as
    (Record<string, unknown> & { policies?: PolicyAccessItem[] }) | undefined;
  if (role && hasAdmin(role.admin_access)) return true;

  const userPolicies = userData.policies as PolicyAccessItem[] | undefined;
  if (Array.isArray(userPolicies)) {
    if (userPolicies.some((p) => hasAdmin(p?.admin_access) || hasAdmin(p?.policy?.admin_access))) {
      return true;
    }
  }

  const rolePolicies = role?.policies;
  if (Array.isArray(rolePolicies)) {
    if (rolePolicies.some((p) => hasAdmin(p?.admin_access) || hasAdmin(p?.policy?.admin_access))) {
      return true;
    }
  }

  return false;
}

async function runTest(url: string, token: string): Promise<TestResult> {
  let parsedUrl = '';
  try {
    parsedUrl = parseUrl(url);
  } catch {
    return {
      success: false,
      status: 'error',
      message: 'Invalid URL format.',
    };
  }

  if (!token) {
    return {
      success: false,
      status: 'error',
      message: 'Static token cannot be empty.',
    };
  }

  try {
    const fields = [
      'id',
      'first_name',
      'last_name',
      'email',
      'role.*',
      'policies.policy.admin_access',
      'role.policies.policy.admin_access',
    ];

    const { data: userRes } = await api.post<{ data: Record<string, unknown> }>(
      `/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`,
      {
        url: `${parsedUrl}/users/me?${fields.map((f) => `fields[]=${f}`).join('&')}`,
        staticToken: token,
        method: 'GET',
      },
    );

    const userData = userRes?.data;
    if (!userData) {
      return {
        success: false,
        status: 'error',
        message: 'No user data returned from the server.',
      };
    }

    const nameParts = [userData.first_name, userData.last_name].filter(Boolean);
    const displayName =
      nameParts.length > 0
        ? nameParts.join(' ')
        : (userData.email as string) || (userData.id as string) || 'User';
    const roleName = (userData.role as { name?: string } | undefined)?.name;
    const roleLabel = roleName ? ` (${roleName})` : '';

    const isAdmin = checkAdminAccess(userData);

    let versionLabel = '';
    try {
      const { data: serverRes } = await api.post<{ data?: { version?: string } }>(
        `/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`,
        {
          url: `${parsedUrl}/server/info`,
          staticToken: token,
          method: 'GET',
        },
      );
      if (serverRes?.data?.version) {
        versionLabel = ` · Directus v${serverRes.data.version}`;
      }
    } catch {
      // server info is optional
    }

    if (!isAdmin) {
      return {
        success: false,
        status: 'warning',
        message: `Connected to ${displayName}${roleLabel}${versionLabel}, but this user does not have admin permissions required by Flow Manager.`,
      };
    }

    return {
      success: true,
      status: 'success',
      message: `Connection successful! Connected as ${displayName}${roleLabel} [Admin]${versionLabel}.`,
    };
  } catch (err: unknown) {
    const errorMsg = formatConnectionError(
      err,
      'Failed to connect to the remote Directus instance.',
    );

    return {
      success: false,
      status: 'error',
      message: `Connection failed: ${errorMsg}`,
    };
  }
}

async function testInputtedCredential() {
  if (!canTest.value) return;
  isTesting.value = true;
  testResult.value = null;
  errors.value = [];
  const tokenToUse =
    credentialStaticToken.value || (isEdit.value ? selectedCredential.value.staticToken : '');
  const result = await runTest(credentialUrl.value, tokenToUse);
  testResult.value = result;
  isTesting.value = false;
}

async function testSavedCredential(item: ICredential) {
  testingRowId.value = item.id;
  const result = await runTest(item.url, item.staticToken);
  testResult.value = {
    ...result,
    message: `[${item.name}] ${result.message}`,
  };
  rowTestResults.value[item.id] = result;
  testingRowId.value = null;
}

function getTestIconName(id: string) {
  const res = rowTestResults.value[id];
  if (res?.status === 'success') return 'check_circle';
  if (res?.status === 'warning') return 'warning';
  if (res?.status === 'error') return 'error';
  return 'cable';
}

function getTestIconColor(id: string) {
  const res = rowTestResults.value[id];
  if (res?.status === 'success') return 'var(--theme--success, var(--success, #2ec4b6))';
  if (res?.status === 'warning') return 'var(--theme--warning, var(--warning, #ff9f1c))';
  if (res?.status === 'error') return 'var(--theme--danger, var(--danger, #e71d36))';
  return undefined;
}

function getTooltipForTestIcon(id: string) {
  const res = rowTestResults.value[id];
  if (res) return `${res.message} (Click to re-test)`;
  return 'Test Connection';
}

const flowManagerUtils = inject<{
  createFlow: (flow: IFlow) => Promise<void>;
  reloadFlow: () => Promise<void>;
  reloadTabularFlow: () => Promise<void>;
}>('flowManagerUtils');

function saveCredential() {
  let credentialUrlParsed = credentialUrl.value;
  try {
    const url = parseUrl(credentialUrlParsed);
    credentialUrlParsed = url;
    errors.value = [];
  } catch {
    errors.value = ['Invalid URL'];
    return;
  }
  testResult.value = null;
  if (isEdit.value) {
    const newCredentials = [...credentials.value];
    const credentialIndex = newCredentials.findIndex(
      (credential) => credential.id === selectedCredential.value.id,
    );
    if (credentialIndex !== -1) {
      (newCredentials[credentialIndex] as ICredential).name = credentialName.value;
      (newCredentials[credentialIndex] as ICredential).url = credentialUrlParsed;
      if (credentialStaticToken.value) {
        (newCredentials[credentialIndex] as ICredential).staticToken = credentialStaticToken.value;
      } else {
        (newCredentials[credentialIndex] as ICredential).staticToken =
          selectedCredential.value.staticToken;
      }

      credentials.value = newCredentials;
    }

    credentialName.value = '';
    credentialUrl.value = '';
    credentialStaticToken.value = '';
    isEdit.value = false;
    selectedCredential.value = {
      id: '',
      name: '',
      url: '',
      staticToken: '',
    };
  } else {
    const newCredentials = [
      ...credentials.value,
      {
        id: generateRandomString(10),
        name: credentialName.value,
        url: credentialUrlParsed,
        staticToken: credentialStaticToken.value,
      },
    ];

    credentials.value = newCredentials;

    credentialName.value = '';
    credentialUrl.value = '';
    credentialStaticToken.value = '';
  }
}

function deleteCredential(item: ICredential) {
  testResult.value = null;
  delete rowTestResults.value[item.id];
  const newCredentials = [...credentials.value];
  const credentialIndex = newCredentials.findIndex((credential) => credential.id === item.id);
  if (credentialIndex !== -1) {
    const credential = newCredentials[credentialIndex];
    if (credential?.id === selectedCredential.value.id) {
      isEdit.value = false;
      selectedCredential.value = {
        id: '',
        name: '',
        url: '',
        staticToken: '',
      };
      credentialName.value = '';
      credentialUrl.value = '';
      credentialStaticToken.value = '';
    }
    newCredentials.splice(credentialIndex, 1);
  }

  credentials.value = newCredentials;
}

function selectCredential(item: ICredential) {
  isEdit.value = true;
  selectedCredential.value = item;
  credentialName.value = item.name;
  credentialUrl.value = item.url;
  credentialStaticToken.value = '';
  testResult.value = null;
}

function onRowClick({ item }: { item: ICredential }) {
  selectCredential(item);
}

function cancelEditCredential() {
  isEdit.value = false;
  selectedCredential.value = {
    id: '',
    name: '',
    url: '',
    staticToken: '',
  };
  credentialName.value = '';
  credentialUrl.value = '';
  credentialStaticToken.value = '';
  testResult.value = null;
}

const pullFlowsHeaders = ref([
  {
    text: '',
    value: 'icon',
    width: 50,
  },
  {
    text: 'Name',
    value: 'name',
    width: 300,
  },
  {
    text: 'Description',
    value: 'description',
    width: 400,
  },
]);

async function pullFlows(credential: ICredential) {
  try {
    flows.value = [];
    isPullingFlowError.value = false;
    pullingFlowErrorMessage.value = '';
    const fields = ['*', 'operations.*'];
    const {
      data: { data },
    } = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
      url: `${credential?.url}/flows?fields=${fields.join(',')}`,
      staticToken: credential?.staticToken,
      method: 'GET',
    });
    flows.value = data;
    pullFlowsDialog.value = true;
    flowDuplicatedName.value = '';
    isPreviousIdPersisted.value = false;
  } catch (err: unknown) {
    isPullingFlowError.value = true;
    pullingFlowErrorMessage.value = formatConnectionError(
      err,
      'Failed to pull flows from the instance.',
    );
  }
}

async function proceedPull() {
  try {
    isPullingFlows.value = true;
    pullingProgressValue.value = 0;
    const flowsToPull = selectedFlows.value.map((flow) => {
      return {
        ...flow,
        status: 'inactive',
        name: flowDuplicatedName.value.replace(/{{original_name}}/g, flow.name),
        id: isPreviousIdPersisted.value ? flow.id : undefined,
      };
    });

    for (let i = 0; i < flowsToPull.length; i++) {
      const flow = flowsToPull[i] as IFlow;
      await flowManagerUtils?.createFlow?.(flow);
      pullingProgressValue.value = Math.round((i / flowsToPull.length) * 100);
    }
  } catch {
    //
  } finally {
    pullFlowsDialog.value = false;
    isPullingFlows.value = false;
    selectedFlows.value = [];
    flowDuplicatedName.value = '';
    isPreviousIdPersisted.value = false;
    pullingProgressValue.value = 0;
    flowManagerUtils?.reloadFlow?.();
    flowManagerUtils?.reloadTabularFlow?.();
  }
}

function parseUrl(url: string) {
  try {
    let cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = `http://${cleanUrl}`;
    }
    const urlParsed = new URL(cleanUrl);
    if (!urlParsed.origin || urlParsed.origin === 'null') {
      throw new Error('Invalid URL');
    }
    const pathname = urlParsed.pathname.replace(/\/admin(\/.*)?$/, '').replace(/\/+$/, '');
    return `${urlParsed.origin}${pathname}`;
  } catch {
    throw new Error('Invalid URL');
  }
}
</script>

<template>
  <v-dialog
    :model-value="value"
    :persistent="true"
    @update:model-value="emit('update:modelValue', false)"
  >
    <v-card>
      <v-card-title>Credentials</v-card-title>
      <v-card-text>
        <v-error
          v-if="isPullingFlowError"
          :error="{
            extensions: { code: 'Error' },
            message: pullingFlowErrorMessage || 'Failed to pull flows',
          }"
        ></v-error>
        <v-table
          :headers="credentialHeaders"
          :items="credentials"
          class="credentials-table"
          :active="isEdit ? [selectedCredential.id] : []"
          @click:row="onRowClick"
        >
          <template #item-append="{ item }">
            <v-progress-circular
              v-if="testingRowId === item.id"
              indeterminate
              x-small
              class="button-action"
            />
            <v-icon
              v-else
              v-tooltip.bottom="getTooltipForTestIcon(item.id)"
              class="button-action"
              :name="getTestIconName(item.id)"
              :color="getTestIconColor(item.id)"
              @click.stop="testSavedCredential(item)"
            />
            <v-icon
              v-tooltip.bottom="'Pull Flows'"
              class="button-action"
              name="download"
              @click.stop="pullFlows(item)"
            />
            <v-icon
              v-tooltip.bottom="'Delete Credential'"
              class="button-action"
              name="delete"
              color="var(--danger)"
              @click.stop="deleteCredential(item)"
            />
          </template>
        </v-table>
        <v-input
          v-model="credentialName"
          v-tooltip.bottom="'Credential Name'"
          placeholder="Name"
          class="input-form"
        >
        </v-input>
        <v-input
          v-model="credentialUrl"
          v-tooltip.bottom="'Credential URL'"
          placeholder="URL"
          class="input-form"
        ></v-input>
        <v-input
          v-model="credentialStaticToken"
          v-tooltip.bottom="'Credential Static Token'"
          :placeholder="isEdit ? '(Unchanged)' : 'Static Token'"
          class="input-form"
        ></v-input>
        <v-notice
          v-if="testResult"
          class="mb-2 mt-2"
          :type="
            testResult.status === 'success'
              ? 'success'
              : testResult.status === 'warning'
                ? 'warning'
                : 'danger'
          "
        >
          {{ testResult.message }}
        </v-notice>
        <v-error
          v-for="(error, indexError) in errors"
          :key="`errorIndex-${indexError}`"
          class="mb-2"
          :error="{ extensions: { code: 'Error' }, message: error }"
        ></v-error>
        <div class="actions-row">
          <v-button :disabled="!isValid || isTesting" @click="saveCredential">
            {{ isEdit ? 'Save' : 'Add' }}
          </v-button>
          <v-button
            secondary
            class="ml-2"
            :disabled="!canTest || isTesting"
            :loading="isTesting"
            @click="testInputtedCredential"
          >
            Test Connection
          </v-button>
          <v-button v-if="isEdit" secondary class="ml-2" @click="cancelEditCredential">
            Cancel
          </v-button>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-button secondary @click="emit('update:modelValue', false)"> Close </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog
    :model-value="pullFlowsDialog"
    :persistent="true"
    @update:model-value="pullFlowsDialog = false"
  >
    <v-card class="card-extended">
      <v-card-title>Flows</v-card-title>
      <v-card-text>
        <v-table
          v-model="selectedFlows"
          show-select="multiple"
          :headers="pullFlowsHeaders"
          :items="flows"
        >
          <template #[`item.icon`]="{ item }">
            <v-icon v-if="item.icon" :name="item.icon || ''" :color="item.color" />
          </template>
        </v-table>
        <v-input
          v-model="flowDuplicatedName"
          v-tooltip.bottom="'Flow Name'"
          class="input-form"
          placeholder="Flow Name"
        />
        <v-checkbox
          class="input-form"
          label="Keep the same flow id as the original flow"
          :model-value="isPreviousIdPersisted"
          @update:model-value="isPreviousIdPersisted = $event"
        />
        <v-progress-linear v-if="isPullingFlows" :value="pullingProgressValue"></v-progress-linear>
      </v-card-text>
      <v-card-actions>
        <v-button :disabled="!selectedFlows.length" @click="proceedPull()"> Pull </v-button>
        <v-button secondary @click="pullFlowsDialog = false"> Close </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.input-form {
  margin-bottom: 7px;
  margin-top: 7px;
}

.ml-2 {
  margin-left: 10px;
}

.mb-2 {
  margin-bottom: 10px;
}
.container > .v-card.card-extended {
  --v-card-min-width: 1000px;
}

.credentials-table :deep(tbody tr) {
  cursor: pointer;
}

.button-action,
.button-delete-category {
  cursor: pointer;
  margin-left: 10px;
}

.actions-row {
  display: flex;
  align-items: center;
}

.mt-2 {
  margin-top: 10px;
}
</style>
