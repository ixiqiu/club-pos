import { describe, expect, it } from 'vitest'
import { parseYuanToCents, yuanToCents, fmtCny } from '../src/shared/money'
import { displayWidth, wrapWidth, padEnd, center, truncateWidth } from '../src/shared/text'

describe('money', () => {
  it('解析金额到分', () => {
    expect(parseYuanToCents('12')).toBe(1200)
    expect(parseYuanToCents('12.5')).toBe(1250)
    expect(parseYuanToCents('¥12.34')).toBe(1234)
    expect(parseYuanToCents('12.345')).toBeNull()
    expect(parseYuanToCents('abc')).toBeNull()
  })
  it('格式化', () => {
    expect(yuanToCents(3.5)).toBe(350)
    expect(fmtCny(350)).toBe('¥3.50')
  })
})

describe('text', () => {
  it('中英文宽度', () => {
    expect(displayWidth('abc')).toBe(3)
    expect(displayWidth('中文')).toBe(4)
    expect(displayWidth('a中')).toBe(3)
  })
  it('截断与换行', () => {
    expect(truncateWidth('abcdef', 3)).toBe('abc')
    const w = wrapWidth('你好世界啊', 6)
    expect(w[0]).toBe('你好世')
    expect(w[1]).toBe('界啊')
  })
  it('对齐', () => {
    expect(displayWidth(padEnd('可乐', 4))).toBe(4)
    expect(center('ab', 6).length).toBe(6)
    expect(displayWidth(center('ab', 6))).toBe(6)
  })
})
