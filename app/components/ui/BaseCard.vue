<script setup lang="ts">
withDefaults(
  defineProps<{
    padding?: string
    hover?: boolean
  }>(),
  {
    padding: 'p-6',
    hover: false,
  }
)
</script>

<template>
  <div
    :class="[
      'bg-white rounded-xl shadow-sm',
      padding,
      hover ? 'hover:shadow-md transition-shadow' : '',
    ]"
  >
    <slot />
  </div>
</template>
