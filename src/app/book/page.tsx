"use client";

import { useEffect, useState } from "react";

function nextBusinessDays(count: number): string[] {
  const days: string[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (days.length < count) {
    cursor.setDate(cursor.getDate() + 1);
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) {
      days.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
      );
    }
  }
  return days;
}

export default function BookingPage() {
  const days = nextBusinessDays(10);
  const [activeDay, setActiveDay] = useState(days[0]);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState<{ htmlLink?: string } | null>(null);
  const [slotMinutes, setSlotMinutes] = useState<number | null>(null);

  useEffect(() => {
    setLoadingSlots(true);
    setSelectedSlot(null);
    fetch(`/api/public/booking/slots?date=${activeDay}`)
      .then((r) => r.json())
      .then((data) => {
        setSlots(data.slots || []);
        if (data.config?.slotMinutes) setSlotMinutes(data.config.slotMinutes);
      })
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [activeDay]);
  const submit = async () => {
    setError("");
    if (!selectedSlot) return setError("Vyberte prosím termín.");
    if (!name.trim() || !email.trim()) return setError("Doplňte jméno a e-mail.");
    setSubmitting(true);
    const response = await fetch("/api/public/booking/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: selectedSlot, guestName: name, guestEmail: email, note }),
    });
    const data = await response.json();
    setSubmitting(false);
    if (!response.ok) {
      setError(data.error || "Rezervaci se nepodařilo vytvořit.");
      return;
    }
    setConfirmed(data);
  };

  if (confirmed) {
    return (
      <main className="booking-page">
        <div className="booking-card booking-confirmed">
          <h1>Termín je zarezervovaný</h1>
          <p>
            Potvrzení jsme poslali na e-mail <b>{email}</b>. Pozvánku najdete i v kalendáři.
          </p>
          {confirmed.htmlLink && (
            <a href={confirmed.htmlLink} target="_blank" rel="noreferrer" className="booking-link">
              Otevřít v Google kalendáři
            </a>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="booking-page">
      <div className="booking-card">
        <p className="booking-eyebrow">NEOVIA · REZERVACE HOVORU</p>
        <h1>Domluvme si čas na hovor</h1>
        <p className="booking-subtitle">
          Vyberte den a volný {slotMinutes || 30}minutový termín.
        </p>
        <div className="booking-days">
          {days.map((day) => (
            <button
              key={day}
              type="button"
              className={day === activeDay ? "active" : ""}
              onClick={() => setActiveDay(day)}
            >
              {new Date(`${day}T12:00:00Z`).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" })}
            </button>
          ))}
        </div>
        <div className="booking-slots">
          {loadingSlots ? (
            <p className="booking-empty">Načítám volné termíny…</p>
          ) : slots.length === 0 ? (
            <p className="booking-empty">V tento den už není volný termín. Zkuste jiný den.</p>
          ) : (
            slots.map((slot) => (
              <button
                key={slot}
                type="button"
                className={slot === selectedSlot ? "active" : ""}
                onClick={() => setSelectedSlot(slot)}
              >
                {new Date(slot).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" })}
              </button>
            ))
          )}
        </div>
        {selectedSlot && (
          <form
            className="booking-form"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label>
              Jméno
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              E-mail
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Poznámka (nepovinné)
              <textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {error && <p className="booking-error">{error}</p>}
            <button type="submit" disabled={submitting} className="booking-submit">
              {submitting ? "Rezervuji…" : "Potvrdit rezervaci"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
