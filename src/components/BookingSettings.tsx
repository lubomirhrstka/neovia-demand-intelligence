"use client";

import { useEffect, useState } from "react";

type BookingCfg = {
  slotMinutes: number;
  workdayStartHour: number;
  workdayEndHour: number;
  workdays: number[];
  bufferMinutes: number;
  confirmationMessage: string;
};

type Block = { id: string; startsAt: string; endsAt: string; reason: string | null };

const DAY_LABELS: [number, string][] = [
  [1, "Po"],
  [2, "Út"],
  [3, "St"],
  [4, "Čt"],
  [5, "Pá"],
  [6, "So"],
  [0, "Ne"],
];

export function BookingSettings({ note }: { note: (s: string) => void }) {
  const [bookingCfg, setBookingCfg] = useState<BookingCfg>({
    slotMinutes: 30,
    workdayStartHour: 9,
    workdayEndHour: 17,
    workdays: [1, 2, 3, 4, 5],
    bufferMinutes: 0,
    confirmationMessage: "",
  });
  const [bookingBlocks, setBookingBlocks] = useState<Block[]>([]);
  const [blockFrom, setBlockFrom] = useState("");
  const [blockTo, setBlockTo] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/booking-settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setBookingCfg({
          slotMinutes: data.slotMinutes ?? 30,
          workdayStartHour: data.workdayStartHour ?? 9,
          workdayEndHour: data.workdayEndHour ?? 17,
          workdays: Array.isArray(data.workdays) ? data.workdays : [1, 2, 3, 4, 5],
          bufferMinutes: data.bufferMinutes ?? 0,
          confirmationMessage: data.confirmationMessage || "",
        });
      })
      .catch(() => {});
    fetch("/api/booking-blocks")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data)) setBookingBlocks(data);
      })
      .catch(() => {});
  }, []);

  const bookingLink = typeof window !== "undefined" ? `${window.location.origin}/book` : "/book";

  const copyBookingLink = async () => {
    try {
      await navigator.clipboard.writeText(bookingLink);
      note("Booking odkaz zkopírován do schránky.");
    } catch {
      note(bookingLink);
    }
  };

  const saveBookingSettings = async () => {
    setBusy(true);
    const res = await fetch("/api/booking-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookingCfg),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      note(data.error || "Nastavení bookingu se nepodařilo uložit.");
      return;
    }
    note("Nastavení bookingu uloženo.");
  };

  const addBookingBlock = async () => {
    if (!blockFrom || !blockTo) {
      note("Vyplňte od–do pro blokaci.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/booking-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startsAt: new Date(blockFrom).toISOString(),
        endsAt: new Date(blockTo).toISOString(),
        reason: blockReason,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      note(data.error || "Blokaci se nepodařilo přidat.");
      return;
    }
    const row = await res.json();
    setBookingBlocks((prev) => [row, ...prev]);
    setBlockFrom("");
    setBlockTo("");
    setBlockReason("");
    note("Blokace přidána.");
  };

  const removeBookingBlock = async (id: string) => {
    setBusy(true);
    const res = await fetch(`/api/booking-blocks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      note("Blokaci se nepodařilo smazat.");
      return;
    }
    setBookingBlocks((prev) => prev.filter((b) => b.id !== id));
    note("Blokace odstraněna.");
  };

  const toggleWorkday = (day: number) => {
    setBookingCfg((cfg) => {
      const has = cfg.workdays.includes(day);
      const workdays = has ? cfg.workdays.filter((d) => d !== day) : [...cfg.workdays, day].sort();
      return { ...cfg, workdays };
    });
  };

  return (
    <section className="panel setting-card">
      <h2>Veřejný booking</h2>
      <p>
        Odkaz pro klienty na rezervaci schůzky. Nastavte délku hovoru, pracovní dobu a případně zablokujte dny
        (dovolená, konference).
      </p>
      <div className="form-grid" style={{ marginBottom: 12 }}>
        <label>
          Booking odkaz
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={bookingLink} style={{ flex: 1 }} />
            <button type="button" className="secondary" onClick={copyBookingLink}>
              Zkopírovat
            </button>
          </div>
        </label>
        <label>
          Délka schůzky
          <select
            value={bookingCfg.slotMinutes}
            onChange={(e) => setBookingCfg((c) => ({ ...c, slotMinutes: Number(e.target.value) }))}
          >
            {[15, 20, 30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m} minut
              </option>
            ))}
          </select>
        </label>
        <label>
          Pracovní doba od
          <input
            type="number"
            min={0}
            max={23}
            value={bookingCfg.workdayStartHour}
            onChange={(e) => setBookingCfg((c) => ({ ...c, workdayStartHour: Number(e.target.value) }))}
          />
        </label>
        <label>
          Pracovní doba do
          <input
            type="number"
            min={1}
            max={24}
            value={bookingCfg.workdayEndHour}
            onChange={(e) => setBookingCfg((c) => ({ ...c, workdayEndHour: Number(e.target.value) }))}
          />
        </label>
        <label>
          Buffer mezi schůzkami (min)
          <input
            type="number"
            min={0}
            max={120}
            value={bookingCfg.bufferMinutes}
            onChange={(e) => setBookingCfg((c) => ({ ...c, bufferMinutes: Number(e.target.value) }))}
          />
        </label>
        <label style={{ gridColumn: "1 / -1" }}>
          Text zprávy klientovi po rezervaci
          <textarea
            rows={3}
            value={bookingCfg.confirmationMessage}
            onChange={(e) => setBookingCfg((c) => ({ ...c, confirmationMessage: e.target.value }))}
            placeholder="Rezervace přes veřejný booking odkaz NEOVIA Demand Intelligence."
          />
          <small style={{ color: "#657d7f", fontSize: 11 }}>
            Vloží se do popisu pozvánky, kterou klient dostane e-mailem z Google kalendáře. Necháte-li prázdné, použije se výchozí text.
          </small>
        </label>
      </div>
      <div style={{ marginBottom: 12 }}>
        <b style={{ fontSize: 12 }}>Pracovní dny</b>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
          {DAY_LABELS.map(([d, label]) => (
            <label key={d} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={bookingCfg.workdays.includes(d)}
                onChange={() => toggleWorkday(d)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <button className="primary" type="button" disabled={busy} onClick={saveBookingSettings}>
        {busy ? "Ukládám…" : "Uložit nastavení bookingu"}
      </button>
      <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid #edf1f0" }} />
      <h3 style={{ fontSize: 13, marginBottom: 8 }}>Blokace termínů</h3>
      <p style={{ fontSize: 11, color: "#657d7f", marginBottom: 10 }}>
        Zablokované intervaly se na veřejné stránce /book nebudou nabízet (např. dovolená).
      </p>
      <div className="form-grid" style={{ marginBottom: 10 }}>
        <label>
          Od
          <input type="datetime-local" value={blockFrom} onChange={(e) => setBlockFrom(e.target.value)} />
        </label>
        <label>
          Do
          <input type="datetime-local" value={blockTo} onChange={(e) => setBlockTo(e.target.value)} />
        </label>
        <label>
          Důvod (nepovinné)
          <input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Dovolená" />
        </label>
      </div>
      <button className="secondary" type="button" disabled={busy} onClick={addBookingBlock}>
        Přidat blokaci
      </button>
      {bookingBlocks.length > 0 && (
        <ul style={{ marginTop: 12, paddingLeft: 0, listStyle: "none", fontSize: 12 }}>
          {bookingBlocks.map((b) => (
            <li
              key={b.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                padding: "8px 0",
                borderBottom: "1px solid #edf1f0",
              }}
            >
              <span>
                {new Date(b.startsAt).toLocaleString("cs-CZ")} → {new Date(b.endsAt).toLocaleString("cs-CZ")}
                {b.reason ? ` · ${b.reason}` : ""}
              </span>
              <button type="button" className="secondary" onClick={() => removeBookingBlock(b.id)}>
                Smazat
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
