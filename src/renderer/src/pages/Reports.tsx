import { useMemo, useState } from 'react'
import { useApp } from '../store/useApp'
import { useToast } from '../store/useToast'
import { moneyText } from '../components/ui'
import { buildOrdersCsv, buildProductSummaryCsv } from '../../../shared/csv'
import { dateStrOf, timeStrOf } from '../../../shared/order'
import { yuanToCents } from '../../../shared/money'

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
function addDays(t: number, days: number): number {
  return dayStart(new Date(t + days * 86400000))
}

export default function Reports() {
  const { orders } = useApp()
  const toast = useToast((s) => s.toast)
  const now = Date.now()
  const [preset, setPreset] = useState<Preset>('today')
  const [customFrom, setCustomFrom] = useState(dateStrOf(now))
  const [customTo, setCustomTo] = useState(dateStrOf(now))

  const [from, to] = useMemo<[number, number]>(() => {
    const today = dayStart(new Date())
    switch (preset) {
      case 'today':
        return [today, addDays(today, 1)]
      case 'yesterday':
        return [addDays(today, -1), today]
      case 'week': {
        const dow = new Date(today).getDay() || 7
        const mon = addDays(today, -(dow - 1))
        return [mon, addDays(mon, 7)]
      }
      case 'month': {
        const d = new Date()
        const m = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
        return [m, next]
      }
      case 'custom': {
        const p = (s: string) => new Date(s + 'T00:00:00').getTime()
        const f = p(customFrom)
        const t = p(customTo)
        return [Number.isFinite(f) ? f : 0, Number.isFinite(t) ? addDays(t, 1) : Infinity]
      }
    }
  }, [preset, customFrom, customTo, now])

  const list = useMemo(
    () =>
      orders
        .filter((o) => o.ts >= from && o.ts < to)
        .sort((a, b) => b.ts - a.ts),
    [orders, from, to]
  )
  const valid = list.filter((o) => o.status !== 'void')

  const stats = useMemo(() => {
    let paid = 0
    let cash = 0
    let online = 0
    let unpaid = 0
    let pendingQty = 0
    let pendingAmt = 0
    let discount = 0
    let count = 0
    for (const o of valid) {
      count++
      discount += o.subtotalYuan - o.totalYuan
      if (o.payment) {
        paid += o.totalYuan
        if (o.payment.method === 'cash') cash += o.totalYuan
        else online += o.totalYuan
      }
      if (o.status === 'unpaid') unpaid += o.totalYuan
      if (o.status === 'pending_pickup') {
        pendingQty++
        pendingAmt += o.totalYuan
      }
    }
    return { paid, cash, online, unpaid, pendingQty, pendingAmt, discount, count }
  }, [valid])

  const productRows = useMemo(() => buildProductSummaryCsv(valid).rows, [valid])

  const c = (n: number) => moneyText(yuanToCents(Math.round(n * 100) / 100))

  async function exportOrders() {
    const path = await window.clubpos.exportCsv(
      buildOrdersCsv(list),
      `订单明细_${customFrom}_${customTo}.csv`
    )
    toast(path ? '已导出：' + path.split(/[\\/]/).pop() : '已取消')
  }
  async function exportProducts() {
    const csv = buildProductSummaryCsv(valid).csv
    const path = await window.clubpos.exportCsv(csv, `商品汇总_${customFrom}_${customTo}.csv`)
    toast(path ? '已导出：' + path.split(/[\\/]/).pop() : '已取消')
  }
  async function exportBackup() {
    const path = await window.clubpos.exportBackup()
    toast(path ? '完整备份已导出：' + path.split(/[\\/]/).pop() : '已取消')
  }

  return (
    <div>
      <div className="page-head">
        <h2>收银报表</h2>
        <div className="row">
          <button className="btn" onClick={exportOrders}>
            ⬇ 导出订单明细
          </button>
          <button className="btn" onClick={exportProducts}>
            ⬇ 导出商品汇总
          </button>
          <button className="btn" onClick={exportBackup}>
            ⬇ 导出完整备份
          </button>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        {(
          [
            ['today', '今天'],
            ['yesterday', '昨天'],
            ['week', '本周'],
            ['month', '本月'],
            ['custom', '自定义']
          ] as [Preset, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            className={'btn sm ' + (preset === k ? 'primary' : '')}
            onClick={() => setPreset(k)}
          >
            {label}
          </button>
        ))}
        {preset === 'custom' && (
          <>
            <input type="date" className="input" style={{ width: 150 }} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <span>至</span>
            <input type="date" className="input" style={{ width: 150 }} value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </>
        )}
        <span style={{ color: 'var(--text-2)', marginLeft: 8 }}>
          {dateStrOf(from)} ~ {dateStrOf(to - 1)}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
        <Stat label="成交单数" value={String(stats.count)} sub="已排除作废单" />
        <Stat label="实收总额" value={c(stats.paid)} sub="现金+在线" accent />
        <Stat label="现金收款" value={c(stats.cash)} />
        <Stat label="在线收款" value={c(stats.online)} />
        <Stat label="赊账待收" value={c(stats.unpaid)} sub="尚未收回" warn={stats.unpaid > 0} />
        <Stat label="预售待取" value={`${stats.pendingQty} 单`} sub={c(stats.pendingAmt)} warn={stats.pendingQty > 0} />
        <Stat label="优惠让利" value={c(stats.discount)} sub="含临时优惠" />
        <Stat label="客单价" value={c(stats.count ? stats.paid / stats.count : 0)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card" style={{ padding: 12, overflow: 'auto' }}>
          <div className="pb-title" style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
            商品销量 TOP
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>商品</th>
                <th>分类</th>
                <th style={{ textAlign: 'right' }}>数量</th>
                <th style={{ textAlign: 'right' }}>金额</th>
              </tr>
            </thead>
            <tbody>
              {productRows.slice(0, 20).map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{r.category || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{r.qty}</td>
                  <td style={{ textAlign: 'right' }}>{moneyText(yuanToCents(Math.round(r.amountYuan * 100)))}</td>
                </tr>
              ))}
              {productRows.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-hint">该时段没有销售</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ padding: 12, overflow: 'auto' }}>
          <div className="pb-title" style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
            近期单据
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>单号</th>
                <th>类型</th>
                <th style={{ textAlign: 'right' }}>应收</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 30).map((o) => (
                <tr key={o.id}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{o.id}</td>
                  <td>{o.mode === 'presale' ? '预售' : o.mode === 'credit' ? '赊账' : '普通'}</td>
                  <td style={{ textAlign: 'right' }}>{c(o.totalYuan)}</td>
                  <td>
                    {o.status === 'void' ? (
                      <span className="badge gray">作废</span>
                    ) : o.status === 'pending_pickup' ? (
                      <span className="badge amber">待取货</span>
                    ) : o.status === 'unpaid' ? (
                      <span className="badge red">待收款</span>
                    ) : (
                      <span className="badge green">完成</span>
                    )}
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-hint">该时段没有单据</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {list.length > 0 && (
            <div style={{ color: 'var(--text-2)', fontSize: 12, marginTop: 6 }}>
              最近一条：{list[0] && `${dateStrOf(list[0].ts)} ${timeStrOf(list[0].ts)} ${list[0].id}`}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat(props: { label: string; value: string; sub?: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{props.label}</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          marginTop: 4,
          color: props.warn ? 'var(--amber)' : props.accent ? 'var(--brand-dark)' : 'var(--text)',
          fontVariantNumeric: 'tabular-nums'
        }}
      >
        {props.value}
      </div>
      {props.sub && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{props.sub}</div>}
    </div>
  )
}
