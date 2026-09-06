// 本地数据存储：单个 store.json，原子写入；带每日备份与导入/导出。
// 放在 app.getPath('userData')/data 下，整个文件夹拷贝即可迁移。

import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  type AppSettings,
  type Order,
  type Product,
  type Promotion,
  type StoreData
} from '../shared/types'
import { dateKeyOf, nextOrderId } from '../shared/order'

export interface Store {
  products: Product[]
  promotions: Promotion[]
  orders: Order[]
  settings: AppSettings
}

export function emptyStore(): Store {
  return { products: [], promotions: [], orders: [], settings: { ...DEFAULT_SETTINGS } }
}

class DataStore {
  private store: Store = emptyStore()
  private loaded = false

  get dataDir(): string {
    return join(app.getPath('userData'), 'data')
  }
  get backupDir(): string {
    return join(app.getPath('userData'), 'backups')
  }
  private get filePath(): string {
    return join(this.dataDir, 'store.json')
  }

  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true })
    await fs.mkdir(this.backupDir, { recursive: true })
  }

  async init(): Promise<Store> {
    if (this.loaded) return this.store
    await this.ensureDirs()
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<StoreData>
      const d = parsed.data ?? (parsed as unknown as Partial<Store>)
      this.store = {
        products: Array.isArray(d.products) ? d.products : [],
        promotions: Array.isArray(d.promotions) ? d.promotions : [],
        orders: Array.isArray(d.orders) ? d.orders : [],
        settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) }
      }
    } catch {
      this.store = emptyStore()
      await this.persist()
    }
    this.loaded = true
    await this.dailyBackup()
    return this.store
  }

  private async persist(): Promise<void> {
    await this.ensureDirs()
    const tmp = this.filePath + '.tmp'
    const payload: StoreData = {
      schemaVersion: SCHEMA_VERSION,
      app: 'club-pos',
      data: this.store
    }
    await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf-8')
    await fs.rename(tmp, this.filePath)
  }

  snapshot(): Store {
    return structuredClone(this.store)
  }

  async replace(store: Store): Promise<Store> {
    this.store = structuredClone(store)
    this.store.settings = { ...DEFAULT_SETTINGS, ...(this.store.settings ?? {}) }
    await this.persist()
    return this.snapshot()
  }

  // ---------- 各表替换 ----------
  async replaceProducts(products: Product[]): Promise<Store> {
    this.store.products = structuredClone(products)
    await this.persist()
    return this.snapshot()
  }
  async replacePromotions(promotions: Promotion[]): Promise<Store> {
    this.store.promotions = structuredClone(promotions)
    await this.persist()
    return this.snapshot()
  }
  async replaceSettings(patch: Partial<AppSettings>): Promise<Store> {
    this.store.settings = { ...DEFAULT_SETTINGS, ...this.store.settings, ...patch }
    await this.persist()
    return this.snapshot()
  }

  // ---------- 订单 ----------
  async createOrder(
    draft: Omit<Order, 'id' | 'ts' | 'status' | 'events'>
  ): Promise<Order> {
    const ts = Date.now()
    const order: Order = {
      ...structuredClone(draft),
      id: nextOrderId(this.store.orders, ts),
      ts,
      status:
        draft.mode === 'presale' ? 'pending_pickup' : draft.mode === 'credit' ? 'unpaid' : 'normal',
      events: []
    }
    // 现金找零兜底
    if (order.payment?.method === 'cash') {
      const totalC = Math.round(order.totalYuan * 100)
      const recvC = Math.round((order.payment.receivedYuan ?? 0) * 100)
      if (recvC < totalC) {
        throw new Error(`实收金额不足：应收 ¥${(totalC / 100).toFixed(2)}，实收 ¥${(recvC / 100).toFixed(2)}`)
      }
      order.payment = {
        method: 'cash',
        receivedYuan: recvC / 100,
        changeYuan: (recvC - totalC) / 100
      }
    }
    this.store.orders.push(order)
    await this.persist()
    await this.dailyBackup()
    return structuredClone(order)
  }

  /** 更新订单（状态/事件/收款信息）。status/payment 未提供则保持原样。 */
  async updateOrder(
    id: string,
    mutation: {
      status?: Order['status']
      payment?: Order['payment'] | null
      event?: Omit<Order['events'][number], 'at'>
    }
  ): Promise<Order | null> {
    const order = this.store.orders.find((o) => o.id === id)
    if (!order) return null
    if (mutation.status !== undefined) order.status = mutation.status
    if (mutation.payment !== undefined) {
      order.payment = mutation.payment
      // 登记收款后若仍为待收款则标为完成
      if (order.status === 'unpaid' && mutation.payment) order.status = 'normal'
    }
    if (mutation.event) {
      order.events = [...order.events, { ...mutation.event, at: Date.now() }]
    }
    await this.persist()
    return structuredClone(order)
  }

  // ---------- 备份 ----------
  private backedTodayKey = ''
  private async dailyBackup(): Promise<void> {
    const key = dateKeyOf(Date.now())
    if (this.backedTodayKey === key) return
    this.backedTodayKey = key
    const file = join(this.backupDir, `backup-${key}.json`)
    try {
      await fs.access(file)
      return
    } catch {
      /* 不存在则写 */
    }
    await this.writeBackupFile(file)
    await this.cleanupBackups()
  }

  private async writeBackupFile(file: string): Promise<void> {
    const payload: StoreData = {
      schemaVersion: SCHEMA_VERSION,
      app: 'club-pos',
      exportedAt: Date.now(),
      data: this.store
    }
    await fs.writeFile(file, JSON.stringify(payload), 'utf-8')
  }

  private async cleanupBackups(): Promise<void> {
    try {
      const files = (await fs.readdir(this.backupDir)).filter((f) => f.startsWith('backup-'))
      if (files.length > 30) {
        files.sort()
        for (const f of files.slice(0, files.length - 30)) {
          await fs.unlink(join(this.backupDir, f)).catch(() => undefined)
        }
      }
    } catch {
      /* ignore */
    }
  }

  async makeManualBackup(): Promise<string> {
    await this.ensureDirs()
    const file = join(this.backupDir, `backup-${dateKeyOf(Date.now())}-manual.json`)
    await this.writeBackupFile(file)
    return file
  }

  // ---------- 导入 ----------
  /** 校验并解析备份文件内容 */
  parseBackup(raw: string): Store {
    const parsed = JSON.parse(raw) as Partial<StoreData>
    const d = (parsed.data ?? (parsed as unknown as Partial<Store>)) as Partial<Store>
    if (!d || !Array.isArray(d.products)) throw new Error('不是有效的备份文件（缺少 products）')
    return {
      products: d.products,
      promotions: Array.isArray(d.promotions) ? d.promotions : [],
      orders: Array.isArray(d.orders) ? d.orders : [],
      settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) }
    }
  }

  mergeBy<K extends { id: string }>(base: K[], incoming: K[]): K[] {
    const map = new Map(base.map((x) => [x.id, x]))
    for (const x of incoming) map.set(x.id, x)
    return [...map.values()]
  }
}

export const dataStore = new DataStore()

/** 生成示例数据（不影响已有订单/设置） */
export function sampleStore(): Store {
  const now = Date.now()
  const products: Product[] = [
    { id: 'p-cola', name: '可乐', price: 3, category: '饮料', active: true, createdAt: now },
    { id: 'p-tea', name: '冰红茶', price: 3.5, category: '饮料', active: true, createdAt: now },
    { id: 'p-milk', name: '奶茶', price: 8, category: '饮料', active: true, createdAt: now },
    { id: 'p-badge', name: '社团徽章', price: 5, category: '周边', active: true, createdAt: now },
    { id: 'p-card', name: '限定明信片', price: 4, category: '周边', active: true, createdAt: now },
    { id: 'p-band', name: '主题手环', price: 6.5, category: '周边', active: true, createdAt: now }
  ]
  const promotions: Promotion[] = [
    { id: 'pr-1', name: '满 20 减 3', enabled: true, kind: 'threshold', thresholdYuan: 20, offYuan: 3 },
    { id: 'pr-2', name: '会员全场 95 折', enabled: false, kind: 'discount', percentOff: 5 },
    { id: 'pr-3', name: '可乐买 2 送 1', enabled: true, kind: 'bogo', buyProductId: 'p-cola', buyQty: 2, getProductId: 'p-cola', getQty: 1 }
  ]
  return { products, promotions, orders: [], settings: { ...DEFAULT_SETTINGS } }
}
