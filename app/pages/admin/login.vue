<script setup lang="ts">
/**
 * Login SixAgo bersifat universal (semua role), sehingga lived di /login.
 * Route ini hanya dijaga agar bookmark & tautan lama tidak mati.
 */
definePageMeta({ middleware: () => navigateTo('/login', { redirectCode: 302 }) })
</script>

<template>
  <div />
</template>
