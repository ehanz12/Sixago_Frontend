<script setup lang="ts">
definePageMeta({ layout: 'admin' })

import type { NotificationItem } from '~/types'
import { mapNotification } from '~/composables/useMappers'
import { paginatorMeta, useApi, type LaravelPaginator } from '~/composables/useApi'
import { useAppStore } from '~/stores/app'

const api = useApi()
const app = useAppStore()

type EnrichedNotif = NotificationItem & {
  badge: string
  badgeClass: string
  icon: string
  iconWrapClass: string
  borderClass: string
  category: string
  refId?: string
  contentTitle: string
  contentBody: string
  meta?: string[]
}

const activeTab = ref('all')
const unreadOnly = ref(false)
const searchQuery = ref('')
const debouncedNotifSearch = useDebounce(searchQuery, 300)
const emailEnabled = ref(app.user?.email_notif_enabled ?? true)

async function saveEmailPref() {
  try {
    await api('/user/profile', { method: 'PUT', body: { email_notif_enabled: emailEnabled.value } })
    if (app.user) app.user.email_notif_enabled = emailEnabled.value
    showToast(emailEnabled.value ? 'Email notifikasi diaktifkan.' : 'Email notifikasi dinonaktifkan.')
  } catch {
    emailEnabled.value = !emailEnabled.value
    showToast('Gagal menyimpan preferensi.', 'error', 'error')
  }
}
const toastMsg = ref('')
const toastVisible = ref(false)
const perPageNotif = ref(20)

const { data: notifRes } = await useAsyncData('notifications', () => api<LaravelPaginator<any>>('/notifications', {
  params: {
    category: activeTab.value,
    unread_only: unreadOnly.value || undefined,
    search: debouncedNotifSearch.value.trim() || undefined,
    per_page: perPageNotif.value,
  },
}), { watch: [activeTab, unreadOnly, debouncedNotifSearch, perPageNotif] })
const { data: unreadRes } = await useAsyncData('notifications-unread', () => api<{ unread: number }>('/notifications-unread-count'))

const styleByCategory: Record<string, { badge: string; badgeClass: string; icon: string; iconWrapClass: string; borderClass: string }> = {
  urgent: { badge: 'Otorisasi Segera', badgeClass: 'bg-error-container text-error', icon: 'electric_bolt', iconWrapClass: 'bg-error-container text-error', borderClass: 'bg-error' },
  finance: { badge: 'Keuangan', badgeClass: 'bg-secondary-container text-[#2e6f3c]', icon: 'account_balance_wallet', iconWrapClass: 'bg-secondary-container text-secondary', borderClass: 'bg-primary' },
  approval: { badge: 'Persetujuan', badgeClass: 'bg-secondary-container/70 text-secondary', icon: 'assignment_ind', iconWrapClass: 'bg-surface-container-low text-on-surface', borderClass: '' },
  system: { badge: 'Kebijakan Perusahaan', badgeClass: 'bg-surface-container text-muted', icon: 'shield', iconWrapClass: 'bg-surface-container text-muted', borderClass: '' },
}

const notifications = computed<EnrichedNotif[]>(() =>
  paginatorMeta(notifRes.value?.data ? notifRes.value : []).items.map((n: any) => {
    const base = mapNotification(n)
    const cat = (n.category ?? 'system') as string
    const style = styleByCategory[cat] ?? styleByCategory.system
    return {
      ...base,
      ...style,
      category: cat,
      refId: n.reference_id ?? undefined,
      contentTitle: n.title,
      contentBody: n.message,
      meta: undefined,
      _rawId: n.id,
    } as EnrichedNotif & { _rawId: number }
  }),
)

const tabs = computed(() => {
  const all = notifications.value
  const count = (c: string) => all.filter(n => n.category === c).length
  return [
    { id: 'all', label: 'Semua Notifikasi', count: all.length, countClass: 'bg-white/70 text-secondary' },
    { id: 'urgent', label: 'Butuh Tindakan Segera / Urgent', count: count('urgent'), countClass: 'bg-error text-white' },
    { id: 'approval', label: 'Persetujuan & Tiket', count: count('approval'), countClass: 'bg-surface-container text-muted' },
    { id: 'finance', label: 'Keuangan & Kas Bon', count: count('finance'), countClass: 'bg-surface-container text-muted' },
    { id: 'system', label: 'Sistem & Kebijakan', count: count('system'), countClass: 'bg-surface-container text-muted' },
  ] as const
})

const sortNewest = ref(true)
const filtered = computed(() => {
  const list = [...notifications.value]
  if (!sortNewest.value) list.reverse()
  return list
})
const unreadCount = computed(() => unreadRes.value?.unread ?? 0)
const urgentUnread = computed(() => notifications.value.filter(n => !n.read && n.category === 'urgent').length)

async function markAllRead() {
  try {
    const res = await api<{ message: string }>('/notifications/mark-all-read', { method: 'POST' })
    showToast(res.message)
    await refreshNuxtData(['notifications', 'notifications-unread'])
  } catch (e: any) {
    showToast(e?.data?.message || 'Gagal menandai notifikasi.', 'error', 'error')
  }
}
async function markSingleRead(n: EnrichedNotif & { _rawId: number }) {
  try {
    await api(`/notifications/${n._rawId}/read`, { method: 'PATCH' })
    showToast(`Notifikasi "${n.contentTitle.slice(0, 32)}..." ditandai telah dibaca.`)
    await refreshNuxtData(['notifications', 'notifications-unread'])
  } catch (e: any) {
    showToast(e?.data?.message || 'Gagal menandai notifikasi.', 'error', 'error')
  }
}
function loadMore() { perPageNotif.value += 20 }

const deleteTarget = ref<EnrichedNotif | null>(null)
const deleteSaving = ref(false)
function openDeleteNotif(n: EnrichedNotif) { deleteTarget.value = n }
function closeDeleteNotif() { deleteTarget.value = null }
async function submitDeleteNotif() {
  if (!deleteTarget.value) return
  deleteSaving.value = true
  try {
    await api(`/notifications/${(deleteTarget.value as unknown as { _rawId: number })._rawId}`, { method: 'DELETE' })
    closeDeleteNotif()
    showToast('Notifikasi dihapus.')
    await refreshNuxtData(['notifications', 'notifications-unread'])
  } catch (e: any) {
    showToast(e?.data?.message || (e?.status === 404 ? 'Notifikasi tidak ditemukan atau bukan milik Anda.' : 'Gagal menghapus notifikasi.'))
  } finally {
    deleteSaving.value = false
  }
}

const showClearReadConfirm = ref(false)
const clearReadSaving = ref(false)
async function clearReadNotifications() {
  clearReadSaving.value = true
  try {
    const res = await api<{ deleted: number }>('/notifications/read', { method: 'DELETE' })
    showClearReadConfirm.value = false
    showToast(`${res.deleted} notifikasi yang sudah dibaca dihapus.`)
    await refreshNuxtData(['notifications', 'notifications-unread'])
  } catch (e: any) {
    showToast(e?.data?.message || (e?.status === 403 ? 'Anda tidak berwenang menghapus notifikasi.' : 'Gagal menghapus notifikasi yang sudah dibaca.'))
  } finally {
    clearReadSaving.value = false
  }
}
async function downloadCenterFile(path: string, filename: string) {
  try {
    const { downloadCsv } = await import('~/composables/useMappers')
    await downloadCsv(path, filename)
    showToast(`File ${filename} berhasil diunduh.`)
  } catch {
    showToast('Unduhan gagal. Pastikan Anda memiliki hak akses.', 'error', 'error')
  }
}
function scrollToPrefs() {
  if (import.meta.client) document.getElementById('notif-prefs')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
function showToast(msg: string) { toastMsg.value = msg; toastVisible.value = true; setTimeout(() => toastVisible.value = false, 3200) }

</script>

<template>
  <div class="flex flex-col w-full space-y-6 pb-8 font-sans">
    <!-- Top Context & Page Breadcrumb Header -->
    <div class="flex flex-col xl:flex-row xl:items-end justify-between gap-4 mt-4">
      <div class="space-y-1 max-w-3xl">

      </div>
      <div class="flex items-center gap-2 flex-wrap shrink-0">
        <button aria-label="Tandai semua sudah dibaca" class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white text-secondary shadow-sm hover:bg-surface-container-low transition-all text-sm font-semibold active:scale-95" @click="markAllRead">
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">done_all</span>
          <span>Tandai Semua Sudah Dibaca</span>
        </button>
        <button aria-label="Hapus notifikasi yang sudah dibaca" class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white text-error shadow-sm hover:bg-error-container transition-all text-sm font-semibold active:scale-95" @click="showClearReadConfirm = true">
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete_sweep</span>
          <span>Hapus yang Sudah Dibaca</span>
        </button>
        <button aria-label="Pengaturan preferensi email" class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-low transition-all text-sm font-semibold active:scale-95" @click="scrollToPrefs">
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">tune</span>
          <span>Pengaturan Preferensi (Email)</span>
        </button>
      </div>
    </div>

    <!-- Primary Analytics Strip & Notification Health -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white p-6 rounded-xl shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between"><span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Perlu Tindakan Anda</span><span class="w-8 h-8 rounded-full bg-error-container/60 flex items-center justify-center text-error"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">bolt</span></span></div>
        <div class="mt-4 flex items-baseline justify-between"><span class="text-3xl font-bold text-error">{{ String(unreadCount).padStart(2, '0') }}</span><span class="text-xs text-error bg-error-container/40 px-2 py-0.5 rounded-full font-semibold">{{ urgentUnread }} Urgent Belum Dibaca</span></div>
        <div class="w-full bg-surface-container-low h-1.5 rounded-full mt-3 overflow-hidden"><div class="bg-error h-full rounded-full w-3/4" /></div>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between"><span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Ditampilkan</span><span class="w-8 h-8 rounded-full bg-secondary-container/50 flex items-center justify-center text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">airplane_ticket</span></span></div>
        <div class="mt-4 flex items-baseline justify-between"><span class="text-3xl font-bold">{{ filtered.length }}</span><span class="text-xs text-secondary bg-secondary-container/40 px-2 py-0.5 rounded-full font-semibold">pada filter aktif</span></div>
        <div class="w-full bg-surface-container-low h-1.5 rounded-full mt-3 overflow-hidden"><div class="bg-primary h-full rounded-full" :style="{ width: filtered.length ? '100%' : '0%' }" /></div>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm flex flex-col justify-between">
        <div class="flex items-center justify-between"><span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Sudah Dibaca</span><span class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-primary-dark"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">mark_email_read</span></span></div>
        <div class="mt-4 flex items-baseline justify-between"><span class="text-2xl font-bold">{{ filtered.filter(n => n.read).length }}</span><span class="text-xs text-muted">dari yang ditampilkan</span></div>
        <div class="w-full bg-surface-container-low h-1.5 rounded-full mt-3 overflow-hidden"><div class="bg-primary h-full rounded-full" :style="{ width: filtered.length ? `${Math.round((filtered.filter(n => n.read).length / filtered.length) * 100)}%` : '0%' }" /></div>
      </div>
      <div class="bg-gradient-to-br from-secondary to-primary text-white p-6 rounded-xl shadow-sm flex flex-col justify-between relative overflow-hidden">
        <div class="absolute -right-4 -top-4 w-28 h-28 bg-white/10 rounded-full blur-xl pointer-events-none" aria-hidden="true" />
        <div class="flex items-center justify-between"><span class="text-[11px] font-semibold uppercase tracking-wider text-white/80">Email Notifikasi</span><span class="material-symbols-outlined text-white text-[20px]" aria-hidden="true">mail</span></div>
        <div class="mt-4"><div class="text-3xl font-bold">{{ emailEnabled ? 'Aktif' : 'Mati' }}</div><p class="text-xs text-white/80 mt-1 truncate">{{ app.user?.email }}</p></div>
        <div class="flex items-center gap-2 mt-2 pt-2 border-t border-white/10 text-white/90 text-xs font-medium"><span class="material-symbols-outlined text-[14px]" aria-hidden="true">info</span> Atur di panel preferensi cepat</div>
      </div>
    </div>

    <!-- Filter & Tab Navigation Area -->
    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 select-none">
        <button
          v-for="t in tabs" :key="t.id"
          :class="activeTab===t.id ? 'bg-secondary-container text-[#2e6f3c] shadow-sm' : 'bg-white text-[#3e4a3c] hover:bg-surface-container-low shadow-sm'"
          class="px-5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-2"
          @click="activeTab=t.id"
        >
          <span>{{ t.label }}</span>
          <span :class="t.countClass" class="text-xs px-2 py-0.5 rounded-full font-semibold">{{ t.count }}</span>
        </button>
      </div>
      <div class="bg-white p-4 rounded-xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div class="flex items-center gap-3 w-full md:w-auto flex-wrap">
          <label class="inline-flex items-center gap-2 cursor-pointer select-none">
            <input v-model="unreadOnly" aria-label="Filter belum dibaca saja" class="sr-only peer" type="checkbox">
            <div class="w-11 h-6 bg-surface-container peer-checked:bg-primary relative rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full transition-colors" />
            <span class="text-sm font-medium">Belum Dibaca Saja</span>
          </label>
          <span class="hidden sm:inline text-surface-dim" aria-hidden="true">|</span>
          <div class="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-surface-container-low text-on-surface text-sm cursor-pointer hover:bg-surface-container transition-colors">
            <span class="material-symbols-outlined text-[16px] text-muted" aria-hidden="true">calendar_today</span>
            <span>Rentang: <strong>7 Hari Terakhir</strong></span>
            <span class="material-symbols-outlined text-[16px] text-muted" aria-hidden="true">arrow_drop_down</span>
          </div>
        </div>
        <div class="flex items-center gap-2 w-full md:w-80">
          <div class="relative w-full">
            <span class="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-[18px]" aria-hidden="true">search</span>
            <input v-model="searchQuery" aria-label="Cari riwayat notifikasi" class="w-full pl-10 pr-4 py-2 rounded-full bg-surface-container-low text-on-surface placeholder:text-muted text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all" placeholder="Cari riwayat notifikasi..." type="text">
          </div>
          <button aria-label="Urutkan waktu" :title="sortNewest ? 'Terbaru dulu (klik: terlama dulu)' : 'Terlama dulu (klik: terbaru dulu)'" class="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors shrink-0" @click="sortNewest = !sortNewest"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">filter_list</span></button>
        </div>
      </div>
    </div>

    <!-- Main Feed & Fast Setting Split Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- Notifications Feed Column (8 cols) -->
      <div class="lg:col-span-8 space-y-3">
        <article
          v-for="n in filtered" :key="n.id"
          :class="n.read ? '' : 'unread'"
          class="group relative bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-all overflow-hidden"
        >
          <div v-if="n.borderClass" :class="n.borderClass" class="absolute left-0 top-0 bottom-0 w-1.5" aria-hidden="true" />
          <div class="flex items-start gap-3">
            <div :class="n.iconWrapClass" class="w-11 h-11 rounded-full flex items-center justify-center shrink-0 mt-0.5">
              <span class="material-symbols-outlined text-[24px]" aria-hidden="true">{{ n.icon }}</span>
            </div>
            <div class="flex-1 min-w-0 space-y-1">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="flex items-center gap-2">
                  <span :class="n.badgeClass" class="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider">{{ n.badge }}</span>
                  <span v-if="!n.read" class="w-2 h-2 rounded-full bg-primary" aria-label="Belum dibaca" title="Belum Dibaca" />
                  <span v-if="n.refId" class="text-xs text-muted">{{ n.refId }}</span>
                </div>
                <div class="flex items-center gap-1 text-xs text-muted"><span class="material-symbols-outlined text-[15px]" aria-hidden="true">schedule</span><span>{{ n.time }}</span></div>
              </div>
              <h3 class="text-base font-semibold tracking-tight group-hover:text-primary-dark transition-colors">{{ n.contentTitle }}</h3>
              <p class="text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">{{ n.contentBody }}</p>
              <div v-if="n.meta" class="p-3 bg-surface-container-low rounded-lg flex items-center gap-4 flex-wrap text-muted text-xs">
                <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px] text-secondary" aria-hidden="true">{{ n.category==='urgent' ? 'flight_takeoff' : 'payments' }}</span> {{ n.meta[0] }}</span>
                <span v-if="n.meta[1]" class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px] text-secondary" aria-hidden="true">hotel</span> {{ n.meta[1] }}</span>
                <span v-if="n.meta[2]" class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px] text-secondary" aria-hidden="true">payments</span> {{ n.meta[2] }}</span>
              </div>
              <div class="pt-1 flex items-center gap-2 flex-wrap">
                <template v-if="n.category==='urgent'">
                  <NuxtLink to="/admin/approval-queue" class="flex items-center gap-1.5 px-5 py-2 rounded-full bg-primary text-white hover:opacity-95 text-sm font-semibold shadow-sm active:scale-95"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">verified</span><span>Tinjau di Antrian Approval</span></NuxtLink>
                </template>
                <template v-else-if="n.category==='finance' && !n.read">
                  <NuxtLink to="/admin/uang-muka" class="flex items-center gap-1.5 px-5 py-2 rounded-full bg-surface-container-low text-secondary hover:bg-secondary-container text-sm font-medium active:scale-95"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">receipt_long</span><span>Buka Uang Muka</span></NuxtLink>
                  <NuxtLink to="/admin/reimbursement" class="flex items-center gap-1.5 px-4 py-2 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-low text-sm font-medium"><span>Rincian Klaim</span></NuxtLink>
                </template>
                <template v-else-if="n.category==='finance'">
                  <NuxtLink to="/admin/reimbursement" class="flex items-center gap-1.5 px-4 py-2 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-low text-sm font-medium"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">table_chart</span><span>Lihat Ringkasan Settlement</span></NuxtLink>
                </template>
                <template v-else-if="n.category==='system'">
                  <NuxtLink to="/admin/management/travel-policy" class="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-surface-container-low text-secondary hover:bg-secondary-container text-sm font-medium"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">menu_book</span><span>Baca Matriks Kebijakan Terbaru</span></NuxtLink>
                </template>
                <template v-else>
                  <NuxtLink to="/admin/management/delegation" class="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-low text-sm font-medium"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">how_to_reg</span><span>Lihat Delegasi</span></NuxtLink>
                </template>
                <button v-if="!n.read" aria-label="Tandai telah dibaca" title="Tandai telah dibaca" class="ml-auto w-8 h-8 rounded-full hover:bg-surface-container-low flex items-center justify-center text-muted" @click="markSingleRead(n)"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">check</span></button>
                <button :aria-label="`Hapus notifikasi ${n.contentTitle}`" title="Hapus notifikasi" class="w-8 h-8 rounded-full hover:bg-surface-container-low flex items-center justify-center text-error" @click="openDeleteNotif(n)"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span></button>
              </div>
            </div>
          </div>
        </article>
        <div v-if="filtered.length===0" class="bg-white rounded-xl p-10 text-center shadow-sm">
          <span class="material-symbols-outlined text-[40px] text-muted" aria-hidden="true">notifications_off</span>
          <p class="text-sm text-muted mt-2">Tidak ada notifikasi yang cocok dengan filter "{{ searchQuery }}".</p>
        </div>
        <div class="flex items-center justify-between pt-2 flex-wrap gap-2">
          <span class="text-xs text-muted">Menampilkan {{ filtered.length }} riwayat notifikasi terbaru</span>
          <button class="flex items-center gap-1 px-5 py-2 rounded-full bg-white text-on-surface hover:bg-surface-container-low text-sm font-medium shadow-sm" @click="loadMore"><span>Muat Riwayat Lebih Lama</span><span class="material-symbols-outlined text-[16px]" aria-hidden="true">expand_more</span></button>
        </div>
      </div>

      <!-- Side Control Widget Column (4 cols) -->
      <div class="lg:col-span-4 space-y-4">
        <div id="notif-prefs" class="bg-white p-6 rounded-xl shadow-sm space-y-4 scroll-mt-4">
          <div class="flex items-center justify-between pb-1">
            <div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-primary text-[22px]" aria-hidden="true">tune</span><h2 class="text-sm font-bold">Pengaturan Notifikasi Cepat</h2></div>
            <span class="w-2 h-2 rounded-full bg-primary" aria-hidden="true" />
          </div>
          <p class="text-xs text-muted">Sesuaikan saluran penerimaan notifikasi real-time agar Anda tidak tertinggal batas waktu otorisasi operasional.</p>
          <div class="space-y-3">
            <div class="p-4 bg-surface-container-low rounded-xl space-y-1">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">mail</span></div>
                  <div><p class="text-sm font-medium">Email Notifikasi Keputusan</p><p class="text-xs font-medium" :class="emailEnabled ? 'text-secondary' : 'text-muted'">{{ emailEnabled ? 'Aktif — terkirim tiap ada keputusan' : 'Nonaktif' }}</p></div>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                  <input v-model="emailEnabled" type="checkbox" class="sr-only peer" aria-label="Aktifkan email notifikasi" @change="saveEmailPref">
                  <div class="w-9 h-5 bg-surface-container peer-checked:bg-primary relative rounded-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
                </label>
              </div>
              <div class="pl-10 text-xs text-muted truncate" :title="app.user?.email">{{ app.user?.email }}</div>
            </div>
            <div class="p-4 bg-surface-container-low rounded-xl space-y-1">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-error"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">alarm</span></div>
                <div><p class="text-sm font-medium">Peringatan SLA &amp; Urgensi</p><p class="text-xs font-medium text-muted">Selalu aktif via tab Urgent — tidak ada push browser/mobile</p></div>
              </div>
              <div class="pl-10 text-xs text-muted">Antrean mendesak tampil di tab Urgent + badge sidebar</div>
            </div>
          </div>
          <NuxtLink to="/password" class="w-full py-2.5 rounded-full bg-secondary text-white hover:opacity-95 text-sm font-semibold shadow-sm flex items-center justify-center gap-2"><span>Kelola Akun &amp; Keamanan</span><span class="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span></NuxtLink>
        </div>
        <div class="bg-surface-container-low p-6 rounded-xl space-y-2">
          <div class="flex items-center gap-2"><div class="w-7 h-7 rounded-full bg-secondary-container flex items-center justify-center text-secondary"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">info</span></div><span class="text-sm font-semibold">Aturan Eskalasi Otomatis</span></div>
          <p class="text-xs text-muted leading-relaxed">Permohonan tiket dengan status mendesak (&lt; 24 jam keberangkatan) akan dialihkan ke Divisi Head jika approver utama tidak merespons dalam waktu <strong>4 jam kerja</strong>.</p>
        </div>
        <div class="bg-white p-6 rounded-xl shadow-sm space-y-3">
          <div class="flex items-center justify-between"><span class="text-[11px] font-semibold uppercase tracking-wider text-muted">Pusat Unduhan Notifikasi</span><span class="material-symbols-outlined text-muted text-[18px]" aria-hidden="true">download_for_offline</span></div>
          <div class="space-y-1">
            <button v-if="app.isSuperAdmin" class="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-container-low transition-colors group" @click="downloadCenterFile('/exports/audit-logs', 'audit-logs.csv')"><span class="text-xs text-on-surface group-hover:text-primary-dark">Log Audit Aktivitas.csv</span><span class="material-symbols-outlined text-[16px] text-muted" aria-hidden="true">file_download</span></button>
            <button class="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-container-low transition-colors group" @click="downloadCenterFile('/exports/advances', 'uang-muka.csv')"><span class="text-xs text-on-surface group-hover:text-primary-dark">Rekap Transfer Kas Bon.csv</span><span class="material-symbols-outlined text-[16px] text-muted" aria-hidden="true">file_download</span></button>
          </div>
        </div>
      </div>
    </div>

    <AppConfirmModal
      :open="deleteTarget !== null"
      title="Hapus notifikasi ini?"
      :message="(deleteTarget?.contentTitle ?? 'Item') + ' akan dihapus permanen dari daftar Anda.'"
      variant="danger"
      confirm-label="Ya, Hapus"
      icon="delete"
      :loading="deleteSaving"
      @close="closeDeleteNotif"
      @confirm="submitDeleteNotif"
    />

    <AppConfirmModal
      :open="showClearReadConfirm"
      title="Hapus semua notifikasi yang sudah dibaca?"
      message="Seluruh notifikasi berstatus sudah dibaca akan dihapus permanen. Notifikasi belum dibaca tidak terpengaruh."
      variant="danger"
      confirm-label="Ya, Hapus yang Sudah Dibaca"
      icon="delete_sweep"
      :loading="clearReadSaving"
      @close="showClearReadConfirm = false"
      @confirm="clearReadNotifications"
    />

    <div :class="toastVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'" class="fixed bottom-6 right-6 z-50 bg-inverse-surface text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 transition-all">
      <span class="material-symbols-outlined text-primary-fixed text-[20px]" aria-hidden="true">check_circle</span>
      <span class="text-sm font-medium">{{ toastMsg }}</span>
    </div>
  </div>
</template>
