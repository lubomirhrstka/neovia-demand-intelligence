"use client";

import { useCallback, useEffect, useState } from "react";

type SavedView = {
  id: string;
  view: string;
  name: string;
  filters: Record<string, unknown>;
  createdAt: string;
};

export function SavedViewsBar({
  view,
  currentFilters,
  onApply,
  note,
}: {
  view: string;
  currentFilters: Record<string, unknown>;
  onApply: (filters: Record<string, unknown>) => void;
  note: (s: string) => void;
}) {
  const [rows, setRows] = useState<SavedView[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/saved-views?view=${encodeURIComponent(view)}`);
      if (!res.ok) return;
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    }
  }, [view]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!name.trim()) {
      note("Zadejte název pohledu.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ view, name: name.trim(), filters: currentFilters }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Pohled se nepodařilo uložit.");
      setName("");
      await load();
      note(`Pohled „${data.name}“ uložen.`);
    } catch (e) {
      note(e instanceof Error ? e.message : "Pohled se nepodařilo uložit.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const res = await fetch("/api/saved-views", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      note("Pohled se nepodařilo smazat.");
      return;
    }
    await load();
    note("Pohled smazán.");
  };

  return (
    <div className="saved-views-bar">
      <div className="saved-views-list">
        <span className="saved-views-label">Uložené pohledy</span>
        {rows.length === 0 && <small className="saved-views-empty">Zatím žádné</small>}
        {rows.map((row) => (
          <span key={row.id} className="saved-view-chip">
            <button type="button" onClick={() => onApply(row.filters || {})}>
              {row.name}
            </button>
            <button
              type="button"
              className="saved-view-delete"
              onClick={() => void remove(row.id)}
              aria-label={`Smazat pohled ${row.name}`}
              title="Smazat pohled"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="saved-views-save">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Název pohledu"
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
        />
        <button type="button" className="secondary" disabled={busy} onClick={() => void save()}>
          {busy ? "Ukládám…" : "Uložit pohled"}
        </button>
      </div>
    </div>
  );
}
