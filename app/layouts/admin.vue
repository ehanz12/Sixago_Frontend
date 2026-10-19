<script setup lang="ts">
import { useAppStore } from '~/stores/app'

const route = useRoute()
const app = useAppStore()
const { canDecideQueue, isSuperAdmin } = storeToRefs(app)
const isActive = (path: string) => route.path === path || route.path.startsWith(path + '/')
const mobileOpen = ref(false)

// Visibilitas menu sesuai role (backend tetap menolak via 403 bila dipaksa).
// Uang Muka & Reimbursement tampil untuk semua role: daftar ter-scope backend,
// aksi finance di-gate per tombol via canFinance di masing-masing halaman.
const showQueue = canDecideQueue
const showManagement = isSuperAdmin
const showDelegation = computed(() => app.hasRole('Line Manager', 'Division Head', 'Super Admin'))

const userMenuOpen = ref(false)
const userInitials = computed(() => app.userName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase())

const { data: badgesRes } = await useAsyncData('layout-badges', () => {
  const api = useApi()
  return api<{ approval_pending: number; notifications_unread: number }>('/dashboard/sidebar-badges')
})
const unreadBadge = computed(() => badgesRes.value?.notifications_unread ?? 0)
const approvalBadge = computed(() => badgesRes.value?.approval_pending ?? 0)
function badgeText(n: number) { return n > 9 ? '9+' : String(n) }

async function doLogout() {
  userMenuOpen.value = false
  await app.logout()
}

// Clean grouping: collapsible sections for demo clarity
const openMain = ref(true)
const openMgmt = ref(true)
const openAnalytics = ref(true)
const headerSearch = ref('')
const debouncedHeaderSearch = useDebounce(headerSearch, 300)
watch(debouncedHeaderSearch, (v) => {
  if (v.trim()) navigateTo(`/admin/travel-requests?q=${encodeURIComponent(v.trim())}`)
})
</script>

<template>
  <div class="min-h-screen bg-background font-sans text-on-surface antialiased">
    <!-- Sidebar — clean grouping, active border indicator -->
    <aside
      class="fixed left-0 top-0 h-screen w-72 bg-white shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-50 flex flex-col justify-between select-none lg:flex hidden"
    >
      <div class="flex flex-col h-full overflow-y-auto">
        <div class="h-20 px-6 flex items-center justify-between shrink-0 border-b border-surface-container-low/60">
          <div class="flex items-center gap-2">
              <img
                alt="SixAgo Brand Logo"
                class="h-8 w-auto object-contain"
                src="~/assets/logo-SixAgo.jpeg"
                loading="eager"
                width="32"
                height="32"
                decoding="async"
              />
            <div class="flex flex-col">
              <span class="text-sm font-bold tracking-tight leading-none">SixAgo</span>
              <span class="text-xs text-muted">Travel Governance</span>
            </div>
          </div>
          <span class="bg-surface-container-low text-secondary text-xs px-2 py-1 rounded-full font-medium">Enterprise</span>
        </div>

        <div class="px-3 py-3 flex-1">
          <nav class="space-y-5">
            <!-- Main -->
            <div class="space-y-1">
              <button class="w-full flex items-center justify-between px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-on-surface transition-colors" @click="openMain = !openMain">
                <span>Main</span>
                <span class="material-symbols-outlined text-[16px] transition-transform" :class="openMain ? 'rotate-180' : ''">expand_more</span>
              </button>
              <div v-show="openMain" class="space-y-1 pt-1">
                <NuxtLink
                  to="/admin"
                  :class="isActive('/admin') && route.path === '/admin' ? 'bg-secondary-container text-[#2e6f3c] font-semibold shadow-sm border-l-[3px] border-secondary' : 'text-[#3e4a3c] hover:bg-surface-container-low border-l-[3px] border-transparent'"
                  class="flex items-center justify-between px-4 py-2.5 rounded-full transition-all"
                >
                  <span class="flex items-center gap-2"><span class="material-symbols-outlined text-[20px]">dashboard</span> Dashboard</span>
                </NuxtLink>
                <NuxtLink
                  to="/admin/travel-requests"
                  :class="isActive('/admin/travel-requests') ? 'bg-secondary-container text-[#2e6f3c] font-semibold shadow-sm border-l-[3px] border-secondary' : 'text-[#3e4a3c] hover:bg-surface-container-low border-l-[3px] border-transparent'"
                  class="flex items-center justify-between px-4 py-2.5 rounded-full transition-all"
                >
                  <span class="flex items-center gap-2"><span class="material-symbols-outlined text-[20px]">flight_takeoff</span> Travel Requests</span>
                </NuxtLink>
                <NuxtLink
                  v-if="showQueue"
                  to="/admin/approval-queue"
                  :class="isActive('/admin/approval-queue') ? 'bg-secondary-container text-[#2e6f3c] font-semibold shadow-sm border-l-[3px] border-secondary' : 'text-[#3e4a3c] hover:bg-surface-container-low border-l-[3px] border-transparent'"
                  class="flex items-center justify-between px-4 py-2.5 rounded-full transition-all"
                >
                  <span class="flex items-center gap-2"><span class="material-symbols-outlined text-[20px]">verified</span> Approval Queue</span>
                  <span v-if="approvalBadge > 0" class="bg-primary-container text-[#003e0f] text-xs px-2 py-0.5 rounded-full font-medium">{{ badgeText(approvalBadge) }}</span>
                </NuxtLink>
                <NuxtLink
                  to="/admin/uang-muka"
                  :class="isActive('/admin/uang-muka') ? 'bg-secondary-container text-[#2e6f3c] font-semibold shadow-sm border-l-[3px] border-secondary' : 'text-[#3e4a3c] hover:bg-surface-container-low border-l-[3px] border-transparent'"
                  class="flex items-center justify-between px-4 py-2.5 rounded-full transition-all"
                >
                  <span class="flex items-center gap-2"><span class="material-symbols-outlined text-[20px]">payments</span> Uang Muka</span>
                </NuxtLink>
              </div>
            </div>

            <!-- Management & Policy -->
            <div class="space-y-1">
              <button class="w-full flex items-center justify-between px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-on-surface transition-colors" @click="openMgmt = !openMgmt">
                <span>Management &amp; Policy</span>
                <span class="material-symbols-outlined text-[16px] transition-transform" :class="openMgmt ? 'rotate-180' : ''">expand_more</span>
              </button>
              <div v-show="openMgmt" class="space-y-1 pt-1">
                <NuxtLink v-if="showManagement" to="/admin/management/travel-policy" :class="isActive('/admin/management/travel-policy') ? 'bg-secondary-container text-[#2e6f3c] font-semibold shadow-sm border-l-[3px] border-secondary' : 'text-[#3e4a3c] hover:bg-surface-container-low border-l-[3px] border-transparent'" class="flex items-center px-4 py-2.5 rounded-full transition-all gap-2"><span class="material-symbols-outlined text-[20px]">policy</span> Policies</NuxtLink>
                <NuxtLink v-if="showManagement" to="/admin/management/projects" :class="isActive('/admin/management/projects') ? 'bg-secondary-container text-[#2e6f3c] font-semibold shadow-sm border-l-[3px] border-secondary' : 'text-[#3e4a3c] hover:bg-surface-container-low border-l-[3px] border-transparent'" class="flex items-center px-4 py-2.5 rounded-full transition-all gap-2"><span class="material-symbols-outlined text-[20px]">folder_shared</span> Projects</NuxtLink>
                <NuxtLink to="/admin/reimbursement" :class="isActive('/admin/reimbursement') ? 'bg-secondary-container text-[#2e6f3c] font-semibold shadow-sm border-l-[3px] border-secondary' : 'text-[#3e4a3c] hover:bg-surface-container-low border-l-[3px] border-transparent'" class="flex items-center px-4 py-2.5 rounded-full transition-all gap-2"><span class="material-symbols-outlined text-[20px]">receipt_long</span> Reimbursements</NuxtLink>
                <NuxtLink v-if="showManagement" to="/admin/management/users" :class="isActive('/admin/management/users') ? 'bg-secondary-container text-[#2e6f3c] font-semibold shadow-sm border-l-[3px] border-secondary' : 'text-[#3e4a3c] hover:bg-surface-container-low border-l-[3px] border-transparent'" class="flex items-center px-4 py-2.5 rounded-full transition-all gap-2"><span class="material-symbols-outlined text-[20px]">manage_accounts</span> Users &amp; Roles</NuxtLink>
                <NuxtLink v-if="showManagement" to="/admin/management/departments" :class="isActive('/admin/management/departments') ? 'bg-secondary-container text-[#2e6f3c] font-semibold shadow-sm border-l-[3px] border-secondary' : 'text-[#3e4a3c] hover:bg-surface-container-low border-l-[3px] border-transparent'" class="flex items-center px-4 py-2.5 rounded-full transition-all gap-2"><span class="material-symbols-outlined text-[20px]">apartment</span> Departemen &amp; Role</NuxtLink>
                <NuxtLink v-if="showManagement" to="/admin/management/approval-levels" :class="isActive('/admin/management/approval-levels') ? 'bg-secondary-container text-[#2e6f3c] font-semibold shadow-sm border-l-[3px] border-secondary' : 'text-[#3e4a3c] hover:bg-surface-container-low border-l-[3px] border-transparent'" class="flex items-center px-4 py-2.5 rounded-full transition-all gap-2"><span class="material-symbols-outlined text-[20px]">account_tree</span> Approval Level</NuxtLink>
                <NuxtLink v-if="showDelegation" to="/admin/management/delegation" :class="isActive('/admin/management/delegation') ? 'bg-secondary-container text-[#2e6f3c] font-semibold shadow-sm border-l-[3px] border-secondary' : 'text-[#3e4a3c] hover:bg-surface-container-low border-l-[3px] border-transparent'" class="flex items-center px-4 py-2.5 rounded-full transition-all gap-2"><span class="material-symbols-outlined text-[20px]">handshake</span> Delegasi Approval</NuxtLink>
              </div>
            </div>

            <!-- Analytics -->
            <div class="space-y-1">
              <button class="w-full flex items-center justify-between px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-on-surface transition-colors" @click="openAnalytics = !openAnalytics">
                <span>Analytics</span>
                <span class="material-symbols-outlined text-[16px] transition-transform" :class="openAnalytics ? 'rotate-180' : ''">expand_more</span>
              </button>
              <div v-show="openAnalytics" class="space-y-1 pt-1">
                <NuxtLink to="/admin/notifications" :class="isActive('/admin/notifications') ? 'bg-secondary-container text-[#2e6f3c] font-semibold shadow-sm border-l-[3px] border-secondary' : 'text-[#3e4a3c] hover:bg-surface-container-low border-l-[3px] border-transparent'" class="flex items-center justify-between px-4 py-2.5 rounded-full transition-all gap-2"><span class="flex items-center gap-2"><span class="material-symbols-outlined text-[20px]">notifications</span> Notifikasi Sistem</span><span v-if="unreadBadge > 0" class="bg-error text-white text-xs px-2 py-0.5 rounded-full font-medium">{{ badgeText(unreadBadge) }}</span></NuxtLink>
                <NuxtLink to="/admin" class="flex items-center gap-2 px-4 py-2.5 rounded-full text-[#3e4a3c] hover:bg-surface-container-low border-l-[3px] border-transparent transition-all"><span class="material-symbols-outlined text-[20px]">analytics</span> Reports &amp; Audit<span class="ml-auto text-[10px] bg-surface-container-low px-1.5 py-0.5 rounded-full">Soon</span></NuxtLink>
              </div>
            </div>
          </nav>
        </div>

        <div class="p-4 m-4 rounded-xl bg-surface-container-low border border-surface-container">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-primary">
              <span class="material-symbols-outlined text-[18px]">help_center</span>
            </div>
            <div class="flex flex-col flex-1">
              <span class="text-sm font-medium">Enterprise Help Desk</span>
              <span class="text-xs text-muted">SLA 15-menit • ext. 402</span>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <!-- Mobile Drawer — 1:1 dengan desktop, grouped -->
    <div v-if="mobileOpen" class="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="mobileOpen = false" />
      <aside class="absolute left-0 top-0 h-full w-72 bg-white shadow-xl flex flex-col">
        <div class="h-16 px-4 flex items-center justify-between border-b border-surface-container-low">
          <span class="font-bold flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-primary" /> SixAgo</span>
          <button aria-label="Tutup menu" class="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center" @click="mobileOpen = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <nav class="p-3 space-y-4 overflow-y-auto flex-1">
          <div class="space-y-1">
            <div class="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Main</div>
            <NuxtLink to="/admin" class="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-surface-container-low" @click="mobileOpen=false"><span class="material-symbols-outlined text-[18px]">dashboard</span> Dashboard</NuxtLink>
            <NuxtLink to="/admin/travel-requests" class="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-surface-container-low" @click="mobileOpen=false"><span class="material-symbols-outlined text-[18px]">flight_takeoff</span> Travel Requests</NuxtLink>
            <NuxtLink v-if="showQueue" to="/admin/approval-queue" class="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-surface-container-low" @click="mobileOpen=false"><span class="material-symbols-outlined text-[18px]">verified</span> Approval Queue <span v-if="approvalBadge > 0" class="ml-auto text-xs bg-primary-container px-2 py-0.5 rounded-full">{{ badgeText(approvalBadge) }}</span></NuxtLink>
            <NuxtLink to="/admin/uang-muka" class="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-surface-container-low" @click="mobileOpen=false"><span class="material-symbols-outlined text-[18px]">payments</span> Uang Muka</NuxtLink>
            <NuxtLink to="/admin/reimbursement" class="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-surface-container-low" @click="mobileOpen=false"><span class="material-symbols-outlined text-[18px]">receipt_long</span> Reimbursements</NuxtLink>
          </div>
          <div class="space-y-1">
            <div class="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Management</div>
            <NuxtLink v-if="showManagement" to="/admin/management/travel-policy" class="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-surface-container-low" @click="mobileOpen=false"><span class="material-symbols-outlined text-[18px]">policy</span> Policies</NuxtLink>
            <NuxtLink v-if="showManagement" to="/admin/management/projects" class="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-surface-container-low" @click="mobileOpen=false"><span class="material-symbols-outlined text-[18px]">folder_shared</span> Projects</NuxtLink>
            <NuxtLink v-if="showManagement" to="/admin/management/users" class="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-surface-container-low" @click="mobileOpen=false"><span class="material-symbols-outlined text-[18px]">manage_accounts</span> Users</NuxtLink>
            <NuxtLink v-if="showManagement" to="/admin/management/departments" class="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-surface-container-low" @click="mobileOpen=false"><span class="material-symbols-outlined text-[18px]">apartment</span> Departemen</NuxtLink>
            <NuxtLink v-if="showManagement" to="/admin/management/approval-levels" class="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-surface-container-low" @click="mobileOpen=false"><span class="material-symbols-outlined text-[18px]">account_tree</span> Approval Level</NuxtLink>
            <NuxtLink v-if="showDelegation" to="/admin/management/delegation" class="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-surface-container-low" @click="mobileOpen=false"><span class="material-symbols-outlined text-[18px]">handshake</span> Delegasi</NuxtLink>
          </div>
          <div class="space-y-1">
            <div class="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">Analytics</div>
            <NuxtLink to="/admin/notifications" class="flex items-center gap-2 px-4 py-2.5 rounded-full hover:bg-surface-container-low" @click="mobileOpen=false"><span class="material-symbols-outlined text-[18px]">notifications</span> Notifikasi <span v-if="unreadBadge > 0" class="ml-auto text-xs bg-error text-white px-2 py-0.5 rounded-full">{{ badgeText(unreadBadge) }}</span></NuxtLink>
          </div>
        </nav>
      </aside>
    </div>

    <!-- Main wrapper -->
    <div class="lg:pl-72">
      <header class="fixed top-0 lg:left-72 left-0 right-0 h-16 bg-white/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 px-4 lg:px-8 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 w-full max-w-lg">
          <button aria-label="Buka menu" class="lg:hidden w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center shrink-0" @click="mobileOpen = true">
            <span class="material-symbols-outlined">menu</span>
          </button>
          <!-- Header search — demo friendly, clearable, navigates to travel-requests -->
          <div class="relative w-full hidden sm:block">
            <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-[20px] pointer-events-none">search</span>
            <input
              v-model="headerSearch"
              class="w-full pl-10 pr-9 py-2 rounded-full bg-surface-container-low text-on-surface placeholder:text-muted text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 shadow-sm transition-all"
              placeholder="Cari perjalanan, tiket, ID request, atau karyawan..."
              type="text"
              aria-label="Cari perjalanan"
            />
            <button v-if="headerSearch" aria-label="Hapus pencarian" class="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white hover:bg-surface-container flex items-center justify-center text-muted transition-colors" @click="headerSearch = ''">
              <span class="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        </div>
        <div class="flex items-center gap-2 lg:gap-3">
          <NuxtLink to="/admin/notifications" aria-label="Notifikasi" class="relative w-9 h-9 rounded-full bg-surface-container-low flex items-center justify-center hover:bg-surface-container transition-colors">
            <span class="material-symbols-outlined text-[20px]">notifications</span>
            <span v-if="unreadBadge > 0" class="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-error text-white text-[10px] flex items-center justify-center font-bold">{{ unreadBadge > 9 ? '9+' : unreadBadge }}</span>
          </NuxtLink>
          <div class="relative flex items-center gap-2 pl-2 border-l border-surface-container-low">
            <button class="flex items-center gap-2" aria-label="Menu akun" :aria-expanded="userMenuOpen" @click="userMenuOpen = !userMenuOpen">
              <img
                v-if="app.user?.avatar"
                :alt="`Foto ${app.userName}`"
                class="w-8 h-8 rounded-full object-cover"
                :src="app.user.avatar"
                loading="lazy"
                width="32"
                height="32"
                decoding="async"
              >
              <span v-else class="w-8 h-8 rounded-full bg-secondary-container text-[#0b5223] flex items-center justify-center text-xs font-bold" aria-hidden="true">{{ userInitials }}</span>
              <div class="hidden md:flex flex-col text-left">
                <span class="text-sm font-medium leading-tight">{{ app.userName }}</span>
                <span class="text-xs text-muted leading-tight">{{ app.userRole }}</span>
              </div>
              <span class="material-symbols-outlined text-muted text-[18px] hidden md:block" aria-hidden="true">expand_more</span>
            </button>
            <div v-if="userMenuOpen" class="absolute right-0 top-11 w-52 bg-white rounded-xl shadow-xl border border-surface-container-low py-2 z-50">
              <div class="px-4 py-2 border-b border-surface-container-low">
                <p class="text-sm font-semibold truncate">{{ app.userName }}</p>
                <p class="text-xs text-muted truncate">{{ app.user?.email }}</p>
              </div>
              <NuxtLink to="/profil" class="flex items-center gap-2 px-4 py-2 text-sm hover:bg-surface-container-low" @click="userMenuOpen = false"><span class="material-symbols-outlined text-[18px] text-muted">account_circle</span>Profil Saya</NuxtLink>
              <NuxtLink to="/password" class="flex items-center gap-2 px-4 py-2 text-sm hover:bg-surface-container-low" @click="userMenuOpen = false"><span class="material-symbols-outlined text-[18px] text-muted">lock_reset</span>Ganti Password</NuxtLink>
              <button class="w-full flex items-center gap-2 px-4 py-2 text-sm text-error hover:bg-error-container" @click="doLogout"><span class="material-symbols-outlined text-[18px]">logout</span>Keluar</button>
            </div>
          </div>
        </div>
      </header>

      <!-- Bottom nav — demo-friendly on mobile -->
      <nav class="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-surface-container-low flex items-center justify-around px-2 py-1 z-40">
        <NuxtLink to="/admin" class="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl" :class="route.path==='/' || route.path==='/admin' ? 'text-primary bg-secondary-container/50' : 'text-muted'"><span class="material-symbols-outlined text-[22px]">dashboard</span><span class="text-[10px] font-medium">Dashboard</span></NuxtLink>
        <NuxtLink to="/admin/travel-requests" class="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl" :class="route.path.startsWith('/admin/travel-requests') ? 'text-primary bg-secondary-container/50' : 'text-muted'"><span class="material-symbols-outlined text-[22px]">flight_takeoff</span><span class="text-[10px] font-medium">Travel</span></NuxtLink>
        <NuxtLink v-if="showQueue" to="/admin/approval-queue" class="relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl" :class="route.path.startsWith('/admin/approval-queue') ? 'text-primary bg-secondary-container/50' : 'text-muted'"><span class="material-symbols-outlined text-[22px]">verified</span><span class="text-[10px] font-medium">Approve</span><span v-if="approvalBadge > 0" class="absolute top-0.5 right-1 min-w-4 h-4 px-0.5 rounded-full bg-error text-white text-[10px] flex items-center justify-center font-bold">{{ badgeText(approvalBadge) }}</span></NuxtLink>
        <NuxtLink to="/admin/notifications" class="relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl" :class="route.path.startsWith('/admin/notifications') ? 'text-primary bg-secondary-container/50' : 'text-muted'"><span class="material-symbols-outlined text-[22px]">notifications</span><span class="text-[10px] font-medium">Notifikasi</span><span v-if="unreadBadge > 0" class="absolute top-0.5 right-1 min-w-4 h-4 px-0.5 rounded-full bg-error text-white text-[10px] flex items-center justify-center font-bold">{{ badgeText(unreadBadge) }}</span></NuxtLink>
      </nav>

      <a href="#main-content" class="sr-only focus:not-sr-only focus:fixed focus:top-16 focus:left-72 bg-primary text-white px-4 py-2 rounded-full z-50">Lewati ke konten utama</a>
      <main id="main-content" class="w-full pt-16 pb-20 lg:pb-8 px-4 lg:px-8 bg-background min-h-screen">
        <slot />
      </main>
    </div>
  </div>
</template>
