<script setup lang="ts">
defineProps<{ icon?: string; title?: string; message?: string }>()
</script>

<template>
  <div class="py-10 text-center text-sm text-muted flex flex-col items-center gap-2">
    <span class="material-symbols-outlined text-[32px] text-muted" aria-hidden="true">{{ icon ?? 'search_off' }}</span>
    <span class="font-medium text-on-surface">{{ title ?? 'Tidak ada data' }}</span>
    <span class="text-xs max-w-md">{{ message ?? 'Coba ubah filter atau kata kunci pencarian.' }}</span>
    <slot />
  </div>
</template>
