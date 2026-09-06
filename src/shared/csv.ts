// 报表 CSV 生成（UTF-8 with BOM，Excel 可直接打开）

import type { Order } from './types'
import { MODE_LABEL, dateTimeStrOf, dateStrOf, timeStrOf, itemsSummary } from './order'
import { fmtYuan } from './money'

const STATUS_LABEL: Record<string, string> = {
  normal: '完成',
  pending_pickup: '待取货',
  unpaid: '待收款',
  void: '已作废'
}

function esc(v: string | number): string {
  const s = String(v ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(esc).join(',')
}

const ORDERS_HEADER = [
  '单号',
  '日期',
  '时间',
  '类型',
  '状态',
  '商品明细',
  '小计(元)',
  '优惠(元)',
  '应收(元)',
  '付款方式',
  '实收(元)',
  '找零(元)',
  '班级',
  '姓名',
  '备注'
]

/** 订单明细 CSV。调用方自行按日期过滤。含作废单（状态标注），便于对账。 */
export function buildOrdersCsv(orders: Order[]): string {
  const rows = [csvRow(ORDERS_HEADER)]
  for (const o of orders) {
    const payment =
      o.mode === 'credit' && !o.payment
        ? '赊账(未收)'
        : o.payment?.method === 'cash'
          ? '现金'
          : o.payment?.method === 'online'
            ? '在线'
            : '—'
    rows.push(
      csvRow([
        o.id,
        dateStrOf(o.ts),
        timeStrOf(o.ts),
        MODE_LABEL[o.mode] ?? o.mode,
        STATUS_LABEL[o.status] ?? o.status,
        itemsSummary(o.items),
        fmtYuan(Math.round(o.subtotalYuan * 100)),
        fmtYuan(Math.round((o.subtotalYuan - o.totalYuan) * 100)),
        fmtYuan(Math.round(o.totalYuan * 100)),
        payment,
        o.payment?.receivedYuan != null ? fmtYuan(Math.round(o.payment.receivedYuan * 100)) : '',
        o.payment?.changeYuan != null ? fmtYuan(Math.round(o.payment.changeYuan * 100)) : '',
        o.buyer?.klass ?? '',
        o.buyer?.name ?? '',
        o.buyer?.note ?? ''
      ])
    )
  }
  return '\uFEFF' + rows.join('\r\n')
}

export interface ProductAggRow {
  name: string
  category: string
  qty: number
  amountYuan: number
}

/** 按商品汇总（不含作废单） */
export function buildProductSummaryCsv(orders: Order[]): { rows: ProductAggRow[]; csv: string } {
  const map = new Map<string, ProductAggRow>()
  for (const o of orders) {
    if (o.status === 'void') continue
    for (const it of o.items) {
      const key = it.productId || it.name
      const cur = map.get(key) ?? { name: it.name, category: '', qty: 0, amountYuan: 0 }
      cur.qty += it.qty
      cur.amountYuan = Math.round((cur.amountYuan + it.qty * it.priceYuan) * 100) / 100
      map.set(key, cur)
    }
  }
  const rows = [...map.values()].sort((a, b) => b.amountYuan - a.amountYuan)
  const lines = [csvRow(['商品', '分类', '数量', '金额(元)'])]
  for (const r of rows) {
    lines.push(csvRow([r.name, r.category, r.qty, r.amountYuan.toFixed(2)]))
  }
  return { rows, csv: '\uFEFF' + lines.join('\r\n') }
}

export { dateTimeStrOf }
