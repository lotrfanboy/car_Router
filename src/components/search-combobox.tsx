"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type SearchOption = { code: string; name: string; searchName?: string };

const key = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();

export function SearchCombobox({
  label,
  name,
  value,
  options,
  onChange,
  onSelect,
  onManual,
  selectedCode,
  disabled = false,
  placeholder,
  maxLength,
  loading = false,
  error = false,
  onRetry,
  required = false,
}: {
  label: string;
  name: string;
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  onSelect?: (option: SearchOption) => void;
  onManual?: () => void;
  selectedCode?: string;
  disabled?: boolean;
  placeholder: string;
  maxLength: number;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  required?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const popupRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const seen = new Set<string>();
    const unique = options.filter((option) => {
      const labelKey = key(option.name);
      if (!labelKey || seen.has(labelKey)) return false;
      seen.add(labelKey);
      return true;
    });
    const query = selectedCode ? "" : key(value);
    return unique
      .filter((option) =>
        key(`${option.name} ${option.searchName ?? ""}`).includes(query),
      )
      .sort((a, b) => {
        const prefix =
          Number(key(b.name).startsWith(query)) -
          Number(key(a.name).startsWith(query));
        return prefix || a.name.localeCompare(b.name, "pt-BR");
      })
      .slice(0, 50);
  }, [options, value, selectedCode]);
  useEffect(() => {
    if (!open || loading || error || !filtered[active]) return;
    const popup = popupRef.current;
    const option = popup?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!popup || !option) return;
    // The positioned popup is the option's offset parent. Keep all measurements
    // in layout pixels so CSS zoom does not multiply the scroll distance.
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < popup.scrollTop) popup.scrollTop = top;
    else if (bottom > popup.scrollTop + popup.clientHeight)
      popup.scrollTop = bottom - popup.clientHeight;
  }, [active, error, filtered, loading, open]);
  const choose = (option: SearchOption) => {
    if (onSelect) onSelect(option);
    else onChange(option.name);
    setOpen(false);
    setActive(-1);
    document.getElementById(id)?.focus();
  };
  return (
    <div
      className="search-combobox"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <label htmlFor={id}>{label}</label>
      <div className="search-combobox-input">
        <input
          id={id}
          name={name}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={
            open && !loading && !error && filtered.length
              ? `${id}-options`
              : undefined
          }
          aria-activedescendant={
            open && !loading && !error && filtered[active]
              ? `${id}-option-${active}`
              : undefined
          }
          required={required}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setActive(-1);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActive((index) =>
                loading || error
                  ? -1
                  : Math.min(index + 1, filtered.length - 1),
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActive((index) =>
                loading || error || !filtered.length
                  ? -1
                  : Math.max(index - 1, 0),
              );
            } else if (
              event.key === "Enter" &&
              open &&
              !loading &&
              !error &&
              active >= 0 &&
              filtered[active]
            ) {
              event.preventDefault();
              choose(filtered[active]);
            }
          }}
        />
        {value && (
          <button
            type="button"
            disabled={disabled}
            aria-label={`Limpar ${label}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange("");
              setActive(-1);
              setOpen(true);
              document.getElementById(id)?.focus();
            }}
          >
            ×
          </button>
        )}
      </div>
      {open && !disabled && (
        <div className="search-combobox-popup" ref={popupRef}>
          {loading ? (
            <p role="status">Carregando opções…</p>
          ) : error ? (
            <p role="status">
              Catálogo indisponível. Digite manualmente.{" "}
              {onRetry && (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onRetry}
                >
                  Tentar novamente
                </button>
              )}
            </p>
          ) : filtered.length === 0 ? (
            <p>Nenhuma opção. Digite manualmente.</p>
          ) : (
            <ul id={`${id}-options`} role="listbox" aria-label={label}>
              {filtered.map((option, index) => (
                <li
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={index === active}
                  key={option.code}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                  >
                    {option.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {onManual && value.trim() && (
            <button
              type="button"
              className="text-button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onManual();
                setOpen(false);
                setActive(-1);
              }}
            >
              Usar texto digitado em {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
