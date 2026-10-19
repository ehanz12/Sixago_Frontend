<script setup lang="ts">
/**
 * Profil & ganti password bersifat universal (semua role), sehingga lived di
 * /profil dan /password — bukan di bawah /admin. Route lama tetap dijaga
 * agar bookmark & tautan sebelumnya tidak mati.
 */
definePageMeta({ middleware: () => navigateTo('/profil', { redirectCode: 302 }) })
</script>

<template>
  <div />
</template>
