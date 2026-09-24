"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { localDateKey, toDatetimeLocal } from "@/lib/app-helpers";
import { getNameDay, getPublicHolidayName } from "@/lib/czech-calendar";
import type {
  TaskRecord,
  CompanyRecord,
  ContactRecord,
  CalendarStatus,
  CalendarEventRecord,
} from "@/lib/app-types";

export function CalendarView({ note }: { note: (s: string) => void }) {
  const [mode, setMode] = useState<"day" | "workweek" | "month">("workweek"),
    [referenceDate, setReferenceDate] = useState(() => new Date()),
    [tasks, setTasks] = useState<TaskRecord[]>([]),
    [companies, setCompanies] = useState<CompanyRecord[]>([]),
    [contacts, setContacts] = useState<ContactRecord[]>([]),
    [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null),
    [calendarEvents, setCalendarEvents] = useState<CalendarEventRecord[]>([]),
    [syncing, setSyncing] = useState(false),
    [lastSyncSummary, setLastSyncSummary] = useState(""),
    [open, setOpen] = useState(false),
    [editingId, setEditingId] = useState<string | null>(null),
    [deleteTarget, setDeleteTarget] = useState<TaskRecord | null>(null),
    [openingGoogleEventId, setOpeningGoogleEventId] = useState<string | null>(null),
    [saving, setSaving] = useState(false),
    [title, setTitle] = useState(""),
    [kind, setKind] = useState("meeting"),
    [dueAt, setDueAt] = useState(""),
    [priority, setPriority] = useState("2"),
    [tag, setTag] = useState(""),
    [companyId, setCompanyId] = useState(""),
    [companyQuery, setCompanyQuery] = useState(""),
    [contactId, setContactId] = useState(""),
    [contactQuery, setContactQuery] = useState("");
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const addDays = (value: Date, days: number) => {
    const next = new Date(value);
    next.setDate(next.getDate() + days);
    return next;
  };
  const addMonths = (value: Date, months: number) => {
    const next = new Date(value);
    next.setMonth(next.getMonth() + months);
    return next;
  };
  const startOfWorkweek = (value: Date) => {
    const base = startOfDay(value);
    const day = base.getDay() || 7;
    base.setDate(base.getDate() - day + 1);
    return base;
  };
  const visibleRange = () => {
    if (mode === "day") {
      const start = startOfDay(referenceDate);
      return { start, end: addDays(start, 1) };
    }
    if (mode === "workweek") {
      const start = startOfWorkweek(referenceDate);
      return { start, end: addDays(start, 5) };
    }
    const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    return { start, end: new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1) };
  };
  const calendarPeriodLabel = () => {
    if (mode === "day") {
      return referenceDate.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    }
    if (mode === "workweek") {
      const start = startOfWorkweek(referenceDate);
      const end = addDays(start, 4);
      return `${start.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })} – ${end.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" })}`;
    }
    return referenceDate.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
  };
  const shiftPeriod = (direction: -1 | 1) => {
    setReferenceDate((current) => {
      if (mode === "day") return addDays(current, direction);
      if (mode === "workweek") return addDays(current, direction * 7);
      return addMonths(current, direction);
    });
  };
  const load = () => {
    const range = visibleRange();
    const eventsUrl = `/api/calendar/google/events?from=${encodeURIComponent(range.start.toISOString())}&to=${encodeURIComponent(range.end.toISOString())}`;
    return Promise.all([
      fetch("/api/tasks").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/companies").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/contacts").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/calendar/google/status").then((r) => (r.ok ? r.json() : null)),
      fetch(eventsUrl).then((r) => (r.ok ? r.json() : { events: [] })),
    ])
      .then(([taskRows, companyRows, contactRows, status, events]) => {
        setTasks(taskRows);
        setCompanies(companyRows);
        setContacts(contactRows);
        setCalendarStatus(status);
        setCalendarEvents(events.events || []);
      })
      .catch(() => note("Kalendář se nepodařilo načíst."));
  };
  useEffect(() => {
    load();
  }, [mode, referenceDate]);
  const companyResults =
    companyQuery.trim().length >= 3
      ? companies
          .filter((company) => company.name.toLowerCase().includes(companyQuery.trim().toLowerCase()))
          .slice(0, 8)
      : [];
  const contactResults =
    contactQuery.trim().length >= 3
      ? contacts
          .filter((contact) => {
            const haystack = `${contact.firstName} ${contact.lastName} ${contact.email || ""} ${contact.phone || ""} ${contact.company || ""}`.toLowerCase();
            return haystack.includes(contactQuery.trim().toLowerCase()) && (!companyId || contact.companyId === companyId);
          })
          .slice(0, 8)
      : [];
  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setKind("meeting");
    setDueAt("");
    setPriority("2");
    setTag("");
    setCompanyId("");
    setCompanyQuery("");
    setContactId("");
    setContactQuery("");
  };
  const openForEdit = (task: TaskRecord) => {
    setEditingId(task.id);
    setTitle(task.title);
    setKind(task.kind || "meeting");
    setDueAt(task.dueAt ? toDatetimeLocal(new Date(task.dueAt)) : "");
    setPriority(String(task.priority ?? 2));
    setTag(task.tag || "");
    setCompanyId(task.companyId || "");
    setCompanyQuery(task.company || "");
    setContactId(task.contactId || "");
    setContactQuery(task.contactName || "");
    setOpen(true);
  };
  const saveCalendarItem = async () => {
    if (!title.trim()) {
      note("Doplňte název záznamu.");
      return;
    }
    if (dueAt) {
      const holidayName = getPublicHolidayName(new Date(dueAt));
      if (holidayName) {
        note(`Na tento den (${holidayName}) je vyhlášený státní svátek — celý den je blokovaný jako volno. Vyberte prosím jiný termín.`);
        return;
      }
    }
    setSaving(true);
    const response = await fetch("/api/tasks", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(editingId ? { id: editingId } : {}),
        title,
        kind,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        priority,
        tag: tag || null,
        companyId: companyId || null,
        contactId: contactId || null,
      }),
    });
    setSaving(false);
    if (!response.ok) {
      note(editingId ? "Záznam se nepodařilo upravit." : "Záznam se nepodařilo uložit.");
      return;
    }
    const created = await response.json();
    if (!editingId && calendarStatus?.connected && dueAt && kind === "meeting") {
      await fetch("/api/calendar/google/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: created.id }),
      }).catch(() => null);
    }
    setOpen(false);
    resetForm();
    load();
    note(editingId ? "Záznam byl upraven." : kind === "meeting" ? "Schůzka byla uložena do kalendáře." : "Záznam byl uložen do kalendáře.");
  };
  const syncCalendar = async (silent = false) => {
    if (!calendarStatus?.connected) {
      if (!silent) note("Nejdřív připojte Google kalendář.");
      return;
    }
    setSyncing(true);
    const response = await fetch("/api/calendar/google/sync", { method: "POST" });
    setSyncing(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (!silent) note(data.error || "Synchronizace Google kalendáře se nepodařila.");
      return;
    }
    const data = await response.json();
    const summary = [
      `Google → CRM: ${data.imported || 0} nových, ${data.updatedFromGoogle || 0} upravených.`,
      `CRM → Google: ${data.pushed || 0} nových, ${data.updatedInGoogle || 0} upravených.`,
      data.skippedForNextBatch ? `Zbývá ${data.skippedForNextBatch} položek do další dávky.` : "",
      data.googleErrors ? `Google dočasně odmítl ${data.googleErrors} požadavků.` : "",
    ].filter(Boolean).join(" ");
    setLastSyncSummary(summary);
    await load();
    if (!silent) note("Kalendář je obousměrně synchronizovaný.");
  };
  useEffect(() => {
    if (!calendarStatus?.connected) return;
    const interval = window.setInterval(() => {
      syncCalendar(true);
    }, 45000);
    return () => window.clearInterval(interval);
  }, [calendarStatus?.connected]);
  const deleteCalendarTask = (task: TaskRecord) => {
    setDeleteTarget(task);
  };
  const openGoogleEventInApp = async (event: CalendarEventRecord) => {
    if (!event.start) {
      note("Google událost nemá čas začátku, nejde ji otevřít jako CRM záznam.");
      return;
    }
    setOpeningGoogleEventId(event.id);
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: event.title || "Událost z Google kalendáře",
        kind: "meeting",
        priority: 2,
        tag: "Google",
        dueAt: new Date(event.start).toISOString(),
        externalProvider: "google_calendar",
        externalId: event.id,
        syncedAt: new Date().toISOString(),
      }),
    });
    setOpeningGoogleEventId(null);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      note(data.error || "Google událost se nepodařilo otevřít v aplikaci.");
      return;
    }
    const task = await response.json();
    const taskForEdit: TaskRecord = {
      ...task,
      company: null,
      contactName: null,
      opportunityTitle: null,
    };
    setTasks((current) => [taskForEdit, ...current.filter((item) => item.id !== taskForEdit.id)]);
    openForEdit(taskForEdit);
  };
  const performDelete = async (mode: "crm" | "crm_and_google" | "archive") => {
    if (!deleteTarget) return;
    const response = await fetch("/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: deleteTarget.id, mode }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      note(data.error || "Záznam se nepodařilo odstranit.");
      setDeleteTarget(null);
      return;
    }
    setDeleteTarget(null);
    load();
    note(
      mode === "archive"
        ? "Záznam byl archivován a znovu se nenaimportuje."
        : mode === "crm_and_google"
          ? "Záznam byl smazán v CRM i v Google kalendáři."
          : "Záznam byl smazán v CRM a už se znovu nenaimportuje.",
    );
  };
  const workweekDays = Array.from({ length: 5 }, (_, index) => addDays(startOfWorkweek(referenceDate), index));
  const monthDays = Array.from({ length: 31 }, (_, index) => {
    const base = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    base.setDate(index + 1);
    return base.getMonth() === referenceDate.getMonth() ? base : null;
  }).filter(Boolean) as Date[];
  const days = mode === "day" ? [referenceDate] : mode === "workweek" ? workweekDays : monthDays;
  const itemsForDay = (day: Date) => {
    const key = localDateKey(day);
    const representedGoogleEventIds = new Set(
      tasks
        .filter((task) => task.status !== "archived" && task.externalProvider === "google_calendar" && task.externalId && task.dueAt)
        .map((task) => `${task.externalId}:${localDateKey(new Date(task.dueAt!))}`),
    );
    const taskItems = tasks
      .filter((task) => task.status !== "archived" && task.dueAt && localDateKey(new Date(task.dueAt)) === key)
      .map((task) => ({ type: "task" as const, task, time: new Date(task.dueAt!).getTime() }));
    const googleItems = calendarEvents
      .filter((event) => event.start && localDateKey(new Date(event.start)) === key && !representedGoogleEventIds.has(`${event.id}:${key}`))
      .map((event) => ({ type: "google" as const, event, time: event.start ? new Date(event.start).getTime() : 0 }));
    return [...taskItems, ...googleItems].sort((a, b) => a.time - b.time);
  };
  return (
    <>
      <div className="title">
        <div>
          <p>KALENDÁŘ</p>
          <h1>Kalendář aktivit</h1>
          <small>Schůzky, úkoly, poznámky a synchronizace s Google kalendářem.</small>
        </div>
        <button className="primary" type="button" onClick={() => setOpen(true)}>
          <Plus size={17} />
          Nová schůzka
        </button>
      </div>
      <section className="panel calendar-shell">
        <div className="calendar-toolbar">
          <div className="calendar-navigation">
            <div className="calendar-period-controls">
              <button className="icon secondary" type="button" onClick={() => shiftPeriod(-1)} aria-label="Předchozí období">
                <ChevronLeft size={18} />
              </button>
              <button className="secondary today-button" type="button" onClick={() => setReferenceDate(new Date())}>Dnes</button>
              <button className="icon secondary" type="button" onClick={() => shiftPeriod(1)} aria-label="Další období">
                <ChevronRight size={18} />
              </button>
              <b>{calendarPeriodLabel()}</b>
            </div>
            <div className="segmented compact">
              <button className={mode === "day" ? "active" : ""} type="button" onClick={() => setMode("day")}>Den</button>
              <button className={mode === "workweek" ? "active" : ""} type="button" onClick={() => setMode("workweek")}>Týden</button>
              <button className={mode === "month" ? "active" : ""} type="button" onClick={() => setMode("month")}>Měsíc</button>
            </div>
          </div>
          <div className="calendar-actions">
            <button className="secondary" type="button" onClick={() => syncCalendar(false)} disabled={syncing}>
              <CalendarDays size={15} />
              {syncing ? "Synchronizuji…" : "Synchronizovat obousměrně"}
            </button>
          </div>
        </div>
        <div className="sync-state">
          <b>{calendarStatus?.connected ? "Automatická synchronizace je aktivní" : "Google kalendář není připojený"}</b>
          <small>
            {lastSyncSummary ||
              (calendarStatus?.lastSyncAt
                ? `Poslední synchronizace: ${new Date(calendarStatus.lastSyncAt).toLocaleString("cs-CZ")}`
                : "Po připojení se kalendář bude průběžně načítat a párovat se záznamy v CRM.")}
          </small>
        </div>
        <div className={`calendar-board ${mode}`}>
          {days.map((day) => {
            const holidayName = getPublicHolidayName(day);
            const nameDay = getNameDay(day);
            return (
            <div className={`calendar-slot${holidayName ? " public-holiday" : ""}`} key={day.toISOString()}>
              <strong>
                {day.toLocaleDateString("cs-CZ", {
                  weekday: mode === "month" ? undefined : "long",
                  day: "numeric",
                  month: "numeric",
                })}
              </strong>
              {nameDay && <span className="name-day">{nameDay}</span>}
              {holidayName && <span className="public-holiday-badge">Státní svátek</span>}
              {holidayName ? (
                <small>{holidayName} · celý den volno</small>
              ) : itemsForDay(day).length === 0 ? (
                <small>Volno</small>
              ) : (
                itemsForDay(day).map((item) =>
                  item.type === "google" ? (
                    <div
                      key={`g-${item.event.id}-${item.event.start || ""}`}
                      className="calendar-item google"
                      onClick={() => openGoogleEventInApp(item.event)}
                      role="button"
                      tabIndex={0}
                    >
                      <b>{item.event.title}</b>
                    </div>
                  ) : (
                    <div className="calendar-item" key={item.task.id} onClick={() => openForEdit(item.task)} role="button" tabIndex={0}>
                      <b>{item.task.title}</b>
                    </div>
                  ),
                )
              )}
            </div>
            );
          })}
        </div>
      </section>
      {open && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={(event) => { event.preventDefault(); saveCalendarItem(); }}>
            <header>
              <div>
                <p>KALENDÁŘ</p>
                <h2>{editingId ? "Upravit záznam" : "Nový kalendářový záznam"}</h2>
              </div>
              <button type="button" onClick={() => { setOpen(false); resetForm(); }}>×</button>
            </header>
            <div className="form-grid task-form">
              <label>
                Název
                <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Například schůzka s klientem" />
              </label>
              <label>
                Typ
                <select value={kind} onChange={(event) => setKind(event.target.value)}>
                  <option value="meeting">Schůzka</option>
                  <option value="task">Úkol</option>
                  <option value="note">Poznámka</option>
                </select>
              </label>
              <label>
                Datum a čas
                <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
              </label>
              <label>
                Priorita
                <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                  <option value="1">1, vysoká</option>
                  <option value="2">2, běžná</option>
                  <option value="3">3, nízká</option>
                </select>
              </label>
              <label>
                Štítek
                <input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="Například obchod, follow-up" />
              </label>
              <label className="search-picker">
                Firma
                <input value={companyQuery} onChange={(event) => { setCompanyQuery(event.target.value); setCompanyId(""); }} placeholder="Minimálně 3 znaky" />
                {companyQuery.trim().length > 0 && companyQuery.trim().length < 3 && <small>Zadejte minimálně 3 znaky.</small>}
                {companyResults.length > 0 && !companyId && (
                  <div className="picker-results">
                    {companyResults.map((company) => (
                      <button type="button" key={company.id} onClick={() => { setCompanyId(company.id); setCompanyQuery(company.name); }}>
                        <strong>{company.name}</strong>
                        <span>{company.ico ? `IČO ${company.ico}` : company.source || "CRM"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <label className="search-picker">
                Kontakt
                <input value={contactQuery} onChange={(event) => { setContactQuery(event.target.value); setContactId(""); }} placeholder="Minimálně 3 znaky" />
                {contactQuery.trim().length > 0 && contactQuery.trim().length < 3 && <small>Zadejte minimálně 3 znaky.</small>}
                {contactResults.length > 0 && !contactId && (
                  <div className="picker-results">
                    {contactResults.map((contact) => {
                      const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email || "Kontakt";
                      return (
                        <button type="button" key={contact.id} onClick={() => {
                          setContactId(contact.id);
                          setContactQuery(contactName);
                          if (contact.companyId) {
                            setCompanyId(contact.companyId);
                            setCompanyQuery(contact.company || "");
                          }
                        }}>
                          <strong>{contactName}</strong>
                          <span>{[contact.company, contact.email, contact.phone].filter(Boolean).join(" · ")}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </label>
            </div>
            <footer>
              <button type="button" className="secondary" onClick={() => { setOpen(false); resetForm(); }}>Zrušit</button>
              <button disabled={saving} type="submit" className="primary">{saving ? "Ukládám…" : editingId ? "Uložit změny" : "Uložit do kalendáře"}</button>
            </footer>
          </form>
        </div>
      )}
      {deleteTarget && (
        <div className="modal-backdrop">
          <div className="modal delete-choice">
            <header>
              <div>
                <p>KALENDÁŘ</p>
                <h2>Odstranit „{deleteTarget.title}“</h2>
              </div>
              <button type="button" onClick={() => setDeleteTarget(null)}>×</button>
            </header>
            {deleteTarget.externalProvider === "google_calendar" && deleteTarget.externalId ? (
              <>
                <p>Tento záznam je propojený s Google kalendářem. Jak ho chcete odstranit?</p>
                <div className="delete-choice-options">
                  <button type="button" className="secondary" onClick={() => performDelete("crm")}>
                    Smazat jen v CRM
                    <small>V Google kalendáři zůstane, ale znovu se sem nenaimportuje.</small>
                  </button>
                  <button type="button" className="secondary" onClick={() => performDelete("crm_and_google")}>
                    Smazat v CRM i v Google kalendáři
                    <small>Událost zmizí úplně, na obou místech.</small>
                  </button>
                  <button type="button" className="secondary" onClick={() => performDelete("archive")}>
                    Archivovat
                    <small>Skryje se z kalendáře, zůstane v historii a znovu se nenaimportuje.</small>
                  </button>
                </div>
              </>
            ) : (
              <p>Opravdu chcete tento záznam odstranit?</p>
            )}
            <footer>
              <button type="button" className="secondary" onClick={() => setDeleteTarget(null)}>Zrušit</button>
              {!(deleteTarget.externalProvider === "google_calendar" && deleteTarget.externalId) && (
                <button type="button" className="primary" onClick={() => performDelete("crm")}>Odstranit</button>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
