<script setup lang="ts">
import { useAppStore } from '~/stores/app'

/**
 * Pintu masuk.Selalu arahkan ke /admin dulu supaya auth.global.ts yang menjadi
 * penjaga (ia jalan di server maupun client). Role landing baru ditentukan
 * resolveHomePath setelah token terbaca di client — hydrate() memang client-only.
 */
definePageMeta({
  middleware: () => {
    const app = useAppStore()
    app.hydrate()
    if (import.meta.client && app.isAuthenticated) {
      return navigateTo(resolveHomePath(app.user?.role), { redirectCode: 302 })
    }
    return navigateTo('/admin', { redirectCode: 302 })
  },
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background">
    <span class="text-sm text-muted flex items-center gap-2">
      <span class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
      Mengalihkan ke dashboard...
    </span>
  </div>
</template>
