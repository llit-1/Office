import React, { useId } from "react";
import OutlinedField from "../OutlinedField/OutlinedField";
import styles from "./Input.module.css";

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string;
  className?: string;
  wrapperClassName?: string;
  maxLength?: number;
  labelVisible?: boolean;
  size?: "small" | "medium";
  /** Кнопки-иконки внутри поля у правого края. */
  endAdornment?: React.ReactNode;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, className, wrapperClassName, maxLength, labelVisible, size, endAdornment, ...rest }, ref) => {
    const generatedId = useId();
    const inputId = rest.id ?? generatedId;
    const wrapperSizeClass = size === "small" ? styles.sizeSmall : size === "medium" ? styles.sizeMedium : "";
    const showLabel = labelVisible !== false;
    const input = <input id={inputId} ref={ref} className={`${styles.input} ${className ?? ""}`} {...rest} maxLength={maxLength} />;

    return (
      <OutlinedField
        label={label}
        htmlFor={inputId}
        labelVisible={showLabel}
        disabled={rest.disabled}
        invalid={rest["aria-invalid"] === true || rest["aria-invalid"] === "true"}
        className={`${styles.inputWrapper} ${wrapperSizeClass} ${wrapperClassName ?? ""}`}
      >
        {endAdornment ? (
          <div className={styles.control} data-disabled={rest.disabled || undefined} data-readonly={rest.readOnly || undefined}>
            {input}
            <span className={styles.endAdornment}>{endAdornment}</span>
          </div>
        ) : input}
      </OutlinedField>
    );
  },
);

export default Input;
