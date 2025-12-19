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
            <CheckOutlinedIcon sx={{ fill: "#F47920", width: "30px", height: "30px" }} />
        ) : (
            <CloseOutlinedIcon sx={{ fill: "gainsboro", width: "30px", height: "30px" }} />
        )}

    </label>
  )
}

export default ConnectField