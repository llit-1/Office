import React, { useId } from "react";
import OutlinedField from "../OutlinedField/OutlinedField";
import styles from "./Textarea.module.css";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  wrapperClassName?: string;
  labelVisible?: boolean;
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, className, wrapperClassName, labelVisible = true, ...rest }, ref) => {
    const generatedId = useId();
    const textareaId = rest.id ?? generatedId;

    return (
      <OutlinedField
        label={label}
        htmlFor={textareaId}
        labelVisible={labelVisible}
        disabled={rest.disabled}
        className={`${styles.textareaWrapper} ${wrapperClassName ?? ""}`}
      >
        <textarea
          id={textareaId}
          ref={ref}
          className={`${styles.textarea} ${className ?? ""}`}
          {...rest}
        />
      </OutlinedField>
    );
  },
);

Textarea.displayName = "Textarea";

export default Textarea;
