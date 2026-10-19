import type {
  AdvanceItem, Delegation, Department, Employee,
  NotificationItem, ReimbursementItem, TravelPolicy, TravelRequest, UserAccount,
} from '~/types'
import { ADVANCE_STATUS, REIMBURSEMENT_STATUS, TRAVEL_STATUS } from '~/constants/domain'
import { formatRp } from '~/utils/format'

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

export function formatDateId(value?: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`
}

export function mapEmployee(u: any): Employee {
  return {
    id: String(u?.id ?? ''),
    name: u?.name ?? '-',
    nik: u?.nik ?? '-',
    email: u?.email ?? '-',
    department: u?.department?.name ?? u?.department ?? '-',
    costCenter: u?.department?.code ?? '',
    grade: u?.grade ?? '-',
    role: u?.role ?? '-',
    manager: u?.manager?.name ?? u?.manager ?? '-',
    avatar: u?.avatar ?? '',
    status: (u?.status ?? 'Aktif') as Employee['status'],
  }
}

export function mapTravelRequest(t: any): TravelRequest {
  const cost = Number(t.cost ?? 0)
  return {
    id: t.request_no ?? `#TR-${t.id}`,
    employee: mapEmployee(t.user),
    project: t.project?.name ?? '-',
    projectCode: t.project?.code ?? '',
    route: t.route ?? '-',
    transport: t.transport ?? '-',
    startDate: formatDateId(t.start_date),
    endDate: formatDateId(t.end_date),
    duration: t.duration ?? '-',
    cost,
    costLabel: formatRp(cost),
    status: (t.status ?? TRAVEL_STATUS.DRAFT) as TravelRequest['status'],
    policyStatus: t.policy_status ?? undefined,
    policyCode: t.policy_code ?? undefined,
    createdAt: formatDateId(t.created_at),
    purpose: t.purpose ?? undefined,
    _rawId: t.id,
    _rawUserId: t.user_id,
  } as TravelRequest & { _rawId: number; _rawUserId?: number }
}

export function mapReimbursement(r: any): ReimbursementItem {
  return {
    id: r.request_no ?? `#REIM-${r.id}`,
    requestId: r.travel_request?.request_no ?? '-',
    employee: mapEmployee(r.travel_request?.user),
    route: r.travel_request?.route ?? '-',
    actualExpense: Number(r.actual_expense ?? 0),
    advance: Number(r.advance ?? 0),
    reconciliation: r.reconciliation ?? '',
    ocrStatus: (r.ocr_status ?? 'Valid') as ReimbursementItem['ocrStatus'],
    receiptCount: Number(r.receipt_count ?? 0),
    status: (r.status ?? REIMBURSEMENT_STATUS.AUDIT) as ReimbursementItem['status'],
  }
}

export function mapAdvance(a: any): AdvanceItem {
  return {
    id: a.request_no ?? `#ADV-${a.id}`,
    requestId: a.travel_request?.request_no ?? '-',
    employee: mapEmployee(a.travel_request?.user),
    purpose: a.purpose ?? '-',
    amount: Number(a.amount ?? 0),
    plafon: Number(a.plafon ?? 0),
    account: a.account ?? '-',
    method: (a.method ?? 'Bank Transfer') as AdvanceItem['method'],
    status: (a.status ?? ADVANCE_STATUS.PENDING) as AdvanceItem['status'],
    sla: '-',
  }
}

export function mapUserAccount(u: any): UserAccount {
  return { ...mapEmployee(u), lastActive: u.last_active ?? undefined, _rawId: u.id } as UserAccount & { _rawId: number }
}

export function mapTravelPolicy(p: any): TravelPolicy {
  return {
    code: p.code, grade: p.grade, transportPlafon: p.transport_plafon,
    hotelPlafon: p.hotel_plafon, perDiem: p.per_diem, localTransport: p.local_transport,
    sla: p.sla, enabled: !!p.enabled, region: (p.region ?? 'Domestik') as TravelPolicy['region'],
  }
}

export function mapDepartment(d: any): Department {
  return {
    code: d.code, name: d.name,
    // Backend menimpa `members` dengan hitungan relasi users() — kolom DB-nya
    // tidak pernah diisi, jadi angka kolom lama (0) tidak boleh dipakai.
    members: Number(d.members ?? 0),
    budgetUsed: Number(d.budget_used ?? 0), budgetTotal: Number(d.budget_total ?? 0),
    leader: mapEmployee(d.leader), sla: d.sla ?? '-',
    memberPreview: (d.member_preview ?? []).map((m: any) => ({
      id: Number(m.id), name: String(m.name ?? '-'), role: String(m.role ?? '-'),
      grade: String(m.grade ?? '-'), avatar: m.avatar ?? null, status: String(m.status ?? 'Aktif'),
    })),
  }
}

export function mapDelegation(d: any): Delegation {
  return {
    id: String(d.id), delegator: mapEmployee(d.delegator), delegatee: mapEmployee(d.delegatee),
    scope: d.scope ?? '-', reason: d.reason ?? '-',
    startDate: formatDateId(d.start_date), endDate: formatDateId(d.end_date),
    // Dulu daysLeft diisi d.status — bukan sisa hari. Halaman delegation.vue
    // memang menghitung ulang sendiri, jadi ini hanya merapikan sumbernya.
    daysLeft: '',
    status: (d.status ?? 'Aktif') as Delegation['status'],
  }
}

export function mapNotification(n: any): NotificationItem {
  const typeMap: Record<string, NotificationItem['type']> = {
    urgent: 'Urgent', finance: 'Finance', system: 'System', approval: 'Approval',
    Urgent: 'Urgent', Finance: 'Finance', System: 'System', Approval: 'Approval',
  }
  return {
    id: String(n.id), title: n.title, message: n.message,
    type: typeMap[n.type] ?? 'System',
    time: formatDateId(n.created_at), read: !!n.read,
  }
}

/** Unduh file CSV apa pun dari API (butuh token → via fetch blob). */
export async function downloadCsv(path: string, filename: string) {
  const api = useApi()
  const blob = await api<Blob>(path, { responseType: 'blob' as any })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** URL file export CSV (butuh token → buka via fetch blob). */
export async function downloadExport(path: 'travel-requests' | 'advances' | 'reimbursements' | 'users', filename: string) {
  const api = useApi()
  const blob = await api<Blob>(`/exports/${path}`, { responseType: 'blob' as any })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
