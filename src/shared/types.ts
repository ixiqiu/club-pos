// 领域类型定义（主进程 / 渲染进程 / 测试共用）

export interface Product {
  id: string
  name: string
  /** 单价，单位：元（两位小数） */
  price: number
  /** 可选分类，如「饮料」「周边」 */
  category?: string
  /** 是否在收银台展示 */
  active: boolean
  createdAt: number
}

// ---------- 优惠 ----------
// 三种优惠类型：
//  threshold : 满 X 减 Y（整单）
//  discount  : 整单打折，percentOff 为让利百分比（10 => 9折 / 立减10%）
//  bogo      : 指定商品买 N 送 M（送同款或另一款）
export type Promotion =
  | {
      id: string
      name: string
      enabled: boolean
      kind: 'threshold'
      /** 满多少（元） */
      thresholdYuan: number
      /** 减多少（元） */
      offYuan: number
    }
  | {
      id: string
      name: string
      enabled: boolean
      kind: 'discount'
      /** 让利百分比 0-100，如 10 = 九折 */
      percentOff: number
      /** 可选：至少满多少才可用 */
      minYuan?: number
    }
  | {
      id: string
      name: string
      enabled: boolean
      kind: 'bogo'
      /** 买的商品 */
      buyProductId: string
      buyQty: number
      /** 送的商品（可与买的相同） */
      getProductId: string
      getQty: number
    }

// ---------- 收银 ----------
export type SaleMode = 'sale' | 'presale' | 'credit'
export type PaymentMethod = 'cash' | 'online'

export interface BuyerInfo {
  /** 班级 */
  klass: string
  /** 姓名 */
  name: string
  /** 备注 */
  note?: string
}

export interface OrderItem {
  productId: string
  name: string
  priceYuan: number
  qty: number
}

export interface DiscountEntry {
  kind: 'promo' | 'manual'
  promoId?: string
  title: string
  /** 优惠金额（元，正数） */
  amountYuan: number
}

export type OrderStatus = 'normal' | 'pending_pickup' | 'unpaid' | 'void'

export interface OrderEvent {
  at: number
  kind: 'picked' | 'delivered' | 'settled' | 'void' | 'reprint'
  note?: string
  /** settle 时收的金额（元） */
  amountYuan?: number
  method?: PaymentMethod
}

export interface OrderPayment {
  method: PaymentMethod
  /** 实收金额（元），现金时有值 */
  receivedYuan?: number
  /** 找零（元），现金时有值 */
  changeYuan?: number
}

export interface Order {
  id: string
  ts: number
  mode: SaleMode
  items: OrderItem[]
  discounts: DiscountEntry[]
  subtotalYuan: number
  totalYuan: number
  buyer?: BuyerInfo | null
  payment?: OrderPayment | null
  status: OrderStatus
  events: OrderEvent[]
}

// ---------- 设置 ----------
export interface AppSettings {
  /** 店名 / 社团名，显示在界面与票头 */
  storeName: string
  /** 可选副标题 / 地址标语 */
  storeNote?: string
  /** 小票纸宽（毫米） */
  receiptWidthMm: 58 | 80
  /** 自动打印份数 */
  receiptCopies: number
  /** 票尾文字 */
  receiptFooter?: string
  /** 指定小票打印机（空 = 系统默认打印机） */
  printerName?: string
  /**
   * 打印方式：
   * - 'system' 系统打印（HTML 走打印机驱动）
   * - 'escpos' 小票直打（ESC/POS 点阵指令，Windows 推荐，字迹清晰不裁切）
   */
  printMode?: 'escpos' | 'system'
}

export const DEFAULT_SETTINGS: AppSettings = {
  storeName: '社团收银台',
  storeNote: '',
  receiptWidthMm: 58,
  receiptCopies: 2,
  receiptFooter: '谢谢惠顾，欢迎再来！',
  printerName: '',
  printMode: 'system'
}

// ---------- 数据文件 ----------
export interface StoreData {
  schemaVersion: number
  app: string
  exportedAt?: number
  data: {
    products: Product[]
    promotions: Promotion[]
    orders: Order[]
    settings: AppSettings
  }
}

export const SCHEMA_VERSION = 1

/** 应用运行时数据（不含 schema 包装） */
export interface AppData {
  products: Product[]
  promotions: Promotion[]
  orders: Order[]
  settings: AppSettings
}

/** 创建订单所需字段（主进程负责编号/时间/状态） */
export type OrderDraft = {
  mode: SaleMode
  items: OrderItem[]
  discounts: DiscountEntry[]
  subtotalYuan: number
  totalYuan: number
  buyer?: BuyerInfo | null
  payment?: OrderPayment | null
}

export type OrderUpdate = {
  id: string
  status?: OrderStatus
  payment?: OrderPayment | null
  /** at 由主进程自动补 */
  event?: Omit<OrderEvent, 'at'>
  /** at 由主进程自动补；可一次追加多个事件 */
  events?: Omit<OrderEvent, 'at'>[]
}

export interface ImportResult {
  mode: 'replace' | 'merge'
  products: number
  promotions: number
  orders: number
}

/** 更改数据目录的结果 */
export interface DataDirResult {
  ok: boolean
  error?: string
  dataRoot?: string
}

export interface AppMeta {
  version: string
  platform: string
  /** 数据根目录：内含 data/（账本）与 backups/（每日备份），拷贝即完整迁移 */
  dataRoot: string
}

// ---------- IPC / 渲染进程 API ----------
export interface PrinterInfo {
  deviceName: string
  displayName: string
  isDefault: boolean
}

export interface ClubPosApi {
  meta(): Promise<AppMeta>
  load(): Promise<StoreData>
  saveProducts(products: Product[]): Promise<AppData>
  savePromotions(promotions: Promotion[]): Promise<AppData>
  saveSettings(patch: Partial<AppSettings>): Promise<AppData>
  applySample(): Promise<AppData>
  reset(): Promise<AppData>
  createOrder(draft: OrderDraft): Promise<{ order?: Order; error?: string }>
  updateOrder(mutation: OrderUpdate): Promise<{ order?: Order | null; error?: string }>
  exportBackup(): Promise<string | null>
  exportCsv(content: string, suggestedName: string): Promise<string | null>
  importData(mode: 'replace' | 'merge'): Promise<ImportResult | null>
  openDataDir(): Promise<void>
  /** 弹窗选择新数据目录并迁移（含 store.json 与每日备份）。取消返回 null。 */
  chooseDataDir(): Promise<DataDirResult | null>
  listPrinters(): Promise<PrinterInfo[]>
  printHtml(options: {
    html?: string
    lines?: string[]
    deviceName?: string
    copies?: number
    docName?: string
    mode?: 'escpos' | 'system'
  }): Promise<{ ok: boolean; error?: string }>
}

export function uid(prefix = ''): string {
  const rnd = Math.random().toString(36).slice(2, 8)
  return `${prefix}${Date.now().toString(36)}${rnd}`
}
