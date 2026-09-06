import { create } from 'zustand'
import type {
  AppData,
  AppMeta,
  AppSettings,
  Order,
  Product,
  Promotion
} from '../../../shared/types'

interface AppState {
  loaded: boolean
  products: Product[]
  promotions: Promotion[]
  orders: Order[]
  settings: AppSettings
  meta: AppMeta | null
  init: () => Promise<void>
  reload: () => Promise<void>
  applyData: (d: AppData) => void
  setProducts: (p: Product[]) => Promise<void>
  setPromotions: (p: Promotion[]) => Promise<void>
  setSettings: (patch: Partial<AppSettings>) => Promise<void>
  refreshAfterOrder: () => Promise<void>
}

export const useApp = create<AppState>((set, get) => ({
  loaded: false,
  products: [],
  promotions: [],
  orders: [],
  settings: {
    storeName: '社团收银台',
    receiptWidthMm: 58,
    receiptCopies: 2,
    receiptFooter: ''
  },
  meta: null,

  init: async () => {
    try {
      const [payload, meta] = await Promise.all([window.clubpos.load(), window.clubpos.meta()])
      set({ ...payload.data, meta, loaded: true })
    } catch (e) {
      console.error('初始化失败', e)
      alert('数据读取失败：' + (e instanceof Error ? e.message : String(e)))
    }
  },

  reload: async () => {
    const payload = await window.clubpos.load()
    set({ ...payload.data, loaded: true })
  },

  applyData: (d: AppData) => {
    set({ products: d.products, promotions: d.promotions, orders: d.orders, settings: d.settings })
  },

  setProducts: async (p) => {
    const d = await window.clubpos.saveProducts(p)
    get().applyData(d)
  },
  setPromotions: async (p) => {
    const d = await window.clubpos.savePromotions(p)
    get().applyData(d)
  },
  setSettings: async (patch) => {
    const d = await window.clubpos.saveSettings(patch)
    get().applyData(d)
  },
  refreshAfterOrder: async () => {
    await get().reload()
  }
}))
