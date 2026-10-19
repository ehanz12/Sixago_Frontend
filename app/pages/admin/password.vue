<script setup lang="ts">
/**
 * Ganti password bersifat universal (semua role), sehingga lived di /password —
 * bukan di bawah /admin. Route lama tetap dijaga agar bookmark tidak mati.
 */
definePageMeta({ middleware: () => navigateTo('/password', { redirectCode: 302 }) })
</script>

<template>
  <div />
</template>
