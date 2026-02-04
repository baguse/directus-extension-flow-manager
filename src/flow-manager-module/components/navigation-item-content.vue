<template>
  <v-list-item-icon>
    <v-icon :name="icon ?? 'label'" :color="color || 'var(--theme--background-inverted, var(--background-inverted))'" />
  </v-list-item-icon>
  <v-list-item-content>
    <div class="flex">
      <div v-if="type !== 'category'">
        <v-chip v-if="status !== 'active'" x-small class="item-name mr-4 trigger-chip" :style="{
          '--v-chip-color': 'var(--foreground-inverted, var(--theme--foreground))',
          '--v-chip-background-color': 'var(--theme--primary)'
        }">{{ triggerType }}</v-chip>
        <v-chip v-else x-small active class="item-name mr-4 trigger-chip" :style="{
          '--v-chip-color': 'var(--foreground-inverted, var(--theme--foreground))',
          '--v-chip-background-color': 'var(--theme--primary)'
        }">
          {{ triggerType }}
        </v-chip>
      </div>
      <v-text-overflow :style="{ color: status !== 'active' ? 'var(--foreground-subdued, var(--theme--foreground-subdued))' : 'var(--foreground, var(--theme--foreground))' }" :text="name" :highlight="search" />
    </div>
  </v-list-item-content>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    name: string;
    search?: string;
    icon?: string;
    color?: string;
    type?: string;
    triggerType?: string;
    status?: string;
  }>(),
  {
    icon: "label",
    color: "var(--theme--background-inverted, var(--background-inverted))",
  }
);
</script>

<style lang="scss" scoped>
.flex {
  display: flex;
}

.text-gray {
  color: var(--foreground-subdued, var(--theme--foreground-subdued, gray));
}

.trigger-chip {
  --v-chip-color: white;
  --v-chip-background-color: var(--theme--primary, var(--primary));
}

.mr-4 {
  margin-right: 4px;
}

.item-name {
  flex-shrink: 0;
}
</style>
