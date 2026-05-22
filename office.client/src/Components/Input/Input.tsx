import React from "react";
import styles from "./Input.module.css";

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string;
  className?: string;
  wrapperClassName?: string;
  maxLength?: number;
  labelVisible?: boolean;
  size?: "small" | "medium";
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, className, wrapperClassName, maxLength, labelVisible, size, ...rest }, ref) => {
    const wrapperSizeClass = size === "small" ? styles.sizeSmall : size === "medium" ? styles.sizeMedium : "";

    return (
      <div className={`${styles.inputWrapper} ${wrapperSizeClass} ${wrapperClassName ?? ""}`}>
        {labelVisible !== false && <label className={styles.label}>{label}</label>}
        <input ref={ref} className={`${styles.input} ${className ?? ""}`} {...rest} maxLength={maxLength} />
      </div>
    );
  },
);

export default Input;
