// 金额工具：内部一律用「分」(整数) 计算，避免浮点误差

export function yuanToCents(yuan: number): number {
  return Math.round(yuan * 100)
}

export function centsToYuan(cents: number): number {
  return cents / 100
}

export function fmtYuan(cents: number): string {
  return (cents / 100).toFixed(2)
}

/** 显示为 ¥xx.xx，负数为 -¥xx.xx */
export function fmtCny(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}¥${Math.abs(cents / 100).toFixed(2)}`
}

/**
 * 解析用户输入的人民币字符串为「分」。
 * 支持 "12" "12.5" "12.50"；失败返回 null。
 */
export function parseYuanToCents(input: string): number | null {
  const s = input.trim().replace(/[¥￥,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [int, frac = ''] = s.split('.')
  const cents = parseInt(int, 10) * 100 + parseInt(frac.padEnd(2, '0') || '0', 10)
  return cents
}

/** 分 -> 输入框友好字符串（去掉多余 0 尾巴） */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, '')
}

export function clampCents(v: number): number {
  return Math.max(0, Math.round(v))
}
