export type ToastType = 'success' | 'error' | 'info'

export function useToast() {
  const msg = ref('')
  const type = ref<ToastType>('success')
  const visible = ref(false)
  const icon = ref('check_circle')
  let timer: ReturnType<typeof setTimeout> | null = null

  function show(message: string, toastType: ToastType = 'success', iconName = 'check_circle', duration = 3200) {
    msg.value = message
    type.value = toastType
    icon.value = iconName
    visible.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (visible.value = false), duration)
  }
  function hide() {
    visible.value = false
    if (timer) clearTimeout(timer)
  }
  onUnmounted(() => { if (timer) clearTimeout(timer) })
  return { msg, type, visible, icon, show, hide }
}
