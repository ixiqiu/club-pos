import { describe, expect, it } from 'vitest'
import {
  computeTotals,
  defaultPromoChoice,
  evaluatePromotions,
  type CartLine,
  type PromoChoice
} from '../src/shared/cart'
import type { Promotion } from '../src/shared/types'

const cola = { productId: 'cola', name: '可乐', priceYuan: 3, qty: 0 }
const card = { productId: 'card', name: '明信片', priceYuan: 4, qty: 0 }
const badge = { productId: 'badge', name: '徽章', priceYuan: 5, qty: 0 }

function line(base: { productId: string; name: string; priceYuan: number }, qty: number): CartLine {
  return { ...base, qty }
}

describe('promo engine', () => {
  it('BOGO 同款：买2送1，拿 3 件收 2 件钱', () => {
    const promos: Promotion[] = [
      { id: 'b1', name: '可乐买2送1', enabled: true, kind: 'bogo', buyProductId: 'cola', buyQty: 2, getProductId: 'cola', getQty: 1 }
    ]
    const t = computeTotals([line(cola, 3)], promos, { bogoIds: ['b1'], orderPromoId: null }, null)
    expect(t.subtotalC).toBe(900)
    expect(t.bogo[0].amountC).toBe(300)
    expect(t.totalC).toBe(600)
  })

  it('BOGO 异款：买2可乐送1明信片，两者都要在车', () => {
    const promos: Promotion[] = [
      { id: 'b1', name: '买可乐送明信片', enabled: true, kind: 'bogo', buyProductId: 'cola', buyQty: 2, getProductId: 'card', getQty: 1 }
    ]
    const t = computeTotals(
      [line(cola, 2), line(card, 1)],
      promos,
      { bogoIds: ['b1'], orderPromoId: null },
      null
    )
    expect(t.bogo[0].amountC).toBe(400)
    expect(t.totalC).toBe(600)
    // 只有可乐时不可用
    const t2 = computeTotals([line(cola, 4)], promos, { bogoIds: ['b1'], orderPromoId: null }, null)
    expect(t2.bogo.length).toBe(0)
  })

  it('满减基于商品小计', () => {
    const promos: Promotion[] = [
      { id: 't1', name: '满20减3', enabled: true, kind: 'threshold', thresholdYuan: 20, offYuan: 3 }
    ]
    const t = computeTotals([line(badge, 4)], promos, { bogoIds: [], orderPromoId: 't1' }, null)
    expect(t.subtotalC).toBe(2000)
    expect(t.totalC).toBe(1700)
    // 不满足门槛
    const t2 = computeTotals([line(badge, 1)], promos, { bogoIds: [], orderPromoId: 't1' }, null)
    expect(t2.totalC).toBe(500)
  })

  it('折扣与手动优惠叠加', () => {
    const promos: Promotion[] = [
      { id: 'd1', name: '全场95折', enabled: true, kind: 'discount', percentOff: 5 }
    ]
    // 100 元，9 折=90，再手动减 5=85
    const t = computeTotals(
      [line(badge, 20)],
      promos,
      { bogoIds: [], orderPromoId: 'd1' },
      { title: '现场优惠', amountC: 500 }
    )
    expect(t.subtotalC).toBe(10000)
    expect(t.order?.amountC).toBe(500)
    expect(t.manual?.amountC).toBe(500)
    expect(t.totalC).toBe(9000)
  })

  it('默认选择：多个整单优惠取最优，BOGO 全选', () => {
    const promos: Promotion[] = [
      { id: 't1', name: '满20减3', enabled: true, kind: 'threshold', thresholdYuan: 20, offYuan: 3 },
      { id: 'd1', name: '95折', enabled: true, kind: 'discount', percentOff: 5 },
      { id: 'b1', name: '可乐买2送1', enabled: true, kind: 'bogo', buyProductId: 'cola', buyQty: 2, getProductId: 'cola', getQty: 1 }
    ]
    // 6 瓶可乐=18元 + 1 徽章 5 元 = 23 元；BOGO 组数=2, 赠 2 瓶=6元 => 剩余 17 元
    // 满20减3 不满足(17<20)；95折 减 0.85 => 最优选择应为 d1
    const c = defaultPromoChoice([line(cola, 6), line(badge, 1)], promos)
    expect(c.bogoIds).toContain('b1')
    expect(c.orderPromoId).toBe('d1')
    const t = computeTotals([line(cola, 6), line(badge, 1)], promos, c, null)
    expect(t.totalC).toBe(1615)
  })

  it('手动优惠封顶到应收金额', () => {
    const t = computeTotals([line(cola, 1)], [], { bogoIds: [], orderPromoId: null }, { title: '白送', amountC: 99999 })
    expect(t.totalC).toBe(0)
  })

  it('评估结果包含缺口提示', () => {
    const promos: Promotion[] = [
      { id: 't1', name: '满20减3', enabled: true, kind: 'threshold', thresholdYuan: 20, offYuan: 3 }
    ]
    const ev = evaluatePromotions([line(cola, 2)], promos)
    expect(ev.order[0].eligible).toBe(false)
    expect(ev.order[0].gapC).toBe(1400)
  })
})
