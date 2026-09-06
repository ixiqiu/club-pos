import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../store/useApp'
import { useToast } from '../store/useToast'
import { Field, moneyText } from '../components/ui'
import {
  computeTotals,
  defaultPromoChoice,
  evaluatePromotions,
  type CartLine,
  type ManualDiscount,
  type PromoChoice
} from '../../../shared/cart'
import {
  centsToInput,
  fmtCny,
  fmtYuan,
  parseYuanToCents,
  yuanToCents
} from '../../../shared/money'
import { buildReceiptHtml } from '../../../shared/receipt'
import type { BuyerInfo, Order, OrderDraft, PaymentMethod, Product, SaleMode } from '../../../shared/types'
import './checkout.css'

/** 收款选择：现金 / 在线 / 暂不收款（预售送货/取货时再收） */
type PayChoice = PaymentMethod | 'later'

export default function Checkout() {
  const { products, promotions, settings, refreshAfterOrder } = useApp()
  const toast = useToast((s) => s.toast)

  const [lines, setLines] = useState<CartLine[]>([])
  const [choice, setChoice] = useState<PromoChoice>({ bogoIds: [], orderPromoId: null })
  const [manual, setManual] = useState<ManualDiscount | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [mode, setMode] = useState<SaleMode>('sale')
  const [pay, setPay] = useState<PayChoice>('cash')
  const [received, setReceived] = useState('')
  const [buyer, setBuyer] = useState<BuyerInfo>({ klass: '', name: '', note: '' })
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('全部')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ order: Order; printOk: boolean; printError?: string } | null>(null)

  const cartSig = useMemo(() => lines.map((l) => `${l.productId}x${l.qty}`).join('|'), [lines])

  // 购物车内容变化时自动重选默认优惠组合
  useEffect(() => {
    setChoice(defaultPromoChoice(lines, promotions))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSig, promotions])

  const promoEval = useMemo(() => evaluatePromotions(lines, promotions), [lines, promotions])
  const totals = useMemo(
    () => computeTotals(lines, promotions, choice, manual),
    [lines, promotions, choice, manual]
  )

  const categories = useMemo(() => {
    const set = new Set<string>()
    products.forEach((p) => p.active && p.category && set.add(p.category))
    return ['全部', ...set]
  }, [products])

  const shown: Product[] = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return products
      .filter((p) => p.active)
      .filter((p) => cat === '全部' || p.category === cat)
      .filter((p) => !kw || p.name.toLowerCase().includes(kw) || (p.category ?? '').toLowerCase().includes(kw))
      .sort((a, b) => a.createdAt - b.createdAt)
  }, [products, q, cat])

  function addProduct(p: Product) {
    setLines((ls) => {
      const found = ls.find((l) => l.productId === p.id)
      if (found) return ls.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l))
      return [...ls, { productId: p.id, name: p.name, priceYuan: p.price, qty: 1 }]
    })
  }

  function changeQty(id: string, delta: number) {
    setLines((ls) =>
      ls
        .map((l) => (l.productId === id ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    )
  }

  const receivedCents = pay === 'cash' ? parseYuanToCents(received) : null
  const changeCents = receivedCents != null ? Math.max(0, receivedCents - totals.totalC) : 0

  // 收款是否满足：普通必须当场收；预售可「暂不收款」（送货/取货时再收）；赊账必不收款
  const paymentOk =
    mode === 'credit' ||
    (mode === 'presale' && pay === 'later') ||
    pay === 'online' ||
    (receivedCents != null && !Number.isNaN(receivedCents) && receivedCents >= totals.totalC)

  const canSubmit =
    lines.length > 0 &&
    (mode === 'sale' || (buyer.klass.trim() && buyer.name.trim())) &&
    paymentOk

  async function submit() {
    if (busy || !canSubmit) return
    setBusy(true)
    try {
      const items = lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        priceYuan: l.priceYuan,
        qty: l.qty
      }))
      const discounts: OrderDraft['discounts'] = []
      for (const b of totals.bogo)
        discounts.push({ kind: 'promo', promoId: b.promoId, title: b.title, amountYuan: b.amountC / 100 })
      if (totals.order)
        discounts.push({ kind: 'promo', promoId: totals.order.promoId, title: totals.order.title, amountYuan: totals.order.amountC / 100 })
      if (totals.manual)
        discounts.push({ kind: 'manual', title: totals.manual.title, amountYuan: totals.manual.amountC / 100 })

      const isCredit = mode === 'credit'
      const isPresale = mode === 'presale'
      const noPayNow = isCredit || (isPresale && pay === 'later')
      const draft: OrderDraft = {
        mode,
        items,
        discounts,
        subtotalYuan: totals.subtotalC / 100,
        totalYuan: totals.totalC / 100,
        buyer: mode === 'sale' ? null : { ...buyer },
        payment: noPayNow
          ? null
          : pay === 'cash'
            ? { method: 'cash', receivedYuan: (receivedCents ?? totals.totalC) / 100 }
            : { method: 'online' }
      }
      const res = await window.clubpos.createOrder(draft)
      if (res.error || !res.order) {
        toast(res.error || '保存失败')
        return
      }
      const order = res.order
      const html = buildReceiptHtml(order, settings)
      const pr = await window.clubpos.printHtml({
        html,
        deviceName: settings.printerName || undefined,
        copies: settings.receiptCopies
      })
      setDone({ order, printOk: pr.ok, printError: pr.error })
      setLines([])
      setChoice({ bogoIds: [], orderPromoId: null })
      setManual(null)
      setReceived('')
      setBuyer({ klass: '', name: '', note: '' })
      setMode('sale')
      setPay('cash')
      await refreshAfterOrder()
    } finally {
      setBusy(false)
    }
  }

  async function reprintOrder(order: Order) {
    const html = buildReceiptHtml(order, settings)
    const pr = await window.clubpos.printHtml({
      html,
      deviceName: settings.printerName || undefined,
      copies: settings.receiptCopies
    })
    toast(pr.ok ? '已补打小票' : '补打失败：' + (pr.error || ''))
  }

  const isPresale = mode === 'presale'
  const isCredit = mode === 'credit'

  function chooseMode(m: SaleMode) {
    setMode(m)
    if (m !== 'presale' && pay === 'later') setPay('cash')
  }

  return (
    <div className="checkout-wrap">
      {/* 左侧：商品 */}
      <div className="checkout-left card" style={{ padding: 12 }}>
        <div className="searchbar">
          <input
            className="input"
            placeholder="🔍 搜索商品名称 / 分类…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="cat-chips">
          {categories.map((c) => (
            <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="prod-grid">
          {shown.map((p) => (
            <button key={p.id} className="prod-card" onClick={() => addProduct(p)}>
              <div className="p-name">{p.name}</div>
              <div className="p-cat">{p.category || '—'}</div>
              <div className="p-price">{moneyText(yuanToCents(p.price))}</div>
            </button>
          ))}
          {shown.length === 0 && (
            <div className="empty-hint">没有可售商品，去「商品管理」添加吧</div>
          )}
        </div>
      </div>

      {/* 右侧：结算 */}
      <div className="cart-panel">
        <div className="cart-head">
          <b>本次收银</b>
          <div className="row">
            {lines.length > 0 && (
              <button className="btn ghost sm" onClick={() => setLines([])}>
                清空
              </button>
            )}
            <button className="btn sm" onClick={() => setShowManual(true)}>
              ＋ 临时优惠
            </button>
          </div>
        </div>

        <div className="cart-items">
          {lines.length === 0 && <div className="empty-hint">点击左侧商品加入购物车</div>}
          {lines.map((l) => (
            <div key={l.productId} className="cart-row">
              <div className="c-name">{l.name}</div>
              <div className="qty-ctl">
                <button onClick={() => changeQty(l.productId, -1)}>−</button>
                <span className="q">{l.qty}</span>
                <button onClick={() => changeQty(l.productId, 1)}>＋</button>
              </div>
              <div className="c-price">{fmtYuan(Math.round(l.priceYuan * l.qty * 100))}</div>
              <button className="btn ghost sm" onClick={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))}>
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="cart-body">
          {(promoEval.bogo.length > 0 || promoEval.order.length > 0) && (
            <div className="promo-box">
              <div className="pb-title">
                <span>优惠活动</span>
              </div>
              {promoEval.bogo.map((ev) => (
                <div key={ev.promoId} className="promo-chip">
                  <label>
                    <input
                      type="checkbox"
                      disabled={!ev.eligible}
                      checked={choice.bogoIds.includes(ev.promoId)}
                      onChange={(e) =>
                        setChoice((c) => ({
                          ...c,
                          bogoIds: e.target.checked ? [...c.bogoIds, ev.promoId] : c.bogoIds.filter((x) => x !== ev.promoId)
                        }))
                      }
                    />
                    <span className={ev.eligible ? '' : 'p-hint'}>{ev.hint}</span>
                  </label>
                  <span className="p-amount">{ev.eligible ? `-${fmtYuan(ev.amountC)}` : '未满足'}</span>
                </div>
              ))}
              {promoEval.order.map((ev) => (
                <div key={ev.promoId} className="promo-chip">
                  <label>
                    <input
                      type="radio"
                      name="order-promo"
                      disabled={!ev.eligible}
                      checked={choice.orderPromoId === ev.promoId}
                      onChange={() => setChoice((c) => ({ ...c, orderPromoId: ev.promoId }))}
                    />
                    <span className={ev.eligible ? '' : 'p-hint'}>{ev.hint}</span>
                  </label>
                  <span className="p-amount">
                    {ev.eligible ? `-${fmtYuan(ev.amountC)}` : ev.gapC > 0 ? `还差${fmtYuan(ev.gapC)}` : ''}
                  </span>
                </div>
              ))}
              {promoEval.order.length > 0 && (
                <label className="promo-chip">
                  <input
                    type="radio"
                    name="order-promo"
                    checked={!choice.orderPromoId}
                    onChange={() => setChoice((c) => ({ ...c, orderPromoId: null }))}
                  />
                  <span>不使用整单优惠</span>
                </label>
              )}
            </div>
          )}

          {manual && (
            <div className="promo-box">
              <div className="pb-title">
                <span>临时优惠：{manual.title}</span>
                <button className="btn ghost sm" onClick={() => setManual(null)}>
                  取消
                </button>
              </div>
              <div className="promo-chip">
                <span>
                  {manual.percent ? `${manual.percent}%` : fmtYuan(manual.amountC ?? 0)} → 立减{' '}
                  <b className="p-amount">-{fmtYuan(totals.manual?.amountC ?? 0)}</b>
                </span>
              </div>
            </div>
          )}

          <div>
            <div className="pb-title" style={{ marginBottom: 6, color: 'var(--text-2)', fontSize: 12 }}>
              交易类型
            </div>
            <div className="mode-seg">
              <button className={mode === 'sale' ? 'on-sale' : ''} onClick={() => chooseMode('sale')}>
                普通
              </button>
              <button className={mode === 'presale' ? 'on-presale' : ''} onClick={() => chooseMode('presale')}>
                预售登记
              </button>
              <button className={mode === 'credit' ? 'on-credit' : ''} onClick={() => chooseMode('credit')}>
                赊账登记
              </button>
            </div>
          </div>

          {(isPresale || isCredit) && (
            <div className="buyer-box">
              <div style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>
                {isPresale
                  ? '预售：可当场收款，也可送货/取货时再收（选「🚚 送货时收款」）'
                  : '赊账：先取货，之后登记收款'}
              </div>
              <input
                className="input"
                placeholder="班级（如 高一(2)班）"
                value={buyer.klass}
                onChange={(e) => setBuyer((b) => ({ ...b, klass: e.target.value }))}
              />
              <input
                className="input"
                placeholder="姓名"
                value={buyer.name}
                onChange={(e) => setBuyer((b) => ({ ...b, name: e.target.value }))}
              />
              <input
                className="input"
                placeholder="备注（可选）"
                value={buyer.note ?? ''}
                onChange={(e) => setBuyer((b) => ({ ...b, note: e.target.value }))}
              />
            </div>
          )}

          {!isCredit && (
            <>
              <div>
                <div className="pb-title" style={{ marginBottom: 6, color: 'var(--text-2)', fontSize: 12 }}>
                  收款方式{isPresale ? '（预售可选稍后收）' : ''}
                </div>
                <div className="pay-seg">
                  <button className={pay === 'cash' ? 'on' : ''} onClick={() => setPay('cash')}>
                    💵 现金
                  </button>
                  <button className={pay === 'online' ? 'on' : ''} onClick={() => setPay('online')}>
                    📱 在线
                  </button>
                  {isPresale && (
                    <button className={pay === 'later' ? 'on' : ''} onClick={() => setPay('later')}>
                      🚚 送货时收款
                    </button>
                  )}
                </div>
              </div>

              {pay === 'later' && isPresale && (
                <div
                  className="promo-box"
                  style={{ background: '#fff7e8', borderStyle: 'solid', borderColor: '#f0d9a8' }}
                >
                  <span style={{ fontSize: 13 }}>
                    🚚 本次不收款。送货/取货时在「订单记录」里点 <b>交付并收款</b>，或先标记交付、之后再收。
                  </span>
                </div>
              )}

              {pay === 'cash' && totals.totalC > 0 && (
                <div>
                  <div className="cash-line">
                    <span>实收</span>
                    <input
                      className="input"
                      inputMode="decimal"
                      placeholder={centsToInput(totals.totalC)}
                      value={received}
                      onChange={(e) => setReceived(e.target.value)}
                    />
                  </div>
                  <div className="chips" style={{ marginTop: 6 }}>
                    {[totals.totalC, 500, 1000, 2000, 5000, 10000]
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .map((c) => (
                        <button key={c} onClick={() => setReceived(centsToInput(c))}>
                          {centsToInput(c)}
                        </button>
                      ))}
                  </div>
                  <div className="change-box" style={{ marginTop: 8 }}>
                    找零 <b>{fmtYuan(changeCents)}</b>
                  </div>
                </div>
              )}
            </>
          )}
          {isCredit && (
            <div
              className="promo-box"
              style={{ background: 'var(--red-bg)', borderStyle: 'solid', borderColor: '#f3c9c9' }}
            >
              <span style={{ fontSize: 13 }}>
                ⏳ 赊账单本次不收款。之后请在「订单记录」里登记收款。
              </span>
            </div>
          )}

          <div className="totals">
            <div className="t-row">
              <span>商品小计</span>
              <span>{fmtCny(totals.subtotalC)}</span>
            </div>
            {totals.discountC > 0 && (
              <div className="t-row disc">
                <span>优惠（含临时优惠）</span>
                <span>-{fmtCny(totals.discountC)}</span>
              </div>
            )}
            <div className="tot-row">
              <span style={{ fontWeight: 600 }}>
                {isCredit ? '本次赊账' : isPresale ? '预售应收' : '应收'}
              </span>
              <span className="amount-big">{fmtYuan(totals.totalC)}</span>
            </div>
          </div>
        </div>

        <div className="foot-btn">
          <button className="btn primary" disabled={!canSubmit || busy} onClick={submit}>
            {busy
              ? '处理中…'
              : isCredit
                ? '确认赊账登记'
                : isPresale && pay === 'later'
                  ? `确认预售登记（暂不收款）`
                  : isPresale
                    ? `确认预售收款 ${fmtYuan(totals.totalC)}`
                    : pay === 'cash'
                      ? `收款 ${fmtYuan(totals.totalC)}`
                      : '确认已在线收款'}
          </button>
        </div>
      </div>

      {showManual && (
        <ManualModal
          totalC={totals.totalC}
          onClose={() => setShowManual(false)}
          onApply={(m) => {
            setManual(m)
            setShowManual(false)
          }}
        />
      )}

      {done && (
        <div className="success-mask">
          <div className="success-card">
            <div className="ok-ico">✅</div>
            <div className="big">收款完成</div>
            <div className="meta">
              单号 {done.order.id}
              <br />
              {!done.order.payment
                ? done.order.mode === 'credit'
                  ? '已登记赊账（待收款）'
                  : '已登记预售（暂未收款，交付时再收）'
                : done.order.payment.receivedYuan != null
                  ? `实收 ${moneyText(yuanToCents(done.order.payment.receivedYuan))}`
                  : '在线收款'}
              {done.order.payment?.changeYuan != null && done.order.payment.changeYuan > 0 && (
                <>
                  <br />
                  找零 {moneyText(yuanToCents(done.order.payment.changeYuan))}
                </>
              )}
              <br />
              {done.printOk
                ? `🖨️ 已自动打印小票 × ${settings.receiptCopies}`
                : '⚠️ 打印未成功：' + (done.printError || '')}
            </div>
            <button className="btn primary" onClick={() => setDone(null)}>
              开始下一单
            </button>
            {!done.printOk && (
              <button className="btn" style={{ marginTop: 8 }} onClick={() => reprintOrder(done.order)}>
                重试打印
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ManualModal(props: { totalC: number; onClose: () => void; onApply: (m: ManualDiscount) => void }) {
  const [kind, setKind] = useState<'amount' | 'percent'>('amount')
  const [amount, setAmount] = useState('')
  const [percent, setPercent] = useState('')
  const [note, setNote] = useState('')
  const toast = useToast((s) => s.toast)

  function apply() {
    if (kind === 'amount') {
      const c = parseYuanToCents(amount)
      if (c == null || c <= 0) {
        toast('请输入正确的金额')
        return
      }
      props.onApply({ title: note.trim() || '临时优惠', amountC: c })
    } else {
      const p = parseInt(percent, 10)
      if (Number.isNaN(p) || p <= 0 || p > 100) {
        toast('请输入 1-100 的百分比')
        return
      }
      props.onApply({ title: note.trim() || '临时优惠', percent: p })
    }
  }

  return (
    <div className="success-mask">
      <div className="modal">
        <div className="modal-head">
          <h3>添加临时优惠</h3>
          <button className="btn ghost sm" onClick={props.onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="mode-seg" style={{ marginBottom: 12 }}>
            <button className={kind === 'amount' ? 'on-sale' : ''} onClick={() => setKind('amount')}>
              减金额
            </button>
            <button className={kind === 'percent' ? 'on-sale' : ''} onClick={() => setKind('percent')}>
              打折 %
            </button>
          </div>
          {kind === 'amount' ? (
            <Field label="减免金额（元）">
              <input
                className="input"
                inputMode="decimal"
                placeholder="如 5 或 2.5"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </Field>
          ) : (
            <Field label="让利比例（%），如 10 = 九折">
              <input
                className="input"
                inputMode="numeric"
                placeholder="10"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
              />
            </Field>
          )}
          <Field label="备注（可选）" hint="如：现场活动价">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
            当前应收 {fmtYuan(props.totalC)}，优惠上限为应收金额。
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={props.onClose}>
            取消
          </button>
          <button className="btn primary" onClick={apply}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
