import React, { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.css'
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: React.ReactNode
  children?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  closeOnBackdropClick?: boolean
  showClose?: boolean
  ariaLabel?: string
  panelClassName?: string
  headerClassName?: string
  bodyClassName?: string
  titleClassName?: string
  closeButtonClassName?: string
  headerActions?: React.ReactNode
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeOnBackdropClick = false,
  showClose = true,
  ariaLabel,
  panelClassName,
  headerClassName,
  bodyClassName,
  titleClassName,
  closeButtonClassName,
  headerActions,
}) => {
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const generatedTitleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return
    // save active element to restore focus on close
    previouslyFocused.current = document.activeElement as HTMLElement | null
    // lock body scroll
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // focus panel for accessibility
    requestAnimationFrame(() => {
      panelRef.current?.focus()
    })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ))
      if (focusable.length === 0) {
        e.preventDefault()
        panelRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      // restore focus
      previouslyFocused.current?.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={!ariaLabel && title ? generatedTitleId : undefined}
      className={styles.modal_backdrop}
      ref={backdropRef}
      onMouseDown={(event) => {
        if (closeOnBackdropClick && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={`${styles.modal_panel} ${styles[size] ?? ''} ${panelClassName ?? ''}`}
        ref={panelRef}
        tabIndex={-1}
      >
        <header className={`${styles.modal_header} ${headerClassName ?? ''}`}>
          <h3 id={generatedTitleId} className={`${styles.modal_title} ${titleClassName ?? ''}`}>{title}</h3>
          <div className={styles.modal_headerActions}>
            {headerActions}
            {showClose ? (
              <button
                type="button"
                aria-label="Закрыть"
                className={`${styles.modal_close} ${closeButtonClassName ?? ''}`}
                onClick={onClose}
              >
                <CloseOutlinedIcon className={styles.closeIcon} />
              </button>
            ) : null}
          </div>
        </header>

        <div className={`${styles.modal_body} ${bodyClassName ?? ''}`}>{children}</div>

      </div>
    </div>,
    document.body,
  )
}

export default Modal
