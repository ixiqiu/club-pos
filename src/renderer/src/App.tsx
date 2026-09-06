import { useEffect, useState } from 'react'
import Checkout from './pages/Checkout'
import Orders from './pages/Orders'
import Products from './pages/Products'
import Promotions from './pages/Promotions'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import { useApp } from './store/useApp'
import { useToast } from './store/useToast'
import logoUrl from './assets/logo.png'

type Page = 'checkout' | 'orders' | 'products' | 'promotions' | 'reports' | 'settings'

const NAV: { key: Page; label: string; ico: string }[] = [
  { key: 'checkout', label: '收银', ico: '🧾' },
  { key: 'orders', label: '订单记录', ico: '📋' },
  { key: 'reports', label: '收银报表', ico: '📊' },
  { key: 'products', label: '商品管理', ico: '🏷️' },
  { key: 'promotions', label: '优惠管理', ico: '🎁' },
  { key: 'settings', label: '设置', ico: '⚙️' }
]

export default function App() {
  const { loaded, init, settings, meta, orders } = useApp()
  const toastMsg = useToast((s) => s.msg)
  const [page, setPage] = useState<Page>('checkout')

  useEffect(() => {
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pendingBadges: Partial<Record<Page, number>> = {
    orders: orders.filter((o) => o.status === 'pending_pickup' || o.status === 'unpaid').length
  }

  if (!loaded) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <img src={logoUrl} alt="logo" style={{ height: 60, marginBottom: 12 }} />
          <div style={{ color: 'var(--text-2)' }}>正在加载数据…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <img src={logoUrl} alt="社团 logo" className="logo" style={{ height: 42, width: 'auto', maxWidth: 220, objectFit: 'contain' }} />
        <div className="store-name">{settings.storeName}</div>
        <div className="spacer" />
        <div style={{ color: 'var(--text-2)', fontSize: 12 }}>
          v{meta?.version || 'dev'} · {meta?.platform === 'win32' ? 'Windows' : meta?.platform === 'linux' ? 'Linux' : meta?.platform}
        </div>
      </div>
      <div className="app-body">
        <div className="nav">
          {NAV.map((n) => (
            <button key={n.key} className={page === n.key ? 'active' : ''} onClick={() => setPage(n.key)}>
              <span className="nav-ico">{n.ico}</span>
              <span style={{ flex: 1 }}>{n.label}</span>
              {(pendingBadges[n.key] ?? 0) > 0 && (
                <span className="badge red">{pendingBadges[n.key]}</span>
              )}
            </button>
          ))}
        </div>
        <div className="content">
          {page === 'checkout' && <Checkout />}
          {page === 'orders' && <Orders />}
          {page === 'reports' && <Reports />}
          {page === 'products' && <Products />}
          {page === 'promotions' && <Promotions />}
          {page === 'settings' && <Settings />}
        </div>
      </div>
      {toastMsg && (
        <div className="toast-wrap">
          <div className="toast">{toastMsg}</div>
        </div>
      )}
    </div>
  )
}
