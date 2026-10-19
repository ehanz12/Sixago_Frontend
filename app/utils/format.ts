// Centralized formatting utilities — prevents duplicated Intl.NumberFormat per render
export function formatRp(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n).replace('Rp', 'Rp ')
}

export function formatRpShort(n: number): string {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} Jt`
  if (n >= 1000) return `Rp ${(n / 1000).toFixed(0)} Rb`
  return formatRp(n)
}

export function statusPillClass(status: string): string {
  if (status === 'In Review') return 'bg-amber-100 text-amber-800'
  if (status === 'Approved') return 'bg-secondary-container text-[#2e6f3c]'
  if (status === 'Completed') return 'bg-surface-container text-[#3e4a3c]'
  if (status === 'Submitted') return 'bg-surface-container-low text-muted'
  if (status === 'Rejected') return 'bg-error-container text-[#93000a]'
  return 'bg-surface-container-low text-muted'
}

export function initialsOf(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

export function transportIconName(t: string): string {
  if (t.includes('Garuda') || t.includes('Batik') || t.includes('Citilink') || t.includes('Lion')) return 'flight'
  if (t.includes('Kereta')) return 'train'
  if (t.includes('Mobil')) return 'directions_car'
  return 'flight'
}
