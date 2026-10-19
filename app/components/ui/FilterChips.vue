<script setup lang="ts">
defineProps<{ chips: { label: string; value: string }[] }>()
const emit = defineEmits<{ (e:'remove', value: string): void; (e:'clear'): void }>()
</script>

<template>
  <div v-if="chips.length" class="flex flex-wrap items-center gap-1.5">
    <span
      v-for="c in chips" :key="c.value"
      class="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-secondary-container text-[#2e6f3c] text-xs font-medium"
    >
      {{ c.label }}: {{ c.value }}
      <button :aria-label="`Hapus filter ${c.label}`" class="w-5 h-5 rounded-full bg-white/70 hover:bg-white flex items-center justify-center transition-colors" @click="emit('remove', c.value)">
        <span class="material-symbols-outlined text-[14px]">close</span>
      </button>
    </span>
    <button class="text-xs text-muted hover:text-on-surface underline ml-1" @click="emit('clear')">Hapus semua</button>
  </div>
</template>
