<script setup lang="ts">
definePageMeta({ layout: 'admin' })

import type { Project } from '~/types'
import { formatRp, formatRpShort } from '~/utils/format'
import { formatDateId, mapEmployee } from '~/composables/useMappers'
import { paginatorMeta, useApi, type LaravelPaginator } from '~/composables/useApi'

const api = useApi()
const toast = useToast()

type DisplayProject = Project & {
  deptLabel: string
  location: string
  sisaLabel: string
  sisaClass: string
  budgetLabel: string
  totalLabel: string
  percent: number
  barClass: string
  percentLabel: string
  percentLabelClass: string
  statusClass: string
  statusDotClass?: string
  statusIcon?: string
}

const searchQuery = ref('')
const debouncedProjectSearch = useDebounce(searchQuery, 300)
const statusFilter = ref('all')
const departemen = ref('')
const currentPage = ref(1)

const statusParam = computed(() => {
  const map: Record<string, string> = { active: 'Active', 'on-hold': 'On Hold', completed: 'Completed', cancelled: 'Cancelled' }
  return map[statusFilter.value] ?? undefined
})

watch([debouncedProjectSearch, statusParam, departemen], () => { currentPage.value = 1 })

const { data: projectRes } = await useAsyncData('projects', () => api<LaravelPaginator<any>>('/projects', {
  params: {
    search: debouncedProjectSearch.value.trim() || undefined,
    status: statusParam.value,
    page: currentPage.value,
    per_page: 10,
  },
}), { watch: [debouncedProjectSearch, statusParam, currentPage] })
const { data: userOptions } = await useAsyncData('project-pm-options', () => api<LaravelPaginator<any>>('/users', { params: { per_page: 100 } }))
// Opsi filter dari API — backend tidak punya filter departemen untuk projects,
// jadi filter tetap lokal (pola yang sama dengan deptOptions uang-muka).
const { data: projDeptRes } = await useAsyncData('project-departments', () => api<LaravelPaginator<any>>('/departments', { params: { per_page: 100 } }))
const projDeptOptions = computed<string[]>(() => paginatorMeta(projDeptRes.value?.data ? projDeptRes.value : []).items.map((d: any) => String(d.name)))

function toDisplay(p: any): DisplayProject {
  const used = Number(p.budget_used ?? 0)
  const total = Number(p.budget_total ?? 0)
  const percent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0
  const daysLeft = Math.ceil((new Date(p.end_date).getTime() - Date.now()) / 86400000)
  const status = (p.status ?? 'Active') as DisplayProject['status']
  const warning = percent > 85 && status === 'Active'
  return {
    code: p.code, wbs: p.wbs, name: p.name,
    deptLabel: p.department ?? p.pm?.department?.name ?? '-',
    location: p.location ?? '-',
    period: `${formatDateId(p.start_date)} - ${formatDateId(p.end_date)}`,
    daysLeft,
    sisaLabel: status === 'Completed' ? 'Selesai 100%' : daysLeft > 0 ? `Sisa ${daysLeft} Hari` : 'Berakhir',
    sisaClass: status === 'Completed' ? 'text-primary font-medium' : daysLeft > 0 && daysLeft <= 30 ? 'text-error font-medium' : daysLeft > 0 ? 'text-secondary font-medium' : 'text-[#54615b]',
    budgetUsed: used, budgetTotal: total,
    budgetLabel: formatRp(used), totalLabel: formatRp(total),
    percent,
    barClass: warning ? 'bg-error' : percent >= 95 ? 'bg-secondary-container' : 'bg-primary-container',
    percentLabel: `Terpakai ${percent}%${warning ? ' (Warning)' : ''}`,
    percentLabelClass: warning ? 'text-error font-bold' : 'text-[#54615b]',
    trips: Number(p.trips ?? 0),
    status,
    statusClass: status === 'Active' ? 'bg-secondary-container text-[#2e6f3c]'
      : status === 'On Hold' ? 'bg-[#dee9fc] text-on-surface'
        : status === 'Completed' ? 'bg-surface-container text-secondary'
          : 'bg-error-container text-error',
    statusDotClass: status === 'Completed' ? undefined : status === 'Active' ? 'bg-primary-container animate-pulse' : 'bg-[#54615b]',
    statusIcon: status === 'Completed' ? 'check' : undefined,
    pm: mapEmployee(p.pm),
    _rawId: p.id,
  } as DisplayProject & { _rawId: number }
}

const displayProjects = computed<DisplayProject[]>(() =>
  paginatorMeta(projectRes.value?.data ? projectRes.value : []).items.map(toDisplay),
)
const projectMeta = computed(() => paginatorMeta(projectRes.value?.data ? projectRes.value : []))

const filteredProjects = computed(() => {
  let list = displayProjects.value
  if (departemen.value) list = list.filter(p => p.deptLabel.toLowerCase().includes(departemen.value.toLowerCase()))
  return list
})

const showDrawer = ref(false)
const editingProjectId = ref<number | null>(null)
const projectForm = reactive({
  code: '', wbs: '', name: '', pm_id: '' as string | number, department: '',
  location: '', budget_total: '' as string | number, start_date: '', end_date: '', status: 'Active',
})
const projectSaving = ref(false)

// Departemen dinamis mengikuti PM yang dipilih. Datanya sudah ada di
// userOptions (endpoint /users memuat relasi department), tanpa request baru.
const selectedPm = computed(() =>
  ((userOptions.value?.data ?? []) as any[]).find((u: any) => String(u.id) === String(projectForm.pm_id)) ?? null,
)
const pmDepartmentName = computed(() => String(selectedPm.value?.department?.name ?? ''))
watch(() => projectForm.pm_id, () => {
  if (pmDepartmentName.value)
    projectForm.department = pmDepartmentName.value
})

function openDrawer() {
  editingProjectId.value = null
  projectForm.code = ''
  projectForm.wbs = ''
  projectForm.name = ''
  projectForm.pm_id = ''
  projectForm.department = ''
  projectForm.location = ''
  projectForm.budget_total = ''
  projectForm.start_date = ''
  projectForm.end_date = ''
  projectForm.status = 'Active'
  showDrawer.value = true
}
function openEditProject(p: DisplayProject) {
  const raw = (p as unknown as { _rawId: number })._rawId
  editingProjectId.value = raw
  const src: any = projectRes.value?.data ? (projectRes.value.data as any[]).find((x: any) => x.id === raw) : null
  projectForm.code = p.code
  projectForm.wbs = p.wbs
  projectForm.name = p.name
  projectForm.pm_id = src?.pm_id ?? ''
  projectForm.department = src?.department ?? ''
  projectForm.location = p.location === '-' ? '' : p.location
  projectForm.budget_total = src?.budget_total ?? ''
  projectForm.start_date = src?.start_date ?? ''
  projectForm.end_date = src?.end_date ?? ''
  projectForm.status = p.status
  showDrawer.value = true
}
function closeDrawer() { showDrawer.value = false }

async function syncSap() {
  try {
    const res = await api<{ message: string }>('/projects/sync-sap', { method: 'POST' })
    toast.show(res.message)
    await refreshNuxtData('projects')
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal sinkronisasi data SAP.', 'error', 'error')
  }
}

async function handleSaveProject() {
  projectSaving.value = true
  try {
    if (editingProjectId.value) {
      await api(`/projects/${editingProjectId.value}`, {
        method: 'PUT',
        body: {
          name: projectForm.name || undefined, pm_id: projectForm.pm_id ? Number(projectForm.pm_id) : undefined,
          department: projectForm.department || undefined, location: projectForm.location || undefined,
          budget_total: projectForm.budget_total !== '' ? Number(projectForm.budget_total) : undefined,
          start_date: projectForm.start_date || undefined, end_date: projectForm.end_date || undefined,
          status: projectForm.status,
        },
      })
      toast.show('Proyek berhasil diperbarui.')
    } else {
      await api('/projects', {
        method: 'POST',
        body: {
          code: projectForm.code, wbs: projectForm.wbs, name: projectForm.name,
          pm_id: Number(projectForm.pm_id), department: projectForm.department || undefined,
          location: projectForm.location || undefined, budget_total: Number(projectForm.budget_total),
          start_date: projectForm.start_date, end_date: projectForm.end_date,
        },
      })
      toast.show('Proyek baru berhasil disimpan.')
    }
    closeDrawer()
    await refreshNuxtData('projects')
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal menyimpan proyek.', 'error', 'error')
  } finally {
    projectSaving.value = false
  }
}

async function exportProjects() {
  const { downloadCsv } = await import('~/composables/useMappers')
  await downloadCsv('/exports/projects', 'projects.csv')
  toast.show('File projects.csv berhasil diunduh.')
}

async function deactivateProject(p: DisplayProject) {
  const raw = (p as unknown as { _rawId: number })._rawId
  try {
    await api(`/projects/${raw}`, { method: 'PUT', body: { status: 'Cancelled' } })
    toast.show(`Proyek ${p.code} dinonaktifkan.`)
    await refreshNuxtData('projects')
  } catch (e: any) {
    toast.show(e?.data?.message || 'Gagal menonaktifkan proyek.', 'error', 'error')
  }
}

const deleteTarget = ref<DisplayProject | null>(null)
const deleteSaving = ref(false)
function openDeleteProject(p: DisplayProject) { deleteTarget.value = p }
function closeDeleteProject() { deleteTarget.value = null }
async function submitDeleteProject() {
  if (!deleteTarget.value) return
  deleteSaving.value = true
  try {
    const raw = (deleteTarget.value as unknown as { _rawId: number })._rawId
    await api(`/projects/${raw}`, { method: 'DELETE' })
    toast.show(`Proyek ${deleteTarget.value.code} dihapus.`)
    closeDeleteProject()
    await refreshNuxtData('projects')
  } catch (e: any) {
    toast.show(e?.data?.message || (e?.status === 403 ? 'Anda tidak berwenang menghapus proyek.' : 'Gagal menghapus proyek.'), 'error', 'error')
  } finally {
    deleteSaving.value = false
  }
}

const statusCounts = computed(() => ({
  all: projectMeta.value.total,
  active: displayProjects.value.filter(p => p.status === 'Active').length,
  onHold: displayProjects.value.filter(p => p.status === 'On Hold').length,
  completed: displayProjects.value.filter(p => p.status === 'Completed').length,
}))

const kpi = computed(() => {
  const list = displayProjects.value
  const used = list.reduce((s, p) => s + p.budgetUsed, 0)
  const total = list.reduce((s, p) => s + p.budgetTotal, 0)
  return {
    active: list.filter(p => p.status === 'Active').length,
    utilization: total > 0 ? Math.round((used / total) * 1000) / 10 : 0,
    overBudget: list.filter(p => p.status === 'Active' && p.percent > 85).length,
    completed: list.filter(p => p.status === 'Completed').length,
    totalPlafon: total,
    totalUsed: used,
  }
})
</script>

<template>
  <div class="flex flex-col w-full gap-6 pb-8 font-sans">
    <!-- Breadcrumb & Header Zone -->
    <div class="flex flex-col gap-1 mt-4">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            aria-label="Sinkronisasi SAP"
            class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-surface-container text-secondary hover:bg-[#dee9fc] transition-all shadow-sm text-sm font-medium"
            @click="syncSap"
          >
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">sync</span>
            <span>Sinkronisasi SAP / ERP Project</span>
          </button>
          <button
            aria-label="Tambah proyek baru"
            class="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-primary-container text-[#003e0f] hover:opacity-95 shadow-md shadow-primary-container/30 transition-all active:scale-95 text-sm font-semibold"
            @click="openDrawer"
          >
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">add_circle</span>
            <span>+ Tambah Proyek Baru</span>
          </button>
        </div>
      </div>
    </div>

    <!-- KPI Metric Cards Grid (4 Units) -->
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <div class="relative overflow-hidden rounded-xl bg-white p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
        <div class="flex items-start justify-between">
          <div class="flex flex-col">
            <span class="text-xs uppercase tracking-wider font-medium text-[#54615b]">Total Proyek Aktif</span>
            <span class="text-2xl font-bold text-on-surface mt-1">{{ kpi.active }} Proyek</span>
          </div>
          <div class="w-10 h-10 rounded-full bg-surface-container-low text-primary flex items-center justify-center">
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">inventory_2</span>
          </div>
        </div>
        <div class="mt-4 flex items-center justify-between text-xs">
          <span class="text-secondary font-medium">{{ formatRpShort(kpi.totalPlafon) }} Total Plafon</span>
          <span class="px-2 py-0.5 rounded-full bg-secondary-container text-[#2e6f3c] font-semibold">{{ kpi.completed }} Selesai</span>
        </div>
      </div>

      <div class="relative overflow-hidden rounded-xl bg-white p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
        <div class="flex items-start justify-between">
          <div class="flex flex-col">
            <span class="text-xs uppercase tracking-wider font-medium text-[#54615b]">Utilisasi Anggaran</span>
            <div class="flex items-baseline gap-1 mt-1">
              <span class="text-2xl font-bold text-on-surface">{{ kpi.utilization }}%</span>
              <span class="text-xs text-secondary font-bold">Sehat</span>
            </div>
          </div>
          <div class="w-10 h-10 rounded-full bg-secondary-container text-secondary flex items-center justify-center">
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">trending_up</span>
          </div>
        </div>
        <div class="mt-4 space-y-1">
          <div class="w-full bg-[#dee9fc] rounded-full h-2 overflow-hidden">
            <div class="bg-primary-container h-full rounded-full" :style="{ width: `${Math.min(kpi.utilization, 100)}%` }" />
          </div>
          <div class="flex justify-between text-xs text-[#54615b] pt-0.5">
            <span>Realisasi: {{ formatRpShort(kpi.totalUsed) }}</span>
            <span>Sisa: {{ formatRpShort(Math.max(kpi.totalPlafon - kpi.totalUsed, 0)) }}</span>
          </div>
        </div>
      </div>

      <div class="relative overflow-hidden rounded-xl bg-white p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
        <div class="flex items-start justify-between">
          <div class="flex flex-col">
            <span class="text-xs uppercase tracking-wider font-medium text-[#54615b]">Mendekati Plafon (&gt;85%)</span>
            <span class="text-2xl font-bold text-error mt-1">{{ kpi.overBudget }} Proyek</span>
          </div>
          <div class="w-10 h-10 rounded-full bg-error-container text-[#93000a] flex items-center justify-center">
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">warning</span>
          </div>
        </div>
        <div class="mt-4 flex items-center justify-between text-xs">
          <span class="text-error font-semibold">Perlu Review Penambahan</span>
        </div>
      </div>

      <div class="relative overflow-hidden rounded-xl bg-white p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
        <div class="flex items-start justify-between">
          <div class="flex flex-col">
            <span class="text-xs uppercase tracking-wider font-medium text-[#54615b]">Close-Out Kuartal Ini</span>
            <span class="text-2xl font-bold text-on-surface mt-1">{{ kpi.completed }} Proyek</span>
          </div>
          <div class="w-10 h-10 rounded-full bg-surface-container text-[#3e4a3c] flex items-center justify-center">
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">task_alt</span>
          </div>
        </div>
        <div class="mt-4 flex items-center justify-between text-xs">
          <span class="text-[#54615b]">Rekonsiliasi Kasbon 100%</span>
          <span class="px-2 py-0.5 rounded-full bg-[#dee9fc] text-on-surface font-medium">Finalize</span>
        </div>
      </div>
    </div>

    <!-- Filter Controls & Search Ribbon -->
    <div class="bg-white p-4 rounded-xl shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
      <div class="relative w-full lg:w-96">
        <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[#54615b] text-[18px]" aria-hidden="true">search</span>
        <input
          v-model="searchQuery"
          class="w-full pl-11 pr-4 py-2.5 rounded-full bg-surface-container-low text-on-surface placeholder-[#54615b] text-sm focus:outline-none focus:bg-white transition-all"
          placeholder="Cari nama proyek, kode WBS/SO, atau PM..."
          type="text"
          aria-label="Cari proyek"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex items-center gap-1 bg-surface-container-low p-1 rounded-full text-xs font-medium overflow-x-auto">
          <button
            :class="statusFilter==='all' ? 'bg-white text-on-surface shadow-sm font-semibold' : 'text-[#54615b] hover:text-on-surface'"
            class="px-3 py-1.5 rounded-full transition-all"
            @click="statusFilter='all'"
          >Semua ({{ statusCounts.all }})</button>
          <button
            :class="statusFilter==='active' ? 'bg-white text-on-surface shadow-sm font-semibold' : 'text-[#54615b] hover:text-on-surface'"
            class="px-3 py-1.5 rounded-full transition-all flex items-center gap-1"
            @click="statusFilter='active'"
          >
            <span>Active</span><span class="w-2 h-2 rounded-full bg-primary-container" aria-hidden="true" /><span class="text-[10px]">({{ statusCounts.active }})</span>
          </button>
          <button
            :class="statusFilter==='on-hold' ? 'bg-white text-on-surface shadow-sm font-semibold' : 'text-[#54615b] hover:text-on-surface'"
            class="px-3 py-1.5 rounded-full transition-all flex items-center gap-1"
            @click="statusFilter='on-hold'"
          >
            <span>On Hold</span><span class="text-[10px]">({{ statusCounts.onHold }})</span>
          </button>
          <button
            :class="statusFilter==='completed' ? 'bg-white text-on-surface shadow-sm font-semibold' : 'text-[#54615b] hover:text-on-surface'"
            class="px-3 py-1.5 rounded-full transition-all flex items-center gap-1"
            @click="statusFilter='completed'"
          >
            <span>Completed</span><span class="text-[10px]">({{ statusCounts.completed }})</span>
          </button>
          <button
            :class="statusFilter==='cancelled' ? 'bg-white text-on-surface shadow-sm font-semibold' : 'text-[#54615b] hover:text-on-surface'"
            class="px-3 py-1.5 rounded-full transition-all flex items-center gap-1"
            @click="statusFilter='cancelled'"
          >
            <span>Cancelled</span><span class="text-[10px]">(2)</span>
          </button>
        </div>
        <div class="relative">
          <select v-model="departemen" class="appearance-none pl-4 pr-9 py-2 rounded-full bg-surface-container-low text-on-surface text-sm focus:outline-none cursor-pointer" aria-label="Filter departemen">
            <option value="">Departemen: Semua</option>
            <option v-for="d in projDeptOptions" :key="d" :value="d">{{ d }}</option>
          </select>
          <span class="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#54615b] text-[18px]" aria-hidden="true">expand_more</span>
        </div>
        <button aria-label="Export data WBS" title="Unduh CSV proyek" class="w-10 h-10 rounded-full bg-surface-container-low text-on-surface hover:bg-[#dee9fc] transition-colors flex items-center justify-center" @click="exportProjects">
          <span class="material-symbols-outlined text-[20px]" aria-hidden="true">file_download</span>
        </button>
      </div>
    </div>

    <!-- Comprehensive Projects Table Layout -->
    <div class="flex-1 w-full bg-white rounded-xl shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-surface-container-low text-[#54615b] text-xs uppercase tracking-wider">
              <th class="py-3 px-6">Kode &amp; Nama Proyek</th>
              <th class="py-3 px-4">Project Manager &amp; Tim</th>
              <th class="py-3 px-4">Periode Efektif</th>
              <th class="py-3 px-4">Plafon Anggaran Travel</th>
              <th class="py-3 px-4 text-center">Terkait</th>
              <th class="py-3 px-4">Status</th>
              <th class="py-3 px-6 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody class="text-sm divide-y divide-surface-container-low/50">
            <tr
              v-for="p in filteredProjects"
              :key="p.code"
              class="hover:bg-[#f8f9ff] transition-colors"
              :class="p.percent > 85 && p.status==='Active' ? 'bg-surface-container-low/30' : ''"
            >
              <td class="py-4 px-6">
                <div class="flex flex-col">
                  <div class="flex items-center gap-1">
                    <span class="text-xs font-bold" :class="p.status==='On Hold' || p.status==='Completed' ? 'text-[#54615b]' : 'text-primary'">{{ p.code }}</span>
                    <span class="text-[#54615b] text-xs">•</span>
                    <span class="text-xs text-[#54615b]">WBS: {{ p.wbs }}</span>
                  </div>
                  <span class="text-sm font-semibold text-on-surface mt-0.5">{{ p.name }}</span>
                  <span class="text-xs text-[#54615b]">{{ p.deptLabel }} • {{ p.location }}</span>
                </div>
              </td>
              <td class="py-4 px-4">
                <div class="flex items-center gap-2">
                  <img :src="p.pm.avatar" :alt="`Foto ${p.pm.name}`" class="w-9 h-9 rounded-full object-cover shadow-sm shrink-0" />
                  <div class="flex flex-col">
                    <span class="text-sm font-semibold text-on-surface">{{ p.pm.name }}</span>
                    <span class="text-xs text-[#54615b]">NIK: {{ p.pm.nik }} • {{ p.pm.department }}</span>
                  </div>
                </div>
              </td>
              <td class="py-4 px-4">
                <div class="flex flex-col">
                  <span class="text-sm text-on-surface">{{ p.period }}</span>
                  <span :class="p.sisaClass" class="text-xs">{{ p.sisaLabel }}</span>
                </div>
              </td>
              <td class="py-4 px-4 w-64">
                <div class="flex flex-col space-y-1">
                  <div class="flex justify-between items-baseline text-xs">
                    <span :class="p.percent>85 && p.status==='Active' ? 'text-error font-bold' : 'text-on-surface font-semibold'">{{ p.budgetLabel }}</span>
                    <span class="text-[#54615b]">/ {{ p.totalLabel }}</span>
                  </div>
                  <div class="w-full bg-[#dee9fc] rounded-full h-1.5 overflow-hidden">
                    <div :class="p.barClass" class="h-full rounded-full" :style="`width: ${p.percent}%`" />
                  </div>
                  <span :class="p.percentLabelClass" class="text-right text-xs">{{ p.percentLabel }}</span>
                </div>
              </td>
              <td class="py-4 px-4 text-center">
                <div class="inline-flex items-center justify-center px-2 py-1 rounded-full bg-surface-container-low text-on-surface text-xs">
                  <span class="material-symbols-outlined text-[16px] text-[#54615b] mr-1" aria-hidden="true">flight_takeoff</span>
                  {{ p.trips }} Perjalanan
                </div>
              </td>
              <td class="py-4 px-4">
                <span :class="p.statusClass" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold">
                  <span v-if="p.statusDotClass" :class="p.statusDotClass" class="w-2 h-2 rounded-full" aria-hidden="true" />
                  <span v-else-if="p.statusIcon" class="material-symbols-outlined text-[14px]" aria-hidden="true">{{ p.statusIcon }}</span>
                  {{ p.status }}
                </span>
              </td>
              <td class="py-4 px-6 text-right">
                <div class="flex items-center justify-end gap-1">
                  <button aria-label="Edit master proyek" class="w-8 h-8 rounded-full bg-surface-container-low hover:bg-secondary-container text-secondary flex items-center justify-center transition-colors" @click="openEditProject(p)">
                    <span class="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span>
                  </button>
                  <NuxtLink to="/admin/travel-requests" aria-label="Detail alokasi tiket" class="w-8 h-8 rounded-full bg-surface-container-low hover:bg-[#dee9fc] text-on-surface flex items-center justify-center transition-colors">
                    <span class="material-symbols-outlined text-[18px]" aria-hidden="true">pie_chart</span>
                  </NuxtLink>
                  <button aria-label="Nonaktifkan proyek" class="w-8 h-8 rounded-full bg-surface-container-low hover:bg-error-container text-on-surface hover:text-error flex items-center justify-center transition-colors" @click="deactivateProject(p)">
                    <span class="material-symbols-outlined text-[18px]" aria-hidden="true">block</span>
                  </button>
                  <button :aria-label="`Hapus proyek ${p.code}`" class="w-8 h-8 rounded-full bg-surface-container-low hover:bg-error text-on-surface hover:text-white flex items-center justify-center transition-colors" @click="openDeleteProject(p)">
                    <span class="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="filteredProjects.length===0">
              <td colspan="7" class="py-10 text-center text-sm text-[#54615b]">Tidak ada proyek yang cocok.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <!-- Table Footer & Pagination -->
      <div class="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-[#f8f9ff] gap-2 text-xs">
        <span class="text-[#54615b]">Menampilkan {{ filteredProjects.length }} dari {{ projectMeta.total }} Proyek Terdaftar</span>
        <div class="flex items-center gap-1">
          <button :disabled="currentPage <= 1" aria-label="Sebelumnya" class="w-8 h-8 rounded-full bg-white text-[#54615b] flex items-center justify-center shadow-sm disabled:opacity-40" @click="currentPage--">
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_left</span>
          </button>
          <span class="px-2 text-[#54615b]">Halaman {{ currentPage }} dari {{ projectMeta.lastPage }}</span>
          <button :disabled="currentPage >= projectMeta.lastPage" aria-label="Berikutnya" class="w-8 h-8 rounded-full bg-white text-[#54615b] flex items-center justify-center shadow-sm disabled:opacity-40" @click="currentPage++">
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Drawer - Formulir Master Proyek (Vue state slide) -->
    <Transition
      enter-active-class="transition duration-300"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="showDrawer" class="fixed inset-0 z-40 bg-[#27313f]/50 backdrop-blur-sm" @click="closeDrawer" />
    </Transition>
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition duration-300 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <aside
        v-if="showDrawer"
        class="fixed top-0 right-0 h-screen w-full sm:w-[420px] max-w-[95vw] bg-white shadow-2xl z-50 flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Formulir master proyek"
      >
        <div class="flex items-center justify-between p-6 pb-3 shrink-0">
          <div class="flex flex-col">
            <span class="text-lg font-bold tracking-tight">Formulir Master Proyek</span>
            <span class="text-xs text-[#54615b]">Tambahkan proyek baru atau edit pembebanan WBS</span>
          </div>
          <button aria-label="Tutup drawer" class="w-8 h-8 rounded-full bg-surface-container-low text-[#54615b] hover:text-on-surface flex items-center justify-center" @click="closeDrawer">
            <span class="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
          </button>
        </div>

        <div class="p-3 mx-6 rounded-lg bg-surface-container-low flex items-start gap-2 mb-4 shrink-0">
          <span class="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5" aria-hidden="true">account_tree</span>
          <p class="text-xs text-[#3e4a3c]">Plafon anggaran yang dialokasikan di sini akan menjadi batas validasi otomatis ketika karyawan mengajukan tiket dinas dan klaim reimbursement.</p>
        </div>

        <form class="space-y-4 flex flex-col px-6 pb-6 overflow-y-auto flex-1" @submit.prevent="handleSaveProject">
          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col space-y-1">
              <label class="text-sm font-semibold">Kode Proyek *</label>
              <input v-model="projectForm.code" :disabled="!!editingProjectId" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm font-mono focus:outline-none focus:bg-white disabled:opacity-60" placeholder="PRJ-2025-11" required type="text" aria-label="Kode proyek" />
            </div>
            <div class="flex flex-col space-y-1">
              <label class="text-sm font-semibold">WBS *</label>
              <input v-model="projectForm.wbs" :disabled="!!editingProjectId" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm font-mono focus:outline-none focus:bg-white disabled:opacity-60" placeholder="884.09.21" required type="text" aria-label="WBS" />
            </div>
          </div>

          <div class="flex flex-col space-y-1">
            <label class="text-sm font-semibold">Nama Proyek &amp; Deskripsi Tujuan *</label>
            <input v-model="projectForm.name" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-on-surface placeholder-[#54615b] text-sm focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary transition-all" placeholder="Contoh: Migrasi Cloud Data Core Balikpapan" required type="text" />
          </div>

          <div class="flex flex-col space-y-1">
            <label class="text-sm font-semibold">Project Manager (PM) *</label>
            <div class="relative">
              <select v-model="projectForm.pm_id" class="w-full appearance-none px-4 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm focus:outline-none focus:bg-white cursor-pointer" required aria-label="Project Manager">
                <option value="">Pilih Karyawan Penanggung Jawab...</option>
                <option v-for="u in (userOptions?.data ?? [])" :key="u.id" :value="u.id">{{ u.name }} (NIK: {{ u.nik }})</option>
              </select>
              <span class="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#54615b] text-[18px]" aria-hidden="true">unfold_more</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col space-y-1">
              <label class="text-sm font-semibold">Departemen</label>
              <input v-model="projectForm.department" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm focus:outline-none focus:bg-white disabled" placeholder="Departemen"  type="text" aria-label="Departemen" disabled/>
            </div>
            <div class="flex flex-col space-y-1">
              <label class="text-sm font-semibold">Lokasi</label>
              <input v-model="projectForm.location" class="w-full px-4 py-2.5 rounded-xl bg-surface-container-low text-on-surface text-sm focus:outline-none focus:bg-white" placeholder="Surabaya" type="text" aria-label="Lokasi" />
            </div>
          </div>

          <div class="flex flex-col space-y-1">
            <label class="text-sm font-semibold">Plafon Anggaran Perjalanan Dinas *</label>
            <div class="relative">
              <span class="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#54615b]">Rp</span>
              <input v-model="projectForm.budget_total" class="w-full pl-12 pr-4 py-2.5 rounded-xl bg-surface-container-low text-on-surface placeholder-[#54615b] text-sm font-mono focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary" placeholder="150000000" required type="number" min="0" aria-label="Plafon anggaran" />
            </div>
            <span class="text-xs text-[#54615b]">Mencakup tiket pesawat, akomodasi hotel, dan uang saku harian.</span>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col space-y-1">
              <label class="text-sm font-semibold">Tanggal Mulai</label>
              <input v-model="projectForm.start_date" class="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface text-xs focus:outline-none cursor-pointer" type="date" aria-label="Tanggal mulai" />
            </div>
            <div class="flex flex-col space-y-1">
              <label class="text-sm font-semibold">Tanggal Selesai</label>
              <input v-model="projectForm.end_date" class="w-full px-3 py-2 rounded-xl bg-surface-container-low text-on-surface text-xs focus:outline-none cursor-pointer" type="date" aria-label="Tanggal selesai" />
            </div>
          </div>

          <div class="p-3 rounded-xl bg-surface-container-low flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px] text-muted shrink-0" aria-hidden="true">info</span>
            <span class="text-xs text-[#54615b]">Pembebanan ke pos anggaran proyek dicatat manual via kolom pagu terpakai — tidak ada auto-debet otomatis.</span>
          </div>

          <div class="pt-2 flex items-center justify-end gap-2">
            <button class="px-6 py-2.5 rounded-full bg-surface-container-low text-on-surface text-sm hover:bg-[#dee9fc] transition-colors" type="button" @click="closeDrawer">Batal</button>
            <button class="px-6 py-2.5 rounded-full bg-primary-container text-[#003e0f] text-sm font-semibold hover:opacity-95 shadow-md flex items-center gap-1.5 disabled:opacity-60" type="submit" :disabled="projectSaving">
              <span class="material-symbols-outlined text-[18px]" aria-hidden="true">check</span>
              <span>{{ projectSaving ? 'Menyimpan...' : 'Simpan Proyek' }}</span>
            </button>
          </div>
        </form>
      </aside>
    </Transition>

    <AppConfirmModal
      :open="deleteTarget !== null"
      title="Hapus proyek?"
      :message="`Proyek ${deleteTarget?.code ?? ''} — ${deleteTarget?.name ?? ''} akan dihapus permanen. Proyek yang masih punya travel request akan ditolak sistem.`"
      variant="danger"
      confirm-label="Ya, Hapus"
      icon="delete"
      :loading="deleteSaving"
      @close="closeDeleteProject"
      @confirm="submitDeleteProject"
    />

    <!-- Toast (AppToast: pill gelap, identik dengan toast lama halaman ini) -->
    <AppToast :msg="toast.msg.value" :visible="toast.visible.value" :icon="toast.icon.value" />
  </div>
</template>
