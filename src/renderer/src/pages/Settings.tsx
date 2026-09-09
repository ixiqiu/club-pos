import { useEffect, useState } from 'react'
import { useApp } from '../store/useApp'
import { useToast } from '../store/useToast'
import { buildReceiptLines, buildTestHtml, buildTestOrder } from '../../../shared/receipt'
import type { AppSettings, PrinterInfo } from '../../../shared/types'

export default function Settings() {
  const { settings, meta, setSettings, reload, init } = useApp()
  const toast = useToast((s) => s.toast)
  const [storeName, setStoreName] = useState(settings.storeName)
  const [storeNote, setStoreNote] = useState(settings.storeNote ?? '')
  const [width, setWidth] = useState<'58' | '80'>(String(settings.receiptWidthMm) as '58' | '80')
  const [copies, setCopies] = useState(String(settings.receiptCopies))
  const [footer, setFooter] = useState(settings.receiptFooter ?? '')
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [busy, setBusy] = useState(false)

  const refreshPrinters = async () => {
    const list = await window.clubpos.listPrinters()
    setPrinters(list)
    toast(`发现 ${list.length} 台打印机`)
  }

  useEffect(() => {
    refreshPrinters()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 汇总表单里尚未保存的小票设置（保存/测试共用） */
  function draftReceiptSettings(): AppSettings {
    return {
      ...settings,
      storeName: storeName.trim() || '社团收银台',
      storeNote: storeNote.trim() || undefined,
      receiptWidthMm: width === '80' ? 80 : 58,
      receiptCopies: Math.min(10, Math.max(1, parseInt(copies, 10) || 2)),
      receiptFooter: footer.trim() || undefined
    }
  }

  async function save() {
    await setSettings({
      storeName: storeName.trim() || '社团收银台',
      storeNote: storeNote.trim() || undefined,
      receiptWidthMm: width === '80' ? 80 : 58,
      receiptCopies: Math.min(10, Math.max(1, parseInt(copies, 10) || 2)),
      receiptFooter: footer.trim() || undefined
    })
    toast('设置已保存')
  }

  async function savePrinter(name: string) {
    await setSettings({ printerName: name })
  }

  async function savePrintMode(mode: 'escpos' | 'system') {
    await setSettings({ printMode: mode })
    toast(mode === 'escpos' ? '已切换为小票直打（ESC/POS）' : '已切换为系统打印（HTML）')
  }

  async function testPrint() {
    setBusy(true)
    try {
      const receiptSettings = draftReceiptSettings()
      const r = await window.clubpos.printHtml({
        html: buildTestHtml(receiptSettings),
        lines: buildReceiptLines(buildTestOrder(), receiptSettings),
        deviceName: settings.printerName || undefined,
        copies: 1,
        docName: '社团收银台测试小票',
        mode: settings.printMode
      })
      toast(r.ok ? '测试小票已发送打印' : '打印失败：' + (r.error || ''))
    } finally {
      setBusy(false)
    }
  }

  async function changeDataRoot() {
    if (
      !window.confirm(
        '将把当前数据（store.json 账本与每日备份）复制到你选择的新目录，并切换程序使用新位置。\n\n原目录文件会保留，确认无误后可自行删除。\n\n继续？'
      )
    )
      return
    try {
      const r = await window.clubpos.chooseDataDir()
      if (!r) return
      if (!r.ok) return toast('更改失败：' + (r.error || '未知错误'))
      await init()
      toast('数据目录已迁移：' + r.dataRoot)
    } catch (e) {
      toast('更改失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function importData(mode: 'replace' | 'merge') {
    const tip =
      mode === 'replace'
        ? '将用备份文件【整体替换】当前数据（建议先导出当前备份）。继续？'
        : '将以【合并】方式导入：同 id 的记录会被覆盖。继续？'
    if (!window.confirm(tip)) return
    try {
      const r = await window.clubpos.importData(mode)
      if (!r) return toast('已取消')
      await reload()
      toast(`导入完成：商品 ${r.products}、优惠 ${r.promotions}、订单 ${r.orders}`)
    } catch (e) {
      toast('导入失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function applySample() {
    if (!window.confirm('将加入一批示例商品和优惠（不会删除现有数据）。继续？')) return
    const d = await window.clubpos.applySample()
    useApp.setState({ products: d.products, promotions: d.promotions })
    toast('已载入示例数据')
  }

  async function resetAll() {
    if (!window.confirm('将先自动备份当前数据，然后清空全部商品/优惠/订单。确认继续？')) return
    if (!window.confirm('再次确认：真的要清空所有数据吗？')) return
    const d = await window.clubpos.reset()
    useApp.setState({ products: d.products, promotions: d.promotions, orders: d.orders, settings: d.settings })
    toast('已重置为空数据（备份在数据目录 backups 中）')
  }

  const printerSelected = settings.printerName || ''

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-head">
        <h2>设置</h2>
      </div>

      <Section title="店铺 / 小票抬头">
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>店名 / 社团名</label>
            <input className="input" value={storeName} onChange={(e) => setStoreName(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>副标题（可选）</label>
            <input className="input" value={storeNote} onChange={(e) => setStoreNote(e.target.value)} placeholder="如摊位地址 / 标语" />
          </div>
        </div>
        <div className="field">
          <label>票尾文字</label>
          <input className="input" value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="谢谢惠顾，欢迎再来！" />
        </div>
        <div className="row">
          <button className="btn primary" onClick={save}>
            保存设置
          </button>
        </div>
      </Section>

      <Section title="小票打印">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="field">
            <label>纸张宽度</label>
            <select className="select" style={{ width: 120 }} value={width} onChange={(e) => setWidth(e.target.value as '58' | '80')}>
              <option value="58">58mm</option>
              <option value="80">80mm</option>
            </select>
          </div>
          <div className="field">
            <label>自动打印份数</label>
            <input
              className="input"
              style={{ width: 90 }}
              inputMode="numeric"
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>指定小票打印机（留空 = 系统默认）</label>
            <div className="row">
              <select
                className="select"
                value={printerSelected}
                onChange={(e) => savePrinter(e.target.value)}
              >
                <option value="">（系统默认打印机）</option>
                {printers.map((p) => (
                  <option key={p.deviceName} value={p.deviceName}>
                    {p.displayName}
                    {p.isDefault ? '（默认）' : ''}
                  </option>
                ))}
              </select>
              <button className="btn" onClick={refreshPrinters}>
                刷新
              </button>
            </div>
          </div>
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>打印方式</label>
          <select
            className="select"
            style={{ width: 280 }}
            value={settings.printMode ?? 'system'}
            onChange={(e) => savePrintMode(e.target.value as 'escpos' | 'system')}
          >
            <option value="escpos">🖨️ 小票直打（ESC/POS，推荐 Windows）</option>
            <option value="system">系统打印（HTML，备用）</option>
          </select>
          <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 4 }}>
            {settings.printMode === 'escpos'
              ? '使用打印机内置点阵字体：清晰、不裁切、数据小不乱码。要求打印机支持 RAW 透传（得力官方驱动即可；若不行，在 Windows 把驱动换成系统自带 Generic / Text Only）。'
              : '走打印机驱动渲染 HTML：兼容性最广，但 58mm 窄纸下可能遇到字号偏小/裁切/乱码。'}
          </div>
        </div>
        <div style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.8 }}>
          💡 提示：先按上面的「保存设置」，再点下面打印测试页，确认小票机出纸正常。
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" disabled={busy} onClick={testPrint}>
            🖨️ 打印测试小票
          </button>
          <button className="btn" onClick={save}>
            先保存以上设置
          </button>
        </div>
      </Section>

      <Section title="数据与备份">
        <div className="field">
          <label>数据目录（拷贝此文件夹即可完整迁移）</label>
          <div className="row">
            <code style={{ flex: 1, background: '#f1f3f6', padding: '8px 10px', borderRadius: 8, fontSize: 12, wordBreak: 'break-all' }}>
              {meta?.dataRoot ?? '…'}
            </code>
            <button className="btn" onClick={() => window.clubpos.openDataDir()}>
              打开
            </button>
            <button className="btn" onClick={changeDataRoot}>
              📂 更改数据目录…
            </button>
          </div>
          <div style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.8 }}>
            此文件夹内含 <code>data/</code>（账本 store.json）与 <code>backups/</code>（每日备份），整体拷贝即可迁移到别的电脑。
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn" onClick={async () => toast((await window.clubpos.exportBackup()) ? '备份已导出' : '已取消')}>
            ⬇ 导出完整备份（JSON）
          </button>
          <button className="btn" onClick={() => importData('merge')}>
            导入备份（合并）
          </button>
          <button className="btn" onClick={() => importData('replace')}>
            导入备份（替换）
          </button>
          <button className="btn" onClick={applySample}>
            载入示例数据
          </button>
          <button className="btn danger" onClick={resetAll}>
            清空所有数据
          </button>
        </div>
        <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 8 }}>
          程序每天首次写入时会在 backups/ 自动留一份当日备份（保留最近 30 天）。
        </div>
      </Section>

      <Section title="关于">
        <div style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.9 }}>
          社团收银台 · 本地数据 · 支持 Windows / Linux
          <br />
          版本：{meta?.version || 'dev'} · 平台：{meta?.platform || '—'}
          <br />
          小票乱码？请检查打印驱动纸张尺寸设置（58mm 选 58×自动），并缩小字号或加大边距再试。
        </div>
      </Section>
    </div>
  )
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{props.title}</div>
      {props.children}
    </div>
  )
}
