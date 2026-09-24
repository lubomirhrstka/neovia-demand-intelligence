"use client";

import { useState } from "react";

export type ExportField = { key: string; label: string };

function loadSelection(storageKey: string, fields: ExportField[]): string[] {
  if (typeof window === "undefined") return fields.map((f) => f.key);
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved) as string[];
      const validKeys = new Set(fields.map((f) => f.key));
      const filtered = parsed.filter((k) => validKeys.has(k));
      if (filtered.length > 0) return filtered;
    }
  } catch {
    // ignore corrupted storage
  }
  return fields.map((f) => f.key);
}

export function ExportFieldPicker({
  title,
  fields,
  storageKey,
  count,
  onClose,
  onExport,
}: {
  title: string;
  fields: ExportField[];
  storageKey: string;
  count: number;
  onClose: () => void;
  onExport: (selectedKeys: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(() => loadSelection(storageKey, fields));

  const toggle = (key: string) => {
    setSelected((current) => {
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      // udrž pořadí polí podle definice `fields`, ne podle pořadí kliknutí
      return fields.map((f) => f.key).filter((k) => next.includes(k));
    });
  };
  const selectAll = () => setSelected(fields.map((f) => f.key));
  const selectNone = () => setSelected([]);
  const handleExport = () => {
    if (selected.length === 0) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(selected));
    } catch {
      // ignore
    }
    onExport(selected);
  };
  return (
    <div className="modal-backdrop">
      <div className="modal export-field-picker">
        <header>
          <div>
            <p>EXPORT</p>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <p className="merge-hint">
          Vyberte, která pole se mají zahrnout do exportu ({count} {count === 1 ? "záznam" : count >= 2 && count <= 4 ? "záznamy" : "záznamů"}). Výběr se zapamatuje pro příště.
        </p>
        <div className="export-field-actions">
          <button type="button" className="link-action" onClick={selectAll}>Vybrat vše</button>
          <button type="button" className="link-action" onClick={selectNone}>Zrušit vše</button>
        </div>
        <div className="export-field-list">
          {fields.map((field) => (
            <label key={field.key} className="export-field-item">
              <input
                type="checkbox"
                checked={selected.includes(field.key)}
                onChange={() => toggle(field.key)}
              />
              {field.label}
            </label>
          ))}
        </div>
        <footer>
          <button type="button" className="secondary" onClick={onClose}>Zrušit</button>
          <button type="button" className="primary" disabled={selected.length === 0} onClick={handleExport}>
            Exportovat ({selected.length} {selected.length === 1 ? "pole" : selected.length >= 2 && selected.length <= 4 ? "pole" : "polí"})
          </button>
        </footer>
      </div>
    </div>
  );
}
