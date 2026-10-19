<script setup lang="ts">
definePageMeta({ layout: 'admin' })

import { mapTravelPolicy } from '~/composables/useMappers'
import { paginatorMeta, useApi, type LaravelPaginator } from '~/composables/useApi'

const api = useApi()
const toast = useToast()

type PolicyDisplay = {
  _rawId: number
  _region: string
  code: string
  nama: string
  desc: string
  gradeLabel: string
  gradeClass: string
  transport: string
  transportNote: string
  hotel: string
  hotelNote: string
  hotelNoteClass: string
  perDiem: string
  perDiemNote: string
  localTransport: string
  sla: string
  slaIcon: string
  enabled: boolean
  isHighlighted?: boolean
}

const searchQuery = ref('')
const debouncedPolicySearch = useDebounce(searchQuery, 300)
const wilayah = ref('Semua (Domestik & Global)')
const statusFilter = ref('Semua Status')

const regionParam = computed(() => {
  if (wilayah.value.startsWith('Domestik')) return 'Domestik'
  if (wilayah.value.startsWith('Asia')) return 'Global'
  if (wilayah.value.startsWith('Internasional')) return 'Global'
  return undefined
})
const statusParam = computed(() => {
  if (statusFilter.value === 'Aktif Berjalan') return 'active'
  if (statusFilter.value === 'Non-aktif' || statusFilter.value === 'Draf Revisi') return 'inactive'
  return undefined
})

const { data: policyRes } = await useAsyncData('travel-policies', () => api<LaravelPaginator<any>>('/travel-policies', {
  params: {
    search: debouncedPolicySearch.value.trim() || undefined,
    region: regionParam.value,
    status: statusParam.value,
    per_page: 50,
  },
}), { watch: [debouncedPolicySearch, regionParam, statusParam] })

const displayPolicies = computed<PolicyDisplay[]>(() =>
  paginatorMeta(policyRes.value?.data ? policyRes.value : []).items.map((p: any) => {
    const base = mapTravelPolicy(p)
    return {
      _rawId: p.id,
      _region: p.region ?? 'Domestik',
      code: base.code,
      nama: base.grade,
      desc: `Wilayah ${base.region} • SLA ${base.sla}`,
      gradeLabel: `Grade ${base.grade}`,
      gradeClass: 'bg-surface-container text-on-surface',
      transport: base.transportPlafon,
      transportNote: 'Per leg penerbangan',
      hotel: base.hotelPlafon,
      hotelNote: 'Per malam',
      hotelNoteClass: 'text-[#54615b]',
      perDiem: base.perDiem,
      perDiemNote: 'Uang harian',
      localTransport: base.localTransport,
      sla: base.sla,
      slaIcon: '',
      enabled: base.enabled,
    }
  }),
)

const filteredPolicies = computed(() => displayPolicies.value)

// Kepatuhan nyata: hitung badge policy_status dari sampel pengajuan yang
// dimuat (per_page=50). Bukan angka global — labelnya jujur soal sumbernya.
const { data: complianceSample } = await useAsyncData('policy-compliance-sample', () => api<LaravelPaginator<any>>('/travel-requests', { params: { per_page: 50 } }))
const complianceKpi = computed(() => {
  const items = paginatorMeta(complianceSample.value?.data ? complianceSample.value : []).items as any[]
  const marked = items.filter(i => i.policy_status === 'Sesuai' || String(i.policy_status ?? '').startsWith('Deviasi'))
  const ok = items.filter(i => i.policy_status === 'Sesuai').length
  const dev = items.filter(i => String(i.policy_status ?? '').startsWith('Deviasi')).length
  return { sample: items.length, marked: marked.length, ok, dev, pct: marked.length ? Math.round((ok / marked.length) * 1000) / 10 : null }
})

const showModal = ref(false)
const saving = ref(false)
const editingPolicyId = ref<number | null>(null)
const policyForm = reactive({
  code: '',
  grade: '',
  transport_plafon: '',
  hotel_plafon: '',
  per_diem: '',
  local_transport: '',
  sla: '',
  region: 'Domestik',
})
function openModal() {
  editingPolicyId.value = null
  policyForm.code = ''
  policyForm.grade = ''
  policyForm.transport_plafon = ''
  policyForm.hotel_plafon = ''
  policyForm.per_diem = ''
  policyForm.local_transport = ''
  policyForm.sla = ''
  policyForm.region = 'Domestik'
  showModal.value = true
}
function openEditPolicy(p: PolicyDisplay) {
  editingPolicyId.value = p._rawId
  policyForm.code = p.code
  policyForm.grade = p.gradeLabel.replace(/^Grade /, '')
  policyForm.transport_plafon = p.transport
  policyForm.hotel_plafon = p.hotel
  policyForm.per_diem = p.perDiem
  policyForm.local_transport = p.localTransport
  policyForm.sla = p.sla
  policyForm.region = p._region
  showModal.value = true
}
function closeModal() { showModal.value = false }
async function savePolicy() {
  saving.value = true
  try {
    if (editingPolicyId.value) {
      await api(`/travel-policies/${editingPolicyId.value}`, {
        method: 'PUT',
        body: {
          grade: policyForm.grade || undefined,
          transport_plafon: policyForm.transport_plafon || undefined,
          hotel_plafon: policyForm.hotel_plafon || undefined,
          per_diem: policyForm.per_diem || undefined,
          local_transport: policyForm.local_transport || undefined,
          sla: policyForm.sla || undefined,
          region: policyForm.region,
        },
      })
    } else {
      await api('/travel-policies', {
        method: 'POST',
        body: {
          code: policyForm.code,
          grade: policyForm.grade,
          transport_plafon: policyForm.transport_plafon,
          hotel_plafon: policyForm.hotel_plafon,
          per_diem: policyForm.per_diem,
          local_transport: policyForm.local_transport,
          sla: policyForm.sla,
          region: policyForm.region,
        },
      })
    }
    closeModal()
    await refreshNuxtData('travel-policies')
  } finally {
    saving.value = false
  }
}
async function togglePolicy(p: PolicyDisplay) {
  try {
    await api(`/travel-policies/${p._rawId}/toggle`, { method: 'PATCH' })
    await refreshNuxtData('travel-policies')
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal mengubah status kebijakan.', 'error', 'error')
  }
}
async function duplicatePolicy(p: PolicyDisplay) {
  try {
    await api('/travel-policies', {
      method: 'POST',
      body: {
        // Backend mewajibkan code unik (TravelPolicyController:32). "-COPY" polos
        // selalu bentrok saat diduplikasi dua kali, jadi tambahkan sufiks waktu.
        code: `${p.code}-COPY-${Date.now().toString(36).toUpperCase()}`,
        grade: p.gradeLabel.replace(/^Grade /, ''),
        transport_plafon: p.transport, hotel_plafon: p.hotel, per_diem: p.perDiem,
        local_transport: p.localTransport, sla: p.sla, region: p._region,
      },
    })
    await refreshNuxtData('travel-policies')
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal menduplikasi kebijakan.', 'error', 'error')
  }
}
async function deletePolicy(p: PolicyDisplay) {
  try {
    await api(`/travel-policies/${p._rawId}`, { method: 'DELETE' })
    await refreshNuxtData('travel-policies')
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal menghapus kebijakan.', 'error', 'error')
  }
}

async function exportMatrix() {
  const { downloadCsv } = await import('~/composables/useMappers')
  await downloadCsv('/exports/travel-policies', 'travel-policies.csv')
}

async function exportPolicyAudit() {
  const { downloadCsv } = await import('~/composables/useMappers')
  await downloadCsv('/exports/audit-logs', 'audit-logs.csv')
}

</script>

<template>
  <div class="flex flex-col w-full gap-6 pb-8 font-sans">
    <!-- Breadcrumbs & Header Section -->
    <div class="flex flex-col gap-2 mt-2">
      <div class="flex items-center gap-1 text-[#54615b] text-sm">

      </div>
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div class="flex flex-col">

        </div>
        <div class="flex items-center gap-2 shrink-0 flex-wrap">
          <button aria-label="Riwayat perubahan aturan" title="Unduh CSV audit log" class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-surface-container text-secondary hover:bg-[#dee9fc] transition-all text-sm font-medium shadow-sm" @click="exportPolicyAudit">
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">history</span>
            <span>Riwayat Perubahan Aturan</span>
          </button>
          <button aria-label="Buat kebijakan baru" class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary-container text-[#003e0f] hover:opacity-95 transition-all text-sm font-semibold shadow-[0_4px_14px_rgba(40,180,70,0.3)]" @click="openModal">
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">add_circle</span>
            <span>+ Buat Kebijakan Baru</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Ringkasan kebijakan: satu kartu per policy di database (data nyata).
      Policy dipilih OTOMATIS dari grade pemohon dan MEMBATASI estimasi biaya TR
      serta nominal Uang Muka; pengajuan melebihi plafon ditolak (422). -->
    <p class="flex items-start gap-2 text-xs text-muted bg-surface-container-low rounded-xl px-4 py-3">
      <span class="material-symbols-outlined text-[16px] shrink-0" aria-hidden="true">info</span>
      <span>Policy dipilih <strong class="text-on-surface">otomatis dari grade pemohon</strong> (tanpa pilih manual). Estimasi biaya Travel Request dan nominal Uang Muka <strong class="text-on-surface">dibatasi</strong> agar tidak melebihi plafon grade; pengajuan melebihi plafon ditolak di sistem. Rantai approval tetap ditentukan nominal + struktur organisasi.</span>
    </p>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <div v-for="p in displayPolicies" :key="p._rawId" class="relative overflow-hidden rounded-xl bg-white p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between" :class="!p.enabled ? 'opacity-60' : ''">
        <div class="flex items-start justify-between mb-4">
          <div class="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center text-primary">
            <span class="material-symbols-outlined text-[22px]" aria-hidden="true">policy</span>
          </div>
          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container text-secondary text-xs font-medium">
            <span class="w-2 h-2 rounded-full" :class="p.enabled ? 'bg-primary' : 'bg-muted'" aria-hidden="true" /> {{ p.enabled ? 'Aktif' : 'Non-aktif' }}
          </span>
        </div>
        <div>
          <span class="text-xs uppercase tracking-wider text-[#54615b]">{{ p.code }}</span>
          <h3 class="text-lg font-bold text-on-surface mt-0.5">{{ p.gradeLabel }}</h3>
          <p class="text-xs text-[#54615b] mb-3">{{ p._region }} • SLA {{ p.sla }}</p>
          <div class="space-y-1 bg-surface-container-low p-2 rounded-lg text-sm">
            <div class="flex items-center justify-between gap-2"><span class="text-[#54615b] flex items-center gap-1 shrink-0"><span class="material-symbols-outlined text-[15px]" aria-hidden="true">flight</span>Tiket:</span><span class="text-sm font-medium text-right">{{ p.transport }}</span></div>
            <div class="flex items-center justify-between gap-2"><span class="text-[#54615b] flex items-center gap-1 shrink-0"><span class="material-symbols-outlined text-[15px]" aria-hidden="true">hotel</span>Hotel:</span><span class="text-sm font-medium text-right">{{ p.hotel }}</span></div>
            <div class="flex items-center justify-between gap-2"><span class="text-[#54615b] flex items-center gap-1 shrink-0"><span class="material-symbols-outlined text-[15px]" aria-hidden="true">payments</span>Per Diem:</span><span class="font-bold text-primary text-sm text-right">{{ p.perDiem }}</span></div>
            <div class="flex items-center justify-between gap-2"><span class="text-[#54615b] flex items-center gap-1 shrink-0"><span class="material-symbols-outlined text-[15px]" aria-hidden="true">directions_car</span>Transport lokal:</span><span class="text-sm font-medium text-right">{{ p.localTransport }}</span></div>
          </div>
        </div>
      </div>
      <div v-if="displayPolicies.length === 0" class="md:col-span-2 xl:col-span-4"><EmptyState icon="policy" title="Belum ada kebijakan" message="Buat kebijakan perjalanan pertama via tombol di bawah tabel." /></div>
    </div>

    <!-- Travel Policy Management Main Table Container -->
    <div class="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
      <!-- Filter, Search & Table Operations Bar -->
      <div class="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-low/40">
        <div class="flex items-center gap-2 flex-wrap flex-1">
          <div class="relative min-w-[220px] sm:min-w-[280px] flex-1 max-w-sm">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#54615b] text-[18px]" aria-hidden="true">search</span>
            <input
              v-model="searchQuery"
              class="w-full pl-9 pr-4 py-1.5 rounded-full bg-white text-sm text-on-surface placeholder-[#54615b] shadow-sm focus:outline-none"
              placeholder="Cari kode atau nama policy..."
              type="text"
              aria-label="Cari policy"
            />
          </div>
          <div class="flex items-center gap-1.5 bg-white px-4 py-1.5 rounded-full shadow-sm shrink-0">
            <span class="text-[#54615b] text-sm">Wilayah:</span>
            <select v-model="wilayah" class="bg-transparent text-sm text-on-surface focus:outline-none cursor-pointer" aria-label="Filter wilayah">
              <option>Semua (Domestik &amp; Global)</option>
              <option>Domestik Indonesia</option>
              <option>Asia Pasifik (APAC)</option>
              <option>Internasional / Jarak Jauh</option>
            </select>
          </div>
          <div class="flex items-center gap-1.5 bg-white px-4 py-1.5 rounded-full shadow-sm shrink-0">
            <span class="text-[#54615b] text-sm">Status:</span>
            <select v-model="statusFilter" class="bg-transparent text-sm text-on-surface focus:outline-none cursor-pointer" aria-label="Filter status">
              <option>Semua Status</option>
              <option>Aktif Berjalan</option>
              <option>Draf Revisi</option>
              <option>Non-aktif</option>
            </select>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button aria-label="Unduh matriks" title="Unduh CSV matriks kebijakan" class="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white hover:bg-surface-container-low text-on-surface transition-colors text-sm font-medium shadow-sm" @click="exportMatrix">
            <span class="material-symbols-outlined text-[16px]" aria-hidden="true">file_download</span>
            <span>Unduh Matriks (XLS)</span>
          </button>
        </div>
      </div>

      <!-- Table Component -->
      <div class="overflow-x-auto w-full">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-surface-container-low text-[#54615b] text-xs uppercase tracking-wider">
              <th class="py-3 px-6 font-semibold">Kode &amp; Kebijakan</th>
              <th class="py-3 px-4 font-semibold">Cakupan Grade</th>
              <th class="py-3 px-4 font-semibold">Plafon Transport (Leg)</th>
              <th class="py-3 px-4 font-semibold">Plafon Hotel (Malam)</th>
              <th class="py-3 px-4 font-semibold">Per Diem (Harian)</th>
              <th class="py-3 px-4 font-semibold">Transport Lokal</th>
              <th class="py-3 px-4 font-semibold">SLA Approval</th>
              <th class="py-3 px-4 font-semibold text-center">Status</th>
              <th class="py-3 px-6 font-semibold text-right">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-container-low text-sm">
            <tr
              v-for="p in filteredPolicies"
              :key="p.code"
              :class="p.isHighlighted ? 'bg-surface-container-low/20 hover:bg-surface-container-low/40' : p.enabled ? 'hover:bg-surface-container-low/30' : 'opacity-75 hover:opacity-100 hover:bg-surface-container-low/30'"
              class="transition-colors"
            >
              <td class="py-4 px-6">
                <div class="flex flex-col">
                  <span :class="p.enabled ? 'text-primary font-bold' : 'text-[#54615b] font-bold'" class="text-xs">{{ p.code }}</span>
                  <span class="text-sm font-semibold text-on-surface">{{ p.nama }}</span>
                  <span class="text-xs text-[#54615b]">{{ p.desc }}</span>
                </div>
              </td>
              <td class="py-4 px-4">
                <span :class="p.gradeClass" class="inline-flex px-2.5 py-0.5 rounded-full text-xs whitespace-nowrap">{{ p.gradeLabel }}</span>
              </td>
              <td class="py-4 px-4">
                <div class="flex flex-col">
                  <span class="text-sm font-medium text-on-surface">{{ p.transport }}</span>
                  <span class="text-xs text-[#54615b]">{{ p.transportNote }}</span>
                </div>
              </td>
              <td class="py-4 px-4">
                <div class="flex flex-col">
                  <span class="text-sm font-medium text-on-surface">{{ p.hotel }}</span>
                  <span :class="p.hotelNoteClass" class="text-xs">{{ p.hotelNote }}</span>
                </div>
              </td>
              <td class="py-4 px-4">
                <div class="flex flex-col">
                  <span class="text-sm font-semibold text-on-surface">{{ p.perDiem }}</span>
                  <span class="text-xs text-[#54615b]">{{ p.perDiemNote }}</span>
                </div>
              </td>
              <td class="py-4 px-4">
                <span class="text-sm text-on-surface">{{ p.localTransport }}</span>
              </td>
              <td class="py-4 px-4">
                <span v-if="p.slaIcon" class="inline-flex items-center gap-1 text-xs text-secondary bg-surface-container-low px-2 py-0.5 rounded-full">
                  <span class="material-symbols-outlined text-[14px]" aria-hidden="true">{{ p.slaIcon }}</span> {{ p.sla }}
                </span>
                <span v-else class="inline-flex items-center gap-1 text-xs text-[#54615b] bg-surface-container-low px-2 py-0.5 rounded-full">{{ p.sla }}</span>
              </td>
              <td class="py-4 px-4 text-center">
                <label class="relative inline-flex items-center cursor-pointer">
                  <input :checked="p.enabled" class="sr-only peer" type="checkbox" :aria-label="`Aktifkan ${p.code}`" @change="togglePolicy(p)" />
                  <div class="w-9 h-5 bg-[#dee9fc] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-container" />
                </label>
              </td>
              <td class="py-4 px-6 text-right">
                <div class="flex items-center justify-end gap-1">
                  <button aria-label="Edit kebijakan" class="w-8 h-8 rounded-full bg-surface-container-low text-primary flex items-center justify-center hover:bg-primary-container hover:text-white transition-colors" @click="openEditPolicy(p)">
                    <span class="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span>
                  </button>
                  <button aria-label="Duplikasi aturan" class="w-8 h-8 rounded-full bg-surface-container-low text-[#54615b] flex items-center justify-center hover:bg-surface-container hover:text-on-surface transition-colors" @click="duplicatePolicy(p)">
                    <span class="material-symbols-outlined text-[18px]" aria-hidden="true">content_copy</span>
                  </button>
                  <button aria-label="Hapus kebijakan" class="w-8 h-8 rounded-full bg-surface-container-low text-error flex items-center justify-center hover:bg-error hover:text-white transition-colors" @click="deletePolicy(p)">
                    <span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredPolicies.length===0">
              <td colspan="9" class="py-10 text-center text-sm text-[#54615b]">Tidak ada kebijakan yang cocok.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Table Footer / Pagination -->
      <div class="px-6 py-4 bg-white flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-surface-container-low text-sm">
        <span class="text-[#54615b]">Menampilkan <span class="font-semibold text-on-surface">{{ filteredPolicies.length }}</span> standar kebijakan perjalanan aktif</span>
        <div class="flex items-center gap-1">
          <button disabled aria-label="Sebelumnya" class="w-8 h-8 rounded-full bg-surface-container-low text-[#54615b] flex items-center justify-center hover:bg-surface-container transition-colors disabled:opacity-40">
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_left</span>
          </button>
          <button class="w-8 h-8 rounded-full bg-primary-container text-[#003e0f] text-sm">1</button>
          <button class="w-8 h-8 rounded-full hover:bg-surface-container text-on-surface text-sm">2</button>
          <button class="w-8 h-8 rounded-full hover:bg-surface-container text-on-surface text-sm">3</button>
          <button aria-label="Berikutnya" class="w-8 h-8 rounded-full bg-surface-container-low text-[#54615b] flex items-center justify-center hover:bg-surface-container transition-colors">
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      </div>
    </div>



    <!-- Modal - Vue state instead of classList hidden -->
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showModal"
        class="fixed inset-0 bg-[#27313f]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        @click.self="closeModal"
      >
        <div class="bg-white w-full max-w-2xl rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
          <div class="px-6 py-5 bg-surface-container-low/60 flex items-center justify-between">
            <div class="flex flex-col">
              <h2 class="text-lg font-bold text-on-surface">{{ editingPolicyId ? 'Ubah Kebijakan Perjalanan' : 'Buat Kebijakan Perjalanan Baru' }}</h2>
              <span class="text-xs text-[#54615b]">Tetapkan batas tarif transportasi, akomodasi, dan aturan per diem.</span>
            </div>
            <button aria-label="Tutup modal" class="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center hover:bg-[#dee9fc] transition-colors" @click="closeModal">
              <span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
            </button>
          </div>

          <div class="p-6 overflow-y-auto space-y-6 flex-1">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1">
                <label class="block text-sm font-semibold">Kode Kebijakan <span class="text-error">*</span></label>
                <input v-model="policyForm.code" :disabled="!!editingPolicyId" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white shadow-sm disabled:opacity-60" placeholder="Contoh: POL-IDN-MGR-06" type="text" />
              </div>
              <div class="space-y-1">
                <label class="block text-sm font-semibold">Cakupan Grade Jabatan <span class="text-error">*</span></label>
                <input v-model="policyForm.grade" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white shadow-sm" placeholder="Contoh: P3 - P5" type="text" />
              </div>
            </div>

            <div class="space-y-1">
              <label class="block text-sm font-semibold">Wilayah Berlaku <span class="text-error">*</span></label>
              <select v-model="policyForm.region" aria-label="Wilayah berlaku" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-sm focus:outline-none cursor-pointer">
                <option>Domestik</option>
                <option>Global</option>
              </select>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1">
                <label class="block text-xs font-semibold">Plafon Tiket Pesawat / Leg</label>
                <input v-model="policyForm.transport_plafon" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white shadow-sm" type="text" placeholder="Maks Rp 4.500.000" />
              </div>
              <div class="space-y-1">
                <label class="block text-xs font-semibold">Plafon Hotel / Malam</label>
                <input v-model="policyForm.hotel_plafon" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white shadow-sm" type="text" placeholder="Maks Rp 1.100.000 / malam" />
              </div>
              <div class="space-y-1">
                <label class="block text-xs font-semibold">Uang Harian (Per Diem)</label>
                <input v-model="policyForm.per_diem" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white shadow-sm" type="text" placeholder="Rp 450.000" />
              </div>
              <div class="space-y-1">
                <label class="block text-xs font-semibold">Transport Lokal</label>
                <input v-model="policyForm.local_transport" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white shadow-sm" type="text" placeholder="Maks Rp 200.000 / hari" />
              </div>
            </div>
            <div class="space-y-1">
              <label class="block text-xs font-semibold">SLA Approval</label>
              <input v-model="policyForm.sla" class="w-full px-4 py-2 rounded-xl bg-surface-container-low text-sm focus:outline-none focus:bg-white shadow-sm" type="text" placeholder="3 Hari Kerja" />
            </div>

            <div class="space-y-2 p-4 rounded-xl bg-surface-container-low">
              <div class="flex items-center gap-1.5">
                <span class="material-symbols-outlined text-secondary text-[20px]" aria-hidden="true">tune</span>
                <span class="text-sm font-semibold">Parameter Toleransi Deviasi Biaya</span>
              </div>
              <p class="text-xs text-[#54615b]">Sistem secara otomatis mengevaluasi harga tiket dinamis saat booking terjadi.</p>
              <div class="space-y-1 pt-2 text-sm">
                <div class="flex items-center justify-between"><span>Toleransi Level 1 (≤ 10%):</span><span class="text-xs text-secondary bg-white px-2 py-0.5 rounded-full shadow-sm">Approval Kepala Divisi</span></div>
                <div class="flex items-center justify-between"><span>Toleransi Level 2 (&gt; 10%):</span><span class="text-xs text-primary font-bold bg-white px-2 py-0.5 rounded-full shadow-sm">Approval Direktur Keuangan</span></div>
              </div>
            </div>

            <div class="flex items-start gap-1.5 text-xs text-[#54615b]">
              <span class="material-symbols-outlined text-[16px] text-secondary mt-0.5" aria-hidden="true">info</span>
              <span>Perubahan pada travel policy ini akan memicu notifikasi pembaruan ke seluruh staf procurement dan travel agency partner rekanan.</span>
            </div>
          </div>

          <div class="px-6 py-4 bg-surface-container-low/60 flex items-center justify-end gap-2">
            <button class="px-6 py-2 rounded-full bg-white hover:bg-[#dee9fc] text-on-surface text-sm transition-colors shadow-sm" @click="closeModal">Batal</button>
            <button class="flex items-center gap-1.5 px-6 py-2 rounded-full bg-primary-container text-[#003e0f] text-sm font-semibold shadow-sm hover:opacity-95 transition-all disabled:opacity-60" :disabled="saving" @click="savePolicy">
              <span v-if="saving" class="material-symbols-outlined text-[18px] animate-spin" aria-hidden="true">progress_activity</span>
              <span v-else class="material-symbols-outlined text-[18px]" aria-hidden="true">check_circle</span>
              <span>{{ saving ? 'Menyimpan...' : 'Simpan Kebijakan' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
    <AppToast :msg="toast.msg.value" :visible="toast.visible.value" :icon="toast.icon.value" />
  </div>
</template>
