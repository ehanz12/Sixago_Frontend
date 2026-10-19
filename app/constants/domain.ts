/**
 * Cermin App\Support\TravelStatuses + UserRoles (SixAgoBeV2).
 * Nilai string HARUS sama persis dengan backend — ubah dua-duanya.
 * Dikunci test BE DomainValuesTest::test_status_constants_match_contract.
 */
export const TRAVEL_STATUS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'In Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
} as const

export const ADVANCE_STATUS = {
  PENDING: 'Pending Finance',
  READY: 'Approved-Ready to Pay',
  PAID: 'Paid',
  REJECTED: 'Rejected',
} as const

export const REIMBURSEMENT_STATUS = {
  AUDIT: 'Menunggu Audit',
  VERIFY: 'Menunggu Verifikasi Finance',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
} as const

export const QUEUE_STATUS = {
  PENDING: 'pending',
  QUEUED: 'queued',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const

export const POLICY_BADGE = {
  OK: 'Sesuai',
  APPROVED: 'Policy Approved',
  REJECTED: 'Ditolak',
  /** Awalan badge deviasi ("Deviasi 12.5%") — nilai dinamis, cek via includes/startsWith. */
  DEV_PREFIX: 'Deviasi',
} as const

export const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  FINANCE: 'Finance Approver',
  DIVISION_HEAD: 'Division Head',
  LINE_MANAGER: 'Line Manager',
  EMPLOYEE: 'Employee',
} as const

/**
 * Cermin App\Support\Positions (SixAgoBeV2). Backend yang menegakkan —
 * nilai di sini hanya untuk menyaring opsi UI agar user tidak Offered
 * kombinasi yang pasti ditolak 422.
 *
 * `rank` naik = grade makin tinggi. Grade menentukan plafon perjalanan,
 * role menentukan wewenang approval; keduanya hanya boleh dipasangkan
 * lewat matriks ini.
 */
export const GRADES = [
  { code: 'P1', rank: 1, label: 'Grade P1 (Staff / Associate)' },
  { code: 'P2', rank: 2, label: 'Grade P2 (Specialist / Officer)' },
  { code: 'P3', rank: 3, label: 'Grade P3 (Senior Engineer / Lead)' },
  { code: 'P4', rank: 4, label: 'Grade P4 (Lead Architect / Manager)' },
  { code: 'P5', rank: 5, label: 'Grade P5 (Senior Manager)' },
  { code: 'M1', rank: 6, label: 'Grade M1 (Kadiv / Executive)' },
  { code: 'M2', rank: 7, label: 'Grade M2 (Senior Executive)' },
  { code: 'M3', rank: 8, label: 'Grade M3 (Direksi)' },
] as const

export type PositionRule = {
  min: string
  max: string
  approver: boolean
  needsManager: boolean
}

/** Role → grade sah + apakah wajib punya atasan langsung. */
export const POSITION_MATRIX: Record<string, PositionRule> = {
  'Employee': { min: 'P1', max: 'P5', approver: false, needsManager: true },
  'Line Manager': { min: 'P4', max: 'M3', approver: true, needsManager: false },
  'Division Head': { min: 'M1', max: 'M3', approver: true, needsManager: false },
  'Finance Approver': { min: 'P1', max: 'M3', approver: true, needsManager: false },
  'Super Admin': { min: 'M1', max: 'M3', approver: true, needsManager: false },
}

export function gradesForRole(role: string | undefined | null) {
  const rule = role ? POSITION_MATRIX[role] : undefined
  if (!rule) return GRADES.slice()
  const min = GRADES.find((g) => g.code === rule.min)?.rank ?? 1
  const max = GRADES.find((g) => g.code === rule.max)?.rank ?? 8
  return GRADES.filter((g) => g.rank >= min && g.rank <= max)
}

export function roleNeedsManager(role: string | undefined | null): boolean {
  return role ? POSITION_MATRIX[role]?.needsManager === true : false
}
