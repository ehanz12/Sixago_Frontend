<script setup lang="ts">
type Status = 'success' | 'warning' | 'error' | 'neutral' | 'info' | 'primary'

withDefaults(
  defineProps<{
    status?: Status
    dot?: boolean
    label?: string
  }>(),
  { status: 'neutral', dot: true }
)
const map: Record<Status, string> = {
  success: 'bg-secondary-container text-[#2e6f3c]',
  primary: 'bg-primary text-white',
  warning: 'bg-amber-100 text-amber-800',
  error: 'bg-error-container text-[#93000a]',
  neutral: 'bg-surface-container-low text-muted',
  info: 'bg-surface-container text-on-surface',
}
const dotMap: Record<Status, string> = {
  success: 'bg-primary',
  primary: 'bg-white',
  warning: 'bg-amber-500',
  error: 'bg-error',
  neutral: 'bg-muted',
  info: 'bg-secondary',
}
</script>

<template>
  <span :class="['inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold', map[status]]">
    <span v-if="dot" :class="['w-1.5 h-1.5 rounded-full', dotMap[status]]" />
    <slot>{{ label }}</slot>
  </span>
</template>
