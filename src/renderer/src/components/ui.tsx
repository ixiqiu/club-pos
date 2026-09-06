import type { ReactNode } from 'react'

export function Modal(props: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  return (
    <div
      className="modal-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose()
      }}
    >
      <div className="modal" style={{ width: props.width ?? 480 }}>
        <div className="modal-head">
          <h3>{props.title}</h3>
          <button className="btn ghost sm" onClick={props.onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{props.children}</div>
        {props.footer && <div className="modal-foot">{props.footer}</div>}
      </div>
    </div>
  )
}

export function Field(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <label>
        {props.label}
        {props.hint && <span style={{ color: 'var(--text-2)' }}>（{props.hint}）</span>}
      </label>
      {props.children}
    </div>
  )
}

export function Seg<T extends string | number>(props: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg">
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={props.value === o.value ? 'seg-on' : ''}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function moneyText(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}¥${(Math.abs(cents) / 100).toFixed(2)}`
}
