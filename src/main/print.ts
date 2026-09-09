// 打印模块：
//  - 'system' 模式：把窄幅小票 HTML 静默发送到系统打印队列（走打印机驱动）
//  - 'escpos' 模式：生成 ESC/POS 点阵指令，Windows 上以 RAW 数据直发打印队列
//    （使用打印机内置字体，58mm 32 列固定排版，字迹清晰不裁切、数据量小不乱码）

import { BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import iconv from 'iconv-lite'

const execFileAsync = promisify(execFile)

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

/** 系统默认打印机的队列名（用于 ESC/POS 未显式指定打印机时） */
async function defaultPrinterName(): Promise<string | null> {
  try {
    const win = await ensureWindow()
    const printers = await win.webContents.getPrintersAsync()
    return printers.find((p) => p.isDefault)?.name ?? printers[0]?.name ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 通用打印入口（收银/补打/测试都走这里）
// ---------------------------------------------------------------------------

export interface PrintTicketOptions {
  /** system 模式用：小票 HTML */
  html?: string
  /** escpos 模式用：等宽排版后的纯文本行（32/48 列） */
  lines?: string[]
  deviceName?: string
  copies?: number
  /** 打印任务名（Windows 打印队列里显示的名字） */
  docName?: string
  mode?: 'escpos' | 'system'
}

export async function printTicket(
  options: PrintTicketOptions
): Promise<{ ok: boolean; error?: string }> {
  if (options.mode === 'escpos') return escposPrint(options)
  return printHtml({ html: options.html ?? '', deviceName: options.deviceName, copies: options.copies })
}

// ---------------------------------------------------------------------------
// system 模式：HTML → 系统驱动打印
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// escpos 模式：生成 ESC/POS 指令并 RAW 直发
// ---------------------------------------------------------------------------

/** 把排版好的行转成 ESC/POS 字节流（GBK 编码文本，58mm 用 32 列行） */
function buildEscposBuffer(lines: string[]): Buffer {
  const parts: Buffer[] = []
  parts.push(Buffer.from([0x1b, 0x40])) // ESC @ 初始化打印机
  // ESC 3 30：行距 30/180 英寸，略紧凑
  parts.push(Buffer.from([0x1b, 0x33, 30]))
  for (const line of lines) {
    if (line === '') {
      parts.push(Buffer.from([0x0a]))
    } else {
      parts.push(iconv.encode(line, 'gbk'))
      parts.push(Buffer.from([0x0a]))
    }
  }
  // 底部走纸几行，方便从出纸口撕下
  parts.push(Buffer.from('\n\n\n\n'))
  return Buffer.concat(parts)
}

async function escposPrint(
  options: PrintTicketOptions
): Promise<{ ok: boolean; error?: string }> {
  try {
    const lines = options.lines
    if (!lines || lines.length === 0) {
      return { ok: false, error: '缺少小票内容（lines）' }
    }
    const copies = Math.max(1, Math.min(10, options.copies ?? 1))
    const parts: Buffer[] = []
    for (let i = 0; i < copies; i++) parts.push(buildEscposBuffer(lines))
    const data = Buffer.concat(parts)
    const docName = options.docName || '社团收银台小票'

    if (process.platform === 'win32') {
      let name = options.deviceName
      if (!name) {
        name = (await defaultPrinterName()) ?? ''
      }
      if (!name) return { ok: false, error: '未找到打印机，请先在设置里选择打印机' }
      return await printRawWindows(name, docName, data)
    }
    if (process.platform === 'linux') {
      return {
        ok: false,
        error: 'Linux 的 ESC/POS 直打支持开发中，请先使用「系统打印」方式'
      }
    }
    return { ok: false, error: '当前平台暂不支持 ESC/POS 直打' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Windows：通过打印队列以 RAW 数据类型发送原始字节（零 native 依赖） */
async function printRawWindows(
  printerName: string,
  docName: string,
  data: Buffer
): Promise<{ ok: boolean; error?: string }> {
  // assets/print-raw.ps1 在 asar 内，PowerShell 无法直接读取，先复制到临时目录
  const psSource = join(__dirname, '../../assets/print-raw.ps1')
  const tmpFile = join(tmpdir(), `clubpos-print-${Date.now()}-${Math.floor(Math.random() * 1e6)}.ps1`)
  try {
    await fs.copyFile(psSource, tmpFile)
    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      tmpFile,
      '-Printer',
      printerName,
      '-DocName',
      docName,
      '-DataBase64',
      data.toString('base64')
    ]
    const { stdout } = await execFileAsync('powershell.exe', args, {
      timeout: 30000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    })
    const out = (stdout || '').trim()
    if (out === 'OK') return { ok: true }
    return { ok: false, error: out.replace(/^ERR:/, '') || '打印失败' }
  } catch (e) {
    const err = e as { code?: string; message?: string; killed?: boolean }
    if (err?.killed) return { ok: false, error: '打印超时（30 秒），请检查打印机是否在线' }
    if (err?.code === 'ENOENT') return { ok: false, error: '找不到 powershell.exe（需要 Windows PowerShell）' }
    return { ok: false, error: err?.message || String(e) }
  } finally {
    await fs.unlink(tmpFile).catch(() => undefined)
  }
}
