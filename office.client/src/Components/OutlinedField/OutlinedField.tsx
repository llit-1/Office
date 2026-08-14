import React from "react";
import styles from "./OutlinedField.module.css";

type OutlinedFieldProps = {
  label: string;
  htmlFor: string;
  labelId?: string;
  labelVisible?: boolean;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
};

const OutlinedField = React.forwardRef<HTMLDivElement, OutlinedFieldProps>(
  ({ label, htmlFor, labelId, labelVisible = true, disabled = false, className, children }, ref) => (
    <div
      ref={ref}
      className={`${styles.field} ${disabled ? styles.disabled : ""} ${className ?? ""}`}
    >
      <label
        id={labelId}
        className={labelVisible ? styles.label : styles.visuallyHiddenLabel}
        htmlFor={htmlFor}
      >
        {label}
      </label>

      {children}

      <fieldset className={styles.outline} aria-hidden="true">
        <legend
          className={!labelVisible ? styles.outlineLegendHidden : undefined}
          data-label={labelVisible ? label : undefined}
        />
      </fieldset>
    </div>
  ),
);

OutlinedField.displayName = "OutlinedField";

export default OutlinedField;
