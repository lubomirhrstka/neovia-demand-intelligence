"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Check, Plus, Trash2 } from "lucide-react";
import { goTo, localDateKey, formatIcsDate, escapeIcs } from "@/lib/app-helpers";
import type {
  TaskRecord,
  CompanyRecord,
  ContactRecord,
  CalendarStatus,
  CalendarEventRecord,
} from "@/lib/app-types";
import { Header } from "@/components/dashboard-widgets";

export function Tasks({ note }: { note: (s: string) => void }) {
  const [rows, setRows] = useState<TaskRecord[]>([]),
    [companies, setCompanies] = useState<CompanyRecord[]>([]),
    [contacts, setContacts] = useState<ContactRecord[]>([]),
    [loading, setLoading] = useState(true),
    [taskFilter, setTaskFilter] = useState("open"),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<TaskRecord | null>(null),
    [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null),
    [calendarEvents, setCalendarEvents] = useState<CalendarEventRecord[]>([]),
    [syncing, setSyncing] = useState(false),
    [lastSyncSummary, setLastSyncSummary] = useState(""),
    [calendarLoading, setCalendarLoading] = useState(false),
    [calendarSyncingTask, setCalendarSyncingTask] = useState<string | null>(null),
    [title, setTitle] = useState(""),
    [kind, setKind] = useState("task"),
    [tag, setTag] = useState(""),
    [dueAt, setDueAt] = useState(""),
    [priority, setPriority] = useState("2"),
    [companyId, setCompanyId] = useState(""),
    [companyQuery, setCompanyQuery] = useState(""),
    [contactId, setContactId] = useState(""),
    [contactQuery, setContactQuery] = useState(""),
    [saving, setSaving] = useState(false);
  const loadCalendarStatus = () =>
    fetch("/api/calendar/google/status")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        setCalendarStatus(data);
        return data as CalendarStatus;
      })
      .catch(() => {
        setCalendarStatus(null);
        return null;
      });
  const loadCalendarEvents = () => {
    setCalendarLoading(true);
    fetch("/api/calendar/google/events")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        setCalendarEvents(data.events || []);
      })
      .catch(() => setCalendarEvents([]))
      .finally(() => setCalendarLoading(false));
  };
  const load = () =>
    Promise.all([
      fetch("/api/tasks").then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
      fetch("/api/companies").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/contacts").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([taskRows, companyRows, contactRows]) => {
        setRows(taskRows);
        setCompanies(companyRows);
        setContacts(contactRows);
      })
      .catch(() => note("Úkoly se nepodařilo načíst."))
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
    loadCalendarStatus().then((status) => {
      if (status?.connected) loadCalendarEvents();
    });
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    const calendarState = params.get("calendar");
    if (calendarState === "connected") {
      note("Google kalendář je připojený.");
      loadCalendarStatus().then((status) => {
        if (status?.connected) loadCalendarEvents();
      });
    }
    if (calendarState === "error") {
      note(`Google kalendář se nepodařilo připojit: ${params.get("reason") || "neznámá chyba"}.`);
    }
  }, []);
  const save = async () => {
    if (!title.trim()) {
      note("Doplňte název úkolu.");
      return;
    }
    setSaving(true);
    const response = await fetch("/api/tasks", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing?.id,
        title,
        kind,
        tag: tag || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        priority,
        companyId: companyId || null,
        contactId: contactId || null,
      }),
    });
    setSaving(false);
    if (!response.ok) {
      note("Úkol se nepodařilo uložit.");
      return;
    }
    setOpen(false);
    setEditing(null);
    setTitle("");
    setDueAt("");
    setPriority("2");
    setCompanyId("");
    setCompanyQuery("");
    setContactId("");
    setContactQuery("");
    setKind("task");
    setTag("");
    load();
    note(editing ? "Úkol byl upraven." : "Úkol byl uložen do společné databáze.");
  };
  const openTaskEditor = (task?: TaskRecord) => {
    setEditing(task || null);
    setTitle(task?.title || "");
    setKind(task?.kind || "task");
    setTag(task?.tag || "");
    setDueAt(task?.dueAt ? task.dueAt.slice(0, 16) : "");
    setPriority(String(task?.priority || 2));
    setCompanyId(task?.companyId || "");
    setCompanyQuery(task?.company || "");
    setContactId(task?.contactId || "");
    setContactQuery(task?.contactName || "");
    setOpen(true);
  };
  const deleteTask = async (task: TaskRecord) => {
    if (!window.confirm(`Opravdu chcete odstranit záznam „${task.title}“? Tato akce se provede až po potvrzení.`)) return;
    const response = await fetch("/api/tasks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id }),
    });
    if (!response.ok) {
      note("Záznam se nepodařilo odstranit.");
      return;
    }
    setOpen(false);
    setEditing(null);
    load();
    note("Záznam byl odstraněn.");
  };
  const openOpportunity = (opportunityId: string) => {
    window.localStorage.setItem("neovia-open-opportunity", opportunityId);
    goTo("Pipeline");
  };
  const openCompany = (company: string) => {
    window.localStorage.setItem("neovia-open-company", company);
    goTo("Kontakty");
  };
  const toggleTask = async (task: TaskRecord) => {
    const nextStatus = task.status === "done" ? "open" : "done";
    setRows(rows.map((x) => (x.id === task.id ? { ...x, status: nextStatus } : x)));
    const response = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, status: nextStatus }),
    });
    if (!response.ok) {
      load();
      note("Stav úkolu se nepodařilo uložit.");
      return;
    }
    note(nextStatus === "done" ? "Úkol byl dokončen." : "Úkol byl znovu otevřen.");
  };
  const todayKey = localDateKey(new Date());
  const visibleTasks = rows.filter((task) => {
    const dueDate = task.dueAt ? new Date(task.dueAt) : null;
    if (taskFilter === "all") return true;
    if (taskFilter === "done") return task.status === "done";
    if (taskFilter === "today") return Boolean(dueDate && localDateKey(dueDate) === todayKey);
    if (taskFilter === "overdue") return Boolean(dueDate && dueDate < new Date() && task.status !== "done");
    return task.status !== "done";
  });
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
            const matchesText = haystack.includes(contactQuery.trim().toLowerCase());
            const matchesCompany = !companyId || contact.companyId === companyId;
            return matchesText && matchesCompany;
          })
          .slice(0, 8)
      : [];
  const timedVisibleTasks = visibleTasks
    .filter((task) => task.dueAt)
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime());
  const exportCalendar = () => {
    if (timedVisibleTasks.length === 0) {
      note("V aktuálním filtru není žádný úkol s termínem pro export.");
      return;
    }
    const now = formatIcsDate(new Date());
    const events = timedVisibleTasks
      .map((task) => {
        const start = new Date(task.dueAt!);
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        const description = [
          task.company ? `Firma: ${task.company}` : "",
          task.opportunityTitle ? `Obchodní případ: ${task.opportunityTitle}` : "",
          `Priorita: ${task.priority}`,
          `Stav: ${task.status === "done" ? "hotovo" : "otevřeno"}`,
        ]
          .filter(Boolean)
          .join("\n");
        return [
          "BEGIN:VEVENT",
          `UID:${task.id}@neovia-demand-intelligence`,
          `DTSTAMP:${now}`,
          `DTSTART:${formatIcsDate(start)}`,
          `DTEND:${formatIcsDate(end)}`,
          `SUMMARY:${escapeIcs(task.title)}`,
          `DESCRIPTION:${escapeIcs(description)}`,
          "END:VEVENT",
        ].join("\r\n");
      })
      .join("\r\n");
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//NEOVIA//Demand Intelligence//CS",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      events,
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([calendar], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `neovia-ukoly-${todayKey}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    note(`Exportováno ${timedVisibleTasks.length} termínovaných úkolů do kalendáře.`);
  };
  const connectGoogleCalendar = () => {
    if (!calendarStatus?.configured) {
      note(`Chybí OAuth údaje pro Google kalendář: ${(calendarStatus?.missing || ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET"]).join(", ")}.`);
      return;
    }
    if (!calendarStatus.oauthUrl) {
      note("Google Calendar OAuth adresa není připravená.");
      return;
    }
    window.open(calendarStatus.oauthUrl, "_blank", "noopener,noreferrer");
  };
  const syncTaskToGoogleCalendar = async (task: TaskRecord) => {
    if (!task.dueAt) {
      note("Úkol nemá termín, nejde ho poslat do Google kalendáře.");
      return;
    }
    if (!calendarStatus?.connected) {
      note("Nejdřív připojte Google kalendář.");
      return;
    }
    setCalendarSyncingTask(task.id);
    const response = await fetch("/api/calendar/google/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id }),
    });
    setCalendarSyncingTask(null);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      note(data.error || "Úkol se nepodařilo poslat do Google kalendáře.");
      return;
    }
    loadCalendarEvents();
    note("Úkol byl přidán do Google kalendáře.");
  };
  return (
    <>
      <div className="title">
        <div>
          <p>AKTIVITY</p>
          <h1>Úkoly a kalendář</h1>
          <small>Další kroky obchodního týmu na jednom místě.</small>
        </div>
        <button className="primary" onClick={() => openTaskEditor()}>
          <Plus size={17} />
          Nový úkol
        </button>
      </div>
      <div className="task-grid">
        <section className="panel">
          <Header title="Moje úkoly" action={`${visibleTasks.length} z ${rows.length}`} />
          <div className="task-toolbar">
            <label>
              Zobrazení
              <select value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)}>
                <option value="open">Otevřené</option>
                <option value="today">Dnes</option>
                <option value="overdue">Po termínu</option>
                <option value="done">Hotové</option>
                <option value="all">Vše</option>
              </select>
            </label>
            <button type="button" className="secondary" onClick={exportCalendar}>
              <CalendarDays size={15} />
              Export .ics
            </button>
          </div>
          {loading ? (
            <div className="empty-state">
              Načítám úkoly ze společné databáze…
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              Zatím nemáte žádný úkol. Vytvořte první další krok.
            </div>
          ) : visibleTasks.length === 0 ? (
            <div className="empty-state">
              V tomto filtru teď není žádný úkol.
            </div>
          ) : (
            visibleTasks.map((task) => (
              <div
                className={task.status === "done" ? "task done" : "task"}
                key={task.id}
                onClick={() => openTaskEditor(task)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openTaskEditor(task);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <button onClick={(event) => { event.stopPropagation(); toggleTask(task); }}>
                  {task.status === "done" && <Check size={14} />}
                </button>
                <div>
                  <button className="link-action task-title-action" type="button" onClick={(event) => { event.stopPropagation(); openTaskEditor(task); }}>
                    {task.title}
                  </button>
                  <small>
                    {task.dueAt
                      ? new Date(task.dueAt).toLocaleString("cs-CZ")
                      : "Bez termínu"}{" "}
                    · Priorita {task.priority}
                    {task.company ? ` · ${task.company}` : ""}
                    {task.contactName ? ` · ${task.contactName}` : ""}
                  </small>
                  <div className="inline-tags">
                    {task.kind && (
                      <span>{task.kind === "meeting" ? "Schůzka" : task.kind === "note" ? "Poznámka" : "Úkol"}</span>
                    )}
                    {task.tag && <span>{task.tag}</span>}
                  </div>
                  {task.opportunityId && (
                    <button
                      className="link-action"
                      type="button"
                      onClick={(event) => { event.stopPropagation(); openOpportunity(task.opportunityId!); }}
                    >
                      Otevřít obchodní kartu
                    </button>
                  )}
                  {!task.opportunityId && task.company && (
                    <button
                      className="link-action"
                      type="button"
                      onClick={(event) => { event.stopPropagation(); openCompany(task.company!); }}
                    >
                      Otevřít firmu
                    </button>
                  )}
                  {task.dueAt && (
                    <button
                      className="link-action"
                      type="button"
                      disabled={calendarSyncingTask === task.id}
                      onClick={(event) => { event.stopPropagation(); syncTaskToGoogleCalendar(task); }}
                    >
                      {calendarSyncingTask === task.id ? "Posílám do kalendáře…" : "Přidat do Google kalendáře"}
                    </button>
                  )}
                </div>
                <div className="task-actions">
                  <button
                    type="button"
                    className="icon danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteTask(task);
                    }}
                    aria-label="Odstranit záznam"
                  >
                    <Trash2 size={15} />
                  </button>
                  <span className="avatar soft">LH</span>
                </div>
              </div>
            ))
          )}
        </section>
        <section className="panel">
          <Header title="Dnešní agenda" action="Kalendář" />
          <div className={calendarStatus?.connected ? "email-setup-warning connected" : "email-setup-warning"}>
            <b>{calendarStatus?.connected ? "Google kalendář je připojený" : "Google kalendář zatím není připojený"}</b>
            <small>
              {calendarStatus?.connected
                ? `${calendarStatus.account}${calendarStatus.lastSyncAt ? ` · poslední načtení ${new Date(calendarStatus.lastSyncAt).toLocaleString("cs-CZ")}` : ""}`
                : calendarStatus?.configured
                  ? `Připraveno k připojení. Redirect URI: ${calendarStatus.redirectUri}`
                  : `Chybí nastavení: ${(calendarStatus?.missing || ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET"]).join(", ")}`}
            </small>
          </div>
          {timedVisibleTasks
            .slice(0, 3)
            .map((task) => (
              <div className="agenda" key={task.id}>
                <b>
                  {new Date(task.dueAt!).toLocaleTimeString("cs-CZ", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </b>
                <div>
                  <i />
                  <strong>{task.title}</strong>
                  <small>
                    {task.company ? `${task.company} · ` : ""}další krok
                  </small>
                </div>
              </div>
            ))}
          {!loading && timedVisibleTasks.length === 0 && (
            <div className="empty-state">Žádné termíny v kalendáři.</div>
          )}
          <button className="calendar" type="button" onClick={exportCalendar}>
            <CalendarDays size={16} /> Stáhnout aktuální výběr do kalendáře
          </button>
          <button
            className="calendar"
            type="button"
            onClick={connectGoogleCalendar}
          >
            <CalendarDays size={16} /> {calendarStatus?.connected ? "Znovu připojit Google kalendář" : "Připojit Google kalendář"}
          </button>
          {calendarStatus?.connected && (
            <button className="calendar" type="button" onClick={loadCalendarEvents}>
              <CalendarDays size={16} /> Načíst události z Google kalendáře
            </button>
          )}
          {calendarStatus?.connected && (
            <div className="calendar-events">
              <b>Nejbližší události z Google</b>
              {calendarLoading ? (
                <small>Načítám kalendář…</small>
              ) : calendarEvents.length === 0 ? (
                <small>V Google kalendáři nejsou načtené žádné nejbližší události.</small>
              ) : (
                calendarEvents.slice(0, 5).map((event) => (
                  <a href={event.link || "#"} target="_blank" rel="noreferrer" key={event.id}>
                    <span>{event.start ? new Date(event.start).toLocaleString("cs-CZ") : "Bez termínu"}</span>
                    <strong>{event.title}</strong>
                  </a>
                ))
              )}
            </div>
          )}
        </section>
      </div>
      {open && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <header>
              <div>
                <p>NOVÝ ÚKOL</p>
                <h2>{editing ? "Upravit další krok" : "Další krok"}</h2>
              </div>
              <button type="button" onClick={() => { setOpen(false); setEditing(null); }}>
                ×
              </button>
            </header>
            <div className="form-grid task-form">
              <label>
                Název úkolu
                <input
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Například zavolat kontaktu"
                />
              </label>
              <label>
                Typ záznamu
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="task">Úkol</option>
                  <option value="meeting">Schůzka</option>
                  <option value="note">Poznámka</option>
                </select>
              </label>
              <label>
                Priorita
                <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="1">1, vysoká</option>
                  <option value="2">2, běžná</option>
                  <option value="3">3, nízká</option>
                </select>
              </label>
              <label>
                Štítek / tag
                <input
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="Například follow-up, nabídka, NIS2"
                />
              </label>
              <label>
                Termín
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </label>
              <label className="search-picker">
                Firma
                <input
                  value={companyQuery}
                  onChange={(e) => {
                    setCompanyQuery(e.target.value);
                    setCompanyId("");
                  }}
                  placeholder="Pište alespoň 3 znaky názvu firmy"
                />
                {companyQuery.trim().length > 0 && companyQuery.trim().length < 3 && (
                  <small>Pro hledání zadejte minimálně 3 znaky.</small>
                )}
                {companyResults.length > 0 && !companyId && (
                  <div className="picker-results">
                    {companyResults.map((company) => (
                      <button
                        type="button"
                        key={company.id}
                        onClick={() => {
                          setCompanyId(company.id);
                          setCompanyQuery(company.name);
                        }}
                      >
                        <strong>{company.name}</strong>
                        <span>{company.ico ? `IČO ${company.ico}` : company.source || "CRM"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <label className="search-picker">
                Kontakt
                <input
                  value={contactQuery}
                  onChange={(e) => {
                    setContactQuery(e.target.value);
                    setContactId("");
                  }}
                  placeholder="Pište alespoň 3 znaky jména, e-mailu nebo telefonu"
                />
                {contactQuery.trim().length > 0 && contactQuery.trim().length < 3 && (
                  <small>Pro hledání zadejte minimálně 3 znaky.</small>
                )}
                {contactResults.length > 0 && !contactId && (
                  <div className="picker-results">
                    {contactResults.map((contact) => {
                      const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email || "Kontakt";
                      return (
                        <button
                          type="button"
                          key={contact.id}
                          onClick={() => {
                            setContactId(contact.id);
                            setContactQuery(contactName);
                            if (contact.companyId) {
                              setCompanyId(contact.companyId);
                              setCompanyQuery(contact.company || "");
                            }
                          }}
                        >
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
              {editing && (
                <button
                  type="button"
                  className="secondary danger-action"
                  onClick={() => deleteTask(editing)}
                >
                  <Trash2 size={15} />
                  Koš
                </button>
              )}
              <button
                type="button"
                className="secondary"
                onClick={() => { setOpen(false); setEditing(null); }}
              >
                Zrušit
              </button>
              <button disabled={saving} type="submit" className="primary">
                {saving ? "Ukládám…" : editing ? "Uložit změny" : "Uložit úkol"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
