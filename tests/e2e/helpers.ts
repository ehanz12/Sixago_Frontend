import type { Page, Response } from '@playwright/test'
/**
 * Navigasi + tunggu hingga Vue/Nuxt selesai hydrate.
 *
 * Tanpa ini, klik pada tombol submit bisa terjadi sebelum listener
 * `@submit.prevent` terpasang, sehingga browser melakukan native form
 * submit (terlihat sebagai ?corporateId=... di URL) alih-alih handler Vue.
 *
 * Vue 3 menandai container mount dengan `__vue_app__` setelah mount,
 * jadi itu sinyal hydrate yang presisi (lebih andal dari networkidle
 * di dev server yang punya HMR websocket).
 */
export async function gotoAndHydrate(page: Page, url: string): Promise<Response | null> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => {
      const root = document.querySelector('#__nuxt')
      return !!root && '__vue_app__' in root
    },
    { timeout: 30000 },
  )
  return response
}

/**
 * Login via form asli (satu-satunya cara masuk yang didukung arsitektur
 * localStorage-token + SSR app ini — navigasi langsung ke URL terproteksi
 * selalu bounce di server karena server tidak bisa membaca localStorage).
 * Mendarat di home sesuai role.
 */
export async function loginAs(page: Page, email: string, password = 'password123'): Promise<void> {
  await gotoAndHydrate(page, '/login')
  await page.locator('#corporateId').fill(email)
  await page.locator('#passwordField').fill(password)
  await page.getByRole('button', { name: /Masuk ke Akun/ }).click()
  await page.waitForURL(/\/admin\/?$|\/password$/, { timeout: 20000 })
}
