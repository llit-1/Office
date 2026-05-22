import React from 'react'
import styles from './ConnectField.module.css'
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';

export interface ConnectFieldProps {
  checked?: boolean
  label?: React.ReactNode
  onClick?: () => void
}

const ConnectField : React.FC<ConnectFieldProps> = ({
    checked,
    label,
    onClick,
}) => {
  return (
    <label className={styles.connectField_container} onClick={onClick}>
        {label ? <span className={styles.label}>{label}</span> : null}

        { checked ? (
            <CheckOutlinedIcon className={styles.iconChecked} />
        ) : (
            <CloseOutlinedIcon className={styles.iconUnchecked} />
        )}

    </label>
  )
}

export default ConnectField
