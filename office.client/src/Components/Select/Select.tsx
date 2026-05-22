import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./Select.module.css";
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

type OptionItem = { value: string; label: string };

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children" | "size"> & {
  label: string;
  options: Array<OptionItem> | string[];
  placeholder?: string;
  className?: string;
  wrapperClassName?: string;
  renderOption?: (option: OptionItem, selected: boolean) => React.ReactNode;
  search?: boolean;
  size?: "small" | "medium";
};

const normalizeOptions = (opts: Array<OptionItem> | string[]) =>
  opts.map((o) => (typeof o === "string" ? { value: o, label: o } : o));

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, placeholder, className, wrapperClassName, renderOption, disabled, search = false, size, ...rest }, ref) => {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const hiddenSelectRef = useRef<HTMLSelectElement | null>(null);
    const prevHiddenRef = useRef<HTMLSelectElement | null>(null);

    const restAny = rest as any;
    const registerRef = restAny.ref;
    const restProps = { ...restAny };
    if (restProps.ref) delete restProps.ref;

    const opts = useMemo(() => normalizeOptions(options || []), [options]);

    const initial = String(rest.value ?? rest.defaultValue ?? (opts[0] ? opts[0].value : ""));
    const [isOpen, setIsOpen] = useState(false);
    const [selected, setSelected] = useState<string>(initial);
    const [searchText, setSearchText] = useState("");

    // keep selected in sync when rest.value is controlled
    useEffect(() => {
      if ((restProps as any).value !== undefined) setSelected(String((restProps as any).value));
    }, [(restProps as any).value]);

    useEffect(() => {
      const onDoc = (e: MouseEvent) => {
        if (!rootRef.current) return;
        if (!rootRef.current.contains(e.target as Node)) setIsOpen(false);
      };

      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    useEffect(() => {
      if (!isOpen) setSearchText("");
    }, [isOpen]);

    const currentOption = opts.find((o) => String(o.value) === String(selected));
    const wrapperSizeClass = size === "small" ? styles.sizeSmall : size === "medium" ? styles.sizeMedium : "";
    const filteredOptions = useMemo(() => {
      if (!search) return opts;
      const query = searchText.trim().toLowerCase();
      if (!query) return opts;
      return opts.filter((item) => item.label.toLowerCase().includes(query));
    }, [opts, search, searchText]);

    const handleChoose = (value: string) => {
      setSelected(value);
      setIsOpen(false);

      // update hidden select for form libs
      if (hiddenSelectRef.current) hiddenSelectRef.current.value = value;

      // dispatch native events so form libraries detect the change
      if (hiddenSelectRef.current) {
        try {
          hiddenSelectRef.current.dispatchEvent(new Event('input', { bubbles: true }));
          hiddenSelectRef.current.dispatchEvent(new Event('change', { bubbles: true }));
        } catch {}
      }

      // call onChange if provided (e.g., react-hook-form register)
      if (typeof (rest as any).onChange === "function") {
        const ev = { target: { value } } as unknown as React.ChangeEvent<HTMLSelectElement>;
        (rest as any).onChange(ev);
      }
    };

    return (
      <div className={`${styles.selectWrapper} ${wrapperSizeClass} ${wrapperClassName ?? ""}`} ref={rootRef}>
        <label className={styles.label}>{label}</label>

        {/* hidden native select to keep compatibility with register/ref/onChange */}
        <select
          ref={(el) => {
            // cleanup previous listener
            if (prevHiddenRef.current && prevHiddenRef.current !== el) {
              try {
                const prev = prevHiddenRef.current as any;
                if (prev && prev.__rs_onChange) prev.removeEventListener("change", prev.__rs_onChange);
              } catch {}
            }

            hiddenSelectRef.current = el;
            prevHiddenRef.current = el;

            if (el) {
              const onChange = () => setSelected(String(el.value));
              try {
                (el as any).__rs_onChange = onChange;
                el.addEventListener("change", onChange);
              } catch {}
            }

            // call react-hook-form register ref if provided
            try {
              if (typeof registerRef === "function") registerRef(el);
            } catch {}

            // forward ref from parent if provided via forwardRef
            if (typeof ref === "function") ref(el as any);
            else if (ref && typeof ref === "object") (ref as React.MutableRefObject<HTMLSelectElement | null>).current = el;
          }}
          className={styles.hiddenNative}
          disabled={disabled}
          {...(restProps as React.SelectHTMLAttributes<HTMLSelectElement>)}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* visible custom control */}
        <div
          className={`${styles.customControl} ${disabled ? styles.disabled : ""} ${isOpen ? styles.open : ""} ${className ?? ""}`}
          onClick={() => { if (!disabled) setIsOpen((s) => !s); }}
          aria-disabled={disabled ? true : undefined}
        >
          <div className={styles.value}>{currentOption ? currentOption.label : placeholder}</div>
          <ArrowDropDownIcon className={styles.icon} />
        </div>

        {isOpen && (
          <div className={styles.optionsList} role="listbox">
            {search && (
              <div className={styles.searchBox}>
                <input
                  type="text"
                  className={styles.searchInput}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Поиск..."
                />
              </div>
            )}

            {filteredOptions.length === 0 && (
              <div className={styles.emptyState}>Ничего не найдено</div>
            )}

            {filteredOptions.map((o) => {
              const sel = String(o.value) === String(selected);
              return (
                <div
                  key={o.value}
                  role="option"
                  aria-selected={sel}
                  className={`${styles.option} ${sel ? styles.optionSelected : ""}`}
                  onClick={() => { if (!disabled) handleChoose(String(o.value)); }}
                >
                  {renderOption ? renderOption(o, sel) : o.label}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  },
);

export default Select;
