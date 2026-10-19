<script setup lang="ts">
definePageMeta({ layout: 'admin' })

import type { Delegation } from '~/types'
import { formatRp } from '~/utils/format'
import { formatDateId, mapDelegation, mapEmployee } from '~/composables/useMappers'
import { paginatorMeta, useApi, type LaravelPaginator } from '~/composables/useApi'

const api = useApi()

const filterQuery = ref('')
const debouncedDelegationSearch = useDebounce(filterQuery, 300)

const { data: delegationRes } = await useAsyncData('delegations', () => api<LaravelPaginator<any>>('/delegations', {
  params: { search: debouncedDelegationSearch.value.trim() || undefined, per_page: 20 },
}), { watch: [debouncedDelegationSearch] })
const { data: delegationUsers } = await useAsyncData('delegation-users', () => api<LaravelPaginator<any>>('/users', { params: { per_page: 100 } }))

const { data: auditRes } = await useAsyncData('delegation-audit', () => api<LaravelPaginator<any>>('/audit-logs', {
  params: { type: 'Delegation', per_page: 10 },
}))
const auditStream = computed<any[]>(() => paginatorMeta(auditRes.value?.data ? auditRes.value : []).items)
function auditLabel(a: any): string {
  const labels: Record<string, string> = {
    'delegation.revoke': 'Delegasi dicabut',
  }
  return `${labels[a.action] ?? a.action} — #${a.auditable_id ?? '-'}` || a.action
}

const app = useAppStore()

// Hanya role approver yang boleh jadi pemberi maupun penerima mandat
// (Positions::isApproverCapable di backend). Menampilkan staf biasa di sini
// hanya menghasilkan error 422 saat disimpan.
const APPROVER_ROLES = ['Line Manager', 'Division Head', 'Finance Approver', 'Super Admin']
const approverUsers = computed<any[]>(() =>
  ((delegationUsers.value?.data ?? []) as any[]).filter((u: any) => APPROVER_ROLES.includes(u.role)),
)
// Delegasi dibuat atas nama diri sendiri; hanya Super Admin boleh behalf orang lain.
const canPickDelegator = computed(() => app.isSuperAdmin)

const delegations = computed<(Delegation & { _rawId: number; _maxAmount: number })[]>(() =>
  paginatorMeta(delegationRes.value?.data ? delegationRes.value : []).items.map((d: any) => {
    const base = mapDelegation(d)
    const now = Date.now()
    const start = new Date(d.start_date).getTime()
    const end = new Date(d.end_date).getTime()
    const daysLeft = d.status === 'Kedaluwarsa'
      ? 'Kedaluwarsa'
      : start > now
        ? `Mulai ${formatDateId(d.start_date)}`
        : `Sisa ${Math.max(0, Math.ceil((end - now) / 86400000))} Hari`
    return {
      ...base,
      daysLeft,
      _rawId: d.id,
      _maxAmount: Number(d.max_amount ?? 0),
      // Label Plt untuk baris ini
      _asPltLabel: `Plt a/n ${d.delegator?.name ?? '-'}`,
    }
  }),
)
const filteredDelegations = computed(() => delegations.value)

// Cerminkan User::delegationScopeCovers() di backend (SixAgoBeV2):
// scope yang mengandung 'penuh'/'full' = Full Approval. Tanpa normalisasi ini,
// data lama berscope 'Full - ...' tampil abu-abu dan form Edit diam-diam
// menurunkannya menjadi 'Tiket & Hotel' saat disimpan.
function isFullScope(scope: string): boolean {
  const s = (scope || '').toLowerCase()
  return s.includes('penuh') || s.includes('full')
}

const delegationKpi = computed(() => ({
  active: delegations.value.filter(d => d.status === 'Aktif').length,
  scheduled: delegations.value.filter(d => d.status === 'Terjadwal').length,
  total: delegations.value.length,
  expired: delegations.value.filter(d => d.status === 'Kedaluwarsa').length,
}))

const showModal = ref(false)
const showToast = ref(false)
const toastMsg = ref('Delegasi kewenangan berhasil diaktifkan dengan audit log tercatat.')
let toastTimer: ReturnType<typeof setTimeout> | null = null
function flashDelegationToast(msg: string) {
  toastMsg.value = msg
  showToast.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (showToast.value = false), 3500)
}

const delegationForm = reactive({
  delegator_id: '' as string | number,
  delegatee_id: '' as string | number,
  scope: 'Penuh (Full Approval)',
  start_date: '',
  end_date: '',
  max_amount: '' as string | number,
  reason: '',
})
const delegationSaving = ref(false)

const modalDelegatorName = computed(() => {
  const found = ((delegationUsers.value?.data ?? []) as any[]).find((u: any) => String(u.id) === String(delegationForm.delegator_id))
  return found ? `${found.name} (${found.role})` : '—'
})

const editingDelegationId = ref<number | null>(null)

const complianceOk = ref(true)
function submitDelegation(e: Event) {
  e.preventDefault()
  if (!complianceOk.value) {
    flashDelegationToast('Centang konfirmasi kepatuhan terlebih dahulu.')
    return
  }
  // Konfirmasi via modal sebelum POST/PUT
  showModal.value = true
}

async function confirmCreateDelegation() {
  showModal.value = false
  delegationSaving.value = true
  try {
    const body = {
      delegator_id: Number(delegationForm.delegator_id),
      delegatee_id: Number(delegationForm.delegatee_id),
      scope: delegationForm.scope,
      reason: delegationForm.reason || undefined,
      max_amount: delegationForm.max_amount !== '' ? Number(delegationForm.max_amount) : undefined,
      start_date: delegationForm.start_date,
      end_date: delegationForm.end_date,
    }
    if (editingDelegationId.value) {
      await api(`/delegations/${editingDelegationId.value}`, { method: 'PUT', body })
      flashDelegationToast('Delegasi berhasil diperbarui.')
    } else {
      await api('/delegations', { method: 'POST', body })
      flashDelegationToast('Delegasi kewenangan berhasil diaktifkan dengan audit log tercatat.')
    }
    editingDelegationId.value = null
    await refreshNuxtData('delegations')
  } finally {
    delegationSaving.value = false
  }
}

function editDelegation(d: Delegation & { _rawId: number }) {
  const src: any = (delegationRes.value?.data as any[] | undefined)?.find((x: any) => x.id === d._rawId)
  editingDelegationId.value = d._rawId
  delegationForm.delegator_id = src?.delegator_id ?? ''
  delegationForm.delegatee_id = src?.delegatee_id ?? ''
  delegationForm.scope = isFullScope(d.scope) ? 'Penuh (Full Approval)' : 'Tiket & Hotel'
  delegationForm.start_date = src?.start_date ?? ''
  delegationForm.end_date = src?.end_date ?? ''
  delegationForm.max_amount = src?.max_amount ?? ''
  delegationForm.reason = d.reason === '-' ? '' : d.reason
}

async function exportDelegationAudit() {
  const { downloadCsv } = await import('~/composables/useMappers')
  await downloadCsv('/exports/audit-logs', 'audit-logs.csv')
  flashDelegationToast('File audit-logs.csv berhasil diunduh.')
}

const revokeTarget = ref<(Delegation & { _rawId: number }) | null>(null)
const revokeSaving = ref(false)
async function confirmRevoke() {
  const d = revokeTarget.value
  if (!d) return
  revokeSaving.value = true
  try {
    await api(`/delegations/${d._rawId}/revoke`, { method: 'POST' })
    flashDelegationToast(`Delegasi ${d.delegator.name} → ${d.delegatee.name} dicabut.`)
    revokeTarget.value = null
    await refreshNuxtData('delegations')
  } finally {
    revokeSaving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col w-full gap-6 pb-8 font-sans">
    <!-- Breadcrumb & Header Section -->
    <section class="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mt-4">
      <div class="space-y-1">


      </div>
      <div class="flex items-center gap-2 shrink-0 flex-wrap">
        <button aria-label="Unduh riwayat audit delegasi" title="Unduh CSV audit log" class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white text-secondary text-sm font-medium shadow-sm hover:bg-[#EFF4FF] transition-all" @click="exportDelegationAudit">
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">picture_as_pdf</span>
          <span>Unduh Riwayat Audit Delegasi (CSV)</span>
        </button>
        <button aria-label="Buat delegasi baru" class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary text-white text-sm font-semibold shadow-sm hover:bg-secondary transition-all" @click="showModal=true">
          <span class="material-symbols-outlined text-[20px]" aria-hidden="true">add_task</span>
          <span>+ Buat Delegasi Baru</span>
        </button>
      </div>
    </section>

    <!-- KPI Cards Matrix -->
    <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl p-4 shadow-sm flex flex-col justify-between relative overflow-hidden hover:shadow-md transition-shadow">
        <div class="absolute -right-4 -top-4 w-20 h-20 bg-secondary-container/40 rounded-full blur-xl pointer-events-none" aria-hidden="true" />
        <div class="flex items-center justify-between">
          <span class="text-xs uppercase tracking-wider text-[#54615b] font-semibold">Delegasi Aktif</span>
          <div class="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">transfer_within_a_station</span></div>
        </div>
        <div class="mt-4">
          <span class="text-2xl font-bold text-on-surface block">{{ delegationKpi.active }} Delegasi</span>
          <div class="flex items-center gap-1.5 mt-1 text-xs text-secondary font-medium">
            <span class="material-symbols-outlined text-[14px]" aria-hidden="true">bolt</span>
            <span>Otorisasi sementara aktif</span>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
        <div class="flex items-center justify-between">
          <span class="text-xs uppercase tracking-wider text-[#54615b] font-semibold">Terjadwal</span>
          <div class="w-8 h-8 rounded-full bg-[#EFF4FF] flex items-center justify-center text-[#54615b]"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">schedule</span></div>
        </div>
        <div class="mt-4">
          <span class="text-2xl font-bold text-on-surface block">{{ delegationKpi.scheduled }} Delegasi</span>
          <div class="flex items-center gap-1.5 mt-1 text-xs text-[#54615b]">
            <span class="material-symbols-outlined text-[14px]" aria-hidden="true">event_repeat</span>
            <span>Cuti terencana mendatang</span>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
        <div class="flex items-center justify-between">
          <span class="text-xs uppercase tracking-wider text-[#54615b] font-semibold">Total Delegasi</span>
          <div class="w-8 h-8 rounded-full bg-secondary-container/40 flex items-center justify-center text-primary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">verified_user</span></div>
        </div>
        <div class="mt-4">
          <span class="text-2xl font-bold text-on-surface block">{{ delegationKpi.total }} Delegasi</span>
          <div class="flex items-center gap-1.5 mt-1 text-xs text-secondary font-medium">
            <span class="material-symbols-outlined text-[14px]" aria-hidden="true">list_alt</span>
            <span>Dari daftar yang dimuat</span>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-xl p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
        <div class="flex items-center justify-between">
          <span class="text-xs uppercase tracking-wider text-[#54615b] font-semibold">Riwayat Kedaluwarsa</span>
          <div class="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">history</span></div>
        </div>
        <div class="mt-4">
          <span class="text-2xl font-bold text-primary block">{{ delegationKpi.expired }} Delegasi</span>
          <div class="flex items-center gap-1.5 mt-1 text-xs text-secondary font-medium">
            <span class="material-symbols-outlined text-[14px]" aria-hidden="true">check_circle</span>
            <span>Periode telah berakhir</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Main Content Layout Grid -->
    <div class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <!-- Table Matrix Container (Left/Wide) -->
      <div class="xl:col-span-8 flex flex-col gap-6">
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <span class="text-base font-bold text-on-surface">Jadwal &amp; Riwayat Delegasi Aktif</span>
              <span class="px-2 py-0.5 rounded-full bg-[#EFF4FF] text-[#54615b] text-xs">{{ delegationKpi.active }} Berjalan</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="relative w-48 sm:w-60">
                <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#54615b] text-[18px]" aria-hidden="true">filter_list</span>
                <input v-model="filterQuery" class="w-full pl-9 pr-4 py-1.5 rounded-full bg-[#EFF4FF] text-on-surface placeholder-[#54615b] text-sm focus:outline-none focus:bg-white shadow-sm" placeholder="Filter pejabat..." type="text" aria-label="Filter pejabat" />
              </div>
              <button aria-label="Segarkan daftar delegasi" title="Muat ulang" class="w-8 h-8 rounded-full bg-[#EFF4FF] flex items-center justify-center text-[#54615b] hover:text-on-surface transition-colors" @click="refreshNuxtData('delegations')"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">refresh</span></button>
            </div>
          </div>

          <div class="w-full overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead>
                <tr class="bg-[#EFF4FF] text-[#54615b] text-xs uppercase tracking-wider">
                  <th class="py-3 px-6">Pemberi Delegasi</th>
                  <th class="py-3 px-4">Penerima (Proxy)</th>
                  <th class="py-3 px-4">Cakupan &amp; Limit</th>
                  <th class="py-3 px-4">Masa Efektif</th>
                  <th class="py-3 px-4">Alasan</th>
                  <th class="py-3 px-4">Status</th>
                  <th class="py-3 px-6 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#EFF4FF]/50">
                <tr v-for="d in filteredDelegations" :key="d.id" class="hover:bg-[#EFF4FF]/60 transition-colors" :class="d.status==='Kedaluwarsa' ? 'opacity-70' : ''">
                  <td class="py-3 px-6">
                    <div class="flex items-center gap-2">
                      <img :src="d.delegator.avatar" :alt="`Foto ${d.delegator.name}`" class="w-9 h-9 rounded-full object-cover shadow-sm shrink-0" :class="d.status==='Kedaluwarsa' ? 'grayscale' : ''" />
                      <div><div class="text-sm font-semibold text-on-surface leading-tight">{{ d.delegator.name }}</div><div class="text-xs text-[#54615b]">{{ d.delegator.role }} • {{ d.delegator.department }}</div></div>
                    </div>
                  </td>
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-2">
                      <img :src="d.delegatee.avatar" :alt="`Foto ${d.delegatee.name}`" class="w-8 h-8 rounded-full object-cover shrink-0" :class="d.status==='Kedaluwarsa' ? 'grayscale' : ''" />
                      <div><div class="text-sm font-semibold text-on-surface leading-tight">{{ d.delegatee.name }}</div><div class="text-xs text-[#54615b]">{{ d.delegatee.role }}</div>
                        <span v-if="d.status !== 'Kedaluwarsa'" class="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] bg-[#EFF4FF] text-secondary font-semibold">{{ (d as any)._asPltLabel }}</span></div>
                    </div>
                  </td>
                  <td class="py-3 px-4">
                    <div class="flex flex-col gap-1 items-start">
                      <span :class="isFullScope(d.scope) ? 'bg-secondary-container text-[#2e6f3c] font-semibold' : d.status==='Kedaluwarsa' ? 'bg-[#E6EEFF] text-[#54615b]' : 'bg-[#EFF4FF] text-on-surface'" class="px-2 py-0.5 rounded-full text-xs">{{ d.scope }}</span>
                      <span class="text-xs text-[#54615b]">Maks. {{ formatRp(d._maxAmount) }}</span>
                    </div>
                  </td>
                  <td class="py-3 px-4 whitespace-nowrap">
                    <div :class="d.status==='Kedaluwarsa' ? 'text-[#54615b]' : 'text-on-surface'" class="text-sm font-medium">{{ d.startDate }} - {{ d.endDate }}</div>
                    <span :class="d.status==='Aktif' ? 'bg-[#EFF4FF] text-secondary' : d.status==='Terjadwal' ? 'bg-[#E6EEFF] text-[#54615b]' : 'bg-[#EFF4FF] text-[#54615b]'" class="inline-block px-1.5 py-0.5 rounded text-[10px] mt-0.5">{{ d.daysLeft }}</span>
                  </td>
                  <td class="py-3 px-4"><span class="px-2 py-0.5 rounded-full bg-[#E6EEFF] text-on-surface text-xs">{{ d.reason }}</span></td>
                  <td class="py-3 px-4">
                    <span v-if="d.status==='Aktif'" class="px-2 py-1 rounded-full bg-secondary-container text-[#2e6f3c] text-xs flex items-center gap-1.5 w-max"><span class="w-1.5 h-1.5 rounded-full bg-primary animate-ping" aria-hidden="true" /> Aktif Berjalan</span>
                    <span v-else-if="d.status==='Terjadwal'" class="px-2 py-1 rounded-full bg-[#EFF4FF] text-[#54615b] text-xs flex items-center gap-1.5 w-max"><span class="w-1.5 h-1.5 rounded-full bg-[#54615b]" aria-hidden="true" /> Terjadwal</span>
                    <span v-else class="px-2 py-1 rounded-full bg-[#EFF4FF] text-[#54615b] text-xs flex items-center gap-1.5 w-max"><span class="w-1.5 h-1.5 rounded-full bg-[#54615b]" aria-hidden="true" /> Kedaluwarsa</span>
                  </td>
                  <td class="py-3 px-6 text-right">
                    <div class="flex items-center justify-end gap-1.5">
                      <template v-if="d.status!=='Kedaluwarsa'">
                        <button aria-label="Ubah delegasi" class="w-8 h-8 rounded-full bg-[#EFF4FF] text-secondary flex items-center justify-center hover:bg-secondary-container transition-colors" @click="editDelegation(d)"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">edit</span></button>
                        <button aria-label="Cabut delegasi" class="w-8 h-8 rounded-full bg-error-container/60 text-error flex items-center justify-center hover:bg-error-container transition-colors" @click="revokeTarget = d"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">cancel</span></button>
                      </template>
                    </div>
                  </td>
                </tr>
                <tr v-if="filteredDelegations.length===0"><td colspan="7" class="py-10 text-center text-sm text-[#54615b]">Tidak ada delegasi yang cocok.</td></tr>
              </tbody>
            </table>
          </div>

          <div class="p-4 bg-white flex items-center justify-between text-xs text-[#54615b] border-t border-[#EFF4FF]">
            <span>Menampilkan {{ filteredDelegations.length }} dari {{ delegationKpi.total }} riwayat delegasi</span>
            <div class="flex items-center gap-1">
              <button class="px-3 py-1 rounded-full bg-[#EFF4FF] text-on-surface hover:bg-[#E6EEFF] transition-all text-xs font-semibold">Sebelumnya</button>
              <span class="px-2 text-sm font-semibold text-on-surface">1</span>
              <button class="px-3 py-1 rounded-full bg-[#EFF4FF] text-on-surface hover:bg-[#E6EEFF] transition-all text-xs font-semibold">Selanjutnya</button>
            </div>
          </div>
        </div>

        <!-- Live Audit Stream Panel -->
        <div class="bg-white rounded-xl p-6 shadow-sm">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">verified</span></div>
              <div><h2 class="text-base font-bold text-on-surface">Audit Trail Otorisasi Delegasi Terkini</h2><p class="text-xs text-[#54615b]">Catatan forensik otomatis setiap kali tiket disetujui atas nama delegator.</p></div>
            </div>
            <span class="text-xs uppercase tracking-wider text-secondary font-bold">Imutabel &amp; Enkripsi SHA-256</span>
          </div>
          <div v-if="auditStream.length" class="space-y-2">
            <div v-for="a in auditStream" :key="a.id" class="p-3 rounded-lg bg-[#EFF4FF] flex flex-col md:flex-row md:items-center justify-between gap-2 hover:bg-[#E6EEFF] transition-colors">
              <div class="flex items-center gap-3">
                <div class="w-2 h-2 rounded-full bg-primary shrink-0" aria-hidden="true" />
                <div><span class="text-sm font-semibold text-on-surface">{{ auditLabel(a) }}</span><div class="text-xs text-[#54615b] mt-0.5">{{ a.user?.name ?? 'Sistem' }} • IP {{ a.ip ?? '-' }}</div></div>
              </div>
              <div class="flex items-center gap-3 shrink-0">
                <span class="text-xs text-[#54615b] font-mono">{{ formatDateId(a.created_at) }}</span>
                <span class="px-2 py-0.5 rounded bg-secondary-container text-[#2e6f3c] text-xs font-semibold">Tercatat</span>
              </div>
            </div>
          </div>
          <p v-else class="text-xs text-muted py-4 text-center">Belum ada jejak audit delegasi. Setiap pembuatan, perubahan, dan pencabutan tercatat otomatis di sini.</p>
        </div>
      </div>

      <!-- Right Side: Fast Delegation Form Card -->
      <div class="xl:col-span-4 bg-white rounded-xl p-6 shadow-sm">
        <div class="flex items-center justify-between pb-4 mb-4 border-b border-[#EFF4FF]">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">assignment_ind</span></div>
            <div><h2 class="text-base font-bold text-on-surface">Form Delegasi Sementara</h2></div>
          </div>
        </div>
        <form class="space-y-4" @submit="submitDelegation">
          <div class="space-y-1">
            <label class="text-sm font-semibold text-on-surface flex items-center justify-between">
              <span>Pemberi Kewenangan (Delegator)</span>
              <span class="text-xs text-secondary font-medium">{{ canPickDelegator ? 'Pilih bebas (Super Admin)' : 'Otomatis: Anda sendiri' }}</span>
            </label>
            <div class="relative">
              <select
                v-model="delegationForm.delegator_id"
                required
                :disabled="!canPickDelegator"
                class="w-full h-11 px-4 rounded-xl bg-[#EFF4FF] text-on-surface text-sm appearance-none focus:bg-white focus:outline-none transition-all shadow-sm pr-10 disabled:opacity-70 disabled:cursor-not-allowed"
                aria-label="Pemberi kewenangan"
              >
                <option value="" disabled>Pilih pemberi kewenangan...</option>
                <option v-for="u in approverUsers" :key="u.id" :value="u.id">{{ u.name }} ({{ u.role }})</option>
              </select>
              <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[#54615b] pointer-events-none text-[20px]" aria-hidden="true">unfold_more</span>
            </div>
            <p v-if="!canPickDelegator" class="text-[11px] text-[#54615b]">Delegasi hanya bisa dibuat atas nama Anda sendiri. Backend menolak 403 bila menunjuk orang lain.</p>
          </div>
          <div class="space-y-1">
            <label class="text-sm font-semibold text-on-surface flex items-center justify-between"><span>Penerima Mandat (Delegatee / Proxy)</span><span class="text-xs text-[#54615b]">Setara / Deputy</span></label>
            <div class="relative">
              <select v-model="delegationForm.delegatee_id" required class="w-full h-11 px-4 rounded-xl bg-[#EFF4FF] text-on-surface text-sm appearance-none focus:bg-white focus:outline-none transition-all shadow-sm pr-10" aria-label="Penerima mandat">
                <option value="" disabled>Pilih pejabat penerima kuasa...</option>
                <option v-for="u in approverUsers" :key="u.id" :value="u.id">{{ u.name }} ({{ u.role }})</option>
              </select>
              <span class="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[#54615b] pointer-events-none text-[20px]" aria-hidden="true">group_add</span>
            </div>
            <p class="text-[11px] text-[#54615b]">Hanya role approver yang bisa menerima mandat — delegasi ke staf biasa ditolak.</p>
          </div>
          <div class="space-y-1">
            <label class="text-sm font-semibold text-on-surface">Cakupan Kewenangan Persetujuan</label>
            <div class="grid grid-cols-2 gap-2">
              <label class="flex items-center gap-2 p-2.5 rounded-xl bg-[#EFF4FF] cursor-pointer hover:bg-[#E6EEFF] transition-colors"><input v-model="delegationForm.scope" value="Penuh (Full Approval)" class="accent-primary" name="scope" type="radio" /><span class="text-xs font-semibold text-on-surface">Penuh (Full)</span></label>
              <label class="flex items-center gap-2 p-2.5 rounded-xl bg-[#EFF4FF] cursor-pointer hover:bg-[#E6EEFF] transition-colors"><input v-model="delegationForm.scope" value="Tiket & Hotel" class="accent-primary" name="scope" type="radio" /><span class="text-xs font-semibold text-on-surface">Tiket &amp; Hotel</span></label>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1"><label class="text-sm font-semibold text-on-surface">Mulai Berlaku</label><input v-model="delegationForm.start_date" required class="w-full h-11 px-3 rounded-xl bg-[#EFF4FF] text-on-surface text-sm focus:bg-white focus:outline-none shadow-sm" type="date" aria-label="Mulai berlaku" /></div>
            <div class="space-y-1"><label class="text-sm font-semibold text-on-surface">Berakhir Pada</label><input v-model="delegationForm.end_date" required class="w-full h-11 px-3 rounded-xl bg-[#EFF4FF] text-on-surface text-sm focus:bg-white focus:outline-none shadow-sm" type="date" aria-label="Berakhir pada" /></div>
          </div>
          <div class="space-y-1">
            <label class="text-sm font-semibold text-on-surface flex items-center justify-between"><span>Batas Nilai Anggaran Maksimal</span><span class="text-xs text-[#54615b]">Per permohonan</span></label>
            <div class="relative"><span class="absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-secondary text-sm">Rp</span><input v-model="delegationForm.max_amount" required type="number" min="1" step="1" class="w-full h-11 pl-12 pr-4 rounded-xl bg-[#EFF4FF] text-on-surface text-sm font-semibold focus:bg-white focus:outline-none shadow-sm" placeholder="25000000" aria-label="Batas nilai anggaran" /></div>
            <p class="text-[11px] text-[#54615b]">Wajib diisi dan lebih dari 0 — delegasi tanpa batas nominal tidak diperbolehkan.</p>
          </div>
          <div class="space-y-1">
            <label class="text-sm font-semibold text-on-surface">Alasan Pelimpahan Wewenang</label>
            <textarea v-model="delegationForm.reason" class="w-full p-3 rounded-xl bg-[#EFF4FF] text-on-surface placeholder-[#54615b] text-sm focus:bg-white focus:outline-none shadow-sm resize-none" placeholder="Tuliskan catatan formal atau nomor surat izin cuti..." rows="3" aria-label="Alasan pelimpahan" />
          </div>
          <div class="p-3 rounded-xl bg-[#EFF4FF] flex items-start gap-2">
            <input v-model="complianceOk" class="mt-1 accent-primary shrink-0" id="complianceCheck" type="checkbox" />
            <label class="text-xs text-on-surface cursor-pointer leading-relaxed" for="complianceCheck">Saya mengonfirmasi pelimpahan ini sesuai regulasi internal perusahaan dan seluruh tindakan proxy akan tercatat pada <strong class="text-secondary font-semibold">Audit Governance Trail</strong>.</label>
          </div>
          <div class="pt-1 space-y-2">
            <button class="w-full py-3 px-4 rounded-full bg-primary text-white text-sm font-bold shadow-sm hover:bg-secondary active:scale-95 transition-all flex items-center justify-center gap-2" type="submit"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">lock_open</span><span>Aktifkan Delegasi Otorisasi</span></button>
            <button class="w-full py-2.5 px-4 rounded-full bg-[#EFF4FF] text-[#54615b] text-sm hover:bg-[#E6EEFF] transition-all" type="reset">Batal &amp; Reset Form</button>
          </div>
        </form>
      </div>
    </div>

    <AppConfirmModal
      :open="revokeTarget !== null"
      :title="`Cabut delegasi ${revokeTarget?.delegator.name}?`"
      :message="revokeTarget ? `${revokeTarget.delegatee.name} seketika kehilangan wewenang Plt (${revokeTarget.scope}, maks. ${formatRp(revokeTarget._maxAmount)}). Antrean yang ditujukan ke pemberi wewenang kembali menggantung.` : ''"
      variant="danger"
      confirm-label="Ya, Cabut"
      icon="warning"
      :loading="revokeSaving"
      @close="revokeTarget = null"
      @confirm="confirmRevoke"
    />

    <!-- Modal Delegasi Cepat -->
    <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-200" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="showModal" class="fixed inset-0 bg-[#27313f]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="showModal=false">
        <div class="bg-white rounded-xl p-6 max-w-lg w-full shadow-2xl space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-full bg-secondary-container flex items-center justify-center text-secondary"><span class="material-symbols-outlined text-[22px]" aria-hidden="true">verified_user</span></div>
              <div><h3 class="text-base font-bold text-on-surface">Konfirmasi Pembuatan Delegasi</h3><span class="text-xs text-[#54615b]">Kewenangan Approval Perjalanan</span></div>
            </div>
            <button aria-label="Tutup modal" class="w-8 h-8 rounded-full bg-[#EFF4FF] flex items-center justify-center text-[#54615b] hover:text-on-surface" @click="showModal=false"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span></button>
          </div>
          <p class="text-sm text-[#54615b]">Anda akan mengalihkan otoritas persetujuan anggaran dan tiket perjalanan kepada deputi pilihan Anda. Pastikan tanggal dan batas pengeluaran sudah terverifikasi.</p>
          <div class="p-3 rounded-xl bg-[#EFF4FF] space-y-2">
            <div class="flex justify-between text-xs"><span class="text-[#54615b]">Pemberi Kewenangan:</span><span class="font-semibold text-on-surface">{{ modalDelegatorName }}</span></div>
            <div class="flex justify-between text-xs"><span class="text-[#54615b]">Status SLA:</span><span class="text-secondary font-semibold">15 Menit Rata-rata Tanggapan</span></div>
          </div>
          <div class="flex items-center justify-end gap-2 pt-2">
            <button class="px-6 py-2.5 rounded-full bg-[#EFF4FF] text-[#54615b] text-sm hover:bg-[#E6EEFF] transition-all" @click="showModal=false">Batal</button>
            <button class="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-bold shadow-sm hover:bg-secondary transition-all disabled:opacity-60" :disabled="delegationSaving" @click="confirmCreateDelegation">{{ delegationSaving ? 'Memproses...' : 'Lanjutkan Pelimpahan' }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition enter-active-class="transition duration-300" enter-from-class="translate-y-10 opacity-0" enter-to-class="translate-y-0 opacity-100" leave-active-class="transition duration-200" leave-from-class="translate-y-0 opacity-100" leave-to-class="translate-y-10 opacity-0">
      <div v-if="showToast" class="fixed bottom-6 right-6 z-50 bg-[#27313f] text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2" role="status" aria-live="polite">
        <span class="material-symbols-outlined text-[#5ce06c] text-[20px]" aria-hidden="true">check_circle</span>
        <span class="text-sm font-medium">Delegasi kewenangan berhasil diaktifkan dengan audit log tercatat.</span>
      </div>
    </Transition>
  </div>
</template>
