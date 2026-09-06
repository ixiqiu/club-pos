import { create } from 'zustand'

interface ToastState {
  msg: string | null
  toast: (msg: string) => void
  clear: () => void
}

let timer: ReturnType<typeof setTimeout> | undefined

export const useToast = create<ToastState>((set) => ({
  msg: null,
  toast: (msg) => {
    set({ msg })
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => set({ msg: null }), 2600)
  },
  clear: () => set({ msg: null })
}))
