<script setup lang="ts">
import { computed, ref, toRefs } from "vue";
import { ICredential } from "../types";
import { maskingText } from "../../utils/string.util";

const props = withDefaults(
  defineProps<{
    value: boolean;
    credentials: ICredential[];
    loading: boolean;
  }>(),
  {
    credentials: () => [],
    loading: false,
  }
);

const emit = defineEmits(["update:modelValue", "proceed"]);

const { value, credentials, loading } = toRefs(props);

const selectedId = ref<string | null>(null);

const credentialOptions = computed(() => {
  return credentials.value.map((credential) => ({
    text: credential.name,
    value: credential.id,
  }));
});

const selectedItem = computed(() => {
  return credentials.value.find((credential) => credential.id === selectedId.value);
});

function pushToCloud() {
  emit("proceed", selectedItem.value);
  selectedId.value = null;
}
</script>

<template>
  <v-dialog :model-value="value" @update:model-value="emit('update:model-value', false)" :persistent="true">
    <v-card>
      <v-card-title>Push to Cloud</v-card-title>
      <v-card-text>
        <v-select v-model="selectedId" :items="credentialOptions"></v-select>
        <div>URL: {{ selectedItem?.url || "-" }}</div>
        <div>Static Token: {{ maskingText(selectedItem?.staticToken) || "-" }}</div>
      </v-card-text>
      <v-card-actions>
        <v-button secondary @click="emit('update:model-value', false)"> Close </v-button>
        <v-button :disabled="!selectedItem" @click="pushToCloud()" :loading="loading"> Proceed </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
