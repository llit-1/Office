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
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, className, wrapperClassName, maxLength, labelVisible, size, ...rest }, ref) => {
    const generatedId = useId();
    const inputId = rest.id ?? generatedId;
    const wrapperSizeClass = size === "small" ? styles.sizeSmall : size === "medium" ? styles.sizeMedium : "";
    const showLabel = labelVisible !== false;

    return (
      <OutlinedField
        label={label}
        htmlFor={inputId}
        labelVisible={showLabel}
        disabled={rest.disabled}
        className={`${styles.inputWrapper} ${wrapperSizeClass} ${wrapperClassName ?? ""}`}
      >
        <input id={inputId} ref={ref} className={`${styles.input} ${className ?? ""}`} {...rest} maxLength={maxLength} />
      </OutlinedField>
    );
  },
);

export default Input;
