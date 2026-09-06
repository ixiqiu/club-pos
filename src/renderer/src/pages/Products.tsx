import { useMemo, useState } from 'react'
import { useApp } from '../store/useApp'
import { useToast } from '../store/useToast'
import { Modal, moneyText } from '../components/ui'
import { parseYuanToCents, yuanToCents } from '../../../shared/money'
import { uid, type Product } from '../../../shared/types'

export default function Products() {
  const { products, setProducts } = useApp()
  const toast = useToast((s) => s.toast)
  const [kw, setKw] = useState('')
  const [editing, setEditing] = useState<Product | null>(null)
  const [creating, setCreating] = useState(false)

  const list = useMemo(() => {
    const k = kw.trim().toLowerCase()
    return [...products]
      .sort((a, b) => a.createdAt - b.createdAt)
      .filter((p) => !k || p.name.toLowerCase().includes(k) || (p.category ?? '').toLowerCase().includes(k))
  }, [products, kw])

  async function remove(p: Product) {
    if (!window.confirm(`确定删除商品「${p.name}」？\n历史订单不受影响。`)) return
    await setProducts(products.filter((x) => x.id !== p.id))
    toast('已删除')
  }

  return (
    <div>
      <div className="page-head">
        <h2>商品管理</h2>
        <div className="row">
          <input
            className="input"
            style={{ width: 220 }}
            placeholder="搜索商品"
            value={kw}
            onChange={(e) => setKw(e.target.value)}
          />
          <button className="btn primary" onClick={() => setCreating(true)}>
            ＋ 添加商品
          </button>
        </div>
      </div>

      <div className="card" style={{ overflow: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>商品</th>
              <th>分类</th>
              <th style={{ textAlign: 'right' }}>单价</th>
              <th>状态</th>
              <th style={{ textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td>{p.category || '—'}</td>
                <td style={{ textAlign: 'right', color: 'var(--brand-dark)', fontWeight: 700 }}>
                  {moneyText(yuanToCents(p.price))}
                </td>
                <td>
                  <span className={'badge ' + (p.active ? 'green' : 'gray')}>
                    {p.active ? '出售中' : '已下架'}
                  </span>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    className="btn sm"
                    onClick={() => setEditing({ ...p })}
                  >
                    编辑
                  </button>{' '}
                  <button className="btn sm" onClick={() => toggleActive(p)}>
                    {p.active ? '下架' : '上架'}
                  </button>{' '}
                  <button className="btn sm danger" onClick={() => remove(p)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-hint">还没有商品，点右上角「添加商品」</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(creating || editing) && (
        <ProductModal
          initial={editing ?? null}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSave={async (next) => {
            if (editing) {
              await setProducts(products.map((x) => (x.id === next.id ? next : x)))
            } else {
              await setProducts([...products, next])
            }
            setCreating(false)
            setEditing(null)
            toast(editing ? '已保存' : '已添加')
          }}
        />
      )}
    </div>
  )

  async function toggleActive(p: Product) {
    await setProducts(products.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)))
  }
}

function ProductModal(props: {
  initial: Product | null
  onClose: () => void
  onSave: (p: Product) => Promise<void>
}) {
  const [name, setName] = useState(props.initial?.name ?? '')
  const [price, setPrice] = useState(
    props.initial ? String(props.initial.price).replace(/\.?0+$/, '') : ''
  )
  const [category, setCategory] = useState(props.initial?.category ?? '')
  const toast = useToast((s) => s.toast)

  async function save() {
    const cents = parseYuanToCents(price)
    if (!name.trim()) return toast('请填写商品名称')
    if (cents == null || cents < 0) return toast('请填写正确的单价')
    const p: Product = {
      id: props.initial?.id ?? uid('p-'),
      name: name.trim(),
      price: cents / 100,
      category: category.trim() || undefined,
      active: props.initial?.active ?? true,
      createdAt: props.initial?.createdAt ?? Date.now()
    }
    await props.onSave(p)
  }

  return (
    <Modal
      title={props.initial ? '编辑商品' : '添加商品'}
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
          <label>商品名称</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>单价（元）</label>
          <input
            className="input"
            inputMode="decimal"
            placeholder="如 3 或 3.5"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="field">
          <label>分类（可选）</label>
          <input
            className="input"
            placeholder="如：饮料、周边"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}
