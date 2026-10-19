<script setup lang="ts">
definePageMeta({ layout: 'admin' })
import { useAppStore } from '~/stores/app'
import { useApi } from '~/composables/useApi'

const api = useApi()
const app = useAppStore()
const toast = useToast()

const form = reactive({
  name: app.user?.name ?? '',
  whatsapp: (app.user as any)?.whatsapp ?? '',
  avatar: app.user?.avatar ?? '',
  email_notif_enabled: (app.user as any)?.email_notif_enabled ?? true,
})
const saving = ref(false)
const loggingAllOut = ref(false)

async function saveProfile() {
  saving.value = true
  try {
    const updated = await api<any>('/user/profile', {
      method: 'PUT',
      body: {
        name: form.name.trim() || undefined,
        whatsapp: form.whatsapp.trim() || undefined,
        avatar: form.avatar.trim() || undefined,
        email_notif_enabled: form.email_notif_enabled,
      },
    })
    if (app.user) {
      app.user.name = updated.name
      ;(app.user as any).email_notif_enabled = updated.email_notif_enabled
      app.user.avatar = updated.avatar
    }
    toast.show('Profil berhasil diperbarui.')
  } catch {
    toast.show('Gagal memperbarui profil.', 'error', 'error')
  } finally {
    saving.value = false
  }
}

async function logoutAllDevices() {
  loggingAllOut.value = true
  try {
    await app.logoutAll()
    toast.show('Semua sesi perangkat berhasil diakhiri.')
  } finally {
    loggingAllOut.value = false
  }
}
</script>

<template>
  <div class="flex flex-col w-full gap-6 pb-8 font-sans max-w-2xl mx-auto mt-4">
    <BaseCard padding="p-6">
      <div class="flex items-center gap-3 mb-1">
        <div class="w-10 h-10 rounded-full bg-secondary-container text-secondary flex items-center justify-center">
          <span class="material-symbols-outlined text-[22px]" aria-hidden="true">account_circle</span>
        </div>
        <div>
          <h1 class="text-lg font-bold">Profil Saya</h1>
          <p class="text-xs text-muted">{{ app.user?.email }} • {{ app.userRole }}</p>
        </div>
      </div>
      <form class="mt-4 space-y-3" @submit.prevent="saveProfile">
        <div class="space-y-1">
          <label class="text-sm font-medium" for="pfName">Nama Lengkap</label>
          <input id="pfName" v-model="form.name" required type="text" aria-label="Nama lengkap" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white">
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-sm font-medium" for="pfWa">No. WhatsApp</label>
            <input id="pfWa" v-model="form.whatsapp" type="text" aria-label="WhatsApp" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white" placeholder="+62 ...">
          </div>
          <div class="space-y-1">
            <label class="text-sm font-medium" for="pfAvatar">URL Foto Profil</label>
            <input id="pfAvatar" v-model="form.avatar" type="url" aria-label="Foto profil" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white" placeholder="https://...">
          </div>
        </div>
        <label class="flex items-center justify-between p-4 rounded-xl bg-surface-container-low cursor-pointer">
          <span class="flex flex-col"><span class="text-sm font-medium">Email Notifikasi Keputusan</span><span class="text-xs text-muted">Kirim email tiap ada approve / reject / pencairan</span></span>
          <input v-model="form.email_notif_enabled" type="checkbox" class="w-5 h-5 accent-primary" aria-label="Email notifikasi">
        </label>
        <div class="flex items-center justify-end gap-2 pt-1">
          <NuxtLink to="/password" class="px-5 py-2.5 rounded-full bg-surface-container-low text-sm font-medium hover:bg-surface-container transition-all">Ganti Password</NuxtLink>
          <BaseButton variant="primary" type="submit" :disabled="saving">{{ saving ? 'Menyimpan...' : 'Simpan Profil' }}</BaseButton>
        </div>
      </form>
    </BaseCard>

    <BaseCard padding="p-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-error-container text-error flex items-center justify-center">
            <span class="material-symbols-outlined text-[22px]" aria-hidden="true">devices</span>
          </div>
          <div>
            <h2 class="text-base font-bold">Sesi Perangkat</h2>
            <p class="text-xs text-muted">Akhiri semua sesi login di perangkat lain (token ikut dicabut).</p>
          </div>
        </div>
        <BaseButton variant="danger" icon="logout" :disabled="loggingAllOut" @click="logoutAllDevices">{{ loggingAllOut ? 'Memproses...' : 'Keluar Semua Perangkat' }}</BaseButton>
      </div>
    </BaseCard>
    <AppToast :msg="toast.msg.value" :visible="toast.visible.value" :icon="toast.icon.value" />
  </div>
</template>
