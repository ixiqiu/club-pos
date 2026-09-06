// 优惠计算引擎（纯函数，可单测）
// 约定：内部金额一律用「分」。输入行 qty 为顾客实际拿走的数量。
//  - BOGO 同款：每 (buy+get) 个中有 get 个免费 -> 优惠 = get * 单价
//  - BOGO 异款：A 买 buy 送 B get，优惠 = 送出的 B 数量 * B 单价
//  - 整单优惠（满减 / 折扣）基于「商品小计 - BOGO 优惠」计算
//  - 临时自定义优惠（手工）基于整单优惠之后再算

import type { Promotion } from './types'
import { clampCents } from './money'

export interface CartLine {
  productId: string
  name: string
  priceYuan: number
  qty: number
}

export interface BogoResult {
  promoId: string
  title: string
  amountC: number
  freeQty: number
}

export interface OrderPromoResult {
  promoId: string
  title: string
  amountC: number
}

export interface Totals {
  subtotalC: number
  bogo: BogoResult[]
  order: OrderPromoResult | null
  manual: { title: string; amountC: number } | null
  /** 优惠总额 */
  discountC: number
  /** 应收 */
  totalC: number
  /** 若应收被手工优惠压到 0，这里记被裁剪的金额（一般不出现） */
  clampedC: number
}

export interface PromoEval {
  promoId: string
  name: string
  kind: Promotion['kind']
  /** 是否可用（条件满足且产生了优惠） */
  eligible: boolean
  /** 可带来的优惠金额（分） */
  amountC: number
  /** 展示文案 */
  hint: string
  /** 若不可用，差多少（分） */
  gapC: number
}

export interface PromoEvalGroup {
  /** 可叠加的 BOGO 优惠 */
  bogo: PromoEval[]
  /** 整单优惠（互斥，一次只取一个） */
  order: PromoEval[]
}

/** 计算一个 BOGO 规则在购物车里的最大组数 */
function bogoSets(promo: Extract<Promotion, { kind: 'bogo' }>, lines: CartLine[]): number {
  const buyLine = lines.find((l) => l.productId === promo.buyProductId)
  if (!buyLine || promo.buyQty <= 0 || promo.getQty <= 0) return 0
  if (promo.buyProductId === promo.getProductId) {
    // 同款：每 (buy+get) 个为一组
    const per = promo.buyQty + promo.getQty
    return Math.floor(buyLine.qty / per)
  }
  const getLine = lines.find((l) => l.productId === promo.getProductId)
  if (!getLine) return 0
  return Math.min(Math.floor(buyLine.qty / promo.buyQty), Math.floor(getLine.qty / promo.getQty))
}

function priceOf(lines: CartLine[], productId: string): number {
  const l = lines.find((x) => x.productId === productId)
  return l ? l.priceYuan : 0
}

/** 评估当前购物车对所有优惠的命中情况（不修改任何状态）。
 *  整单优惠按「商品小计 - 已命中的 BOGO 让利」计算，与结算口径一致。 */
export function evaluatePromotions(lines: CartLine[], promos: Promotion[]): PromoEvalGroup {
  const active = promos.filter((p) => p.enabled)
  const bogo: PromoEval[] = []
  const order: PromoEval[] = []

  const subtotalC = Math.round(
    lines.reduce((s, l) => s + l.priceYuan * l.qty, 0) * 100
  )

  for (const p of active) {
    if (p.kind === 'bogo') {
      const sets = bogoSets(p, lines)
      const price = priceOf(lines, p.getProductId)
      const freeQty = sets * p.getQty
      const amountC = Math.round(freeQty * price * 100)
      bogo.push({
        promoId: p.id,
        name: p.name,
        kind: p.kind,
        eligible: sets > 0 && amountC > 0,
        amountC,
        hint: sets > 0 ? `${p.name}：赠 ${freeQty} 件` : p.name,
        gapC: sets > 0 ? 0 : amountC
      })
    }
  }
  const bogoHitC = bogo.filter((e) => e.eligible).reduce((s, e) => s + e.amountC, 0)
  const orderBaseC = clampCents(subtotalC - bogoHitC)

  for (const p of active) {
    if (p.kind === 'bogo') continue
    const el: PromoEval = {
      promoId: p.id,
      name: p.name,
      kind: p.kind,
      eligible: false,
      amountC: 0,
      hint: p.name,
      gapC: 0
    }
    if (p.kind === 'threshold') {
      const needC = Math.round(p.thresholdYuan * 100)
      const offC = Math.round(p.offYuan * 100)
      el.amountC = orderBaseC >= needC ? Math.min(offC, orderBaseC) : 0
      el.eligible = orderBaseC >= needC && el.amountC > 0
      el.gapC = Math.max(0, needC - orderBaseC)
      el.hint = `满${p.thresholdYuan}减${p.offYuan}`
    } else {
      const minC = p.minYuan ? Math.round(p.minYuan * 100) : 0
      const pct = Math.max(0, Math.min(100, p.percentOff))
      el.eligible = orderBaseC >= minC
      el.amountC = el.eligible ? Math.round((orderBaseC * pct) / 100) : 0
      el.gapC = Math.max(0, minC - orderBaseC)
      const fold = ((100 - pct) / 10).toFixed(1).replace(/\.0$/, '')
      el.hint = `整单${fold}折`
    }
    order.push(el)
  }
  return { bogo, order }
}

export interface PromoChoice {
  bogoIds: string[]
  orderPromoId: string | null
}

/** 默认选择：启用所有命中 BOGO；整单优惠逐个模拟取最终应收最低者。 */
export function defaultPromoChoice(lines: CartLine[], promos: Promotion[]): PromoChoice {
  const evals = evaluatePromotions(lines, promos)
  const bogoIds = evals.bogo.filter((e) => e.eligible).map((e) => e.promoId)
  const candidates = evals.order.filter((e) => e.eligible)

  const none = computeTotals(lines, promos, { bogoIds, orderPromoId: null }, null)
  let best: { id: string; totalC: number } | null = null
  for (const cand of candidates) {
    const t = computeTotals(lines, promos, { bogoIds, orderPromoId: cand.promoId }, null)
    if (t.totalC < none.totalC && (!best || t.totalC < best.totalC)) {
      best = { id: cand.promoId, totalC: t.totalC }
    }
  }
  return { bogoIds, orderPromoId: best?.id ?? null }
}

export interface ManualDiscount {
  title: string
  /** amountC 与 percent 二选一（percent 基于当前应付） */
  amountC?: number
  percent?: number
}

/**
 * 结算计算。
 * @param chosen BOGO 与整单优惠的选择（调用方可在购物车变化时用 defaultPromoChoice 重算）
 * @param manual  临时自定义优惠，可为空
 */
export function computeTotals(
  lines: CartLine[],
  promos: Promotion[],
  chosen: PromoChoice,
  manual: ManualDiscount | null
): Totals {
  const subtotalC = Math.round(lines.reduce((s, l) => s + l.priceYuan * l.qty, 0) * 100)

  const bogo: BogoResult[] = []
  for (const p of promos) {
    if (p.kind !== 'bogo' || !p.enabled) continue
    if (!chosen.bogoIds.includes(p.id)) continue
    const sets = bogoSets(p, lines)
    if (sets <= 0) continue
    const freeQty = sets * p.getQty
    const amountC = Math.round(freeQty * priceOf(lines, p.getProductId) * 100)
    if (amountC <= 0) continue
    bogo.push({ promoId: p.id, title: p.name, amountC, freeQty })
  }
  const bogoC = bogo.reduce((s, b) => s + b.amountC, 0)
  const orderBaseC = clampCents(subtotalC - bogoC)

  let order: OrderPromoResult | null = null
  if (chosen.orderPromoId) {
    const p = promos.find((x) => x.id === chosen.orderPromoId && x.enabled)
    if (p && p.kind !== 'bogo') {
      if (p.kind === 'threshold') {
        const needC = Math.round(p.thresholdYuan * 100)
        const offC = Math.round(p.offYuan * 100)
        if (orderBaseC >= needC && offC > 0) {
          order = { promoId: p.id, title: p.name, amountC: Math.min(offC, orderBaseC) }
        }
      } else {
        const minC = p.minYuan ? Math.round(p.minYuan * 100) : 0
        if (orderBaseC >= minC) {
          const pct = Math.max(0, Math.min(100, p.percentOff))
          const amountC = Math.round((orderBaseC * pct) / 100)
          if (amountC > 0) order = { promoId: p.id, title: p.name, amountC }
        }
      }
    }
  }
  const orderC = order?.amountC ?? 0

  let manualResult: { title: string; amountC: number } | null = null
  let manualC = 0
  if (manual) {
    let amountC = 0
    if (typeof manual.percent === 'number' && manual.percent > 0) {
      const base = clampCents(orderBaseC - orderC)
      amountC = Math.round((base * Math.min(100, manual.percent)) / 100)
    } else if (manual.amountC) {
      amountC = manual.amountC
    }
    amountC = clampCents(amountC)
    const remain = clampCents(orderBaseC - orderC)
    let clamped = 0
    if (amountC > remain) {
      clamped = amountC - remain
      amountC = remain
    }
    if (amountC > 0) manualResult = { title: manual.title || '临时优惠', amountC }
    manualC = amountC
    void clamped
  }

  const discountC = bogoC + orderC + manualC
  const totalC = clampCents(subtotalC - discountC)

  return {
    subtotalC,
    bogo,
    order,
    manual: manualResult,
    discountC,
    totalC,
    clampedC: 0
  }
}
