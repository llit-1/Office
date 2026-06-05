import React from "react";
import styles from "./Checkbox.module.css";

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
  label: React.ReactNode;
  labelClassName?: string;
  size?: "sm" | "md";
};

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, labelClassName, disabled, size = "md", ...rest }, ref) => {
    return (
      <label
        className={`${styles.checkboxLabel} ${styles[`checkboxLabel_${size}`]} ${disabled ? styles.checkboxLabelDisabled : ""} ${labelClassName ?? ""}`}
      >
        <input
          ref={ref}
          type="checkbox"
          className={`${styles.checkboxInput} ${styles[`checkboxInput_${size}`]} ${className ?? ""}`}
          disabled={disabled}
          {...rest}
        />
        <span className={styles.labelText}>{label}</span>
      </label>
    );
  },
);

export default Checkbox;
