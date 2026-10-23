import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import styles from "./Select.module.scss";

export type SelectOption<T extends string | number> = { value: T; label: string; group?: string };

type Props<T extends string | number> = {
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  label: string; // what screen readers call it
  placeholder?: string;
  size?: "sm" | "md";
  full?: boolean;
  disabled?: boolean;
};

type Place = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };

const MAX_HEIGHT = 320;

// The site's dropdown, in place of the browser's own <select>. The list is
// drawn in a portal with fixed positioning, so a scrolling table or a card
// with overflow hidden can't clip it, and it opens upwards when there's more
// room above. Keyboard: arrows, Home/End, Enter/Space, Escape, and typing a
// letter jumps to the next option starting with it.
export function Select<T extends string | number>({ value, options, onChange, label, placeholder = "Choose", size = "md", full, disabled }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const listId = `${id}-list`;

  const selected = options.findIndex((o) => o.value === value);
  const current = options[selected];

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < Math.min(MAX_HEIGHT, 200) && above > below;
    const width = Math.max(r.width, 180);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPlace(up
      ? { left, width, bottom: window.innerHeight - r.top + 4, maxHeight: Math.min(MAX_HEIGHT, above) }
      : { left, width, top: r.bottom + 4, maxHeight: Math.min(MAX_HEIGHT, below) });
    setActive(Math.max(selected, 0));
    setOpen(true);
  }

  function close(refocus = true) {
    setOpen(false);
    // Without scrolling, so a choice that scrolls the page (Docs "Jump to") isn't undone.
    if (refocus) btnRef.current?.focus({ preventScroll: true });
  }

  function choose(i: number) {
    const o = options[i];
    if (o && o.value !== value) onChange(o.value);
    close();
  }

  // Clicks elsewhere close it; so does scrolling the page or resizing, since
  // the list is placed for where the button was.
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false);
    };
    const moved = (e: Event) => {
      if (!listRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const resized = () => setOpen(false);
    document.addEventListener("mousedown", outside);
    window.addEventListener("scroll", moved, true);
    window.addEventListener("resize", resized);
    listRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("scroll", moved, true);
      window.removeEventListener("resize", resized);
    };
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, listId]);

  function onButtonKey(e: KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      openMenu();
    }
  }

  function onListKey(e: KeyboardEvent) {
    const last = options.length - 1;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, last)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(last); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") { close(false); }
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase();
      const order = [...options.keys()].map((i) => (active + 1 + i) % options.length);
      const hit = order.find((i) => options[i]?.label.toLowerCase().startsWith(k));
      if (hit !== undefined) setActive(hit);
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`${styles.trigger} ${styles[size]}${full ? ` ${styles.full}` : ""}${open ? ` ${styles.triggerOpen}` : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${current?.label ?? placeholder}`}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onButtonKey}
      >
        <span className={current ? styles.value : styles.placeholder}>{current?.label ?? placeholder}</span>
        <ChevronDown size={13} className={styles.caret} aria-hidden />
      </button>

      {open && place && createPortal(
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${listId}-${active}`}
          tabIndex={-1}
          className={styles.list}
          style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight }}
          onKeyDown={onListKey}
        >
          {options.map((o, i) => (
            <div key={String(o.value)} role="presentation">
              {o.group && o.group !== options[i - 1]?.group && (
                <div className={styles.group} role="presentation">{o.group}</div>
              )}
              <div
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === selected}
                className={`${styles.option}${i === active ? ` ${styles.optionActive}` : ""}${i === selected ? ` ${styles.optionSelected}` : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
              >
                <span>{o.label}</span>
                {i === selected && <Check size={13} aria-hidden />}
              </div>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
