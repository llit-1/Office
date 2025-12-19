import React, { useId, useState } from 'react'
import styles from './Toggle.module.css'

export interface ToggleProps {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  small?: boolean
  id?: string
  label?: React.ReactNode
  ariaLabel?: string
}

export const Toggle: React.FC<ToggleProps> = ({
  checked: controlledChecked,
  defaultChecked,
  onChange,
  disabled = false,
  small = false,
  id,
  label,
  ariaLabel,
}) => {
  const autoId = useId()
  const inputId = id ?? `toggle-${autoId}`

  const [uncontrolledChecked, setUncontrolledChecked] = useState<boolean>(
    !!defaultChecked,
  )

  const isControlled = controlledChecked !== undefined
  const isChecked = isControlled ? !!controlledChecked : uncontrolledChecked

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked
    if (!isControlled) setUncontrolledChecked(next)
    onChange?.(next)
  }

  return (
    <label
      className={`${styles.toggle_container} ${disabled ? styles.toggle_disabled : ''}`}
      htmlFor={inputId}
    >
      <input
        id={inputId}
        aria-label={ariaLabel}
        aria-checked={isChecked}
        className={styles.toggle_input}
        type="checkbox"
        checked={isChecked}
        onChange={handleChange}
        disabled={disabled}
      />

      <span className={`${styles.toggle_switch} ${small ? styles.small : ''}`}>
        <span className={styles.toggle_handle} />
      </span>

      {label ? <span className={styles.label}>{label}</span> : null}
    </label>
  )
}

export default Toggle
