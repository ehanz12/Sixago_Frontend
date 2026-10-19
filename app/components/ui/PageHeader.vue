<script setup lang="ts">
defineProps<{ title: string; subtitle?: string; breadcrumb?: string }>()
</script>

<template>
  <div class="space-y-1">
    <p v-if="breadcrumb" class="text-xs font-medium text-muted tracking-wide">{{ breadcrumb }}</p>
    <h1 class="text-2xl font-bold tracking-tight text-on-surface">{{ title }}</h1>
    <p v-if="subtitle" class="text-sm text-muted">{{ subtitle }}</p>
  </div>
</template>
