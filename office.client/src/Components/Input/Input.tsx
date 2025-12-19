import React from "react";
import styles from "./Input.module.css";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  className?: string;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, className, ...rest }, ref) => {
    return (
      <div className={styles.inputWrapper}>
        <label className={styles.label}>{label}</label>
        <input ref={ref} className={`${styles.input} ${className ?? ""}`} {...rest} />
      </div>
    );
  },
);

export default Input;