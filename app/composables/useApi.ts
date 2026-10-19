import { useAppStore } from '~/stores/app'

/**
 * API client terpusat ke backend Laravel (Sanctum Bearer token).
 * Base URL dari runtimeConfig.public.apiBase (env NUXT_PUBLIC_API_BASE).
 */
export const useApi = () => {
  const config = useRuntimeConfig()
  const app = useAppStore()

  return $fetch.create({
    baseURL: config.public.apiBase as string,
    headers: { Accept: 'application/json' },
    onRequest({ options }) {
      if (app.token) {
        options.headers.set('Authorization', `Bearer ${app.token}`)
      }
    },
    onResponseError({ response }) {
      if (response.status === 401 && import.meta.client) {
        app.logout()
        navigateTo('/login')
      }
    },
  })
}

/** Bentuk paginator Laravel: { data, current_page, last_page, total, ... } */
export interface LaravelPaginator<T> {
  data: T[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export function paginatorMeta<T>(res: LaravelPaginator<T> | T[]) {
  if (Array.isArray(res)) {
    return { items: res, total: res.length, currentPage: 1, lastPage: 1 }
  }
  return {
    items: res.data,
    total: res.total,
    currentPage: res.current_page,
    lastPage: res.last_page,
  }
}
