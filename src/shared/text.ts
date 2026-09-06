// 中日韩宽字符排版工具（小票用，等宽对齐）

/** 一个显示字符占几格：CJK/全角记 2，其余记 1 */
export function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0
    // 中日韩统一表意文字、假名、谚文、全角标点等
    if (
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0x3000 && code <= 0x303f)
    ) {
      w += 2
    } else {
      w += 1
    }
  }
  return w
}

function cjkChar(ch: string): boolean {
  return displayWidth(ch) === 2
}

/** 按显示宽度截取（不会从中间劈开 CJK 字符） */
export function truncateWidth(s: string, width: number): string {
  let w = 0
  let out = ''
  for (const ch of s) {
    const cw = cjkChar(ch) ? 2 : 1
    if (w + cw > width) break
    out += ch
    w += cw
  }
  return out
}

/** 文本按宽度换行，返回行数组 */
export function wrapWidth(s: string, width: number): string[] {
  const lines: string[] = []
  let cur = ''
  let w = 0
  for (const ch of s) {
    const cw = cjkChar(ch) ? 2 : 1
    if (w + cw > width && cur !== '') {
      lines.push(cur)
      cur = ''
      w = 0
    }
    cur += ch
    w += cw
  }
  if (cur !== '') lines.push(cur)
  return lines.length ? lines : ['']
}

/** 左对齐补齐到 width 格 */
export function padEnd(s: string, width: number, fill = ' '): string {
  const pad = width - displayWidth(s)
  return pad > 0 ? s + fill.repeat(pad) : s
}

/** 右对齐 */
export function padStart(s: string, width: number, fill = ' '): string {
  const pad = width - displayWidth(s)
  return pad > 0 ? fill.repeat(pad) + s : s
}

/** 居中对齐 */
export function center(s: string, width: number, fill = ' '): string {
  const w = displayWidth(s)
  if (w >= width) return s
  const left = Math.floor((width - w) / 2)
  return fill.repeat(left) + s + fill.repeat(width - w - left)
}

/** 把一整段文本按宽度换行并左对齐（自动处理超长行） */
export function formatBlock(s: string, width: number): string[] {
  const lines: string[] = []
  for (const raw of s.split('\n')) {
    for (const ln of wrapWidth(raw, width)) lines.push(padEnd(ln, width))
  }
  return lines
}
