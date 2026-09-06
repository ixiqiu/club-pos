// 订单编号、时间与汇总帮助函数

import type { Order, OrderItem } from './types'
import { fmtYuan } from './money'

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 本地时区的 yyyyMMdd */
export function dateKeyOf(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}

/** 本地时区 yyyy-MM-dd */
export function dateStrOf(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 本地时区 HH:mm:ss */
export function timeStrOf(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

export function dateTimeStrOf(ts: number): string {
  return `${dateStrOf(ts)} ${timeStrOf(ts)}`
}

/** 根据已有订单生成当日下一个流水号：20260906-0001 */
export function nextOrderId(orders: Order[], ts: number): string {
  const key = dateKeyOf(ts)
  let max = 0
  for (const o of orders) {
    if (o.id.startsWith(`${key}-`)) {
      const n = parseInt(o.id.slice(key.length + 1), 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  return `${key}-${pad4(max + 1)}`
}

const pad4 = (n: number) => String(n).padStart(4, '0')

export const MODE_LABEL: Record<string, string> = {
  sale: '普通销售',
  presale: '预售登记',
  credit: '赊账登记'
}

/** 订单商品概要文本：可乐 x2 ¥6.00; 徽章 x1 ¥5.00 */
export function itemsSummary(items: OrderItem[]): string {
  return items.map((i) => `${i.name} x${i.qty} ¥${fmtYuan(Math.round(i.priceYuan * 100))}`).join('; ')
}

export function isVoid(o: Order): boolean {
  return o.status === 'void'
}
