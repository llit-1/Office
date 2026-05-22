import React from "react";
import styles from "./Checkbox.module.css";

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: React.ReactNode;
  labelClassName?: string;
};

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, labelClassName, disabled, ...rest }, ref) => {
    return (
      <label className={`${styles.checkboxLabel} ${disabled ? styles.checkboxLabelDisabled : ""} ${labelClassName ?? ""}`}>
        <input ref={ref} type="checkbox" className={`${styles.checkboxInput} ${className ?? ""}`} disabled={disabled} {...rest} />
        <span className={styles.labelText}>{label}</span>
      </label>
    );
  },
);

export default Checkbox;
