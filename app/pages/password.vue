<script setup lang="ts">
definePageMeta({ layout: 'admin' })
import { useAppStore } from '~/stores/app'

const app = useAppStore()
const toast = useToast()

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const saving = ref(false)

async function handleChange() {
  if (newPassword.value.length < 8) {
    toast.show('Password baru minimal 8 karakter.', 'info', 'info')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    toast.show('Konfirmasi password tidak sama.', 'info', 'info')
    return
  }
  saving.value = true
  try {
    const msg = await app.changePassword(currentPassword.value, newPassword.value, confirmPassword.value)
    toast.show(msg)
    await navigateTo(resolveHomePath(app.user?.role))
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal memperbarui password.', 'error', 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col w-full gap-6 pb-8 font-sans max-w-xl mx-auto mt-4">
    <BaseCard padding="p-6">
      <div class="flex items-center gap-3 mb-1">
        <div class="w-10 h-10 rounded-full bg-secondary-container text-secondary flex items-center justify-center">
          <span class="material-symbols-outlined text-[22px]" aria-hidden="true">lock_reset</span>
        </div>
        <div>
          <h1 class="text-lg font-bold">Ganti Password</h1>
          <p v-if="app.mustChangePassword" class="text-xs text-error font-medium">Demi keamanan, Anda wajib membuat password baru sebelum melanjutkan.</p>
          <p v-else class="text-xs text-muted">Perbarui password akun Anda secara berkala.</p>
        </div>
      </div>
      <form class="mt-4 space-y-3" @submit.prevent="handleChange">
        <div class="space-y-1">
          <label class="text-sm font-medium" for="curPwd">Password Saat Ini</label>
          <input id="curPwd" v-model="currentPassword" required type="password" autocomplete="current-password" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white" placeholder="••••••••">
        </div>
        <div class="space-y-1">
          <label class="text-sm font-medium" for="newPwd">Password Baru (min. 8 karakter)</label>
          <input id="newPwd" v-model="newPassword" required minlength="8" type="password" autocomplete="new-password" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white" placeholder="••••••••">
        </div>
        <div class="space-y-1">
          <label class="text-sm font-medium" for="confPwd">Konfirmasi Password Baru</label>
          <input id="confPwd" v-model="confirmPassword" required minlength="8" type="password" autocomplete="new-password" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white" placeholder="••••••••">
        </div>
        <div class="pt-2 flex justify-end">
          <BaseButton variant="primary" type="submit" :disabled="saving">{{ saving ? 'Menyimpan...' : 'Simpan Password Baru' }}</BaseButton>
        </div>
      </form>
    </BaseCard>
    <AppToast :msg="toast.msg.value" :visible="toast.visible.value" :icon="toast.icon.value" />
  </div>
</template>
