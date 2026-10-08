<script setup lang="ts">
import { ref, toRefs, inject, computed } from 'vue';
import type { FlowManagerUtilsContext, IFlow } from '../../types';
import { useStores, useApi } from '@directus/extensions-sdk';
import { ENDPOINT_EXTENSION_NAME } from '../../constants';

const props = defineProps<{
  selectedItem: Partial<IFlow>;
  value: boolean;
}>();

const emit = defineEmits(['update:modelValue', 'reload:flow', 'reload:tabularFlow']);

const { selectedItem, value } = toRefs(props);
const { useNotificationsStore } = useStores();
const notificationsStore = useNotificationsStore();
const api = useApi();

const loadingRunFlow = ref(false);
const payload = ref('{}');
const responseJSON = ref('{}');

const flowManagerUtils = inject<FlowManagerUtilsContext>('flowManagerUtils');

const selectedCredential = computed(() =>
  flowManagerUtils?.credentials?.value?.find(
    (c) => c.id === flowManagerUtils?.selectedCredential?.value,
  ),
);

async function runFlow() {
  loadingRunFlow.value = true;

  let parsedPayload = {};
  try {
    parsedPayload = JSON.parse(payload.value || '{}');
  } catch {
    notificationsStore.add({
      type: 'error',
      title: 'Invalid JSON',
      message: 'Please provide a valid JSON payload',
      closeable: true,
      persist: true,
    });
    loadingRunFlow.value = false;
    return;
  }

  const method = (selectedItem.value?.options?.method || 'get').toLowerCase();
  try {
    let result = { data: {} };
    if (flowManagerUtils?.selectedCredential?.value === 'local') {
      result = await api.request({
        url: `/flows/trigger/${selectedItem.value?.id}`,
        method,
        data: parsedPayload,
        params: method === 'get' ? parsedPayload : undefined,
      });
    } else if (selectedCredential.value) {
      result = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
        url: `${selectedCredential.value.url}/flows/trigger/${selectedItem.value?.id}`,
        staticToken: selectedCredential.value.staticToken,
        payload: parsedPayload,
        method: selectedItem.value?.options?.method || 'GET',
      });
    }

    responseJSON.value = JSON.stringify(result.data, null, 2);

    emit('reload:flow');
    emit('reload:tabularFlow');
    notificationsStore.add({
      type: 'success',
      title: `Flow "${selectedItem.value?.name || ''}" has been run successfully`,
      closeable: true,
      persist: true,
    });
  } catch {
    notificationsStore.add({
      type: 'error',
      title: `Failed to run Flow "${selectedItem.value?.name || ''}"`,
      closeable: true,
      persist: true,
    });
  } finally {
    loadingRunFlow.value = false;
  }
}

function proceed() {
  responseJSON.value = '{}';
  runFlow();
}

function resetConfirm() {
  payload.value = '{}';
  responseJSON.value = '{}';
  emit('update:modelValue', false);
}
</script>

<template>
  <v-dialog :model-value="value" @update:model-value="resetConfirm">
    <v-card class="extended-card">
      <v-card-title>Run {{ selectedItem?.name }}</v-card-title>
      <v-card-text>
        <div class="mb-2 overflow-x-scroll">
          Request Body
          <interface-input-code
            :value="payload"
            language="JSON"
            line-wrapping
            line-number
            @input="($e: string) => (payload = $e)"
          />
          Response
          <interface-input-code :value="responseJSON" language="JSON" line-number />
        </div>
      </v-card-text>
      <v-card-actions>
        <v-button secondary @click="resetConfirm"> Cancel </v-button>
        <v-button :loading="loadingRunFlow" @click="proceed()"> Run </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style lang="scss" scoped>
.overflow-x-scroll {
  overflow-x: scroll;
}

.extended-card {
  min-width: 800px;
}
</style>
