import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import OutlinedField from "../OutlinedField/OutlinedField";
import styles from "./Select.module.css";
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

type OptionItem = { value: string; label: string };

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children" | "size"> & {
  label: string;
  hideLabel?: boolean;
  options: Array<OptionItem> | string[];
  placeholder?: string;
  className?: string;
  wrapperClassName?: string;
  renderOption?: (option: OptionItem, selected: boolean) => React.ReactNode;
  search?: boolean;
  portal?: boolean;
  size?: "small" | "medium";
};

const normalizeOptions = (opts: Array<OptionItem> | string[]) =>
  opts.map((o) => (typeof o === "string" ? { value: o, label: o } : o));

const getVisibleDropdownBounds = (element: HTMLElement) => {
  const viewportPadding = 12;
  let top = viewportPadding;
  let bottom = window.innerHeight - viewportPadding;
  let parent = element.parentElement;

  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent);
    if (/(auto|scroll|overlay|hidden|clip)/.test(`${style.overflow} ${style.overflowY}`)) {
      const rect = parent.getBoundingClientRect();
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
    }
    parent = parent.parentElement;
  }

  return { top, bottom };
};

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hideLabel = false, options, placeholder, className, wrapperClassName, renderOption, disabled, search = false, portal = true, size, ...rest }, ref) => {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const controlRef = useRef<HTMLButtonElement | null>(null);
    const optionsRef = useRef<HTMLDivElement | null>(null);
    const searchRef = useRef<HTMLInputElement | null>(null);
    const hiddenSelectRef = useRef<HTMLSelectElement | null>(null);
    const prevHiddenRef = useRef<HTMLSelectElement | null>(null);
    const generatedId = useId();
    const selectId = rest.id ?? generatedId;
    const labelId = `${selectId}-label`;
    const listboxId = `${selectId}-listbox`;

    const restAny = rest as any;
    const registerRef = restAny.ref;
    const restProps = { ...restAny };
    if (restProps.ref) delete restProps.ref;

    const opts = useMemo(() => normalizeOptions(options || []), [options]);

    const initial = String(rest.value ?? rest.defaultValue ?? "");
    const [isOpen, setIsOpen] = useState(false);
    const [selected, setSelected] = useState<string>(initial);
    const [searchText, setSearchText] = useState("");
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

    // keep selected in sync when rest.value is controlled
    useEffect(() => {
      if ((restProps as any).value !== undefined) setSelected(String((restProps as any).value));
    }, [(restProps as any).value]);

    useEffect(() => {
      const onDoc = (e: MouseEvent) => {
        const target = e.target as Node;
        if (rootRef.current?.contains(target) || optionsRef.current?.contains(target)) return;
        setIsOpen(false);
      };

      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    useEffect(() => {
      if (!isOpen) return;
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setIsOpen(false);
          controlRef.current?.focus();
        }
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [isOpen]);

    useEffect(() => {
      if (!isOpen) setSearchText("");
    }, [isOpen]);

    useEffect(() => {
      if (!isOpen) return;
      requestAnimationFrame(() => {
        if (search) searchRef.current?.focus();
        else optionsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
      });
    }, [isOpen, search]);

    const filteredOptions = useMemo(() => {
      if (!search) return opts;
      const query = searchText.trim().toLowerCase();
      if (!query) return opts;
      return opts.filter((item) => item.label.toLowerCase().includes(query));
    }, [opts, search, searchText]);

    const currentOption = opts.find((o) => String(o.value) === String(selected));
    const wrapperSizeClass = size === "small" ? styles.sizeSmall : size === "medium" ? styles.sizeMedium : "";
    const updateDropdownPosition = useCallback(() => {
      const control = controlRef.current;
      if (!control) return;

      const rect = control.getBoundingClientRect();
      const gap = 6;
      // A portaled dropdown is no longer clipped by scrollable/hidden ancestors
      // (most notably a modal body), so it may use the whole viewport.
      const bounds = portal
        ? { top: 12, bottom: window.innerHeight - 12 }
        : getVisibleDropdownBounds(control);
      const availableBelow = Math.max(0, bounds.bottom - rect.bottom - gap);
      const availableAbove = Math.max(0, rect.top - bounds.top - gap);
      const estimatedHeight = Math.min(260, (search ? 58 : 2) + Math.max(1, filteredOptions.length) * 42);
      const openUp = availableBelow < estimatedHeight && availableAbove > availableBelow;
      const availableHeight = openUp ? availableAbove : availableBelow;
      const maxHeight = Math.max(0, Math.min(260, availableHeight));

      if (portal) {
        setDropdownStyle({
          position: "fixed",
          left: rect.left,
          // Explicitly reset the opposite side: .optionsList has a default
          // `top`, which otherwise remains active when the menu opens upward.
          top: openUp ? "auto" : rect.bottom + gap,
          bottom: openUp ? window.innerHeight - rect.top + gap : "auto",
          right: "auto",
          width: rect.width,
          maxHeight,
          zIndex: 2000,
        });
        return;
      }

      setDropdownStyle({
        position: "absolute",
        left: 0,
        right: 0,
        top: openUp ? "auto" : `calc(100% + ${gap}px)`,
        bottom: openUp ? `calc(100% + ${gap}px)` : "auto",
        width: "100%",
        maxHeight,
        zIndex: 2000,
      });
    }, [filteredOptions.length, portal, search]);

    useLayoutEffect(() => {
      if (!isOpen) return;

      updateDropdownPosition();
      window.addEventListener("resize", updateDropdownPosition);
      window.addEventListener("scroll", updateDropdownPosition, true);

      return () => {
        window.removeEventListener("resize", updateDropdownPosition);
        window.removeEventListener("scroll", updateDropdownPosition, true);
      };
    }, [isOpen, updateDropdownPosition]);

    const handleChoose = (value: string) => {
      setSelected(value);
      setIsOpen(false);

      // update hidden select for form libs
      if (hiddenSelectRef.current) hiddenSelectRef.current.value = value;

      // Notify controlled consumers exactly once. Dispatching a native change
      // and then calling the React handler caused duplicate dependent requests.
      if (typeof (rest as any).onChange === "function") {
        const ev = { target: { value } } as unknown as React.ChangeEvent<HTMLSelectElement>;
        (rest as any).onChange(ev);
      }
    };

    const optionsList = isOpen ? (
      <div
        id={listboxId}
        ref={optionsRef}
        className={styles.optionsList}
        style={dropdownStyle}
        role="listbox"
        aria-labelledby={labelId}
      >
        {search && (
          <div className={styles.searchBox}>
            <input
              ref={searchRef}
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
              tabIndex={0}
              key={o.value}
              role="option"
              aria-selected={sel}
              className={`${styles.option} ${sel ? styles.optionSelected : ""}`}
              onClick={() => { if (!disabled) handleChoose(String(o.value)); }}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                event.preventDefault();
                const optionElements = Array.from(optionsRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
                const index = optionElements.indexOf(event.currentTarget);
                const delta = event.key === "ArrowDown" ? 1 : -1;
                optionElements[(index + delta + optionElements.length) % optionElements.length]?.focus();
              }}
            >
              {renderOption ? renderOption(o, sel) : o.label}
            </div>
          );
        })}
      </div>
    ) : null;

    return (
      <OutlinedField
        ref={rootRef}
        label={label}
        labelId={labelId}
        htmlFor={selectId}
        labelVisible={!hideLabel}
        disabled={disabled}
        className={`${styles.selectWrapper} ${wrapperSizeClass} ${wrapperClassName ?? ""}`}
      >
        {/* hidden native select to keep compatibility with register/ref/onChange */}
        <select
          id={selectId}
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
          {!placeholder && !opts.some((option) => String(option.value) === "") && <option value="" />}
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
        <button
          type="button"
          ref={controlRef}
          className={`${styles.customControl} ${disabled ? styles.disabled : ""} ${isOpen ? styles.open : ""} ${className ?? ""}`}
          onClick={() => { if (!disabled) setIsOpen((s) => !s); }}
          aria-disabled={disabled ? true : undefined}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={isOpen ? listboxId : undefined}
          aria-labelledby={labelId}
          disabled={disabled}
        >
          <div className={styles.value}>{currentOption ? currentOption.label : placeholder}</div>
          <ArrowDropDownIcon className={styles.icon} />
        </button>

        {optionsList && (portal ? createPortal(optionsList, document.body) : optionsList)}
      </OutlinedField>
    );
  },
);

export default Select;
