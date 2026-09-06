// Preload：安全地向渲染进程暴露 IPC API
import { contextBridge, ipcRenderer } from 'electron'
import type { ClubPosApi } from '../shared/types'

const api: ClubPosApi = {
  meta: () => ipcRenderer.invoke('app:meta'),
  load: () => ipcRenderer.invoke('data:load'),
  saveProducts: (products) => ipcRenderer.invoke('data:saveProducts', products),
  savePromotions: (promotions) => ipcRenderer.invoke('data:savePromotions', promotions),
  saveSettings: (patch) => ipcRenderer.invoke('data:saveSettings', patch),
  applySample: () => ipcRenderer.invoke('data:applySample'),
  reset: () => ipcRenderer.invoke('data:reset'),
  createOrder: (draft) => ipcRenderer.invoke('orders:create', draft),
  updateOrder: (mutation) => ipcRenderer.invoke('orders:update', mutation),
  exportBackup: () => ipcRenderer.invoke('data:exportBackup'),
  exportCsv: (content, suggestedName) => ipcRenderer.invoke('data:exportCsv', content, suggestedName),
  importData: (mode) => ipcRenderer.invoke('data:import', mode),
  openDataDir: () => ipcRenderer.invoke('data:openDir'),
  chooseDataDir: () => ipcRenderer.invoke('data:chooseDataDir'),
  listPrinters: () => ipcRenderer.invoke('printer:list'),
  printHtml: (options) => ipcRenderer.invoke('printer:print', options)
}

contextBridge.exposeInMainWorld('clubpos', api)
