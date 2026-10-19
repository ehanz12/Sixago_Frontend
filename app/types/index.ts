// Dummy TypeScript interfaces - awal desain sebelum fetching (pre-API)
export interface Employee {
  id: string
  name: string
  nik: string
  email: string
  department: string
  costCenter: string
  grade: string
  role: string
  manager: string
  avatar: string
  status: 'Aktif' | 'Pending' | 'Cuti' | 'Non-Aktif'
}

export interface TravelRequest {
  id: string // #TR-2025-xxx
  employee: Employee
  project: string
  projectCode: string
  route: string
  transport: string
  startDate: string
  endDate: string
  duration: string
  cost: number
  costLabel: string
  status: 'Draft' | 'Submitted' | 'In Review' | 'Approved' | 'Rejected' | 'Completed'
  policyStatus?: string
  policyCode?: string
  createdAt: string
  purpose?: string
}

export interface ReimbursementItem {
  id: string // #REIM-xxx
  requestId: string
  employee: Employee
  route: string
  actualExpense: number
  advance: number
  reconciliation: string
  ocrStatus: 'Valid' | 'Deviasi Plafon' | 'Ditolak'
  receiptCount: number
  status: 'Menunggu Audit' | 'Menunggu Verifikasi Finance' | 'Disetujui' | 'Ditolak'
}

export interface AdvanceItem {
  id: string // #ADV-xxx
  requestId: string
  employee: Employee
  purpose: string
  amount: number
  plafon: number
  account: string
  method: 'Bank Transfer' | 'Corporate Card'
  status: 'Pending Finance' | 'Approved-Ready to Pay' | 'Paid' | 'Rejected'
  sla: string
}

export interface UserAccount extends Employee {
  lastActive?: string
}

export interface TravelPolicy {
  code: string
  grade: string
  transportPlafon: string
  hotelPlafon: string
  perDiem: string
  localTransport: string
  sla: string
  enabled: boolean
  region: 'Domestik' | 'Global'
}

export interface Project {
  code: string
  wbs: string
  name: string
  pm: Employee
  period: string
  daysLeft: number
  budgetUsed: number
  budgetTotal: number
  trips: number
  status: 'Active' | 'On Hold' | 'Completed'
}

/** Potongan anggota yang tampil di kartu departemen (backend: member_preview). */
export interface DepartmentMember {
  id: number
  name: string
  role: string
  grade: string
  avatar?: string | null
  status: string
}

export interface Department {
  code: string
  name: string
  members: number
  budgetUsed: number
  budgetTotal: number
  leader: Employee
  sla: string
  memberPreview: DepartmentMember[]
}

export interface Delegation {
  id: string
  delegator: Employee
  delegatee: Employee
  scope: string
  reason: string
  startDate: string
  endDate: string
  daysLeft: string
  status: 'Aktif' | 'Terjadwal' | 'Kedaluwarsa'
}

export interface NotificationItem {
  id: string
  title: string
  message: string
  type: 'Urgent' | 'Finance' | 'System' | 'Approval'
  time: string
  read: boolean
}
