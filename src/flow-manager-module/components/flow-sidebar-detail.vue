<script setup lang="ts">
import { computed } from 'vue';
import type { IFlow, IFolder, IOperation } from '../../types';

const props = defineProps<{
  selectedItem?: IFlow | IFolder | null;
  formatDateLong: (date?: string | null) => string;
  getOperationNameById: (operationId: string) => IOperation | undefined;
}>();

const emit = defineEmits<{
  (e: 'openVersionDialog', flow: IFlow): void;
  (e: 'openGitExportDialog', flow: IFlow): void;
}>();

const selectedFlow = computed<IFlow | null>(() => {
  if (!props.selectedItem?.id || (props.selectedItem as IFolder).type === 'category') {
    return null;
  }
  return props.selectedItem as IFlow;
});
</script>

<template>
  <sidebar-detail id="flow-information" icon="info" :title="'information'">
    <div v-if="selectedFlow" class="sidebar-grid">
      <div class="field-label">Flow ID</div>
      <div class="sidebar-text">{{ selectedFlow.id }}</div>

      <div class="field-label mt-2">Flow Name</div>
      <div>{{ selectedFlow.name }}</div>

      <div class="field-label mt-2">Status</div>
      <div>{{ selectedFlow.status?.toUpperCase() || 'N/A' }}</div>

      <div class="field-label mt-2">Trigger Type</div>
      <div>{{ selectedFlow.trigger?.toUpperCase() || 'N/A' }}</div>

      <div class="field-label mt-2">Description</div>
      <div>{{ selectedFlow.description || 'N/A' }}</div>

      <div class="field-label mt-2">Total Runs</div>
      <div>
        {{ selectedFlow.flow_manager_metadata_id?.flow_manager_run_counter || 0 }}
      </div>

      <div class="field-label mt-2">Last Run</div>
      <div>
        {{
          formatDateLong(
            selectedFlow.flow_manager_metadata_id?.flow_manager_last_run_at as unknown as string,
          )
        }}
      </div>

      <div class="field-label mt-2">Last Error Message</div>
      <div>
        {{ selectedFlow.flow_manager_metadata_id?.flow_manager_last_run_message || 'N/A' }}
      </div>

      <div class="field-label mt-2">Failed Operation Name</div>
      <div>
        {{
          getOperationNameById(
            selectedFlow.flow_manager_metadata_id?.flow_manager_last_run_operation || '',
          )?.name || 'N/A'
        }}
      </div>

      <div class="sidebar-actions mt-3">
        <v-button
          small
          secondary
          class="sidebar-action-btn"
          @click="emit('openVersionDialog', selectedFlow)"
        >
          <v-icon name="history" class="mr-1" />
          Version History
        </v-button>

        <v-button
          small
          secondary
          class="sidebar-action-btn mt-1"
          @click="emit('openGitExportDialog', selectedFlow)"
        >
          <v-icon name="terminal" class="mr-1" />
          Export for Git
        </v-button>
      </div>
    </div>
  </sidebar-detail>
</template>

<style scoped lang="scss">
.sidebar-grid {
  display: grid;
}

.field-label {
  font-weight: bold;
}

.sidebar-text {
  word-break: break-all;
}

.mt-2 {
  margin-top: 8px;
}

.mt-3 {
  margin-top: 14px;
}

.mt-1 {
  margin-top: 6px;
}

.mr-1 {
  margin-right: 4px;
}

.sidebar-actions {
  display: flex;
  flex-direction: column;
}

.sidebar-action-btn {
  width: 100%;
  justify-content: flex-start;
}
</style>
