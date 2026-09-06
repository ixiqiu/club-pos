import { useState } from 'react'
import { useApp } from '../store/useApp'
import { useToast } from '../store/useToast'
import { Modal } from '../components/ui'
import { uid, type Promotion } from '../../../shared/types'

export default function Promotions() {
  const { promotions, products, setPromotions } = useApp()
  const toast = useToast((s) => s.toast)
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [creating, setCreating] = useState(false)

  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? '（已删除商品）'

  async function remove(pr: Promotion) {
    if (!window.confirm(`确定删除优惠「${pr.name}」？`)) return
    await setPromotions(promotions.filter((x) => x.id !== pr.id))
    toast('已删除')
  }

  async function toggleEnabled(pr: Promotion) {
    await setPromotions(promotions.map((x) => (x.id === pr.id ? { ...x, enabled: !x.enabled } : x)))
  }

  return (
    <div>
      <div className="page-head">
        <h2>优惠管理</h2>
        <button className="btn primary" onClick={() => setCreating(true)}>
          ＋ 新建优惠
        </button>
      </div>

      <div className="card">
        <table className="tbl">
          <thead>
            <tr>
              <th>名称</th>
              <th>规则</th>
              <th>状态</th>
              <th style={{ textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {promotions.map((pr) => (
              <tr key={pr.id}>
                <td style={{ fontWeight: 600 }}>{pr.name}</td>
                <td>
                  {pr.kind === 'threshold' && (
                    <span>整单满 ¥{pr.thresholdYuan} 减 ¥{pr.offYuan}</span>
                  )}
                  {pr.kind === 'discount' && (
                    <span>
                      整单 {(100 - pr.percentOff) / 10} 折（让利 {pr.percentOff}%）
                      {pr.minYuan ? `，满 ¥${pr.minYuan} 可用` : ''}
                    </span>
                  )}
                  {pr.kind === 'bogo' && (
                    <span>
                      买「{nameOf(pr.buyProductId)}」{pr.buyQty} 送「{nameOf(pr.getProductId)}」{pr.getQty}
                      {pr.buyProductId !== pr.getProductId ? '（需同时加入购物车）' : ''}
                    </span>
                  )}
                </td>
                <td>
                  <span className={'badge ' + (pr.enabled ? 'green' : 'gray')}>
                    {pr.enabled ? '启用中' : '停用'}
                  </span>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn sm" onClick={() => setEditing({ ...pr })}>
                    编辑
                  </button>{' '}
                  <button className="btn sm" onClick={() => toggleEnabled(pr)}>
                    {pr.enabled ? '停用' : '启用'}
                  </button>{' '}
                  <button className="btn sm danger" onClick={() => remove(pr)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {promotions.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-hint">
                    还没有优惠规则。支持：满减、整单折扣、指定商品买几送几
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <PromoModal
          initial={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSave={async (next) => {
            if (editing) {
              await setPromotions(promotions.map((x) => (x.id === next.id ? next : x)))
            } else {
              await setPromotions([...promotions, next])
            }
            setCreating(false)
            setEditing(null)
            toast(editing ? '已保存' : '已创建')
          }}
        />
      )}
    </div>
  )
}

function PromoModal(props: {
  initial: Promotion | null
  onClose: () => void
  onSave: (p: Promotion) => Promise<void>
}) {
  const { products } = useApp()
  const toast = useToast((s) => s.toast)
  const [kind, setKind] = useState<Promotion['kind']>(props.initial?.kind ?? 'threshold')
  const [name, setName] = useState(props.initial?.name ?? '')
  const [thresholdYuan, setThresholdYuan] = useState(
    props.initial?.kind === 'threshold' ? String(props.initial.thresholdYuan) : ''
  )
  const [offYuan, setOffYuan] = useState(
    props.initial?.kind === 'threshold' ? String(props.initial.offYuan) : ''
  )
  const [percentOff, setPercentOff] = useState(
    props.initial?.kind === 'discount' ? String(props.initial.percentOff) : ''
  )
  const [minYuan, setMinYuan] = useState(
    props.initial?.kind === 'discount' ? String(props.initial.minYuan ?? '') : ''
  )
  const [buyProductId, setBuyProductId] = useState(
    props.initial?.kind === 'bogo' ? props.initial.buyProductId : ''
  )
  const [buyQty, setBuyQty] = useState(
    props.initial?.kind === 'bogo' ? String(props.initial.buyQty) : ''
  )
  const [getProductId, setGetProductId] = useState(
    props.initial?.kind === 'bogo' ? props.initial.getProductId : ''
  )
  const [getQty, setGetQty] = useState(
    props.initial?.kind === 'bogo' ? String(props.initial.getQty) : ''
  )

  const num = (s: string) => {
    const n = parseFloat(s)
    return Number.isFinite(n) ? n : NaN
  }

  async function save() {
    if (!name.trim()) return toast('请填写优惠名称')
    const base = { id: props.initial?.id ?? uid('pr-'), name: name.trim(), enabled: props.initial?.enabled ?? true }
    let promo: Promotion
    if (kind === 'threshold') {
      const t = num(thresholdYuan)
      const o = num(offYuan)
      if (!(t > 0) || !(o > 0)) return toast('请填写正确的满/减金额')
      promo = { ...base, kind: 'threshold', thresholdYuan: t, offYuan: o }
    } else if (kind === 'discount') {
      const pct = num(percentOff)
      if (!(pct > 0 && pct <= 100)) return toast('让利比例需在 1-100 之间')
      const min = minYuan.trim() ? num(minYuan) : undefined
      if (min !== undefined && !(min > 0)) return toast('门槛金额不正确')
      promo = { ...base, kind: 'discount', percentOff: pct, minYuan: min }
    } else {
      const bq = num(buyQty)
      const gq = num(getQty)
      if (!buyProductId || !getProductId) return toast('请选择商品')
      if (!(bq >= 1) || !(gq >= 1)) return toast('数量需为正整数')
      promo = {
        ...base,
        kind: 'bogo',
        buyProductId,
        buyQty: Math.round(bq),
        getProductId,
        getQty: Math.round(gq)
      }
    }
    await props.onSave(promo)
  }

  const productsOpts = products.length > 0 && (
    <>
      {products.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </>
  )

  return (
    <Modal
      title={props.initial ? '编辑优惠' : '新建优惠'}
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>
            取消
          </button>
          <button className="btn primary" onClick={save}>
            保存
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="field">
          <label>优惠名称</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：满 20 减 3 / 社团折扣" />
        </div>
        <div className="field">
          <label>类型</label>
          <select
            className="select"
            value={kind}
            onChange={(e) => setKind(e.target.value as Promotion['kind'])}
          >
            <option value="threshold">满减（整单满 X 减 Y）</option>
            <option value="discount">整单折扣（按百分比）</option>
            <option value="bogo">指定商品买几送几</option>
          </select>
        </div>

        {kind === 'threshold' && (
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label>满（元）</label>
              <input className="input" inputMode="decimal" value={thresholdYuan} onChange={(e) => setThresholdYuan(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>减（元）</label>
              <input className="input" inputMode="decimal" value={offYuan} onChange={(e) => setOffYuan(e.target.value)} />
            </div>
          </div>
        )}

        {kind === 'discount' && (
          <>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>让利 %（10 = 九折）</label>
                <input className="input" inputMode="numeric" value={percentOff} onChange={(e) => setPercentOff(e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>满额门槛（可选）</label>
                <input className="input" inputMode="decimal" value={minYuan} onChange={(e) => setMinYuan(e.target.value)} placeholder="不限" />
              </div>
            </div>
            <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
              例：让利 10% = 整单 9 折；让利 20% = 8 折。
            </div>
          </>
        )}

        {kind === 'bogo' && (
          <>
            {products.length === 0 && (
              <div style={{ color: 'var(--brand-dark)', fontSize: 13, marginBottom: 8 }}>
                请先在「商品管理」中添加商品，再创建买赠优惠。
              </div>
            )}
            <div className="row">
              <div className="field" style={{ flex: 2 }}>
                <label>购买商品</label>
                <select className="select" value={buyProductId} onChange={(e) => setBuyProductId(e.target.value)}>
                  <option value="">选择商品…</option>
                  {productsOpts}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>买</label>
                <input className="input" inputMode="numeric" value={buyQty} onChange={(e) => setBuyQty(e.target.value)} placeholder="2" />
              </div>
            </div>
            <div className="row">
              <div className="field" style={{ flex: 2 }}>
                <label>赠送商品（可与上面相同）</label>
                <select className="select" value={getProductId} onChange={(e) => setGetProductId(e.target.value)}>
                  <option value="">选择商品…</option>
                  {productsOpts}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>送</label>
                <input className="input" inputMode="numeric" value={getQty} onChange={(e) => setGetQty(e.target.value)} placeholder="1" />
              </div>
            </div>
            <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
              同款买送：顾客共拿走 N 件时按每 (买+送) 个算一组；异款买送：需两种商品都加购。
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
