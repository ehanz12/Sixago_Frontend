export function useDebounce<T>(value: Ref<T>, delay = 300) {
  const debounced = ref(value.value) as Ref<T>
  let timer: ReturnType<typeof setTimeout> | null = null
  watch(value, (v) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (debounced.value = v), delay)
  })
  onUnmounted(() => { if (timer) clearTimeout(timer) })
  return debounced
}

export function useDebouncedRef<T>(initial: T, delay = 300) {
  const raw = ref(initial) as Ref<T>
  const debounced = useDebounce(raw, delay)
  return { raw, debounced }
}
