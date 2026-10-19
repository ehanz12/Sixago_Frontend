<script setup lang="ts">
withDefaults(defineProps<{
  open: boolean
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'primary' | 'danger'
  loading?: boolean
  icon?: string
}>(), {
  title: 'Konfirmasi',
  message: 'Apakah Anda yakin?',
  confirmLabel: 'Ya, Lanjutkan',
  cancelLabel: 'Batal',
  variant: 'primary',
  icon: 'help',
})
const emit = defineEmits<{ (e: 'confirm'): void; (e: 'close'): void }>()
</script>

<template>
  <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-150" leave-from-class="opacity-100" leave-to-class="opacity-0">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#27313F]/40 backdrop-blur-sm" @click.self="emit('close')">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div class="p-6 flex gap-4">
          <div :class="variant==='danger' ? 'bg-error-container text-error' : 'bg-secondary-container text-secondary'" class="w-10 h-10 rounded-full flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[22px]" aria-hidden="true">{{ icon }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-base font-bold text-on-surface">{{ title }}</h3>
            <p class="text-sm text-muted mt-1 leading-relaxed">{{ message }}</p>
            <slot />
          </div>
        </div>
        <div class="px-6 pb-5 flex justify-end gap-2">
          <button class="px-5 py-2 rounded-full bg-surface-container-low text-on-surface text-sm font-medium hover:bg-surface-container transition-colors" @click="emit('close')">{{ cancelLabel }}</button>
          <button :disabled="loading" :class="variant==='danger' ? 'bg-error text-white hover:bg-[#93000a]' : 'bg-primary text-white hover:opacity-95'" class="px-5 py-2 rounded-full text-sm font-semibold shadow-sm flex items-center gap-1.5 disabled:opacity-50 transition-all" @click="emit('confirm')">
            <span v-if="loading" class="material-symbols-outlined text-[16px] animate-spin" aria-hidden="true">progress_activity</span>
            <span>{{ confirmLabel }}</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
