import { expect, test } from '@playwright/test'
import { gotoAndHydrate, loginAs } from './helpers'

/**
 * Satu login Super Admin, lalu klik seluruh menu sidebar (navigasi client-side).
 * Profil & password ikut diuji di akhir sesi yang sama — tidak ada login ulang.
 */
const ADMIN_LINKS: Array<{ label: string; url: RegExp }> = [
  { label: 'Dashboard', url: /\/admin\/?$/ },
  { label: 'Travel Requests', url: /\/admin\/travel-requests\/?$/ },
  { label: 'Approval Queue', url: /\/admin\/approval-queue/ },
  { label: 'Uang Muka', url: /\/admin\/uang-muka/ },
  { label: 'Reimbursements', url: /\/admin\/reimbursement/ },
  { label: 'Notifikasi', url: /\/admin\/notifications/ },
  { label: 'Policies', url: /\/admin\/management\/travel-policy/ },
  { label: 'Projects', url: /\/admin\/management\/projects/ },
  { label: 'Users & Roles', url: /\/admin\/management\/users/ },
  { label: 'Departemen', url: /\/admin\/management\/departments/ },
  { label: 'Approval Level', url: /\/admin\/management\/approval-levels/ },
  { label: 'Delegasi Approval', url: /\/admin\/management\/delegation/ },
]

test.describe('Semua halaman utama render untuk Super Admin', () => {
  test('klik tiap menu sidebar tanpa error', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(String(err)))

    await loginAs(page, 'admin@sixago.local')

    for (const { label, url } of ADMIN_LINKS) {
      await page.locator('aside').getByText(label).first().click()
      await expect(page).toHaveURL(url, { timeout: 15000 })
      await expect(page.locator('text=/Application error|Something went wrong/i')).toHaveCount(0)
    }
    expect(errors).toEqual([])
  })
})
