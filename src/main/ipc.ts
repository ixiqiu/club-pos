import { dialog, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { dataStore, sampleStore, type Store } from './store'
import { listPrinters, printHtml } from './print'
import type {
  AppMeta,
  AppSettings,
  ImportResult,
  OrderDraft,
  OrderUpdate
} from '../shared/types'
import { SCHEMA_VERSION } from '../shared/types'

export function registerIpc(): void {
  ipcMain.handle('app:meta', (): AppMeta => {
    return {
      version: process.env.npm_package_version || '',
      platform: process.platform,
      dataDir: dataStore.dataDir
    }
  })

  ipcMain.handle('data:load', async () => {
    const s = await dataStore.init()
    return {
      schemaVersion: SCHEMA_VERSION,
      app: 'club-pos',
      data: s
    }
  })

  ipcMain.handle('data:saveProducts', async (_e, products) => {
    const s = await dataStore.replaceProducts(products)
    return { data: s }
  })

  ipcMain.handle('data:savePromotions', async (_e, promotions) => {
    const s = await dataStore.replacePromotions(promotions)
    return { data: s }
  })

  ipcMain.handle('data:saveSettings', async (_e, patch: Partial<AppSettings>) => {
    const s = await dataStore.replaceSettings(patch)
    return { data: s }
  })

  ipcMain.handle('data:applySample', async () => {
    const base = await dataStore.init()
    const sample = sampleStore()
    const merged: Store = {
      products: dataStore.mergeBy(base.products, sample.products),
      promotions: dataStore.mergeBy(base.promotions, sample.promotions),
      orders: base.orders,
      settings: base.settings
    }
    const s = await dataStore.replace(merged)
    return { data: s }
  })

  ipcMain.handle('data:reset', async () => {
    await dataStore.makeManualBackup()
    const s = await dataStore.replace({
      products: [],
      promotions: [],
      orders: [],
      settings: { ...(await dataStore.init()).settings }
    })
    return { data: s }
  })

  ipcMain.handle('orders:create', async (_e, draft: OrderDraft) => {
    try {
      const order = await dataStore.createOrder(draft)
      return { order }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('orders:update', async (_e, mutation: OrderUpdate) => {
    try {
      const order = await dataStore.updateOrder(mutation.id, {
        status: mutation.status,
        payment: mutation.payment,
        event: mutation.event
      })
      return { order }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('data:exportBackup', async () => {
    const s = await dataStore.init()
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const name = `备份-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出完整备份',
      defaultPath: name,
      filters: [{ name: 'JSON 备份', extensions: ['json'] }]
    })
    if (canceled || !filePath) return null
    const payload = { schemaVersion: SCHEMA_VERSION, app: 'club-pos', exportedAt: Date.now(), data: s }
    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8')
    return filePath
  })

  ipcMain.handle('data:exportCsv', async (_e, content: string, suggestedName: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出报表',
      defaultPath: suggestedName,
      filters: [
        { name: 'CSV 表格', extensions: ['csv'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (canceled || !filePath) return null
    await writeFile(filePath, content, 'utf-8')
    return filePath
  })

  ipcMain.handle('data:import', async (_e, mode: 'replace' | 'merge'): Promise<ImportResult | null> => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择备份文件导入',
      properties: ['openFile'],
      filters: [{ name: 'JSON 备份', extensions: ['json'] }]
    })
    if (canceled || filePaths.length === 0) return null
    const { readFile } = await import('node:fs/promises')
    const raw = await readFile(filePaths[0], 'utf-8')
    const incoming = dataStore.parseBackup(raw)
    const cur = await dataStore.init()
    let next: Store
    if (mode === 'replace') {
      next = incoming
    } else {
      next = {
        products: dataStore.mergeBy(cur.products, incoming.products),
        promotions: dataStore.mergeBy(cur.promotions, incoming.promotions),
        orders: dataStore.mergeBy(cur.orders, incoming.orders),
        settings: incoming.settings
      }
    }
    await dataStore.replace(next)
    return {
      mode,
      products: next.products.length,
      promotions: next.promotions.length,
      orders: next.orders.length
    }
  })

  ipcMain.handle('data:openDir', async () => {
    const s = await dataStore.init()
    shell.openPath(dataStore.dataDir)
    void s
  })

  ipcMain.handle('printer:list', async () => {
    return listPrinters()
  })

  ipcMain.handle('printer:print', async (_e, options: { html: string; deviceName?: string; copies?: number }) => {
    return printHtml(options)
  })
}
