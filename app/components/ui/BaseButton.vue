<script setup lang="ts">
type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'
withDefaults(
  defineProps<{
    variant?: Variant
    size?: Size
    icon?: string
    trailingIcon?: string
    loading?: boolean
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
    ariaLabel?: string
  }>(),
  {
    variant: 'primary',
    size: 'md',
    icon: undefined,
    trailingIcon: undefined,
    ariaLabel: undefined,
    type: 'button',
  }
)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :aria-label="ariaLabel"
    :class="[
      'inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed',
      variant === 'primary' ? 'bg-primary-container text-[#003e0f] shadow-sm hover:opacity-95 active:scale-[0.98]' : '',
      variant === 'secondary' ? 'bg-secondary-container text-[#2e6f3c] hover:opacity-90' : '',
      variant === 'outline' ? 'bg-white border border-[#d9e3f6] text-on-surface hover:bg-surface-container-low' : '',
      variant === 'ghost' ? 'bg-transparent text-muted hover:bg-surface-container-low' : '',
      variant === 'danger' ? 'bg-error-container text-[#93000a] hover:bg-error hover:text-white' : '',
      size === 'sm' ? 'px-3 py-1.5 text-xs' : '',
      size === 'md' ? 'px-5 py-2.5 text-sm' : '',
      size === 'lg' ? 'px-6 py-3 text-sm' : '',
    ]"
  >
    <span v-if="icon" class="material-symbols-outlined text-[18px]">{{ icon }}</span>
    <slot />
    <span v-if="trailingIcon" class="material-symbols-outlined text-[18px]">{{ trailingIcon }}</span>
  </button>
</template>
