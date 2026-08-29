import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A dd/mm/yyyy date field. Native <input type="date"> renders mm/dd for many
 * browser locales, which contradicts every date the app displays — this field
 * speaks the same language as the data. Value in/out is ISO yyyy-mm-dd.
 */

function isoToDisplay(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function displayToIso(display: string): string | null {
  const trimmed = display.trim();
  if (!trimmed) return "";
  const m = trimmed.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function DateField({
  value,
  onChange,
  label,
  placeholder = "dd/mm/yyyy",
}: {
  value: string; // ISO or ""
  onChange: (iso: string) => void;
  label: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(isoToDisplay(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(isoToDisplay(value));
    setInvalid(false);
  }, [value]);

  const commit = () => {
    const iso = displayToIso(draft);
    if (iso === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (iso !== value) onChange(iso);
  };

  return (
    <Input
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        setInvalid(false);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      placeholder={placeholder}
      aria-label={label}
      aria-invalid={invalid}
      inputMode="numeric"
      className={cn("num w-36", invalid && "border-negative text-negative")}
      title={invalid ? "Use dd/mm/yyyy" : undefined}
    />
  );
}
