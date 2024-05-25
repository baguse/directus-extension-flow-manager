<script setup lang="ts">
import { PropType, computed, ref, toRefs } from "vue";
import { ICredential } from "../types";
import { generateRandomString } from "../../utils/string.util";

const props = withDefaults(
  defineProps<{
    value: boolean;
  }>(),
  {}
);

const emit = defineEmits(["update:modelValue"]);

const credentials = defineModel("credentials", {
  type: Array as PropType<ICredential[]>,
  default: () => [],
});

const { value } = toRefs(props);

const credentialName = ref("");
const credentialUrl = ref("");
const credentialStaticToken = ref("");

const isEdit = ref(false);

const selectedCredential = ref<ICredential>({
  id: "",
  name: "",
  url: "",
  staticToken: "",
});
const credentialHeaders = ref([
  {
    text: "Name",
    value: "name",
  },
  {
    text: "URL",
    value: "url",
  },
]);

const isValid = computed(() => {
  if (isEdit.value) {
    return !!credentialName.value && !!credentialUrl.value;
  }
  return !!credentialName.value && !!credentialUrl.value && !!credentialStaticToken.value;
});

function saveCredential() {
  if (isEdit.value) {
    const newCredentials = [...credentials.value];
    const credentialIndex = newCredentials.findIndex((credential) => credential.id === selectedCredential.value.id);
    if (credentialIndex !== -1) {
      (newCredentials[credentialIndex] as ICredential).name = credentialName.value;
      (newCredentials[credentialIndex] as ICredential).url = credentialUrl.value;
      if (credentialStaticToken.value) {
        (newCredentials[credentialIndex] as ICredential).staticToken = credentialStaticToken.value;
      } else {
        (newCredentials[credentialIndex] as ICredential).staticToken = selectedCredential.value.staticToken;
      }

      credentials.value = newCredentials;
    }

    credentialName.value = "";
    credentialUrl.value = "";
    credentialStaticToken.value = "";
    isEdit.value = false;
    selectedCredential.value = {
      id: "",
      name: "",
      url: "",
      staticToken: "",
    };
  } else {
    const newCredentials = [
      ...credentials.value,
      {
        id: generateRandomString(10),
        name: credentialName.value,
        url: credentialUrl.value,
        staticToken: credentialStaticToken.value,
      },
    ];

    credentials.value = newCredentials;

    credentialName.value = "";
    credentialUrl.value = "";
    credentialStaticToken.value = "";
  }
}

function deleteCredential(item: ICredential) {
  const newCredentials = [...credentials.value];
  const credentialIndex = newCredentials.findIndex((credential) => credential.id === item.id);
  if (credentialIndex !== -1) {
    const credential = newCredentials[credentialIndex];
    if (credential?.id === selectedCredential.value.id) {
      isEdit.value = false;
      selectedCredential.value = {
        id: "",
        name: "",
        url: "",
        staticToken: "",
      };
      credentialName.value = "";
      credentialUrl.value = "";
      credentialStaticToken.value = "";
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
}

function cancelEditCredential() {
  isEdit.value = false;
  selectedCredential.value = {
    id: "",
    name: "",
    url: "",
    staticToken: "",
  };
  credentialName.value = "";
  credentialUrl.value = "";
  credentialStaticToken.value = "";
}
</script>

<template>
  <v-dialog :model-value="value" @update:model-value="emit('update:model-value', false)" :persistent="true">
    <v-card>
      <v-card-title>Credentials</v-card-title>
      <v-card-text>
        <v-table :headers="credentialHeaders" :items="credentials">
          <template #item-append="{ item }">
            <v-icon
              class="button-delete-category"
              name="edit"
              color="var(--warning)"
              @click="selectCredential(item)"
              v-tooltip.bottom="'Edit Credential'"
            />
            <v-icon
              class="button-delete-category"
              name="delete"
              color="var(--danger)"
              @click="deleteCredential(item)"
              v-tooltip.bottom="'Delete Credential'"
            />
          </template>
        </v-table>
        <v-input placeholder="Name" v-model="credentialName" v-tooltip.bottom="'Credential Name'" class="input-form"> </v-input>
        <v-input placeholder="URL" v-model="credentialUrl" v-tooltip.bottom="'Credential URL'" class="input-form"></v-input>
        <v-input
          :placeholder="isEdit ? '(Unchanged)' : 'Static Token'"
          v-model="credentialStaticToken"
          v-tooltip.bottom="'Credential Static Token'"
          class="input-form"
        ></v-input>
        <v-button :disabled="!isValid" @click="saveCredential">
          {{ isEdit ? "Save" : "Add" }}
        </v-button>
        <v-button secondary v-if="isEdit" class="ml-2" @click="cancelEditCredential"> Cancel </v-button>
      </v-card-text>
      <v-card-actions>
        <v-button secondary @click="emit('update:model-value', false)"> Close </v-button>
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
</style>
