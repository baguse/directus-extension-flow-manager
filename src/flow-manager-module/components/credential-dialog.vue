<script setup lang="ts">
import { type PropType, computed, inject, ref, toRefs, watch } from "vue";
import type { ICredential, IFlow } from "../../types";
import { generateRandomString } from "../../utils/string.util";
import { useApi } from "@directus/extensions-sdk";
import { ENDPOINT_EXTENSION_NAME } from "../../constants";
const props = withDefaults(
	defineProps<{
		value: boolean;
	}>(),
	{},
);

const emit = defineEmits(["update:modelValue"]);

const credentials = defineModel("credentials", {
	type: Array as PropType<ICredential[]>,
	default: () => [],
});

const api = useApi();

const { value } = toRefs(props);

const credentialName = ref("");
const credentialUrl = ref("");
const credentialStaticToken = ref("");
const flows = ref<IFlow[]>([]);
const selectedFlows = ref<IFlow[]>([]);
const flowDuplicatedName = ref("");
const pullingProgressValue = ref(0);

const isEdit = ref(false);
const pullFlowsDialog = ref(false);
const isPreviousIdPersisted = ref(false);
const isPullingFlows = ref(false);
const isPullingFlowError = ref(false);

const errors = ref<string[]>([]);

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
		width: 300,
	},
	{
		text: "URL",
		value: "url",
		width: 400,
	},
]);

watch(
	[selectedFlows],
	([value]) => {
		if (value.length === 1) {
			flowDuplicatedName.value = `${value[0]?.name} - Copy`;
		} else if (value.length > 1) {
			flowDuplicatedName.value = "{{original_name}} - Copy";
		} else {
			flowDuplicatedName.value = "";
		}
	},
	{
		immediate: true,
	},
);

const isValid = computed(() => {
	if (isEdit.value) {
		return !!credentialName.value && !!credentialUrl.value;
	}
	return (
		!!credentialName.value &&
		!!credentialUrl.value &&
		!!credentialStaticToken.value
	);
});

const flowManagerUtils = inject<{
	createFlow: (flow: IFlow) => Promise<void>;
	reloadFlow: () => Promise<void>;
	reloadTabularFlow: () => Promise<void>;
}>("flowManagerUtils");

function saveCredential() {
	let credentialUrlParsed = credentialUrl.value;
	try {
		const url = parseUrl(credentialUrlParsed);
		credentialUrlParsed = url;
		errors.value = [];
	} catch {
		errors.value = ["Invalid URL"];
		return;
	}
	if (isEdit.value) {
		const newCredentials = [...credentials.value];
		const credentialIndex = newCredentials.findIndex(
			(credential) => credential.id === selectedCredential.value.id,
		);
		if (credentialIndex !== -1) {
			(newCredentials[credentialIndex] as ICredential).name =
				credentialName.value;
			(newCredentials[credentialIndex] as ICredential).url =
				credentialUrlParsed;
			if (credentialStaticToken.value) {
				(newCredentials[credentialIndex] as ICredential).staticToken =
					credentialStaticToken.value;
			} else {
				(newCredentials[credentialIndex] as ICredential).staticToken =
					selectedCredential.value.staticToken;
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
				url: credentialUrlParsed,
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
	const credentialIndex = newCredentials.findIndex(
		(credential) => credential.id === item.id,
	);
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

const pullFlowsHeaders = ref([
	{
		text: "",
		value: "icon",
		width: 50,
	},
	{
		text: "Name",
		value: "name",
		width: 300,
	},
	{
		text: "Description",
		value: "description",
		width: 400,
	},
]);

async function pullFlows(credential: ICredential) {
	try {
		flows.value = [];
		isPullingFlowError.value = false;
		const fields = ["*", "operations.*"];
		const {
			data: { data },
		} = await api.post(`/${ENDPOINT_EXTENSION_NAME}/flow-manager/process`, {
			url: `${credential?.url}/flows?fields=${fields.join(",")}`,
			staticToken: credential?.staticToken,
			method: "GET",
		});
		flows.value = data;
		pullFlowsDialog.value = true;
		flowDuplicatedName.value = "";
		isPreviousIdPersisted.value = false;
	} catch {
		isPullingFlowError.value = true;
	}
}

async function proceedPull() {
	try {
		isPullingFlows.value = true;
		pullingProgressValue.value = 0;
		const flowsToPull = selectedFlows.value.map((flow) => {
			return {
				...flow,
				status: "inactive",
				name: flowDuplicatedName.value.replace(/{{original_name}}/g, flow.name),
				id: isPreviousIdPersisted.value ? flow.id : undefined,
			};
		});

		for (let i = 0; i < flowsToPull.length; i++) {
			const flow = flowsToPull[i] as IFlow;
			await flowManagerUtils?.createFlow(flow);
			pullingProgressValue.value = Math.round((i / flowsToPull.length) * 100);
		}
	} catch {
    //
	} finally {
		pullFlowsDialog.value = false;
		isPullingFlows.value = false;
		selectedFlows.value = [];
		flowDuplicatedName.value = "";
		isPreviousIdPersisted.value = false;
		pullingProgressValue.value = 0;
		flowManagerUtils?.reloadFlow();
		flowManagerUtils?.reloadTabularFlow();
	}
}

function parseUrl(url: string) {
	try {
		const urlParsed = new URL(url);
		if (!urlParsed.origin || urlParsed.origin === "null") {
			throw new Error("Invalid URL");
		}
		const regex = /^\/([^/]+)(\/admin\/)/;
		const match = urlParsed.pathname.match(regex);

		if (match) {
			return `${urlParsed.origin}/${match[1]}`;
		}
		return urlParsed.origin;
	} catch {
		throw new Error("Invalid URL");
	}
}
</script>

<template>
  <v-dialog :model-value="value" @update:model-value="emit('update:modelValue', false)" :persistent="true">
    <v-card>
      <v-card-title>Credentials</v-card-title>
      <v-card-text>
        <v-error v-if="isPullingFlowError" :error="{ extensions: { code: 'Error' }, message: 'Failed to pull flows' }"></v-error>
        <v-table :headers="credentialHeaders" :items="credentials">
          <template #item-append="{ item }">
            <v-icon class="button-delete-category" name="download" @click="pullFlows(item)" v-tooltip.bottom="'Pull Flows'" />
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
        <v-error
          v-for="(error, indexError) in errors"
          class="mb-2"
          :key="`errorIndex-${indexError}`"
          :error="{ extensions: { code: 'Error' }, message: error }"
        ></v-error>
        <v-button :disabled="!isValid" @click="saveCredential">
          {{ isEdit ? "Save" : "Add" }}
        </v-button>
        <v-button secondary v-if="isEdit" class="ml-2" @click="cancelEditCredential"> Cancel </v-button>
      </v-card-text>
      <v-card-actions>
        <v-button secondary @click="emit('update:modelValue', false)"> Close </v-button>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog :model-value="pullFlowsDialog" @update:model-value="pullFlowsDialog = false" :persistent="true">
    <v-card class="card-extended">
      <v-card-title>Flows</v-card-title>
      <v-card-text>
        <v-table v-model="selectedFlows" show-select="multiple" :headers="pullFlowsHeaders" :items="flows">
          <template #[`item.icon`]="{ item }">
            <v-icon v-if="item.icon" :name="item.icon || ''" :color="item.color" />
          </template>
        </v-table>
        <v-input class="input-form" placeholder="Flow Name" v-model="flowDuplicatedName" v-tooltip.bottom="'Flow Name'" />
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

.button-delete-category {
  cursor: pointer;
  margin-left: 10px;
}
</style>
