import { useMemo, useState } from 'react'
import { useApp } from '../store/useApp'
import { useToast } from '../store/useToast'
import { Modal, Seg, moneyText } from '../components/ui'
import { buildReceiptHtml } from '../../../shared/receipt'
import { dateStrOf, timeStrOf } from '../../../shared/order'
import { fmtYuan, yuanToCents } from '../../../shared/money'
import type { Order, OrderStatus, PaymentMethod } from '../../../shared/types'
import './checkout.css'

const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  normal: { label: '完成', cls: 'green' },
  pending_pickup: { label: '待取货', cls: 'amber' },
  unpaid: { label: '待收款', cls: 'red' },
  void: { label: '已作废', cls: 'gray' }
}

const MODE_META: Record<string, string> = {
  sale: '普通',
  presale: '预售',
  credit: '赊账'
}

type Filter = 'all' | 'presale' | 'credit' | OrderStatus

export default function Orders() {
  const { orders, settings, reload } = useApp()
  const toast = useToast((s) => s.toast)
  const [filter, setFilter] = useState<Filter>('all')
  const [kw, setKw] = useState('')
  const [detail, setDetail] = useState<Order | null>(null)
  const [settle, setSettle] = useState<Order | null>(null)

  const list = useMemo(() => {
    const k = kw.trim().toLowerCase()
    return [...orders]
      .sort((a, b) => b.ts - a.ts)
      .filter((o) => {
        if (filter === 'presale') return o.mode === 'presale' && o.status !== 'void'
        if (filter === 'credit') return o.mode === 'credit' && o.status !== 'void'
        if (filter !== 'all') return o.status === filter
        return true
      })
      .filter((o) => !k || o.id.toLowerCase().includes(k) || o.buyer?.name.toLowerCase().includes(k))
  }, [orders, filter, kw])

  async function reprint(o: Order) {
    const html = buildReceiptHtml(o, settings)
    const pr = await window.clubpos.printHtml({
      html,
      deviceName: settings.printerName || undefined,
      copies: settings.receiptCopies
    })
    toast(pr.ok ? '已补打小票' : '补打失败：' + (pr.error || ''))
  }

  async function markPicked(o: Order) {
    if (!window.confirm(`确认「${o.id}」的预售商品已被取走？`)) return
    const r = await window.clubpos.updateOrder({ id: o.id, status: 'normal', event: { kind: 'picked' } })
    if (r.error) toast(r.error)
    else toast('已标记取货')
    await reload()
  }

  async function doSettle(o: Order, method: PaymentMethod) {
    const r = await window.clubpos.updateOrder({
      id: o.id,
      status: 'normal',
      payment: { method, receivedYuan: o.totalYuan, changeYuan: 0 },
      event: { kind: 'settled', method, amountYuan: o.totalYuan }
    })
    if (r.error) toast(r.error)
    else toast(`已登记收款 ${fmtYuan(yuanToCents(o.totalYuan))}`)
    setSettle(null)
    await reload()
  }

  async function voidOrder(o: Order) {
    if (!window.confirm(`确认作废订单「${o.id}」？\n作废后将从报表统计中剔除（留痕可查）。`)) return
    const r = await window.clubpos.updateOrder({ id: o.id, status: 'void', event: { kind: 'void' } })
    if (r.error) toast(r.error)
    else toast('已作废')
    await reload()
  }

  return (
    <div>
      <div className="page-head">
        <h2>订单记录</h2>
        <div className="row">
          <input
            className="input"
            style={{ width: 240 }}
            placeholder="搜索单号 / 姓名"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
          />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Seg<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: '全部' },
            { value: 'pending_pickup', label: '待取货(预售)' },
            { value: 'unpaid', label: '待收款(赊账)' },
            { value: 'normal', label: '已完成' },
            { value: 'void', label: '已作废' }
          ]}
        />
      </div>

      <div className="card" style={{ overflow: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>单号</th>
              <th>时间</th>
              <th>类型</th>
              <th>商品</th>
              <th>购买方</th>
              <th style={{ textAlign: 'right' }}>应收</th>
              <th>付款</th>
              <th>状态</th>
              <th style={{ textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => {
              const st = STATUS_META[o.status]
              return (
                <tr key={o.id}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{o.id}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {dateStrOf(o.ts)} {timeStrOf(o.ts)}
                  </td>
                  <td>
                    <span className={'badge ' + (o.mode === 'sale' ? 'gray' : o.mode === 'presale' ? 'amber' : 'red')}>
                      {MODE_META[o.mode]}
                    </span>
                  </td>
                  <td style={{ maxWidth: 280 }}>
                    {o.items.map((i) => `${i.name}×${i.qty}`).join('、')}
                  </td>
                  <td>{o.buyer ? `${o.buyer.klass} ${o.buyer.name}` : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{moneyText(yuanToCents(o.totalYuan))}</td>
                  <td>
                    {o.status === 'void'
                      ? '—'
                      : o.payment?.method === 'cash'
                        ? '现金'
                        : o.payment?.method === 'online'
                          ? '在线'
                          : '未收'}
                  </td>
                  <td>
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn sm" onClick={() => setDetail(o)}>
                      查看
                    </button>{' '}
                    <button className="btn sm" onClick={() => reprint(o)}>
                      补打
                    </button>{' '}
                    {o.status === 'pending_pickup' && (
                      <button className="btn sm green" onClick={() => markPicked(o)}>
                        已取货
                      </button>
                    )}
                    {o.status === 'unpaid' && (
                      <button className="btn sm green" onClick={() => setSettle(o)}>
                        登记收款
                      </button>
                    )}
                    {o.status !== 'void' && (
                      <button className="btn sm danger" onClick={() => voidOrder(o)}>
                        作废
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <div className="empty-hint">暂无记录</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <Modal title={`订单详情 ${detail.id}`} onClose={() => setDetail(null)} width={520}>
          <OrderDetail order={detail} />
        </Modal>
      )}

      {settle && (
        <SettleModal
          order={settle}
          onClose={() => setSettle(null)}
          onConfirm={(m) => doSettle(settle, m)}
        />
      )}
    </div>
  )
}

function OrderDetail({ order }: { order: Order }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="promo-box">
        <Row k="单号" v={order.id} />
        <Row k="时间" v={`${dateStrOf(order.ts)} ${timeStrOf(order.ts)}`} />
        <Row
          k="类型"
          v={order.mode === 'presale' ? '预售登记' : order.mode === 'credit' ? '赊账登记' : '普通销售'}
        />
        {order.buyer && (
          <>
            <Row k="班级" v={order.buyer.klass} />
            <Row k="姓名" v={order.buyer.name} />
            {order.buyer.note && <Row k="备注" v={order.buyer.note} />}
          </>
        )}
        <Row
          k="付款"
          v={
            order.payment?.method === 'cash'
              ? `现金 实收${order.payment.receivedYuan ?? ''} 找零${order.payment.changeYuan ?? ''}`
              : order.payment?.method === 'online'
                ? '在线收款'
                : '未收款（赊账）'
          }
        />
      </div>
      <div style={{ fontSize: 14 }}>
        {order.items.map((i) => (
          <div key={i.productId} className="t-row">
            <span>
              {i.name} × {i.qty}
            </span>
            <span>{fmtYuan(Math.round(i.priceYuan * i.qty * 100))}</span>
          </div>
        ))}
        <div className="t-row">
          <span>商品小计</span>
          <span>{moneyText(yuanToCents(order.subtotalYuan))}</span>
        </div>
        {order.discounts.map((d, idx) => (
          <div key={idx} className="t-row disc">
            <span>优惠：{d.title}</span>
            <span>-{fmtYuan(Math.round(d.amountYuan * 100))}</span>
          </div>
        ))}
        <div className="t-row" style={{ fontWeight: 700, fontSize: 16 }}>
          <span>应收</span>
          <span style={{ color: 'var(--brand-dark)' }}>{moneyText(yuanToCents(order.totalYuan))}</span>
        </div>
      </div>
      {order.events.length > 0 && (
        <div className="promo-box">
          <div className="pb-title">操作记录</div>
          {order.events.map((ev, i) => (
            <div key={i} style={{ fontSize: 13, color: 'var(--text-2)' }}>
              {dateStrOf(ev.at)} {timeStrOf(ev.at)} · {eventLabel(ev.kind)}
              {ev.amountYuan ? ` ${moneyText(yuanToCents(ev.amountYuan))}` : ''}
              {ev.method ? `（${ev.method === 'cash' ? '现金' : '在线'}）` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function eventLabel(kind: string): string {
  return (
    { picked: '已取货', settled: '登记收款', void: '作废', reprint: '补打' }[kind] ?? kind
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ color: 'var(--text-2)', minWidth: 48 }}>{k}</span>
      <span>{v}</span>
    </div>
  )
}

function SettleModal(props: { order: Order; onClose: () => void; onConfirm: (m: PaymentMethod) => void }) {
  const [method, setMethod] = useState<PaymentMethod>('cash')
  return (
    <Modal
      title="登记赊账收款"
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>
            取消
          </button>
          <button className="btn green" onClick={() => props.onConfirm(method)}>
            确认收款 {moneyText(yuanToCents(props.order.totalYuan))}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="promo-box">
          <Row k="单号" v={props.order.id} />
          <Row
            k="购买方"
            v={props.order.buyer ? `${props.order.buyer.klass} ${props.order.buyer.name}` : '—'}
          />
          <Row k="应收" v={moneyText(yuanToCents(props.order.totalYuan))} />
        </div>
        <Seg<PaymentMethod>
          value={method}
          onChange={setMethod}
          options={[
            { value: 'cash', label: '💵 现金收款' },
            { value: 'online', label: '📱 在线收款' }
          ]}
        />
      </div>
    </Modal>
  )
}
