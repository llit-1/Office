import React, { useEffect, useRef, useState } from 'react'
import styles from './CustomSelect.module.css'

type Option = { value: string; label: string }

interface Props {
  options: Option[]
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
}

const CustomSelect: React.FC<Props> = ({ options, value, onChange, placeholder = 'Выберите', className = '' }) => {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | undefined>(value)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => setSelected(value), [value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(v: string) {
    setSelected(v)
    setOpen(false)
    onChange?.(v)
  }

  const selectedLabel = options.find((o) => o.value === selected)?.label ?? placeholder

  return (
    <div className={`${styles.wrapper} ${className}`} ref={ref}>
      <button
        type="button"
        className={styles.control}
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={styles.label}>{selectedLabel}</span>
        <span className={`${styles.chev} ${open ? styles.open : ''}`} />
      </button>

      {open && (
        <ul className={styles.list} role="listbox" tabIndex={-1}>
          {options.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === selected}
              className={`${styles.item} ${o.value === selected ? styles.selected : ''}`}
              onClick={() => handleSelect(o.value)}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default CustomSelect
