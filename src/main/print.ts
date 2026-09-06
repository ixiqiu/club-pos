// 打印模块：把窄幅小票 HTML 静默发送到指定/默认打印机。
// 依赖已装好的打印机驱动（如得力小票机），走系统打印队列。

import { BrowserWindow } from 'electron'

export interface PrinterInfo {
  deviceName: string
  displayName: string
  isDefault: boolean
}

let hiddenWin: BrowserWindow | null = null

async function ensureWindow(): Promise<BrowserWindow> {
  if (hiddenWin && !hiddenWin.isDestroyed()) return hiddenWin
  hiddenWin = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true }
  })
  hiddenWin.on('closed', () => {
    hiddenWin = null
  })
  await hiddenWin.loadURL('about:blank')
  return hiddenWin
}

export async function listPrinters(): Promise<PrinterInfo[]> {
  const win = await ensureWindow()
  try {
    const printers = await win.webContents.getPrintersAsync()
    return printers.map((p) => ({
      deviceName: p.name,
      displayName: p.displayName || p.name,
      isDefault: p.isDefault
    }))
  } catch (e) {
    console.error('listPrinters failed', e)
    return []
  }
}

export interface PrintHtmlOptions {
  html: string
  deviceName?: string
  copies?: number
}

/** 打印 HTML；deviceName 为空时用系统默认打印机。copies 默认 1。 */
export async function printHtml(options: PrintHtmlOptions): Promise<{ ok: boolean; error?: string }> {
  try {
    const win = await ensureWindow()
    const copies = Math.max(1, Math.min(10, options.copies ?? 1))
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(options.html)
    await win.loadURL(dataUrl)
    await new Promise<void>((r) => setTimeout(r, 250))

    const printOpts: Electron.WebContentsPrintOptions = {
      silent: true,
      printBackground: false,
      deviceName: options.deviceName || '',
      copies: 1
    }
    for (let i = 0; i < copies; i++) {
      const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        win.webContents.print(printOpts, (success, failureReason) => {
          if (success) resolve({ ok: true })
          else resolve({ ok: false, error: failureReason || '未知打印错误' })
        })
      })
      if (!result.ok) return result
      if (i < copies - 1) await new Promise<void>((r) => setTimeout(r, 400))
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
