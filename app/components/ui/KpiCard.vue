<script setup lang="ts">
defineProps<{
  label: string
  value: string
  sublabel?: string
  icon: string
  trend?: string
  trendColor?: string
}>()
</script>

<template>
  <div class="p-6 rounded-xl bg-white shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
    <div class="flex items-start justify-between">
      <div class="space-y-1">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">{{ label }}</span>
        <div class="text-2xl font-bold tracking-tight mt-1">
          {{ value }} <span v-if="sublabel" class="text-sm font-normal text-muted">{{ sublabel }}</span>
        </div>
      </div>
      <div class="w-12 h-12 rounded-full bg-secondary-container/60 flex items-center justify-center text-secondary">
        <span class="material-symbols-outlined text-[24px]">{{ icon }}</span>
      </div>
    </div>
    <slot>
      <div v-if="trend" class="mt-4 pt-3 flex items-center gap-2">
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container text-[#2e6f3c] text-xs font-medium">{{ trend }}</span>
      </div>
    </slot>
  </div>
</template>
