<script setup lang="ts">
import logoSixAgo from '~/assets/logo-SixAgo.jpeg'
import { useAppStore } from '~/stores/app'

definePageMeta({ layout: 'auth' })

const app = useAppStore()

const corporateId = ref('')
const password = ref('')
const showPassword = ref(false)
const submitLoading = ref(false)
const toastMsg = ref('')
const toastVisible = ref(false)
const toastType = ref<'success' | 'info'>('success')

function showToast(msg: string, type: 'success' | 'info' = 'success') {
  toastMsg.value = msg; toastType.value = type; toastVisible.value = true
  setTimeout(() => toastVisible.value = false, 3200)
}

async function handleSubmit() {
  if (!corporateId.value.trim() || !password.value.trim()) {
    showToast('Lengkapi Email/NIK dan Kata Sandi terlebih dahulu.', 'info')
    return
  }
  submitLoading.value = true
  try {
    const user = await app.login(corporateId.value.trim(), password.value)
    if (app.mustChangePassword) {
      showToast('Demi keamanan, silakan buat password baru terlebih dahulu.', 'info')
      await navigateTo('/password')
      return
    }
    showToast(`Selamat datang, ${user.name}! Mengalihkan ke dashboard admin.`)
    await navigateTo(resolveHomePath(user.role))
  } catch (e: any) {
    // Backend: 401 invalid credentials, 403 akun non-Aktif, 422 validasi.
    const msg = e?.data?.message || 'Email/NIK atau kata sandi salah. Silakan coba lagi.'
    showToast(msg, 'info')
  } finally {
    submitLoading.value = false
  }
}
</script>

<template>
  <div class="w-full">
    <!-- Brand -->
    <div class="flex flex-col items-center text-center">
      <img
        alt="SixAgo Brand Logo"
        class="h-10 w-auto mix-blend-multiply"
        :src="logoSixAgo"
        width="40"
        height="40"
        loading="eager"
        decoding="async"
      >
      <div class="inline-flex items-center gap-1.5 px-2.5 py-1 mt-[18px] rounded-full bg-surface-container-low text-secondary text-[11px] font-semibold tracking-wider">
        <span class="material-symbols-outlined text-[14px] text-primary" style="font-variation-settings:'FILL' 1" aria-hidden="true">flight_takeoff</span>
        <span>ENTERPRISE GOVERNANCE</span>
      </div>
      <h1 class="text-lg font-bold tracking-tight text-on-surface mt-2.5">Masuk ke SixAgo Portal</h1>
      <p class="text-xs text-on-surface-variant mt-3">Sistem Manajemen Perjalanan Dinas Korporat Terpadu</p>
    </div>

    <!-- Form -->
    <form class="w-full mt-14" novalidate @submit.prevent="handleSubmit">
      <!-- Email / NIK -->
      <div>
        <label class="block text-[13px] font-medium text-on-surface" for="corporateId">Email Perusahaan / NIK</label>
        <div class="relative flex items-center mt-2.5">
          <span class="material-symbols-outlined absolute left-3.5 text-muted pointer-events-none text-[20px]" aria-hidden="true">alternate_email</span>
          <input
            id="corporateId"
            v-model="corporateId"
            class="w-full h-[41px] pl-10 pr-4 rounded-full bg-surface-container-low text-on-surface text-sm placeholder:text-outline/70 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:bg-surface-container-lowest transition-all"
            name="corporateId"
            placeholder="nama@perusahaan.co.id"
            required
            type="text"
            autocomplete="username"
          >
        </div>
        <p class="text-[11px] text-outline mt-2 px-2">Gunakan akun SSO resmi atau NIK 8-digit terdaftar</p>
      </div>

      <!-- Password -->
      <div class="mt-6">
        <div class="flex items-center justify-between px-1">
          <label class="block text-[13px] font-medium text-on-surface" for="passwordField">Kata Sandi</label>
          <span class="text-[13px] text-muted" title="Reset password mandiri belum tersedia — hubungi Super Admin">Lupa Password? Hubungi Admin</span>
        </div>
        <div class="relative flex items-center mt-2.5">
          <span class="material-symbols-outlined absolute left-3.5 text-muted pointer-events-none text-[20px]" aria-hidden="true">lock</span>
          <input
            id="passwordField"
            v-model="password"
            class="w-full h-[41px] pl-10 pr-11 rounded-full bg-surface-container-low text-on-surface text-sm placeholder:text-outline/70 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:bg-surface-container-lowest transition-all"
            name="password"
            placeholder="••••••••••••"
            required
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
          >
          <button
            :aria-label="showPassword ? 'Sembunyikan password' : 'Tampilkan password'"
            class="absolute right-3 p-1 rounded-full text-muted hover:text-on-surface transition-colors"
            type="button"
            @click="showPassword = !showPassword"
          >
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">{{ showPassword ? 'visibility_off' : 'visibility' }}</span>
          </button>
        </div>
      </div>

      <!-- Sesi selalu per-perangkat (token Sanctum); tidak ada opsi ingat-saya -->
      <div class="flex items-center justify-between mt-6">
        <span class="text-xs text-on-surface-variant">Sesi berlaku di perangkat ini. Gunakan "Keluar Semua Perangkat" di Profil untuk mencabut semua sesi.</span>
        <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-muted bg-surface-container-low px-2 py-0.5 rounded-full">
          <span class="material-symbols-outlined text-[13px] text-primary" aria-hidden="true">verified_user</span>
          Tersertifikasi
        </span>
      </div>

      <!-- Submit -->
      <div class="mt-7">
        <button
          class="w-full h-[41px] px-6 rounded-full bg-primary hover:opacity-95 active:scale-[0.98] text-sm font-semibold text-white shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-60"
          type="submit"
          :disabled="submitLoading"
        >
          <span v-if="!submitLoading">Masuk ke Akun</span>
          <span v-else class="flex items-center gap-2"><span class="material-symbols-outlined text-[18px] animate-spin" aria-hidden="true">progress_activity</span> Memproses...</span>
          <span v-if="!submitLoading" class="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_forward</span>
        </button>
      </div>
    </form>

    <!-- Toast -->
    <div
      :class="toastVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'"
      class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-inverse-surface text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 transition-all"
      role="status"
      aria-live="polite"
    >
      <span class="material-symbols-outlined text-primary-fixed text-[20px]" aria-hidden="true">{{ toastType === 'success' ? 'check_circle' : 'info' }}</span>
      <span class="text-sm font-medium">{{ toastMsg }}</span>
    </div>
  </div>
</template>
