<script setup lang="ts">
defineProps<{ msg: string; visible: boolean; icon?: string }>()
</script>

<template>
  <Transition
    enter-active-class="transition duration-300"
    enter-from-class="translate-y-10 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-200"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-10 opacity-0"
  >
    <div
      v-if="visible"
      class="fixed bottom-6 right-6 z-50 bg-inverse-surface text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2"
      role="status"
      aria-live="polite"
    >
      <span class="material-symbols-outlined text-primary-fixed text-[20px]" aria-hidden="true">{{ icon ?? 'check_circle' }}</span>
      <span class="text-sm font-medium">{{ msg }}</span>
    </div>
  </Transition>
</template>
