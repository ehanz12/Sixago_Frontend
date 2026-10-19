<script setup lang="ts">
definePageMeta({ layout: 'admin' })

import type { Department } from '~/types'
import { formatRp } from '~/utils/format'
import { formatDateId, mapDepartment } from '~/composables/useMappers'
import { paginatorMeta, useApi, type LaravelPaginator } from '~/composables/useApi'

const api = useApi()
const searchQuery = ref('')
const debouncedDeptSearch = useDebounce(searchQuery, 300)
const activeTab = ref<'departments' | 'roles'>('departments')
const showDeptModal = ref(false)
const showCustomRoleModal = ref(false)
const showToast = ref(false)
const toastMsg = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

function triggerToast(msg: string) {
  toastMsg.value = msg
  showToast.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (showToast.value = false), 3000)
}

const { data: deptRes } = await useAsyncData('departments', () => api<LaravelPaginator<any>>('/departments', {
  params: { search: debouncedDeptSearch.value.trim() || undefined, per_page: 20 },
}), { watch: [debouncedDeptSearch] })
const { data: rolesRes } = await useAsyncData('roles', () => api<any[]>('/roles'))
// Opsi Kepala Departemen — menentukan approver Level 2 (user.department.leader).
const { data: leaderOptionsRes } = await useAsyncData('dept-leader-options', () => api<LaravelPaginator<any>>('/users', { params: { per_page: 100 } }))
const leaderOptions = computed<any[]>(() => paginatorMeta(leaderOptionsRes.value?.data ? leaderOptionsRes.value : []).items)

const departments = computed<Department[]>(() =>
  paginatorMeta(deptRes.value?.data ? deptRes.value : []).items.map((d: any) => ({
    ...mapDepartment(d),
    _rawId: d.id,
    _rawLeaderId: d.leader_id ?? d.leader?.id ?? null,
    _updated: d.updated_at,
  }) as Department & { _rawId: number; _rawLeaderId: number | null; _updated: string }),
)
const roles = computed<any[]>(() => rolesRes.value ?? [])

function percent(d: Department) {
  if (!d.budgetTotal) return 0
  return Math.round((d.budgetUsed / d.budgetTotal) * 100)
}

function metaFor(d: Department & { _updated?: string }) {
  const pct = percent(d)
  return {
    icon: 'domain',
    desc: `Unit bisnis ${d.name} â€” cost center ${d.code}.`,
    plafonLabel: formatRp(d.budgetTotal),
    terpakaiLabel: `Terpakai ${pct}% (${formatRp(d.budgetUsed)})`,
    sisaLabel: `Sisa Limit: ${formatRp(d.budgetTotal - d.budgetUsed)}`,
    chain: d.sla,
    updated: d._updated ? `Diperbarui ${formatDateId(d._updated)}` : '-',
    isWarning: pct > 75,
  }
}

const filteredDepartments = computed(() => departments.value)

const deptKpi = computed(() => {
  const totalPlafon = departments.value.reduce((s, d) => s + d.budgetTotal, 0)
  const totalUsed = departments.value.reduce((s, d) => s + d.budgetUsed, 0)
  return {
    totalPlafon,
    totalMembers: departments.value.reduce((s, d) => s + d.members, 0),
    utilization: totalPlafon ? Math.round((totalUsed / totalPlafon) * 1000) / 10 : 0,
    unitCount: departments.value.length,
    // Tanpa leader = Level 2 auto-pass untuk TR departemen tersebut.
    noLeader: departments.value.filter(d => !d.leader || d.leader.name === '-').length,
  }
})

const deptForm = reactive({ name: '', code: '', entity: 'PT Nusantara Dinamika Tbk (Holding)', leader: '', plafon: '' as string | number, flow: 'Tier 1 Standard' })
const deptSaving = ref(false)
const editingDeptId = ref<number | null>(null)

// ---- Modal anggota departemen ----
const membersModal = ref<{ open: boolean; dept: (Department & { _rawId: number }) | null; rows: any[]; total: number }>({
  open: false, dept: null, rows: [], total: 0,
})

function initialsOfMember(name: string): string {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

async function openMembers(dept: Department & { _rawId: number }) {
  membersModal.value = { open: true, dept, rows: [], total: dept.members }
  try {
    const res = await api<LaravelPaginator<any>>(`/departments/${dept._rawId}/members`, { params: { per_page: 100 } })
    membersModal.value.rows = paginatorMeta(res).items
    membersModal.value.total = paginatorMeta(res).total
  } catch {
    membersModal.value.rows = []
    membersModal.value.total = dept.members
  }
}

function closeMembers() { membersModal.value.open = false }

/** Link "Kelola Anggota" → halaman Users yang sudah terfilter departemen ini. */
function manageMembersLink(dept: Department & { _rawId: number }) {
  return {
    path: '/admin/management/users',
    query: { department_id: String(dept._rawId), department_name: dept.name },
  }
}

function openDeptModal() {
  editingDeptId.value = null
  deptForm.name = ''
  deptForm.code = ''
  deptForm.leader = ''
  deptForm.plafon = ''
  showDeptModal.value = true
}
function openEditDept(d: Department & { _rawId: number; _rawLeaderId?: number | null }) {
  editingDeptId.value = d._rawId
  deptForm.name = d.name
  deptForm.code = d.code
  deptForm.leader = d._rawLeaderId ?? ''
  deptForm.plafon = d.budgetTotal
  showDeptModal.value = true
}
function closeDeptModal() { showDeptModal.value = false }
async function handleCreateDept(e: Event) {
  e.preventDefault()
  deptSaving.value = true
  try {
    // leader_id menentukan approver Level 2 (kosong = L2 auto-pass tercatat audit).
    const leaderId = deptForm.leader !== '' ? Number(deptForm.leader) : null
    if (editingDeptId.value) {
      await api(`/departments/${editingDeptId.value}`, {
        method: 'PUT',
        body: {
          name: deptForm.name || undefined,
          budget_total: deptForm.plafon !== '' ? Number(deptForm.plafon) : undefined,
          sla: deptForm.flow,
          leader_id: leaderId,
        },
      })
      triggerToast('Departemen berhasil diperbarui.')
    } else {
      await api('/departments', {
        method: 'POST',
        body: { code: deptForm.code, name: deptForm.name, budget_total: Number(deptForm.plafon || 0), sla: deptForm.flow, leader_id: leaderId },
      })
      triggerToast('Departemen baru berhasil disimpan ke dalam direktori master data.')
    }
    closeDeptModal()
    await refreshNuxtData('departments')
  } finally {
    deptSaving.value = false
  }
}

const deleteTarget = ref<(Department & { _rawId: number }) | null>(null)
const deleteSaving = ref(false)
function openDeleteDept(d: Department & { _rawId: number }) { deleteTarget.value = d }
function closeDeleteDept() { deleteTarget.value = null }
async function submitDeleteDept() {
  if (!deleteTarget.value) return
  deleteSaving.value = true
  try {
    await api(`/departments/${deleteTarget.value._rawId}`, { method: 'DELETE' })
    triggerToast(`Departemen ${deleteTarget.value.name} dihapus.`)
    closeDeleteDept()
    await refreshNuxtData(['departments', 'dept-leader-options'])
  } catch (e: any) {
    triggerToast(e?.data?.message || (e?.status === 403 ? 'Anda tidak berwenang menghapus departemen.' : 'Gagal menghapus departemen.'))
  } finally {
    deleteSaving.value = false
  }
}

async function exportDepartments() {
  const { downloadCsv } = await import('~/composables/useMappers')
  await downloadCsv('/exports/departments', 'departments.csv')
  triggerToast('File departments.csv berhasil diunduh.')
}

async function exportAuditCsv() {
  const { downloadCsv } = await import('~/composables/useMappers')
  await downloadCsv('/exports/audit-logs', 'audit-logs.csv')
  triggerToast('File audit-logs.csv berhasil diunduh.')
}

const customRoleForm = reactive({ name: '', template: "Duplikat dari 'Line Manager'" })
async function submitCustomRole() {
  await api('/roles', { method: 'POST', body: { name: customRoleForm.name, description: `Basis: ${customRoleForm.template}` } })
  showCustomRoleModal.value = false
  triggerToast('Custom role berhasil dibuat.')
  await refreshNuxtData('roles')
}
</script>

<template>
  <div class="flex flex-col w-full gap-6 pb-8 font-sans">
    <!-- Breadcrumb & Header -->
    <div class="flex flex-col gap-4">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="space-y-1">

        </div>
        <div class="flex items-center gap-2 bg-white p-1.5 rounded-full shadow-sm shrink-0 self-start md:self-auto mt-4">
          <span class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#EFF4FF] text-sm"><span class="w-2 h-2 rounded-full bg-primary animate-pulse" aria-hidden="true" /> {{ departments.length }} Cost Centers</span>
          <span class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary-container text-[#2e6f3c] text-sm font-medium"><span class="material-symbols-outlined text-[16px]" aria-hidden="true">verified_user</span> {{ roles.length }} Peran Terkelola</span>
        </div>
      </div>

      <!-- Tab Switcher -->
      <div class="flex items-center gap-2 p-1.5 bg-[#EFF4FF] rounded-full w-full md:w-fit shadow-inner overflow-x-auto">
        <button
          :class="activeTab==='departments' ? 'bg-white text-secondary shadow-sm' : 'text-[#3e4a3c] hover:text-on-surface'"
          class="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all"
          aria-label="Tab Struktur Departemen"
          @click="activeTab='departments'"
        >
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">account_tree</span>
          <span>Struktur Departemen &amp; Cost Center</span>
          <span :class="activeTab==='departments' ? 'bg-secondary-container text-[#2e6f3c]' : 'bg-[#E6EEFF] text-[#54615b]'" class="text-xs px-1.5 py-0.5 rounded-full">{{ departments.length }} Divisi</span>
        </button>
        <button
          :class="activeTab==='roles' ? 'bg-white text-secondary shadow-sm' : 'text-[#3e4a3c] hover:text-on-surface'"
          class="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all"
          aria-label="Tab Definisi Hak Akses"
          @click="activeTab='roles'"
        >
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">admin_panel_settings</span>
          <span>Definisi Hak Akses &amp; Matriks Role</span>
          <span :class="activeTab==='roles' ? 'bg-secondary-container text-[#2e6f3c]' : 'bg-[#E6EEFF] text-[#54615b]'" class="text-xs px-1.5 py-0.5 rounded-full">{{ roles.length }} Role Utama</span>
        </button>
      </div>
    </div>

    <!-- Filter, Search & Global Action Bar -->
    <div class="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm">
      <div class="flex flex-col sm:flex-row items-center gap-3 flex-1">
        <div class="relative w-full sm:max-w-md">
          <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#54615b] text-[20px]" aria-hidden="true">search</span>
          <input
            v-model="searchQuery"
            class="w-full pl-12 pr-4 py-2.5 rounded-full bg-[#EFF4FF] text-on-surface placeholder-[#54615b] text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary/20 transition-all"
            placeholder="Cari nama departemen, kode cost center, atau kepala divisi..."
            type="text"
            aria-label="Cari departemen"
          />
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0 flex-wrap">
        <button aria-label="Export struktur organisasi" class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#EFF4FF] hover:bg-[#E6EEFF] text-on-surface text-sm font-medium transition-colors" @click="exportDepartments">
          <span class="material-symbols-outlined text-[18px] text-[#54615b]" aria-hidden="true">ios_share</span>
          <span>Export Struktur Organisasi</span>
        </button>
        <button aria-label="Tambah departemen baru" class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary-container hover:bg-secondary text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all" @click="openDeptModal">
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">add_circle</span>
          <span>+ Tambah Departemen Baru</span>
        </button>
      </div>
    </div>

    <!-- KPI Overview Strip -->
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <div class="bg-white p-6 rounded-xl shadow-sm flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-xs uppercase tracking-wider text-[#54615b]">Total Alokasi Plafon Q2</span>
            <div class="text-2xl font-bold text-on-surface">{{ formatRp(deptKpi.totalPlafon) }}</div>
          </div>
          <div class="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-secondary">
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">account_balance_wallet</span>
          </div>
        </div>
        <div class="mt-4 pt-2 flex items-center gap-1.5 text-secondary text-sm font-medium">
          <span class="material-symbols-outlined text-[16px]" aria-hidden="true">trending_up</span>
          <span>{{ deptKpi.utilization }}% Terutilisasi</span>
          <span class="text-[#54615b] text-xs font-normal"> across {{ deptKpi.unitCount }} units</span>
        </div>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-xs uppercase tracking-wider text-[#54615b]">Anggota Aktif Perjalanan</span>
            <div class="text-2xl font-bold text-on-surface">{{ deptKpi.totalMembers }} <span class="text-sm text-[#54615b] font-normal">Personel</span></div>
          </div>
          <div class="w-10 h-10 rounded-full bg-[#EFF4FF] flex items-center justify-center text-primary">
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">badge</span>
          </div>
        </div>
        <div class="mt-4 pt-2 flex items-center gap-1.5 text-[#54615b] text-xs">
          <span class="w-2 h-2 rounded-full bg-primary" aria-hidden="true" />
          <span>100% Terpetakan ke Cost-Center</span>
        </div>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-xs uppercase tracking-wider text-[#54615b]">Tanpa Kepala Departemen</span>
            <div class="text-2xl font-bold text-on-surface">{{ deptKpi.noLeader }} <span class="text-sm text-[#54615b] font-normal">Departemen</span></div>
          </div>
          <div class="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center text-secondary">
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">person_off</span>
          </div>
        </div>
        <div class="mt-4 pt-2 flex items-center gap-1.5 text-[#54615b] text-xs">
          <span class="material-symbols-outlined text-[16px]" aria-hidden="true">info</span>
          <span>Level 2 auto-pass untuk TR departemen tersebut</span>
        </div>
      </div>
      <div class="bg-white p-6 rounded-xl shadow-sm flex flex-col justify-between">
        <div class="flex items-start justify-between">
          <div class="space-y-1">
            <span class="text-xs uppercase tracking-wider text-[#54615b]">Cakupan Matriks Role</span>
            <div class="text-2xl font-bold text-on-surface">{{ roles.length }} <span class="text-sm text-[#54615b] font-normal">Role</span></div>
          </div>
          <div class="w-10 h-10 rounded-full bg-[#E6EEFF] flex items-center justify-center text-primary">
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">security</span>
          </div>
        </div>
        <div class="mt-4 pt-2 flex items-center gap-1.5 text-[#54615b] text-xs">
          <span class="material-symbols-outlined text-[16px]" aria-hidden="true">info</span>
          <span>5 role kanonik yang ditegakkan backend</span>
        </div>
      </div>
    </div>

    <!-- DEPARTMENT STRUCTURAL CARDS GRID -->
    <div v-show="activeTab==='departments'" class="space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 class="text-lg font-bold text-on-surface">Direktori Cost-Center &amp; Departemen</h2>
        </div>
        <div class="flex items-center gap-1 text-[#54615b] text-xs font-medium">
          <span class="px-3 py-1">{{ filteredDepartments.length }} departemen</span>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div
          v-for="d in filteredDepartments"
          :key="d.code"
          class="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3 min-w-0">
              <div class="w-12 h-12 rounded-xl bg-secondary-container text-secondary flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[26px]" aria-hidden="true">{{ metaFor(d).icon }}</span>
              </div>
              <div class="space-y-1 min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <h3 class="text-base font-bold text-on-surface">{{ d.name }}</h3>
                  <span class="px-2.5 py-0.5 rounded-full bg-secondary-container text-[#2e6f3c] text-xs font-semibold">{{ d.code }}</span>
                </div>
              </div>
            </div>
            <button aria-label="Ubah departemen" class="px-3 py-1.5 rounded-full bg-[#EFF4FF] hover:bg-[#E6EEFF] text-on-surface text-xs font-medium transition-colors shrink-0" @click="openEditDept(d)">
              Ubah
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#EFF4FF] p-3 rounded-xl">
            <div class="flex items-center gap-2">
              <img :src="d.leader.avatar" :alt="`Foto ${d.leader.name}`" class="w-10 h-10 rounded-full object-cover shrink-0" />
              <div class="flex flex-col min-w-0">
                <span class="text-[11px] uppercase tracking-wider text-[#54615b]">Kepala Departemen</span>
                <span class="text-sm font-semibold text-on-surface truncate">{{ d.leader.name }}</span>
                <span class="text-xs text-secondary truncate">{{ d.leader.role }}</span>
              </div>
            </div>
            <div class="flex items-center justify-between sm:justify-end gap-3">
              <div class="flex flex-col sm:items-end">
                <span class="text-[11px] uppercase tracking-wider text-[#54615b]">Total Personel</span>
                <span class="text-base font-bold text-on-surface">{{ d.members }} <span class="text-xs text-[#54615b] font-normal">Karyawan</span></span>
                <span class="text-xs text-[#54615b]">{{ d.sla }}</span>
              </div>
              <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center text-primary shrink-0">
                <span class="material-symbols-outlined text-[20px]" aria-hidden="true">groups</span>
              </div>
            </div>
          </div>

          <!-- Daftar anggota: klik untuk melihat semua. Card hanya menampilkan
               potongan 4 orang pertama (backend member_preview). -->
          <button
            type="button"
            class="w-full text-left rounded-xl bg-surface-container-low/60 hover:bg-surface-container transition-colors p-3 space-y-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
            :aria-label="`Lihat anggota departemen ${d.name}`"
            @click="openMembers(d as Department & { _rawId: number })"
          >
            <div v-if="d.memberPreview.length" class="flex items-center gap-3">
              <div class="flex -space-x-2 shrink-0">
                <span
                  v-for="m in d.memberPreview"
                  :key="m.id"
                  class="w-7 h-7 rounded-full bg-white ring-2 ring-white flex items-center justify-center overflow-hidden text-[10px] font-bold text-[#2e6f3c]"
                  :title="`${m.name} — ${m.role} (${m.grade})`"
                >
                  <img v-if="m.avatar" :src="m.avatar" :alt="`Foto ${m.name}`" class="w-full h-full object-cover" />
                  <template v-else>{{ initialsOfMember(m.name) }}</template>
                </span>
                <span v-if="d.members > d.memberPreview.length" class="w-7 h-7 rounded-full bg-surface-container ring-2 ring-white flex items-center justify-center text-[10px] font-bold text-[#54615b]" :title="`+${d.members - d.memberPreview.length} lainnya`">
                  +{{ d.members - d.memberPreview.length }}
                </span>
              </div>
              <div class="min-w-0 text-left">
                <p class="text-xs font-semibold text-on-surface truncate">{{ d.memberPreview.map(m => m.name).join(', ') }}<template v-if="d.members > d.memberPreview.length"> …</template></p>
                <p class="text-[11px] text-[#54615b]">Klik untuk melihat seluruh {{ d.members }} anggota</p>
              </div>
            </div>
            <p v-else class="text-xs text-[#54615b]">Belum ada anggota tercatat di departemen ini.</p>
          </button>

          <div class="space-y-1">
            <div class="flex items-center justify-between text-xs font-medium">
              <div class="flex items-center gap-1.5">
                <span class="text-[#54615b] font-normal">Plafon Dinas Q2:</span>
                <span class="text-on-surface font-semibold">{{ metaFor(d).plafonLabel }}</span>
              </div>
              <span :class="metaFor(d).isWarning ? 'text-error' : 'text-secondary'" class="font-bold">{{ metaFor(d).terpakaiLabel }}</span>
            </div>
            <div class="w-full bg-[#EFF4FF] h-2.5 rounded-full overflow-hidden">
              <div class="bg-primary h-full rounded-full transition-all duration-500" :style="`width: ${percent(d)}%`" />
            </div>
            <div class="flex items-center justify-between text-xs text-[#54615b]">
              <span>{{ metaFor(d).sisaLabel }}</span>
              <span>{{ metaFor(d).chain }}</span>
            </div>
          </div>

          <div class="flex items-center justify-between pt-1 flex-wrap gap-2">
            <span class="text-xs text-[#54615b]">{{ metaFor(d).updated }}</span>
            <div class="flex items-center gap-1.5 flex-wrap">
              <button class="px-3 py-1.5 rounded-full bg-[#EFF4FF] hover:bg-[#E6EEFF] text-on-surface text-xs font-medium transition-colors flex items-center gap-1" aria-label="Atur plafon" @click="openEditDept(d)">
                <span class="material-symbols-outlined text-[16px] text-[#54615b]" aria-hidden="true">tune</span> Atur Plafon
              </button>
              <NuxtLink :to="manageMembersLink(d as Department & { _rawId: number })" class="px-3 py-1.5 rounded-full bg-secondary-container hover:opacity-90 text-[#2e6f3c] text-xs font-medium transition-colors flex items-center gap-1" aria-label="Kelola anggota di halaman pengguna">
                <span class="material-symbols-outlined text-[16px]" aria-hidden="true">group_add</span> Kelola Anggota
              </NuxtLink>
              <button aria-label="Edit departemen" class="w-8 h-8 rounded-full bg-[#EFF4FF] hover:bg-[#E6EEFF] flex items-center justify-center text-primary transition-colors" @click="openEditDept(d)">
                <span class="material-symbols-outlined text-[16px]" aria-hidden="true">edit</span>
              </button>
              <button :aria-label="`Hapus departemen ${d.name}`" class="w-8 h-8 rounded-full bg-[#EFF4FF] hover:bg-[#E6EEFF] flex items-center justify-center text-error transition-colors" @click="openDeleteDept(d)">
                <span class="material-symbols-outlined text-[16px]" aria-hidden="true">delete</span>
              </button>
            </div>
          </div>
        </div>
        <div v-if="filteredDepartments.length===0" class="col-span-full py-10 text-center text-sm text-[#54615b] bg-white rounded-xl">Tidak ada departemen yang cocok.</div>
      </div>
    </div>

    <!-- ROLE MATRIX & ACCESS CONTROL SECTION -->
    <div v-show="activeTab==='roles' || activeTab==='departments'" class="bg-white rounded-xl p-6 shadow-sm space-y-6">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-secondary text-[22px]" aria-hidden="true">policy</span>
            <h2 class="text-lg font-bold text-on-surface">Matriks Hak Akses &amp; Kewenangan Approval</h2>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 flex-wrap">
          <button aria-label="Riwayat perubahan matrix" title="Unduh CSV audit log" class="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#EFF4FF] hover:bg-[#E6EEFF] text-on-surface text-xs font-medium transition-colors" @click="exportAuditCsv">
            <span class="material-symbols-outlined text-[16px]" aria-hidden="true">history</span>
            <span>Riwayat Perubahan Matrix</span>
          </button>
          <button aria-label="Buat custom role baru" class="flex items-center gap-1.5 px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold shadow-sm hover:bg-secondary transition-all" @click="showCustomRoleModal=true">
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">add_moderator</span>
            <span>+ Buat Custom Role Baru</span>
          </button>
        </div>
      </div>

      <div class="overflow-x-auto rounded-xl">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-[#EFF4FF]">
              <th class="py-3 px-6 text-xs uppercase tracking-wider text-[#54615b] font-semibold rounded-l-xl">Peran / Modul Sistem</th>
              <th class="py-3 px-3 text-xs uppercase tracking-wider text-[#54615b] font-semibold text-center">Travel Request (Pengajuan)</th>
              <th class="py-3 px-3 text-xs uppercase tracking-wider text-[#54615b] font-semibold text-center">Kas Bon Advance (Uang Muka)</th>
              <th class="py-3 px-3 text-xs uppercase tracking-wider text-[#54615b] font-semibold text-center">Reimbursement &amp; Settlement</th>
              <th class="py-3 px-3 text-xs uppercase tracking-wider text-[#54615b] font-semibold text-center">Kebijakan Policy &amp; SLA</th>
              <th class="py-3 px-3 text-xs uppercase tracking-wider text-[#54615b] font-semibold text-center">Audit Laporan Finansial</th>
              <th class="py-3 px-6 text-xs uppercase tracking-wider text-[#54615b] font-semibold text-right rounded-r-xl">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#EFF4FF] text-sm">
            <tr class="hover:bg-[#EFF4FF]/50 transition-colors">
              <td class="py-3 px-6">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-full bg-secondary text-white flex items-center justify-center text-xs font-bold">SA</div>
                  <div><div class="text-sm font-semibold text-on-surface">Super Admin</div><div class="text-xs text-[#54615b]">Akses Penuh Root &amp; Konfigurasi</div></div>
                </div>
              </td>
              <td class="py-3 px-3 text-center"><span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary-container text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">verified</span></span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary-container text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">verified</span></span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary-container text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">verified</span></span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary-container text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">verified</span></span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary-container text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">verified</span></span></td>
              <td class="py-3 px-6 text-right"><span class="text-xs text-[#54615b] bg-[#EFF4FF] px-2 py-1 rounded-full">Sistem Default</span></td>
            </tr>
            <tr class="hover:bg-[#EFF4FF]/50 transition-colors">
              <td class="py-3 px-6">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">FA</div>
                  <div><div class="text-sm font-semibold text-on-surface">Finance Approver</div><div class="text-xs text-[#54615b]">Treasury, Disbursment &amp; Verifikasi Pajak</div></div>
                </div>
              </td>
              <td class="py-3 px-3 text-center"><span class="inline-flex px-2 py-1 rounded-full bg-[#EFF4FF] text-secondary text-xs">Final Review</span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary-container text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">check_circle</span></span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary-container text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">check_circle</span></span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex px-2 py-1 rounded-full bg-[#EFF4FF] text-[#54615b] text-xs">View Only</span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary-container text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">check_circle</span></span></td>
              <td class="py-3 px-6 text-right"><NuxtLink to="/admin/management/users" aria-label="Kelola hak Finance" class="text-primary hover:text-secondary text-sm font-medium">Kelola Hak</NuxtLink></td>
            </tr>
            <tr class="hover:bg-[#EFF4FF]/50 transition-colors">
              <td class="py-3 px-6">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-full bg-[#E6EEFF] text-primary flex items-center justify-center text-xs font-bold">DH</div>
                  <div><div class="text-sm font-semibold text-on-surface">Division Head (Kadiv)</div><div class="text-xs text-[#54615b]">Otoritas Kuasa Pengguna Anggaran Unit</div></div>
                </div>
              </td>
              <td class="py-3 px-3 text-center"><span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary-container text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">check_circle</span></span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary-container text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">check_circle</span></span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary-container text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">check_circle</span></span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex px-2 py-1 rounded-full bg-[#EFF4FF] text-[#54615b] text-xs">View Only</span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex px-2 py-1 rounded-full bg-secondary-container text-secondary text-xs">Divisi Sendiri</span></td>
              <td class="py-3 px-6 text-right"><NuxtLink to="/admin/management/users" aria-label="Kelola hak Kadiv" class="text-primary hover:text-secondary text-sm font-medium">Kelola Hak</NuxtLink></td>
            </tr>
            <tr class="hover:bg-[#EFF4FF]/50 transition-colors">
              <td class="py-3 px-6">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-full bg-[#EFF4FF] text-[#3e4a3c] flex items-center justify-center text-xs font-bold">LM</div>
                  <div><div class="text-sm font-semibold text-on-surface">Line Manager</div><div class="text-xs text-[#54615b]">Approval Tingkat 1 (Kelayakan Tugas Kerja)</div></div>
                </div>
              </td>
              <td class="py-3 px-3 text-center"><span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary-container text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">check_circle</span></span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex px-2 py-1 rounded-full bg-[#EFF4FF] text-secondary text-xs">Hingga Rp 10 Juta</span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary-container text-secondary"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">check_circle</span></span></td>
              <td class="py-3 px-3 text-center"><span class="material-symbols-outlined text-[#6d7b6a]/40 text-[18px]" aria-hidden="true">block</span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex px-2 py-1 rounded-full bg-[#EFF4FF] text-[#54615b] text-xs">Tim Direct Report</span></td>
              <td class="py-3 px-6 text-right"><NuxtLink to="/admin/management/users" aria-label="Kelola hak Line Manager" class="text-primary hover:text-secondary text-sm font-medium">Kelola Hak</NuxtLink></td>
            </tr>
            <tr class="hover:bg-[#EFF4FF]/50 transition-colors">
              <td class="py-3 px-6">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-full bg-[#EFF4FF] text-[#54615b] flex items-center justify-center text-xs font-bold">EP</div>
                  <div><div class="text-sm font-semibold text-on-surface">Employee / Pemohon</div><div class="text-xs text-[#54615b]">Akses Pembuatan Pengajuan &amp; Laporan Dinas</div></div>
                </div>
              </td>
              <td class="py-3 px-3 text-center"><span class="inline-flex px-2 py-1 rounded-full bg-secondary-container text-secondary text-xs">Create &amp; View Pribadi</span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex px-2 py-1 rounded-full bg-secondary-container text-secondary text-xs">Create &amp; View Pribadi</span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex px-2 py-1 rounded-full bg-secondary-container text-secondary text-xs">Create Klaim</span></td>
              <td class="py-3 px-3 text-center"><span class="inline-flex px-2 py-1 rounded-full bg-[#EFF4FF] text-[#54615b] text-xs">Plafon &amp; Standar</span></td>
              <td class="py-3 px-3 text-center"><span class="material-symbols-outlined text-[#6d7b6a]/40 text-[18px]" aria-hidden="true">block</span></td>
              <td class="py-3 px-6 text-right"><span class="text-xs text-[#54615b] bg-[#EFF4FF] px-2 py-1 rounded-full">Standar Basic</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="p-4 rounded-xl bg-secondary-container/40 flex items-start gap-3">
        <div class="w-8 h-8 rounded-full bg-white text-secondary flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-[18px]" aria-hidden="true">info</span>
        </div>
        <div class="space-y-0.5">
          <h4 class="text-sm font-semibold text-on-surface">Pendelegasian Sementara (Delegation of Authority)</h4>
          <p class="text-xs text-[#54615b]">Jika pejabat approver (Kadiv / Director) cuti dinas atau berhalangan, wewenang dialihkan otomatis ke Plt (Pelaksana Tugas) yang ditunjuk pada sub-modul Approval Hierarchy &amp; Delegation tanpa mengubah matriks role global ini.</p>
        </div>
      </div>
    </div>

    <!-- Modal Tambah Departemen -->
    <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-200" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="showDeptModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#27313f]/40 backdrop-blur-sm" @click.self="closeDeptModal">
        <div class="bg-white rounded-2xl w-full max-w-xl p-6 shadow-xl space-y-6 max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-secondary-container text-secondary flex items-center justify-center"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">domain_add</span></div>
              <div><h3 class="text-base font-bold text-on-surface">Tambah Departemen &amp; Cost-Center Baru</h3><p class="text-xs text-[#54615b]">Daftarkan unit bisnis baru untuk alokasi budget dinas.</p></div>
            </div>
            <button aria-label="Tutup modal" class="w-8 h-8 rounded-full bg-[#EFF4FF] hover:bg-[#E6EEFF] flex items-center justify-center text-[#54615b]" @click="closeDeptModal"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span></button>
          </div>
          <form class="space-y-4" @submit="handleCreateDept">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1"><label class="text-xs font-semibold uppercase text-on-surface">Nama Departemen</label><input v-model="deptForm.name" class="w-full px-4 py-2.5 rounded-xl bg-[#EFF4FF] text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary/20" placeholder="Contoh: Digital Marketing" required type="text" /></div>
              <div class="space-y-1"><label class="text-xs font-semibold uppercase text-on-surface">Kode Cost Center</label><input v-model="deptForm.code" :disabled="!!editingDeptId" class="w-full px-4 py-2.5 rounded-xl bg-[#EFF4FF] text-sm focus:outline-none uppercase disabled:opacity-60" placeholder="Contoh: CC-MKT-202" required type="text" /></div>
            </div>
            <div class="space-y-1"><label class="text-xs font-semibold uppercase text-on-surface">Plafon Anggaran Q2 (IDR)</label><input v-model="deptForm.plafon" class="w-full px-4 py-2.5 rounded-xl bg-[#EFF4FF] text-sm focus:outline-none" placeholder="Contoh: 250000000" required type="number" min="0" /></div>
            <div class="space-y-1"><label class="text-xs font-semibold uppercase text-on-surface">Kepala Departemen (Approver Level 2)</label>
              <select v-model="deptForm.leader" class="w-full px-4 py-2.5 rounded-xl bg-[#EFF4FF] text-sm focus:outline-none cursor-pointer" aria-label="Kepala departemen">
                <option value="">— Kosong (Level 2 auto-pass) —</option>
                <option v-for="u in leaderOptions" :key="u.id" :value="u.id">{{ u.name }} ({{ u.role }})</option>
              </select>
              <p class="text-xs text-[#54615b]">Kosong = Level 2 dilewati otomatis dan tercatat di audit.</p>
            </div>
            <div class="space-y-1"><label class="text-xs font-semibold uppercase text-on-surface">Alur Approval Standar</label><div class="grid grid-cols-3 gap-2 pt-1"><label v-for="f in ['Tier 1 Standard', 'Tier 2 Fast-Track', 'BOD Direct']" :key="f" class="flex items-center gap-2 p-2 rounded-xl bg-[#EFF4FF] cursor-pointer hover:bg-[#E6EEFF] text-xs"><input v-model="deptForm.flow" class="accent-primary" name="flow" type="radio" :value="f" /><span>{{ f }}</span></label></div></div>
            <div class="pt-4 flex items-center justify-end gap-2"><button class="px-6 py-2.5 rounded-full bg-[#EFF4FF] hover:bg-[#E6EEFF] text-on-surface text-sm" type="button" @click="closeDeptModal">Batal</button><button class="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-semibold shadow-sm hover:bg-secondary transition-colors disabled:opacity-60" type="submit" :disabled="deptSaving">{{ deptSaving ? 'Menyimpan...' : 'Simpan Departemen' }}</button></div>
          </form>
        </div>
      </div>
    </Transition>

    <!-- Modal Custom Role -->
    <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-200" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="showCustomRoleModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#27313f]/40 backdrop-blur-sm" @click.self="showCustomRoleModal=false">
        <div class="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl space-y-6">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-secondary-container text-secondary flex items-center justify-center"><span class="material-symbols-outlined text-[20px]" aria-hidden="true">shield_person</span></div>
              <div><h3 class="text-base font-bold text-on-surface">Buat Custom Role Baru</h3><p class="text-xs text-[#54615b]">Sesuaikan hak akses granular untuk divisi khusus.</p></div>
            </div>
            <button aria-label="Tutup modal" class="w-8 h-8 rounded-full bg-[#EFF4FF] flex items-center justify-center text-[#54615b]" @click="showCustomRoleModal=false"><span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span></button>
          </div>
          <div class="space-y-4">
            <div class="space-y-1"><label class="text-xs font-semibold uppercase text-on-surface">Nama Peran (Role Name)</label><input v-model="customRoleForm.name" class="w-full px-4 py-2.5 rounded-xl bg-[#EFF4FF] text-sm focus:outline-none" placeholder="Contoh: Project Auditor Lapangan" type="text" /></div>
            <div class="space-y-1"><label class="text-xs font-semibold uppercase text-on-surface">Role Template Basis</label><select v-model="customRoleForm.template" class="w-full px-4 py-2.5 rounded-xl bg-[#EFF4FF] text-sm focus:outline-none"><option>Duplikat dari 'Line Manager'</option><option>Duplikat dari 'Division Head'</option><option>Mulai Kosong (Custom Rule)</option></select></div>
            <div class="p-3 rounded-xl bg-[#EFF4FF] space-y-2">
              <span class="text-xs uppercase tracking-wider text-[#54615b]">Hak Modul Prioritas:</span>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <label class="flex items-center gap-2 cursor-pointer"><input checked class="accent-primary" type="checkbox" /><span>Verifikasi Tiket Pesawat</span></label>
                <label class="flex items-center gap-2 cursor-pointer"><input checked class="accent-primary" type="checkbox" /><span>Override Emergency Booking</span></label>
                <label class="flex items-center gap-2 cursor-pointer"><input class="accent-primary" type="checkbox" /><span>Disburse Kas Bon Finansial</span></label>
                <label class="flex items-center gap-2 cursor-pointer"><input class="accent-primary" type="checkbox" /><span>Export Audit Trail Pajak</span></label>
              </div>
            </div>
          </div>
          <p class="text-xs text-[#54615b]">Catatan: role tersimpan di database, tetapi matriks di tab ini dan pilihan role di form pengguna masih memakai 5 role kanonik — role baru belum mengatur hak akses apa pun.</p>
          <div class="pt-4 flex items-center justify-end gap-2"><button class="px-6 py-2.5 rounded-full bg-[#EFF4FF] hover:bg-[#E6EEFF] text-on-surface text-sm" @click="showCustomRoleModal=false">Batal</button><button class="px-6 py-2.5 rounded-full bg-primary text-white text-sm font-semibold shadow-sm" @click="submitCustomRole">Buat Role</button></div>
        </div>
      </div>
    </Transition>

    <!-- Modal anggota departemen -->
    <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-150" leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="membersModal.open" class="fixed inset-0 bg-[#27313F]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" @click.self="closeMembers">
        <div class="bg-white w-full max-w-2xl rounded-2xl shadow-xl p-6 flex flex-col max-h-[85vh]">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-base font-bold">Anggota {{ membersModal.dept?.name }}</h2>
              <p class="text-xs text-muted mt-0.5">{{ membersModal.total }} karyawan terdaftar · {{ membersModal.dept?.sla }}</p>
            </div>
            <button type="button" aria-label="Tutup" class="w-8 h-8 rounded-full bg-surface-container-low text-muted flex items-center justify-center hover:bg-surface-container" @click="closeMembers">
              <span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
            </button>
          </div>

          <div class="mt-4 flex-1 overflow-y-auto space-y-2">
            <p v-if="!membersModal.rows.length" class="text-sm text-muted py-6 text-center">Belum ada anggota di departemen ini.</p>
            <div v-for="m in membersModal.rows" :key="m.id" class="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low/60">
              <span class="w-9 h-9 rounded-full bg-white ring-1 ring-surface-container flex items-center justify-center overflow-hidden text-xs font-bold text-[#2e6f3c] shrink-0">
                <img v-if="m.avatar" :src="m.avatar" :alt="`Foto ${m.name}`" class="w-full h-full object-cover" />
                <template v-else>{{ initialsOfMember(m.name) }}</template>
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-on-surface truncate">{{ m.name }}</p>
                <p class="text-xs text-muted truncate">{{ m.role }} · Grade {{ m.grade }}<template v-if="m.manager"> · Atasan: {{ m.manager }}</template></p>
              </div>
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" :class="m.status === 'Aktif' ? 'bg-secondary-container text-[#2e6f3c]' : 'bg-error-container text-[#93000a]'">{{ m.status }}</span>
            </div>
          </div>

          <div class="pt-4 flex items-center justify-end gap-2">
            <button type="button" class="px-5 py-2 rounded-full bg-surface-container-low text-on-surface text-sm" @click="closeMembers">Tutup</button>
            <NuxtLink
              v-if="membersModal.dept"
              :to="manageMembersLink(membersModal.dept as Department & { _rawId: number })"
              class="px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:opacity-95 transition-opacity"
            >Kelola di Halaman Pengguna</NuxtLink>
          </div>
        </div>
      </div>
    </Transition>

    <AppConfirmModal
      :open="deleteTarget !== null"
      title="Hapus departemen?"
      :message="`Departemen ${deleteTarget?.name ?? ''} akan dihapus dari direktori master data. Departemen yang masih punya anggota akan ditolak sistem.`"
      variant="danger"
      confirm-label="Ya, Hapus"
      icon="delete"
      :loading="deleteSaving"
      @close="closeDeleteDept"
      @confirm="submitDeleteDept"
    />

    <Transition enter-active-class="transition duration-300" enter-from-class="translate-y-10 opacity-0" enter-to-class="translate-y-0 opacity-100" leave-active-class="transition duration-200" leave-from-class="translate-y-0 opacity-100" leave-to-class="translate-y-10 opacity-0">
      <div v-if="showToast" class="fixed bottom-6 right-6 z-50 bg-[#27313f] text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2" role="status" aria-live="polite">
        <span class="material-symbols-outlined text-[#5ce06c] text-[20px]" aria-hidden="true">check_circle</span>
        <span class="text-sm font-medium">{{ toastMsg }}</span>
      </div>
    </Transition>
  </div>
</template>
