// 小票生成：窄幅纯文本版面，避免串口打印机大文件乱码。
// 所有行按「半角格」对齐（中文算 2 格），打印前自行换行。

import type { AppSettings, Order } from './types'
import { fmtYuan } from './money'
import { center, formatBlock, padEnd, padStart, truncateWidth, wrapWidth } from './text'

/** 根据纸宽选择小票每行半角格数 */
export function receiptCols(widthMm: number): number {
  return widthMm >= 80 ? 48 : 32
}

function divider(cols: number): string {
  return '-'.repeat(cols)
}

/** 两列行：label 占 cols-10，右侧金额占 10 */
function amountRow(label: string, amount: string, cols: number, amountIsMoney = true): string {
  const lw = cols - 12
  const aw = 12
  const labelPart = truncateWidth(label, lw)
  const amountPart = amountIsMoney ? padStart(amount, aw) : padEnd(amount, aw)
  return padEnd(labelPart, lw) + amountPart
}

/** 生成小票文本行（不含 HTML） */
export function buildReceiptLines(order: Order, settings: AppSettings): string[] {
  const cols = receiptCols(settings.receiptWidthMm)
  const out: string[] = []

  out.push('')
  out.push(center(settings.storeName || '小票', cols, ' '))
  if (settings.storeNote) {
    for (const ln of formatBlock(settings.storeNote, cols)) out.push(ln)
  }
  out.push(divider(cols))

  // 类型醒目标注
  const modeTag =
    order.mode === 'presale' ? '★ 预售登记' : order.mode === 'credit' ? '★ 赊账登记' : ''
  const headerLine = `${order.id}`
  out.push(modeTag ? center(modeTag, cols) : '')
  out.push(padEnd(headerLine, cols - 9) + padStart(fmtDate(order.ts), 9))
  out.push(divider(cols))

  // 商品
  const nameCol = cols - 14
  const qtyCol = 6
  const amtCol = 8
  for (const it of order.items) {
    const priceCents = Math.round(it.priceYuan * 100)
    const amount = fmtYuan(priceCents * it.qty)
    const nameLines = wrapWidth(it.name, nameCol)
    for (let i = 0; i < nameLines.length; i++) {
      const namePart = padEnd(nameLines[i], nameCol)
      if (i === 0) {
        const qtyPart = padStart(`x${it.qty}`, qtyCol)
        const amtPart = padStart(amount, amtCol)
        out.push(namePart + qtyPart + amtPart)
      } else {
        out.push(namePart + ' '.repeat(qtyCol) + ' '.repeat(amtCol))
      }
    }
  }
  out.push(divider(cols))

  // 金额区
  const subtotalCents = Math.round(order.subtotalYuan * 100)
  const totalCents = Math.round(order.totalYuan * 100)
  const discountCents = subtotalCents - totalCents
  out.push(amountRow('商品小计', fmtYuan(subtotalCents), cols))
  for (const d of order.discounts) {
    out.push(amountRow(`优惠:${truncateWidth(d.title, 22)}`, `-${fmtYuan(Math.round(d.amountYuan * 100))}`, cols))
  }
  if (discountCents > 0 && order.discounts.length === 0) {
    out.push(amountRow('优惠合计', `-${fmtYuan(discountCents)}`, cols))
  }
  out.push(amountRow('应收金额', fmtYuan(totalCents), cols))

  // 收款
  if (order.mode === 'credit' && !order.payment) {
    out.push('')
    out.push('※ 赊账：未收款，待登记')
  } else if (order.mode === 'presale' && !order.payment) {
    out.push('')
    out.push('※ 预售：未收款，交付/取货时请收款')
  } else if (order.payment) {
    const methodText = order.payment.method === 'cash' ? '现金' : '在线收款'
    out.push(amountRow(`付款方式`, methodText, cols, false))
    if (order.payment.receivedYuan != null) {
      out.push(amountRow('实收金额', fmtYuan(Math.round(order.payment.receivedYuan * 100)), cols))
    }
    if (order.payment.changeYuan != null && order.payment.changeYuan > 0) {
      out.push(amountRow('找零', fmtYuan(Math.round(order.payment.changeYuan * 100)), cols))
    }
  }

  // 购买方
  if (order.buyer) {
    out.push(divider(cols))
    if (order.buyer.klass) out.push(padEnd(`班级：${order.buyer.klass}`, cols))
    if (order.buyer.name) out.push(padEnd(`姓名：${order.buyer.name}`, cols))
    if (order.buyer.note) {
      for (const ln of wrapWidth(`备注：${order.buyer.note}`, cols)) out.push(padEnd(ln, cols))
    }
  }

  if (order.mode === 'presale') {
    out.push('')
    out.push(center('取货时请出示本小票', cols))
  }

  // 状态提示
  if (order.status === 'pending_pickup') {
    out.push(center(order.payment ? '【预售 · 待取货】' : '【预售 · 待交付 · 未收款】', cols))
  }
  if (order.status === 'unpaid') out.push(center('【待收款】', cols))

  out.push('')
  if (settings.receiptFooter) {
    for (const ln of formatBlock(settings.receiptFooter, cols)) out.push(ln)
  }
  out.push('')
  out.push(center('— 单据仅作记录凭证 —', cols))
  out.push('')
  return out
}

function fmtDate(ts: number): string {
  const d = new Date(ts)
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 渲染成适合打印的窄幅 HTML */
export function buildReceiptHtml(order: Order, settings: AppSettings): string {
  const lines = buildReceiptLines(order, settings)
  const mm = settings.receiptWidthMm
  // 热敏纸的可打印区比纸宽小（58mm 纸约 48mm、80mm 纸约 72mm）。
  // 初始字号适中；打印页内联脚本会实测 pre 宽度，超宽自动缩字号，
  // 保证行尾右对齐的金额不会被裁掉（此前 13px 时整行约 62mm 超出 58mm 纸宽）。
  const fontSize = mm >= 80 ? 11 : 10
  const fitTargetMm = mm >= 80 ? 70 : 46
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<title>社团收银台小票 ${escapeHtml(order.id)}</title>
<style>
  @page { size: ${mm}mm auto; margin: 0; }
  html,body { margin:0; padding:0; }
  body {
    width: ${mm}mm;
    font-family: 'Sarasa Mono SC','Sarasa Term SC','Noto Sans Mono CJK SC','Noto Sans CJK SC','WenQuanYi Micro Hei Mono','Microsoft YaHei Mono','Microsoft YaHei','Courier New',monospace;
    font-size: ${fontSize}px;
  }
  pre { margin: 0; white-space: pre; }
</style></head>
<body><pre>${lines
    .map((l) => escapeHtml(l) || ' ')
    .join('\n')}</pre>
<script>
// 打印前自动把内容缩到可打印区内，避免右侧金额被裁
;(function () {
  var targetPx = (${fitTargetMm} / 25.4) * 96
  var pre = document.querySelector('pre')
  var bodyStyle = document.body.style
  if (!pre) return
  var fs = parseFloat(getComputedStyle(document.body).fontSize) || ${fontSize}
  for (var i = 0; i < 14 && fs > 5.5; i++) {
    if (pre.scrollWidth <= targetPx) break
    fs = fs - 0.5
    bodyStyle.fontSize = fs + 'px'
  }
})()
</script>
</body></html>`
}

/** 生成测试小票（用于设置里调试打印机），走相同排版路径 */
export function buildTestHtml(settings: AppSettings): string {
  const now = new Date()
  const pseudo: Order = {
    id: `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-9999`,
    ts: now.getTime(),
    mode: 'sale',
    items: [
      { productId: 'test1', name: '社团徽章（测试商品）', priceYuan: 5.5, qty: 2 },
      { productId: 'test2', name: '可乐', priceYuan: 3, qty: 1 }
    ],
    discounts: [{ kind: 'promo', title: '满10减1', amountYuan: 1 }],
    subtotalYuan: 14,
    totalYuan: 13,
    buyer: { klass: '示例班级', name: '测试员', note: '测试备注行' },
    payment: { method: 'cash', receivedYuan: 20, changeYuan: 7 },
    status: 'normal',
    events: []
  }
  return buildReceiptHtml(pseudo, { ...settings, receiptFooter: settings.receiptFooter || '打印机测试页' })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
