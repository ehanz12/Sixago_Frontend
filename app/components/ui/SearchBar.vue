<script setup lang="ts">
withDefaults(
  defineProps<{
    placeholder?: string
    modelValue?: string
  }>(),
  { placeholder: 'Cari...', modelValue: '' }
)
defineEmits<{ (e: 'update:modelValue', v: string): void }>()
</script>

<template>
  <div class="relative w-full">
    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[18px]">search</span>
    <input
      :value="modelValue"
      :placeholder="placeholder"
      type="text"
      class="w-full pl-9 pr-3 py-2 rounded-full bg-surface-container-low text-on-surface placeholder:text-muted text-sm focus:outline-none focus:bg-white shadow-sm transition-all"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>
