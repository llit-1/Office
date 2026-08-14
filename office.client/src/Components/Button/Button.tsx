import React from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "md", loading = false, leadingIcon, trailingIcon, className, children, disabled, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${className ?? ""}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <span className={styles.content} data-loading={loading || undefined}>
        {leadingIcon ? <span className={styles.icon} aria-hidden="true">{leadingIcon}</span> : null}
        <span className={styles.label}>{children}</span>
        {trailingIcon ? <span className={styles.icon} aria-hidden="true">{trailingIcon}</span> : null}
      </span>
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
    </button>
  ),
);

Button.displayName = "Button";

export default Button;
