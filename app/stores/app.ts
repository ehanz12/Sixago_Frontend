import { defineStore } from 'pinia'

export interface AuthUser {
  id: number
  name: string
  nik: string
  email: string
  role: string
  grade: string
  status: string
  avatar?: string | null
  department?: { id: number; name: string; code: string } | null
  /**
   * Dikirim backend tapi TIDUK ditegakkan backend — jangan dipakai untuk gate.
   * Lihat catatan otoritas pada hasRole() di bawah.
   */
  permissions?: string[]
  email_notif_enabled?: boolean
}

const TOKEN_KEY = 'sixago_token_v2'
const USER_KEY = 'sixago_user_v2'

export const useAppStore = defineStore('app', () => {
  const token = ref<string | null>(null)
  const user = ref<AuthUser | null>(null)
  const mustChangePassword = ref(false)
  const userName = ref('Ratna Paramita')
  const userRole = ref('HR & Travel Admin')
  const isAuthenticated = computed(() => !!token.value)

  function syncDisplay() {
    userName.value = user.value?.name ?? 'Ratna Paramita'
    userRole.value = user.value?.role ?? 'HR & Travel Admin'
  }

  function persist() {
    if (import.meta.client) {
      if (token.value) {
        localStorage.setItem(TOKEN_KEY, token.value)
        localStorage.setItem(USER_KEY, JSON.stringify(user.value))
        localStorage.setItem('sixago_pwd_flag', mustChangePassword.value ? '1' : '0')
      } else {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        localStorage.removeItem('sixago_pwd_flag')
      }
      // Bersihkan cache versi lama (tanpa permissions)
      localStorage.removeItem('sixago_token')
      localStorage.removeItem('sixago_user')
    }
  }

  /**
   * CATATAN AUTHORITAS — baca sebelum menambah gate baru.
   *
   * Backend (SixAgoBeV2) TIDAK PERNAH menegakkan array `permissions` yang dikirim
   * pada respons login. Otorisasi di sana 100% berasal dari:
   *   - middleware `role:` (app/Http/Middleware/CheckRole.php)
   *   - User::hasRole() / canDecide() / visibleUserIds()
   *
   * Kolom `roles.permissions` di DB hanya diekspor ke API, tidak dipakai untuk
   * keputusan akses. `User::hasPermission()` pun nol call site di luar definisinya.
   *
   * Karena itu jangan memindahkan gate ke `can(permission)`: UI akan menampilkan
   * tombol yang backend tetap tolak dengan 403. Gate frontend WAJIB mencerminkan
   * nama role, seperti canDecideQueue / canFinance di bawah.
   */
  function hasRole(...roles: string[]): boolean {
    return !!user.value && roles.includes(user.value.role)
  }

  const isSuperAdmin = computed(() => user.value?.role === 'Super Admin')
  /** Boleh menekan tombol approve/reject di antrian & detail. */
  const canDecideQueue = computed(() => hasRole('Line Manager', 'Division Head', 'Finance Approver', 'Super Admin'))
  /**
   * Boleh batch-approve travel request. Sengaja TIDAK sama dengan canDecideQueue:
   * routes/api.php:37 membatasi POST /travel-requests/batch-approve ke
   * Line Manager, Division Head, Super Admin (Finance Approver tidak termasuk),
   * sedangkan /approval-queue/batch-approve (:44) memuatkannya.
   */
  const canBatchApproveTravel = computed(() => hasRole('Line Manager', 'Division Head', 'Super Admin'))
  /** Aksi finance: verifikasi, settlement, disburse. */
  const canFinance = computed(() => hasRole('Finance Approver', 'Super Admin'))
  /**
   * UPDATE /travel-requests/{id} hanya boleh pemilik atau Super Admin
   * (TravelRequestController:118-120) — jadi "Batalkan Pengajuan" harusDicek
   * kepemilikannya, bukan hanya role.
   */
  function isOwnRequest(rawUserId?: number | string | null): boolean {
    if (isSuperAdmin.value) return true
    const me = user.value?.id
    if (me == null || rawUserId == null) return false
    return String(rawUserId) === String(me)
  }

  async function login(corporateId: string, password: string) {
    const config = useRuntimeConfig()
    const data = await $fetch<{ access_token: string; user: AuthUser; must_change_password?: boolean }>('/login', {
      baseURL: config.public.apiBase as string,
      method: 'POST',
      body: { corporateId, password },
    })
    token.value = data.access_token
    user.value = data.user
    mustChangePassword.value = !!data.must_change_password
    syncDisplay()
    persist()
    return data.user
  }

  async function changePassword(currentPassword: string, password: string, passwordConfirmation: string) {
    const api = useApi()
    const res = await api<{ message: string }>('/user/password', {
      method: 'POST',
      body: { current_password: currentPassword, password, password_confirmation: passwordConfirmation },
    })
    mustChangePassword.value = false
    persist()
    return res.message
  }

  async function logout() {
    if (token.value) {
      try {
        const config = useRuntimeConfig()
        await $fetch('/logout', {
          baseURL: config.public.apiBase as string,
          method: 'POST',
          headers: { Authorization: `Bearer ${token.value}`, Accept: 'application/json' },
        })
      } catch { /* token kadaluwarsa — tetap bersihkan lokal */ }
    }
    token.value = null
    user.value = null
    mustChangePassword.value = false
    syncDisplay()
    persist()
    if (import.meta.client) await navigateTo('/login')
  }

  function hydrate() {
    if (import.meta.client) {
      token.value = localStorage.getItem(TOKEN_KEY)
      try {
        user.value = JSON.parse(localStorage.getItem(USER_KEY) || 'null')
      } catch {
        user.value = null
      }
      if (!token.value) user.value = null
      mustChangePassword.value = localStorage.getItem('sixago_pwd_flag') === '1'
      syncDisplay()
    }
  }

  async function logoutAll() {
    if (token.value) {
      try {
        const api = useApi()
        await api('/logout-all', { method: 'POST' })
      } catch { /* abaikan */ }
    }
    await logout()
  }

  return { token, user, userName, userRole, isAuthenticated, mustChangePassword, login, logout, logoutAll, changePassword, hydrate, hasRole, isSuperAdmin, canDecideQueue, canBatchApproveTravel, canFinance, isOwnRequest }
})
