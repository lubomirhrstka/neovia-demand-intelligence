"use client";

import { useEffect, useMemo, useState } from "react";
import { getNameDay, getPublicHolidayName } from "@/lib/czech-calendar";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  FileBarChart,
  Filter,
  KanbanSquare,
  LayoutDashboard,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Analytics } from "@/components/analytics";
import packageInfo from "../../package.json";

const APP_VERSION = packageInfo.version;
const APP_RELEASE_DATE = process.env.NEXT_PUBLIC_APP_RELEASE_DATE || "2026-09-21";

type View =
  | "Přehled"
  | "E-mail"
  | "Kalendář"
  | "Poptávky"
  | "Kontakty"
  | "Pool kapacit"
  | "Pipeline"
  | "Úkoly"
  | "Zdroje"
  | "Analýzy"
  | "Nastavení";
const views: View[] = [
  "Přehled",
  "E-mail",
  "Kalendář",
  "Poptávky",
  "Kontakty",
  "Pool kapacit",
  "Pipeline",
  "Úkoly",
  "Zdroje",
  "Analýzy",
  "Nastavení",
];
function goTo(view: View) {
  window.location.hash = encodeURIComponent(view);
}
function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
function formatIcsDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}
function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function toDatetimeLocal(value: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
function repairCzechMojibake(value: string) {
  const replacements: Record<string, string> = {
    "√°": "á",
    "√Å": "Á",
    "ƒç": "č",
    "ƒå": "Č",
    "ƒè": "ď",
    "ƒé": "Ď",
    "√©": "é",
    "√â": "É",
    "ƒõ": "ě",
    "ƒö": "Ě",
    "√≠": "í",
    "√ç": "Í",
    "≈à": "ň",
    "≈á": "Ň",
    "√≥": "ó",
    "√ì": "Ó",
    "≈ô": "ř",
    "≈ò": "Ř",
    "≈°": "š",
    "≈†": "Š",
    "≈•": "ť",
    "≈§": "Ť",
    "√∫": "ú",
    "√ö": "Ú",
    "≈Ø": "ů",
    "≈Æ": "Ů",
    "√Ω": "ý",
    "√ù": "Ý",
    "≈æ": "ž",
    "≈Ω": "Ž",
  };
  return Object.entries(replacements).reduce(
    (text, [broken, fixed]) => text.replaceAll(broken, fixed),
    value,
  );
}
function parseCsvRow(row: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    const next = row[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ";" && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function utf16LeBlob(content: string, type: string) {
  const bytes = new Uint8Array(content.length * 2 + 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    bytes[index * 2 + 2] = code & 0xff;
    bytes[index * 2 + 3] = code >> 8;
  }
  return new Blob([bytes], { type });
}
function downloadCsv(rows: string[], filename: string) {
  const parsedRows = rows.map((row) =>
    parseCsvRow(row).map((cell) => repairCzechMojibake(cell)),
  );
  const columnCount = Math.max(1, ...parsedRows.map((row) => row.length));
  const dataRowCount = Math.max(1, parsedRows.length);
  const filterRange = `R3C1:R${dataRowCount + 2}C${columnCount}`;
  const generatedAt = new Date().toLocaleString("cs-CZ");
  const tableRows = [
    `<tr class="export-title"><td colspan="${columnCount}">NEOVIA export, ${escapeHtml(generatedAt)}</td></tr>`,
    `<tr class="export-filter"><td colspan="${columnCount}">Filtr a hledání: v Excelu použij šipky v hlavičce tabulky nebo zkratku Ctrl+F. AutoFilter je připravený pro celý rozsah dat.</td></tr>`,
    ...parsedRows.map((row, rowIndex) => {
      const tag = rowIndex === 0 ? "th" : "td";
      return `<tr>${Array.from({ length: columnCount }, (_, cellIndex) => {
        const cell = row[cellIndex] || "";
        return `<${tag}>${escapeHtml(cell)}</${tag}>`;
      }).join("")}</tr>`;
    }),
  ].join("");
  const workbook = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-16" />
<!--[if gte mso 9]><xml>
<x:ExcelWorkbook>
<x:ExcelWorksheets>
<x:ExcelWorksheet>
<x:Name>Export</x:Name>
<x:WorksheetOptions>
<x:Selected/>
<x:FreezePanes/>
<x:FrozenNoSplit/>
<x:SplitHorizontal>3</x:SplitHorizontal>
<x:TopRowBottomPane>3</x:TopRowBottomPane>
<x:ActivePane>2</x:ActivePane>
<x:AutoFilter x:Range="${filterRange}"/>
</x:WorksheetOptions>
</x:ExcelWorksheet>
</x:ExcelWorksheets>
</x:ExcelWorkbook>
</xml><![endif]-->
<style>
body { font-family: Arial, sans-serif; }
table { border-collapse: collapse; }
th, td {
  border: 1px solid #9fb8b7;
  padding: 6px 8px;
  vertical-align: top;
  white-space: nowrap;
  mso-number-format: "\\@";
}
th {
  background: #0b7d70;
  color: #ffffff;
  font-weight: 700;
}
.export-title td {
  background: #e6f4f1;
  color: #173739;
  font-weight: 700;
  font-size: 13px;
}
.export-filter td {
  background: #fff6df;
  color: #6a5114;
  font-weight: 700;
}
</style>
</head>
<body><table>${tableRows}</table></body></html>`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    utf16LeBlob(workbook, "application/vnd.ms-excel;charset=utf-16le"),
  );
  link.download = filename.replace(/\.csv$/i, ".xls");
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}
type Demand = {
  id: string;
  company: string;
  role: string;
  place: string;
  source: string;
  score: number;
  status: string;
  contact: string;
  age: string;
  tags: string[];
};
const demands: Demand[] = [];
type Contact = {
  id: string;
  companyId: string | null;
  name: string;
  company: string;
  role: string;
  email: string;
  secondaryEmail?: string;
  phone: string;
  secondaryPhone?: string;
  source: string;
  state: string;
  duplicates: number;
  last: string;
  verified: boolean;
};
type CompanyRecord = {
  id: string;
  name: string;
  ico: string | null;
  website: string | null;
  sector: string | null;
  source: string | null;
  priority: string | null;
  size: string | null;
  relationshipStatus: string | null;
  ownerName: string | null;
  decisionMaker: string | null;
  nextStep: string | null;
  nextStepDueAt: string | null;
  note: string | null;
  doNotContact: boolean;
  updatedAt: string;
  contactsCount: number;
  demandsCount: number;
  opportunitiesCount: number;
};
type ActivityRecord = {
  id: string;
  type: string;
  subject: string;
  note: string | null;
  occurredAt: string;
  companyId: string | null;
  company: string | null;
  contactId: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  opportunityId: string | null;
  opportunityTitle: string | null;
};
const initialContacts: Contact[] = [];
type TaskRecord = {
  id: string;
  title: string;
  kind?: string | null;
  priority: number;
  tag?: string | null;
  dueAt: string | null;
  status: string;
  externalProvider?: string | null;
  externalId?: string | null;
  syncedAt?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  companyId?: string | null;
  opportunityId?: string | null;
  opportunityTitle?: string | null;
  company?: string | null;
};
type CalendarStatus = {
  configured: boolean;
  connected: boolean;
  account: string;
  oauthUrl: string | null;
  redirectUri: string;
  missing: string[];
  mode: string;
  lastSyncAt: string | null;
};
type CalendarEventRecord = {
  id: string;
  title: string;
  start: string | null;
  end: string | null;
  link: string;
};
type DashboardOpportunity = {
  id: string;
  title: string;
  companyId?: string | null;
  company: string | null;
  stage: string;
  valueCzk: number | null;
  probability: number;
  expectedCloseDate: string | null;
  source?: string | null;
};
type ContactRecord = {
  id: string;
  firstName: string;
  lastName: string;
  role: string | null;
  email: string | null;
  secondaryEmail?: string | null;
  phone: string | null;
  secondaryPhone?: string | null;
  verified: boolean;
  companyId?: string | null;
  company: string | null;
};
type ImportRunRecord = {
  id: string;
  sourceName: string | null;
  sourceKey: string | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  receivedCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorSummary: string | null;
};
const nav: { label: View; icon: typeof LayoutDashboard }[] = [
  { label: "Přehled", icon: LayoutDashboard },
  { label: "E-mail", icon: Mail },
  { label: "Kalendář", icon: CalendarDays },
  { label: "Poptávky", icon: BriefcaseBusiness },
  { label: "Kontakty", icon: Users },
  { label: "Pool kapacit", icon: Target },
  { label: "Pipeline", icon: KanbanSquare },
  { label: "Úkoly", icon: CircleCheck },
  { label: "Zdroje", icon: Activity },
  { label: "Analýzy", icon: FileBarChart },
];

export default function Home() {
  const { data: session, isPending } = authClient.useSession();
  const [view, setView] = useState<View>("Přehled"),
    [focus, setFocus] = useState(""),
    [query, setQuery] = useState(""),
    [onlyFocus, setOnlyFocus] = useState(false),
    [toast, setToast] = useState(""),
    [contactList, setContactList] = useState<Contact[]>(initialContacts);
  useEffect(() => {
    const saved = window.localStorage.getItem("neovia-contacts");
    if (saved) {
      try {
        setContactList(JSON.parse(saved));
      } catch {
        window.localStorage.removeItem("neovia-contacts");
      }
    }
  }, []);
  useEffect(() => {
    window.localStorage.setItem("neovia-contacts", JSON.stringify(contactList));
  }, [contactList]);
  useEffect(() => {
    const sync = () => {
      const candidate = decodeURIComponent(window.location.hash.slice(1));
      if (views.includes(candidate as View)) setView(candidate as View);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const filtered = useMemo(
    () =>
      demands.filter(
        (d) =>
          `${d.company} ${d.role} ${d.tags.join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (!onlyFocus || d.score >= 80),
      ),
    [query, onlyFocus],
  );
  const note = (s: string) => {
    setToast(s);
    window.setTimeout(() => setToast(""), 2600);
  };
  if (isPending)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <div className="brand-mark">N</div>
          <p>Ověřuji přístup k pracovnímu prostoru.</p>
        </div>
      </main>
    );
  if (!session) return <AuthScreen />;
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div>N</div>
          <span>NEOVIA</span>
          <small>INTELLIGENCE</small>
        </div>
        <div className="workspace">
          <span className="avatar blue">L</span>
          <div>
            <b>{session.user.name}</b>
            <small>Obchodní tým</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <nav>
          {nav.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={view === label ? "nav active" : "nav"}
              onClick={() => goTo(label)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
        <div className="bottom">
          <button
            className={view === "Nastavení" ? "nav active" : "nav"}
            onClick={() => goTo("Nastavení")}
          >
            <Settings size={18} />
            Nastavení
          </button>
          <small>
            <i></i> Data se načítají z pracovního prostoru
          </small>
          <small className="app-version">
            v{APP_VERSION} · {APP_RELEASE_DATE} · NEOVIA Demand Intelligence
          </small>
        </div>
      </aside>
      <section className="content">
        <header>
          <div>
            <span>Pracovní prostor</span>
            <b>/</b>
            <strong>{view}</strong>
          </div>
          <div>
            <button
              className="icon"
              onClick={() => note("Nemáte žádná nová systémová upozornění.")}
            >
              <Bell size={18} />
              <em />
            </button>
            <span className="avatar ink">
              {session.user.name
                .split(" ")
                .map((x) => x[0])
                .slice(0, 2)
                .join("")}
            </span>
          </div>
        </header>
        <div className="page">
          {view === "Přehled" && (
            <Dashboard
              {...{ focus, setFocus, onlyFocus, setOnlyFocus, filtered, note }}
            />
          )}
          {view === "E-mail" && <EmailClient note={note} />}
          {view === "Kalendář" && <CalendarView note={note} />}
          {view === "Poptávky" && (
            <Demands {...{ query, setQuery, filtered, note }} />
          )}
          {view === "Kontakty" && (
            <Contacts
              note={note}
              contacts={contactList}
              setContacts={setContactList}
              setQuery={setQuery}
            />
          )}{" "}
          {view === "Pool kapacit" && <Pool note={note} />}{" "}
          {view === "Pipeline" && <Pipeline note={note} />}{" "}
          {view === "Úkoly" && <Tasks note={note} />}
          {view === "Zdroje" && <Sources note={note} />}{" "}
          {view === "Analýzy" && <Analytics />}
          {view === "Nastavení" && (
            <AccountSettings
              name={session.user.name}
              email={session.user.email}
              note={note}
            />
          )}
        </div>
      </section>
      {toast && (
        <div className="toast">
          <CircleCheck size={18} />
          {toast}
        </div>
      )}
    </main>
  );
}
function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("signup"),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const result =
      mode === "signup"
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
    if (!result.error && mode === "signup")
      await fetch("/api/bootstrap", { method: "POST" });
    setBusy(false);
    if (result.error)
      setMessage(result.error.message || "Přihlášení se nepodařilo.");
  };
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-logo">
          <span>N</span>
          <b>NEOVIA</b>
          <small>INTELLIGENCE</small>
        </div>
        <p className="eyebrow">ZABEZPEČENÝ PRACOVNÍ PROSTOR</p>
        <h1>
          {mode === "signup" ? "Vytvořte první týmový účet" : "Přihlaste se"}
        </h1>
        <p className="auth-subtitle">
          {mode === "signup"
            ? "Váš účet bude uložen v zabezpečené databázi NEOVIA."
            : "Pokračujte do svého obchodního pracovního prostoru."}
        </p>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Jméno a příjmení
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vaše jméno"
              />
            </label>
          )}
          <label>
            Služební e-mail
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jmeno@firma.cz"
            />
          </label>
          <label>
            Heslo
            <input
              required
              minLength={8}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nejméně 8 znaků"
            />
          </label>
          {message && <div className="auth-error">{message}</div>}
          <button disabled={busy} className="primary" type="submit">
            {busy
              ? "Probíhá ověření…"
              : mode === "signup"
                ? "Vytvořit účet"
                : "Přihlásit se"}
          </button>
        </form>
        <button
          className="auth-switch"
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setMessage("");
          }}
        >
          {mode === "signup"
            ? "Už mám účet, přihlásit se"
            : "Ještě nemám účet, vytvořit ho"}
        </button>
      </section>
    </main>
  );
}
function AccountSettings({
  name,
  email,
  note,
}: {
  name: string;
  email: string;
  note: (s: string) => void;
}) {
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [again, setAgain] = useState(""),
    [mailAccount, setMailAccount] = useState(() => window.localStorage.getItem("neovia-mail-account") || email),
    [mailSenderName, setMailSenderName] = useState(() => window.localStorage.getItem("neovia-mail-sender") || name),
    [mailSignature, setMailSignature] = useState(() => window.localStorage.getItem("neovia-mail-signature") || "Lubomír Hrstka\nNEOVIA"),
    [mailMode, setMailMode] = useState(() => window.localStorage.getItem("neovia-mail-mode") || "draft_review"),
    [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/calendar/google/status")
      .then((response) => (response.ok ? response.json() : null))
      .then(setCalendarStatus)
      .catch(() => setCalendarStatus(null));
  }, []);
  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next.length < 8) {
      setError("Nové heslo musí mít alespoň 8 znaků.");
      return;
    }
    if (next !== again) {
      setError("Nové heslo a jeho potvrzení se neshodují.");
      return;
    }
    setBusy(true);
    const result = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (result.error) {
      setError(
        result.error.message ||
          "Heslo se nepodařilo změnit. Zkontrolujte aktuální heslo.",
      );
      return;
    }
    setCurrent("");
    setNext("");
    setAgain("");
    note("Heslo bylo změněno. Ostatní zařízení byla odhlášena.");
  };
  const signOut = async () => {
    await authClient.signOut();
    window.location.reload();
  };
  const saveMailSettings = () => {
    window.localStorage.setItem("neovia-mail-account", mailAccount);
    window.localStorage.setItem("neovia-mail-sender", mailSenderName);
    window.localStorage.setItem("neovia-mail-signature", mailSignature);
    window.localStorage.setItem("neovia-mail-mode", mailMode);
    note("E-mailové nastavení bylo uloženo v aplikaci. Skutečné Gmail API se zapne po doplnění Google OAuth přístupů.");
  };
  const connectGoogleCalendar = () => {
    if (!calendarStatus?.oauthUrl) {
      note("Google kalendář není připravený k připojení. Zkontrolujte OAuth nastavení.");
      return;
    }
    window.open(calendarStatus.oauthUrl, "_blank", "noopener,noreferrer");
  };
  return (
    <>
      <div className="title">
        <div>
          <p>ÚČET A ZABEZPEČENÍ</p>
          <h1>Nastavení</h1>
          <small>Správa vašeho přístupu k pracovnímu prostoru.</small>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel setting-card">
          <h2>Váš účet</h2>
          <div className="account-line">
            <span className="avatar blue">
              {name
                .split(" ")
                .map((x) => x[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <b>{name}</b>
              <small>{email}</small>
            </div>
          </div>
          <p>První založený účet je správce pracovního prostoru.</p>
        </section>
        <section className="panel setting-card">
          <h2>Firemní Gmail a e-mailový klient</h2>
          <p>
            Bezpečný režim je připravený: aplikace generuje koncept, uloží ho ke kontaktu jako komunikaci a otevře Gmail ke kontrole před odesláním.
          </p>
          <div className="email-status-card">
            <span className="source-tag">PŘIPRAVENO</span>
            <b>Gmail OAuth zatím není připojený</b>
            <small>Po doplnění Google Client ID, Client Secret a callback URL půjde zapnout čtení inboxu, Gmail drafts a odesílání přes API.</small>
          </div>
          <div className="form-grid email-settings-grid">
            <label>
              Výchozí e-mailový účet
              <input value={mailAccount} onChange={(e) => setMailAccount(e.target.value)} />
            </label>
            <label>
              Jméno odesílatele
              <input value={mailSenderName} onChange={(e) => setMailSenderName(e.target.value)} />
            </label>
            <label>
              Režim odesílání
              <select value={mailMode} onChange={(e) => setMailMode(e.target.value)}>
                <option value="draft_review">Vždy vytvořit koncept ke kontrole</option>
                <option value="batch_review">Fronta konceptů, potvrdit dávku</option>
                <option value="api_ready">API připraveno, neodesílat bez potvrzení</option>
              </select>
            </label>
            <label>
              Podpis
              <textarea value={mailSignature} onChange={(e) => setMailSignature(e.target.value)} />
            </label>
          </div>
          <div className="email-rules">
            <b>Bezpečnostní pravidla</b>
            <span>Neodesílat kontaktům označeným neoslovovat.</span>
            <span>Každý e-mail uložit jako aktivitu ke kontaktu a firmě.</span>
            <span>Automatické odeslání pouze po ručním potvrzení.</span>
            <span>Follow-up vždy jako úkol, ne jako skryté odeslání.</span>
          </div>
          <button className="primary" onClick={saveMailSettings}>
            Uložit e-mailové nastavení
          </button>
        </section>
        <section className="panel setting-card">
          <h2>Google kalendář</h2>
          <p>
            Připojení a případnou reautorizaci kalendáře spravujte tady. V kalendáři pak zůstane jen běžná práce se schůzkami a synchronizací.
          </p>
          <div className={calendarStatus?.connected ? "email-status-card connected" : "email-status-card"}>
            <span className="source-tag">{calendarStatus?.connected ? "PŘIPOJENO" : "PŘIPRAVENO"}</span>
            <b>{calendarStatus?.connected ? calendarStatus.account : "Google kalendář zatím není připojený"}</b>
            <small>
              {calendarStatus?.connected
                ? calendarStatus.lastSyncAt
                  ? `Poslední synchronizace: ${new Date(calendarStatus.lastSyncAt).toLocaleString("cs-CZ")}`
                  : "Kalendář je připojený, zatím bez záznamu synchronizace."
                : calendarStatus?.configured
                  ? `Redirect URI: ${calendarStatus.redirectUri}`
                  : `Chybí nastavení: ${(calendarStatus?.missing || ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET"]).join(", ")}`}
            </small>
          </div>
          <button className="primary" type="button" onClick={connectGoogleCalendar}>
            {calendarStatus?.connected ? "Znovu připojit Google kalendář" : "Připojit Google kalendář"}
          </button>
        </section>
        <section className="panel setting-card">
          <h2>Změnit heslo</h2>
          <p>Po změně budou ostatní přihlášená zařízení odhlášena.</p>
          <form className="password-form" onSubmit={changePassword}>
            <label>
              Současné heslo
              <input
                required
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <label>
              Nové heslo
              <input
                required
                minLength={8}
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label>
              Potvrdit nové heslo
              <input
                required
                minLength={8}
                type="password"
                value={again}
                onChange={(e) => setAgain(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            {error && <div className="auth-error">{error}</div>}
            <button disabled={busy} className="primary" type="submit">
              {busy ? "Ukládám…" : "Změnit heslo"}
            </button>
          </form>
        </section>
        <section className="panel setting-card">
          <h2>Zapomenuté heslo</h2>
          <p>
            Obnova e-mailem se aktivuje po připojení firemní pošty. Dokud jste
            přihlášený, heslo změníte bezpečně výše.
          </p>
          <button
            className="secondary"
            onClick={() =>
              note(
                "Pro e-mailový reset je potřeba připojit odesílání z firemní adresy.",
              )
            }
          >
            Nastavit e-mailový reset
          </button>
        </section>
        <section className="panel setting-card danger-card">
          <h2>Odhlášení</h2>
          <p>Ukončí aktuální relaci na tomto zařízení.</p>
          <button className="secondary" onClick={signOut}>
            Odhlásit se
          </button>
        </section>
      </div>
    </>
  );
}
function Title({
  eyebrow,
  title,
  subtitle,
  button,
  note,
  onAction,
  tools,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  button: string;
  note: (s: string) => void;
  onAction?: () => void;
  tools?: React.ReactNode;
}) {
  const action = () => {
    if (onAction) {
      onAction();
      return;
    }
    if (button === "Přidat poptávku" || button === "Importovat data") {
      goTo("Zdroje");
      return;
    }
    if (button === "Přidat kapacitu") {
      goTo("Pool kapacit");
      note("Přidání kapacity bude dostupné po dokončení evidence kapacit.");
      return;
    }
    if (button === "Nový případ") {
      goTo("Pipeline");
      note(
        "Nový případ bude dostupný po dokončení evidence obchodních případů.",
      );
      return;
    }
    if (button === "Export reportu") {
      downloadCsv(["Metrika;Hodnota"], "neovia-analyza-role.csv");
      note("Report byl stažen jako CSV.");
    }
  };
  return (
    <div className="title">
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <small>{subtitle}</small>
      </div>
      <div className="title-actions">
        {tools}
        <button className="primary" onClick={action}>
          <Plus size={17} />
          {button}
        </button>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  change,
  icon,
  alert,
  onClick,
}: {
  label: string;
  value: string;
  change: string;
  icon: React.ReactNode;
  alert?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className="metric" onClick={onClick}>
      <div className={alert ? "metric-icon warn" : "metric-icon"}>{icon}</div>
      <div>
        <small>{label}</small>
        <b>{value}</b>
        <span className={alert ? "warning" : "positive"}>
          {!alert && <ArrowUpRight size={13} />} {change}
        </span>
      </div>
    </Tag>
  );
}
function Header({ title, action }: { title: string; action: string }) {
  const open = () => {
    if (action === "Zobrazit vše") goTo("Poptávky");
    else if (action === "Kalendář") goTo("Úkoly");
    else if (action === "Otevřít kontakty") goTo("Kontakty");
    else if (action === "Otevřít CRM") goTo("Kontakty");
  };
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      <button onClick={open}>
        {action}
        <ChevronDown size={14} />
      </button>
    </div>
  );
}
function Row({ d, note }: { d: Demand; note: (s: string) => void }) {
  const openDemand = () => {
    window.localStorage.setItem("neovia-open-demand", d.id);
    goTo("Poptávky");
  };
  return (
    <div className="demand-row" onClick={openDemand} role="button" tabIndex={0}>
      <div>
        <span className="company">{d.company[0]}</span>
        <div>
          <b>{d.role}</b>
          <small>
            {d.company} · {d.place}
          </small>
        </div>
      </div>
      <span className="source">{d.source}</span>
      <span className="score">
        <i style={{ width: `${d.score}%` }} />
        {d.score}%
      </span>
      <button
        className="quiet"
        onClick={(event) => { event.stopPropagation(); openDemand(); }}
      >
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
}
function Dashboard({
  focus,
  setFocus,
  onlyFocus,
  setOnlyFocus,
  filtered,
  note,
}: {
  focus: string;
  setFocus: (x: string) => void;
  onlyFocus: boolean;
  setOnlyFocus: (x: boolean) => void;
  filtered: Demand[];
  note: (s: string) => void;
}) {
  const [nextTasks, setNextTasks] = useState<TaskRecord[]>([]),
    [dashboardDemands, setDashboardDemands] = useState<ImportedDemand[]>([]),
    [opportunities, setOpportunities] = useState<DashboardOpportunity[]>([]),
    [contacts, setContacts] = useState<ContactRecord[]>([]),
    [companies, setCompanies] = useState<CompanyRecord[]>([]),
    [activities, setActivities] = useState<ActivityRecord[]>([]),
    [globalSearch, setGlobalSearch] = useState(""),
    [loading, setLoading] = useState(true);
  const today = new Date();
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);
  const dateLabel = today
    .toLocaleDateString("cs-CZ", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })
    .toUpperCase();
  const greeting =
    today.getHours() < 11
      ? "Dobré ráno"
      : today.getHours() < 18
        ? "Dobrý den"
        : "Dobrý večer";
  useEffect(() => {
    Promise.all([
      fetch("/api/tasks").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/demands").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/opportunities").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/contacts").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/companies").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/activities").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([taskData, demandData, opportunityData, contactData, companyData, activityData]) => {
        setNextTasks(taskData);
        setDashboardDemands(demandData);
        setOpportunities(opportunityData);
        setContacts(contactData);
        setCompanies(companyData);
        setActivities(activityData);
      })
      .catch(() => note("Přehled se nepodařilo celý načíst."))
      .finally(() => setLoading(false));
  }, []);
  const visibleDemands = dashboardDemands.filter((d) => {
    const text = `${d.company || ""} ${d.role || ""} ${d.title || ""} ${(d.technologies || []).join(" ")}`.toLowerCase();
    return (!focus || text.includes(focus.toLowerCase())) && (!onlyFocus || Number(d.relevanceScore || 0) >= 80);
  });
  const newToday = dashboardDemands.filter((d) => {
    const imported = d.importedAt ? new Date(d.importedAt) : null;
    return imported && imported >= startOfToday && imported <= endOfToday;
  }).length;
  const hotDemands = dashboardDemands
    .map((d) => ({ demand: d, intel: demandIntelligence(d) }))
    .sort((a, b) => b.intel.score - a.intel.score)
    .slice(0, 5);
  const missingContactDemands = dashboardDemands.filter((d) => !hasDemandContact(d)).length;
  const cyberDemands = dashboardDemands.filter((d) => demandIntelligence(d).cyberSignals.length > 0).length;
  const duplicateSignals = dashboardDemands.reduce((sum, demand, index) => {
    const previous = dashboardDemands.slice(0, index);
    return sum + (demandDuplicates(demand, previous).length ? 1 : 0);
  }, 0);
  const openTasks = nextTasks.filter((t) => t.status !== "done");
  const todayTasks = openTasks.filter((t) => {
    const due = t.dueAt ? new Date(t.dueAt) : null;
    return due && due >= startOfToday && due <= endOfToday;
  });
  const overdueTasks = openTasks.filter((t) => {
    const due = t.dueAt ? new Date(t.dueAt) : null;
    return due && due < startOfToday;
  });
  const pipelineValue = opportunities.reduce(
    (sum, item) => sum + Number(item.valueCzk || 0),
    0,
  );
  const proposalStages = new Set(["proposal", "negotiation", "contract", "won"]);
  const conversion =
    opportunities.length > 0
      ? Math.round(
          (opportunities.filter((x) => proposalStages.has(x.stage)).length /
            opportunities.length) *
            100,
        )
      : 0;
  const contactsToCheck = contacts.filter(
    (contact) => !contact.verified || !contact.email || !contact.phone,
  ).length;
  const todayActivities = activities.filter((activity) => {
    const occurred = activity.occurredAt ? new Date(activity.occurredAt) : null;
    return occurred && occurred >= startOfToday && occurred <= endOfToday;
  });
  const completeDashboardTask = async (task: TaskRecord) => {
    setNextTasks(nextTasks.map((x) => (x.id === task.id ? { ...x, status: "done" } : x)));
    const response = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, status: "done" }),
    });
    if (!response.ok) {
      setNextTasks(nextTasks);
      note("Úkol se nepodařilo dokončit.");
      return;
    }
    note("Úkol byl dokončen a zmizí z otevřených kroků.");
  };
  const monthBuckets = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1);
    const label = date.toLocaleDateString("cs-CZ", { month: "short" });
    const count = dashboardDemands.filter((d) => {
      const imported = d.importedAt ? new Date(d.importedAt) : null;
      return (
        imported &&
        imported.getFullYear() === date.getFullYear() &&
        imported.getMonth() === date.getMonth()
      );
    }).length;
    return { label, count };
  });
  const maxMonth = Math.max(1, ...monthBuckets.map((x) => x.count));
  const weekDays = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return {
      key: date.toISOString(),
      day: date.toLocaleDateString("cs-CZ", { weekday: "short" }).toUpperCase(),
      date: date.toLocaleDateString("cs-CZ", { day: "2-digit" }),
      today: index === 0,
    };
  });
  const openGlobalResult = (result: { type: string; id?: string; company?: string | null; opportunityId?: string | null }) => {
    if (result.type === "Poptávka" && result.id) {
      window.localStorage.setItem("neovia-open-demand", result.id);
      goTo("Poptávky");
      return;
    }
    if (result.type === "Firma" && (result.id || result.company)) {
      window.localStorage.setItem("neovia-open-company", result.id || result.company || "");
      goTo("Kontakty");
      return;
    }
    if (result.type === "Kontakt" && result.id) {
      window.localStorage.setItem("neovia-open-contact", result.id);
      goTo("Kontakty");
      return;
    }
    if (result.type === "Pipeline" && result.id) {
      window.localStorage.setItem("neovia-open-opportunity", result.id);
      goTo("Pipeline");
      return;
    }
    if (result.type === "Úkol") {
      goTo("Úkoly");
      return;
    }
    if (result.type === "Aktivita") {
      if (result.opportunityId) window.localStorage.setItem("neovia-open-opportunity", result.opportunityId);
      goTo(result.opportunityId ? "Pipeline" : "Kontakty");
    }
  };
  const globalResults = [
    ...dashboardDemands.map((d) => ({
      type: "Poptávka",
      id: d.id,
      title: d.role || d.title,
      subtitle: `${d.company || "Firma neuvedena"} · ${d.source}`,
      text: `${d.title} ${d.role || ""} ${d.company || ""} ${d.source} ${d.location || ""} ${d.demandText || ""} ${(d.technologies || []).join(" ")}`,
    })),
    ...companies.map((company) => ({
      type: "Firma",
      id: company.id,
      company: company.name,
      title: company.name,
      subtitle: `${company.source || "Zdroj neuveden"} · ${company.contactsCount || 0} kontaktů`,
      text: `${company.name} ${company.ico || ""} ${company.website || ""} ${company.sector || ""} ${company.source || ""} ${company.note || ""} ${company.decisionMaker || ""}`,
    })),
    ...contacts.map((contact) => ({
      type: "Kontakt",
      id: contact.id,
      company: contact.company,
      title: `${contact.firstName} ${contact.lastName}`,
      subtitle: `${contact.company || "Firma neuvedena"} · ${contact.role || "Role neuvedena"}`,
      text: `${contact.firstName} ${contact.lastName} ${contact.company || ""} ${contact.role || ""} ${contact.email || ""} ${contact.phone || ""}`,
    })),
    ...opportunities.map((opportunity) => ({
      type: "Pipeline",
      id: opportunity.id,
      company: opportunity.company,
      title: opportunity.title,
      subtitle: `${opportunity.company || "Firma neuvedena"} · ${opportunity.stage} · ${opportunity.probability}%`,
      text: `${opportunity.title} ${opportunity.company || ""} ${opportunity.stage} ${opportunity.source || ""} ${opportunity.valueCzk || ""}`,
    })),
    ...nextTasks.map((task) => ({
      type: "Úkol",
      id: task.id,
      company: task.company,
      opportunityId: task.opportunityId || null,
      title: task.title,
      subtitle: `${task.company || "Bez firmy"} · ${task.dueAt ? new Date(task.dueAt).toLocaleString("cs-CZ") : "Bez termínu"}`,
      text: `${task.title} ${task.company || ""} ${task.opportunityTitle || ""} ${task.status}`,
    })),
    ...activities.map((activity) => ({
      type: "Aktivita",
      id: activity.id,
      company: activity.company,
      opportunityId: activity.opportunityId || null,
      title: activity.subject,
      subtitle: `${activity.company || [activity.contactFirstName, activity.contactLastName].filter(Boolean).join(" ") || "Bez vazby"} · ${activity.type}`,
      text: `${activity.subject} ${activity.note || ""} ${activity.company || ""} ${activity.contactFirstName || ""} ${activity.contactLastName || ""} ${activity.opportunityTitle || ""}`,
    })),
  ]
    .filter((item) => !globalSearch.trim() || item.text.toLowerCase().includes(globalSearch.toLowerCase()))
    .slice(0, 8);
  return (
    <>
      <Title
        eyebrow={dateLabel}
        title={`${greeting}, Lubomíre.`}
        subtitle={
          loading
            ? "Načítám aktuální stav pracovního prostoru."
            : `${newToday} nových poptávek dnes, ${openTasks.length} otevřených úkolů, ${todayActivities.length} aktivit dnes.`
        }
        button="Importovat data"
        note={note}
        tools={
          <label className="global-search">
            <Search size={16} />
            <input
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Hledat v celé aplikaci"
            />
          </label>
        }
      />
      {globalSearch.trim() && (
        <section className="global-results panel">
          <div className="panel-header">
            <h2>Výsledky hledání</h2>
            <button onClick={() => setGlobalSearch("")}>
              Zavřít
              <ChevronDown size={14} />
            </button>
          </div>
          {globalResults.length === 0 ? (
            <div className="empty-state">Nic jsem v databázi nenašel.</div>
          ) : (
            globalResults.map((result) => (
              <button
                type="button"
                key={`${result.type}-${result.id}-${result.title}`}
                onClick={() => openGlobalResult(result)}
              >
                <span className="source-tag">{result.type}</span>
                <div>
                  <b>{result.title}</b>
                  <small>{result.subtitle}</small>
                </div>
                <ArrowUpRight size={15} />
              </button>
            ))
          )}
        </section>
      )}
      <section className="focus">
        <div className="focus-icon">
          <Target size={20} />
        </div>
        <div className="focus-copy">
          <span>AKTIVNÍ FOKUS</span>
          <label>
            <input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="Zadejte hledanou roli"
            />
            <ChevronDown size={16} />
          </label>
          <small>
            Filtruje reálné poptávky podle role, firmy, názvu a technologií.
          </small>
        </div>
        <div className="focus-metric">
          <b>{visibleDemands.length}</b>
          <small>relevantních poptávek</small>
        </div>
        <div className="focus-metric">
          <b>{newToday}</b>
          <small>nové dnes</small>
        </div>
        <button
          className={onlyFocus ? "filter on" : "filter"}
          onClick={() => setOnlyFocus(!onlyFocus)}
        >
          <SlidersHorizontal size={16} />
          {onlyFocus ? "Pouze shody" : "Filtrovat shody"}
        </button>
      </section>
      <section className="metrics">
        <Metric
          label="Nové poptávky"
          value={String(newToday)}
          change={`${dashboardDemands.length} celkem`}
          icon={<BriefcaseBusiness size={19} />}
          onClick={() => goTo("Poptávky")}
        />
        <Metric
          label="Pipeline"
          value={`${pipelineValue.toLocaleString("cs-CZ")} Kč`}
          change={`${opportunities.length} případů`}
          icon={<Activity size={19} />}
          onClick={() => goTo("Pipeline")}
        />
        <Metric
          label="Konverze na nabídku"
          value={`${conversion} %`}
          change={`${opportunities.filter((x) => proposalStages.has(x.stage)).length} v nabídce a dál`}
          icon={<ArrowUpRight size={19} />}
          onClick={() => goTo("Analýzy")}
        />
        <Metric
          label="Kontakty k ověření"
          value={String(contactsToCheck)}
          change={`${todayActivities.length} aktivit dnes`}
          alert={contactsToCheck > 0}
          icon={<Phone size={19} />}
          onClick={() => goTo("Kontakty")}
        />
      </section>
      <section className="panel sales-radar">
        <div className="panel-header">
          <h2>Obchodní radar</h2>
          <button onClick={() => goTo("Poptávky")}>
            Kvalifikovat poptávky
            <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="radar-grid">
          <article>
            <b>{hotDemands.filter((x) => x.intel.score >= 80).length}</b>
            <span>horké příležitosti</span>
            <small>skóre 80 % a více</small>
          </article>
          <article>
            <b>{cyberDemands}</b>
            <span>NIS2/kyber signály</span>
            <small>role, štítky nebo text</small>
          </article>
          <article>
            <b>{missingContactDemands}</b>
            <span>bez kontaktu</span>
            <small>potřebují dohledat osobu</small>
          </article>
          <article>
            <b>{duplicateSignals}</b>
            <span>možné duplicity</span>
            <small>stejná firma a role</small>
          </article>
        </div>
        <div className="radar-list">
          {hotDemands.length === 0 ? (
            <div className="empty-state">Radar se naplní po importu poptávek.</div>
          ) : (
            hotDemands.map(({ demand, intel }) => (
              <button
                type="button"
                key={demand.id}
                onClick={() => {
                  window.localStorage.setItem("neovia-open-demand", demand.id);
                  goTo("Poptávky");
                }}
              >
                <strong>{intel.score}%</strong>
                <span>
                  <b>{demand.role || demand.title}</b>
                  <small>{demand.company || "Firma neuvedena"} · {recommendedNextStep(demand)}</small>
                </span>
              </button>
            ))
          )}
        </div>
      </section>
      <div className="grid">
        <section className="panel wide">
          <Header title="Nejrelevantnější poptávky" action="Zobrazit vše" />
          <div className="table-label">
            <span>Poptávka</span>
            <span>Zdroj</span>
            <span>Shoda</span>
          </div>
          {visibleDemands.length === 0 ? (
            <div className="empty-state">
              Zatím tu nejsou žádné poptávky pro zvolený fokus. Spusťte import
              ve zdrojích.
              <button className="inline-cta" onClick={() => goTo("Zdroje")}>
                Otevřít zdroje
              </button>
            </div>
          ) : (
            visibleDemands.slice(0, 3).map((d) => (
              <button
                className="demand-row interactive-row"
                key={d.id}
                type="button"
                onClick={() => {
                  window.localStorage.setItem("neovia-open-demand", d.id);
                  goTo("Poptávky");
                }}
              >
                <div>
                  <span className="company">{(d.company || "?")[0]}</span>
                  <div>
                    <b>{d.role || d.title}</b>
                    <small>
                      {d.company || "Firma neuvedena"} ·{" "}
                      {d.location || "Lokalita neuvedena"}
                    </small>
                  </div>
                </div>
                <span className="source">{d.source}</span>
                <span className="score">
                  <i style={{ width: `${Number(d.relevanceScore || 0)}%` }} />
                  {Number(d.relevanceScore || 0)}%
                </span>
                <span className="quiet row-arrow" aria-hidden="true">
                  <MoreHorizontal size={18} />
                </span>
              </button>
            ))
          )}
        </section>
        <section className="panel">
          <Header title="Dnešní další kroky" action="Kalendář" />
          <div className="datebar">
            {weekDays.map((x) => (
              <div className={x.today ? "today" : ""} key={x.key}>
                <small>{x.day}</small>
                <b>{x.date}</b>
              </div>
            ))}
          </div>
          {overdueTasks.length > 0 && (
            <div className="dashboard-alert">
              <CircleAlert size={15} />
              <span>{overdueTasks.length} úkolů je po termínu.</span>
              <button onClick={() => goTo("Úkoly")}>Otevřít úkoly</button>
            </div>
          )}
          {todayTasks.length === 0 && (
            <div className="empty-state">
              Dnes není naplánovaný žádný další krok.
              <button className="inline-cta" onClick={() => goTo("Pipeline")}>
                Vytvořit z pipeline
              </button>
            </div>
          )}
          {todayTasks.slice(0, 3).map((t, i) => (
            <div className="mini-task" key={t.id} onClick={() => goTo("Úkoly")} role="button" tabIndex={0}>
              <button onClick={(event) => { event.stopPropagation(); completeDashboardTask(t); }} />
              <div>
                <button className="link-action task-title-action" type="button" onClick={(event) => { event.stopPropagation(); goTo("Úkoly"); }}>
                  {t.title}
                </button>
                <small>
                  {t.dueAt
                    ? new Date(t.dueAt).toLocaleString("cs-CZ")
                    : "Bez termínu"}
                  {t.company ? ` · ${t.company}` : ""}
                </small>
              </div>
              <span className="avatar soft">{i ? "TS" : "LH"}</span>
            </div>
          ))}
        </section>
      </div>
      <div className="grid bottom-grid">
        <section className="panel wide">
          <Header title="Vývoj poptávky" action="Posledních 6 měsíců" />
          {dashboardDemands.length === 0 ? (
            <div className="empty-state">
              Graf se zobrazí po prvním importu poptávek.
            </div>
          ) : (
            <div className="chart">
              <div className="axis">
                <span>{maxMonth}</span>
                <span>{Math.ceil(maxMonth / 2)}</span>
                <span>0</span>
              </div>
              <div className="bars">
                {monthBuckets.map((bucket) => (
                  <div key={bucket.label}>
                    <i
                      style={{
                        height: `${Math.max(6, (bucket.count / maxMonth) * 100)}%`,
                      }}
                    />
                    <small>{bucket.label}</small>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="legend">
            <span>
              <i /> Importované poptávky
            </span>
            <b>{dashboardDemands.length} celkem</b>
          </div>
        </section>
        <section className="panel">
          <Header title="Poslední obchodní aktivity" action="Otevřít CRM" />
          {activities.length === 0 ? (
            <div className="empty-state">
              Zatím není zapsaná žádná aktivita. Přidejte ji z karty firmy nebo kontaktu.
            </div>
          ) : (
            activities.slice(0, 4).map((activity) => (
              <div className="mini-task" key={activity.id} onClick={() => goTo("Kontakty")} role="button" tabIndex={0}>
                <button onClick={(event) => { event.stopPropagation(); goTo("Kontakty"); }} />
                <div>
                  <b>{activity.subject}</b>
                  <small>
                    {activity.company || [activity.contactFirstName, activity.contactLastName].filter(Boolean).join(" ") || "Bez vazby"} · {new Date(activity.occurredAt).toLocaleString("cs-CZ")}
                  </small>
                </div>
                <span className="avatar soft">{activity.type.slice(0, 2).toUpperCase()}</span>
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}
function EmailClient({ note }: { note: (s: string) => void }) {
  const [folder, setFolder] = useState("inbox");
  const [status, setStatus] = useState<{
    configured: boolean;
    connected: boolean;
    account: string;
    oauthUrl: string | null;
    missing: string[];
    mode: string;
    redirectUri: string;
  } | null>(null);
  const [mailData, setMailData] = useState<{
    connected: boolean;
    account?: string;
    labels: { id: string; name: string; messagesTotal?: number; messagesUnread?: number }[];
    messages: { id: string; subject: string; from: string; fromEmail: string; date: string; snippet: string; labels: string[] }[];
    error?: string;
  } | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<{
    id: string;
    subject: string;
    from: string;
    fromEmail: string;
    to: string;
    date: string;
    snippet: string;
    body: string;
    attachments?: { id: string; filename: string; mimeType: string; size: number }[];
    labels: string[];
  } | null>(null);
  const [emailMatch, setEmailMatch] = useState<{
    id: string;
    firstName: string;
    lastName: string;
    role: string | null;
    email: string | null;
    phone: string | null;
    companyId: string | null;
    company: string | null;
  } | null>(null);
  const [emailDetailLoading, setEmailDetailLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState({ to: "", subject: "", body: "" });
  const [composeAttachments, setComposeAttachments] = useState<Array<{ name: string; type: string; data: string }>>([]);
  const [trackOpen, setTrackOpen] = useState(false);
  const [localDrafts, setLocalDrafts] = useState<Array<{ to: string; subject: string; body: string; source?: string; createdAt?: string }>>([]);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [contactCandidate, setContactCandidate] = useState<{ name: string; email: string; phone: string; company: string; duplicate: boolean } | null>(null);
  const [creatingContact, setCreatingContact] = useState(false);
  const [mailLoading, setMailLoading] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    try {
      setLocalDrafts(JSON.parse(window.localStorage.getItem("neovia-email-drafts") || "[]"));
    } catch {
      setLocalDrafts([]);
    }
  }, []);
  const countFor = (labelId: string) => mailData?.labels.find((label) => label.id === labelId)?.messagesTotal || 0;
  const reviewItems = [
    ...localDrafts.map((draft) => ({
      subject: draft.subject || "Koncept bez předmětu",
      contact: draft.to || "Příjemce neuveden",
      company: draft.source || "Interní koncept",
      state: "Koncept",
    })),
    {
      subject: "Cold e-mail ke kontrole",
      contact: "Vyberte kontakt v CRM",
      company: "Koncepty vznikají z karty kontaktu nebo poptávky",
      state: "Připraveno",
    },
  ];
  const followupItems = [
    {
      subject: "Follow-up po 3 dnech",
      contact: "Automatizace",
      company: "Bude navázaná na úkoly a aktivity",
      state: "Čeká na OAuth",
    },
  ];
  const folders = [
    { id: "inbox", label: "Doručené", count: countFor("INBOX") },
    { id: "sent", label: "Odeslané", count: countFor("SENT") },
    { id: "drafts", label: "Koncepty", count: countFor("DRAFT") },
    { id: "review", label: "Ke kontrole", count: reviewItems.length },
    { id: "followups", label: "Follow-upy", count: followupItems.length },
    { id: "archive", label: "Archiv", count: countFor("CATEGORY_PERSONAL") },
    { id: "trash", label: "Koš", count: countFor("TRASH") },
  ];
  useEffect(() => {
    fetch("/api/email/gmail/status")
      .then((response) => (response.ok ? response.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);
  useEffect(() => {
    if (!status?.connected || ["review", "followups"].includes(folder)) return;
    setMailLoading(true);
    fetch(`/api/email/gmail/folders?folder=${encodeURIComponent(folder)}`)
      .then((response) => (response.ok ? response.json() : response.json().catch(() => null)))
      .then((data) => setMailData(data))
      .catch(() => setMailData((current) => current ? { ...current, error: "Poštu se nepodařilo načíst." } : null))
      .finally(() => setMailLoading(false));
  }, [folder, status?.connected]);
  const selectedFolder = folders.find((item) => item.id === folder) || folders[0];
  const sampleQueue = (folder === "followups" ? followupItems : reviewItems).filter((item) => `${item.subject} ${item.contact} ${item.company}`.toLowerCase().includes(search.toLowerCase()));
  const filteredMessages = (mailData?.messages || []).filter((item) =>
    `${item.subject} ${item.from} ${item.fromEmail} ${item.snippet}`.toLowerCase().includes(search.toLowerCase()),
  );
  const buildContactCandidate = (detail: { from: string; fromEmail: string; body: string; snippet: string }) => {
    const text = `${detail.body || ""}\n${detail.snippet || ""}`;
    const signaturePhone = text.match(/(?:\+420|00420)?[\s.-]?(?:\d{3}[\s.-]?){3}/)?.[0]?.trim() || "";
    const signatureEmail = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || detail.fromEmail || "";
    const cleanName = detail.from
      .replace(/\(.*?\)/g, "")
      .replace(/prostřednictvím služby.*/i, "")
      .trim();
    const domain = signatureEmail.split("@")[1] || "";
    const company = domain && !["gmail.com", "seznam.cz", "email.cz", "post.cz", "outlook.com"].includes(domain)
      ? domain.split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
      : "";
    return {
      name: cleanName || signatureEmail.split("@")[0] || "Nový kontakt",
      email: signatureEmail,
      phone: signaturePhone,
      company,
      duplicate: false,
    };
  };
  const openEmail = async (item: { id: string; fromEmail: string }) => {
    setEmailDetailLoading(true);
    setSelectedEmail(null);
    setEmailMatch(null);
    setContactCandidate(null);
    try {
      const detailResponse = await fetch(`/api/email/gmail/messages/${encodeURIComponent(item.id)}`);
      const detail = await detailResponse.json();
      if (!detailResponse.ok) throw new Error(detail.error || "Detail e-mailu se nepodařilo načíst.");
      setSelectedEmail(detail);
      if (detail.fromEmail || detail.from || detail.body) {
        const params = new URLSearchParams({
          email: detail.fromEmail || "",
          name: detail.from || "",
          text: `${detail.body || ""} ${detail.snippet || ""}`.slice(0, 4000),
        });
        const matchResponse = await fetch(`/api/contacts/match?${params.toString()}`);
        const matchData = await matchResponse.json();
        setEmailMatch(matchData.match || null);
        if (!matchData.match) setContactCandidate(buildContactCandidate(detail));
      }
    } catch (error) {
      note(error instanceof Error ? error.message : "Detail e-mailu se nepodařilo načíst.");
    } finally {
      setEmailDetailLoading(false);
    }
  };
  const saveEmailActivity = async () => {
    if (!selectedEmail || !emailMatch) return;
    const response = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "email",
        subject: `E-mail: ${selectedEmail.subject}`,
        note: `Od: ${selectedEmail.from} <${selectedEmail.fromEmail}>\nKomu: ${selectedEmail.to || "neuvedeno"}\nDatum: ${selectedEmail.date || "neuvedeno"}\n\n${selectedEmail.body || selectedEmail.snippet}`,
        contactId: emailMatch.id,
        companyId: emailMatch.companyId,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      note(data.error || "E-mail se nepodařilo uložit jako aktivitu.");
      return;
    }
    note("E-mail je uložený jako aktivita u kontaktu.");
  };
  const createContactFromEmail = async () => {
    if (!contactCandidate) return;
    const nameParts = contactCandidate.name.trim().split(/\s+/);
    setCreatingContact(true);
    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: nameParts[0] || "Kontakt",
          lastName: nameParts.slice(1).join(" ") || "[DOPLNIT]",
          company: contactCandidate.company || "Firma z e-mailu",
          role: "",
          email: contactCandidate.email,
          phone: contactCandidate.phone,
          source: "Gmail",
          verified: true,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Kontakt se nepodařilo založit.");
      setEmailMatch({
        id: data.id,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
        email: data.email,
        phone: data.phone,
        companyId: data.companyId,
        company: data.company,
      });
      setContactCandidate(null);
      note(`Kontakt ${data.firstName} ${data.lastName} byl založený. Firmu můžete hned doplnit v kartě firmy.`);
      if (data.companyId) {
        window.localStorage.setItem("neovia-open-company", data.companyId);
      }
    } catch (error) {
      note(error instanceof Error ? error.message : "Kontakt se nepodařilo založit.");
    } finally {
      setCreatingContact(false);
    }
  };
  const saveComposeDraft = () => {
    const draft = { ...compose, source: "E-mail klient", createdAt: new Date().toISOString() };
    saveLocalEmailDraft(draft);
    setLocalDrafts((current) => [draft, ...current].slice(0, 50));
    setComposeOpen(false);
    setCompose({ to: "", subject: "", body: "" });
    setComposeAttachments([]);
    setTrackOpen(false);
    note("Koncept e-mailu je uložený ke kontrole v aplikaci.");
  };
  const loadComposeAttachments = async (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files).slice(0, 5);
    const encoded = await Promise.all(selected.map((file) => new Promise<{ name: string; type: string; data: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", data: String(reader.result || "") });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })));
    setComposeAttachments(encoded);
  };
  const sendComposeEmail = async () => {
    if (!compose.to.trim() || !compose.subject.trim() || !compose.body.trim()) {
      note("Doplňte příjemce, předmět a text e-mailu.");
      return;
    }
    if (!window.confirm(`Odeslat e-mail na ${compose.to}?`)) return;
    setSendingEmail(true);
    try {
      const response = await fetch("/api/email/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...compose, attachments: composeAttachments, trackOpen }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "E-mail se nepodařilo odeslat.");
      setComposeOpen(false);
      setCompose({ to: "", subject: "", body: "" });
      setComposeAttachments([]);
      setTrackOpen(false);
      note(data.trackingId ? `E-mail byl odeslaný. Tracking ID: ${data.trackingId}` : "E-mail byl odeslaný přes připojený Gmail účet.");
      if (status?.connected && !["review", "followups"].includes(folder)) {
        fetch(`/api/email/gmail/folders?folder=${encodeURIComponent(folder)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => data && setMailData(data))
          .catch(() => undefined);
      }
    } catch (error) {
      note(error instanceof Error ? error.message : "E-mail se nepodařilo odeslat.");
    } finally {
      setSendingEmail(false);
    }
  };
  return (
    <>
      <Title
        eyebrow="E-MAILOVÝ KLIENT"
        title="Pošta a obchodní komunikace"
        subtitle="Firemní Gmail, koncepty ke kontrole, vytěžování komunikace a vazba na kontakty, firmy a pipeline."
        button="Nastavit Gmail"
        note={note}
        onAction={() => goTo("Nastavení")}
      />
      <section className="email-client">
        <aside className="email-folders panel">
          <div className="email-account">
            <span className={status?.connected ? "source-tag" : status?.configured ? "source-tag pending-tag" : "source-tag pending-tag"}>
              {status?.connected ? "PŘIPOJENO" : status?.configured ? "OAUTH PŘIPRAVEN" : "ČEKÁ NA OAUTH"}
            </span>
            <b>{status?.account || "Gmail účet"}</b>
            <small>{status?.mode || "Načítám stav připojení..."}</small>
          </div>
          {folders.map((item) => (
            <button
              key={item.id}
              className={folder === item.id ? "active" : ""}
              type="button"
              onClick={() => setFolder(item.id)}
            >
              <Mail size={15} />
              <span>{item.label}</span>
              <b>{item.count}</b>
            </button>
          ))}
          <button className="primary connect-mail-button" type="button" onClick={() => {
            if (status?.oauthUrl) window.open(status.oauthUrl, "_blank", "noopener,noreferrer");
            else note(`Chybí OAuth údaje: ${(status?.missing || ["GOOGLE_GMAIL_CLIENT_ID", "GOOGLE_GMAIL_CLIENT_SECRET"]).join(", ")}`);
          }}>
            Připojit Gmail
          </button>
        </aside>
        <section className="panel email-pane">
          <div className="panel-header">
            <h2>{selectedFolder.label}</h2>
            <button onClick={() => goTo("Kontakty")}>
              Otevřít kontakty
              <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="toolbar email-toolbar">
            <label>
              <Search size={17} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Hledat v poště, kontaktech nebo konceptech" />
            </label>
            <button className="secondary" onClick={() => setComposeOpen(true)}>
              Nový e-mail
            </button>
          </div>
          {!status?.configured && (
            <div className="email-setup-warning">
              <CircleAlert size={18} />
              <div>
                <b>Pro skutečné čtení a odesílání pošty je potřeba doplnit Google OAuth údaje.</b>
                <small>
                  Nastavte proměnné GOOGLE_GMAIL_CLIENT_ID, GOOGLE_GMAIL_CLIENT_SECRET a redirect URI {status?.redirectUri || "/api/email/gmail/callback"}.
                </small>
              </div>
            </div>
          )}
          {status?.configured && !status.connected && (
            <div className="email-setup-warning">
              <CircleAlert size={18} />
              <div>
                <b>OAuth údaje jsou nastavené, ale Gmail účet ještě není připojený.</b>
                <small>Klikněte vlevo na Připojit Gmail a dokončete přihlášení přes Google.</small>
              </div>
            </div>
          )}
          {mailData?.error && (
            <div className="email-setup-warning">
              <CircleAlert size={18} />
              <div>
                <b>Gmail odpověděl chybou.</b>
                <small>{mailData.error}</small>
              </div>
            </div>
          )}
          <div className="email-list">
            {mailLoading && <div className="empty-state">Načítám zprávy z Gmailu…</div>}
            {!mailLoading && status?.connected && !["review", "followups"].includes(folder) && filteredMessages.map((item) => (
              <button type="button" key={item.id} onClick={() => openEmail(item)}>
                <span className="avatar soft">{(item.from || item.subject).slice(0, 2).toUpperCase()}</span>
                <div>
                  <b>{item.subject}</b>
                  <small>{item.from} · {item.fromEmail || item.date}</small>
                  <small>{item.snippet}</small>
                </div>
                <span className="source-tag">{item.labels?.includes("UNREAD") ? "Nepřečteno" : "Gmail"}</span>
              </button>
            ))}
            {!mailLoading && status?.connected && !["review", "followups"].includes(folder) && !filteredMessages.length && (
              <div className="empty-state">V této složce není žádná zpráva odpovídající filtru.</div>
            )}
            {(!status?.connected || ["review", "followups"].includes(folder)) && sampleQueue.map((item) => (
              <button type="button" key={item.subject + item.state} onClick={() => note("Po připojení Gmail API se zde otevře detail e-mailu a vazby na CRM.")}>
                <span className="avatar soft">{item.subject.slice(0, 2).toUpperCase()}</span>
                <div>
                  <b>{item.subject}</b>
                  <small>{item.contact} · {item.company}</small>
                </div>
                <span className="source-tag">{item.state}</span>
              </button>
            ))}
          </div>
          <div className="email-rules">
            <b>Gmail API funkce</b>
            <span>Načítá Doručené, Odeslané, Koncepty, Archiv a Koš po připojení účtu.</span>
            <span>Párovat zprávy podle e-mailu na kontaktní a firemní kartu.</span>
            <span>Vytěžovat podpis, telefon, roli, firmu, další krok a odpověď.</span>
            <span>Odesílat pouze po ruční kontrole nebo potvrzení dávky.</span>
          </div>
        </section>
      </section>
      {(selectedEmail || emailDetailLoading) && (
        <div className="modal-backdrop">
          <div className="modal email-detail-modal">
            <header>
              <div>
                <p>GMAIL · DETAIL ZPRÁVY</p>
                <h2>{selectedEmail?.subject || "Načítám e-mail…"}</h2>
              </div>
              <button type="button" onClick={() => {
                setSelectedEmail(null);
                setEmailMatch(null);
              }}>×</button>
            </header>
            <div className="modal-scroll email-detail-body">
              {emailDetailLoading && <div className="empty-state">Načítám detail e-mailu…</div>}
              {selectedEmail && (
                <>
                  <div className="email-detail-meta">
                    <div>
                      <span>Odesílatel</span>
                      <b>{selectedEmail.from}</b>
                      <small><EmailLink value={selectedEmail.fromEmail} /></small>
                    </div>
                    <div>
                      <span>Datum</span>
                      <b>{selectedEmail.date || "Neuvedeno"}</b>
                    </div>
                    <div>
                      <span>Vazba na CRM</span>
                      {emailMatch ? (
                        <>
                          <button
                            type="button"
                            className="entity-link strong-link"
                            onClick={() => {
                              window.localStorage.setItem("neovia-open-contact", emailMatch.id);
                              setSelectedEmail(null);
                              setEmailMatch(null);
                              goTo("Kontakty");
                            }}
                          >
                            {emailMatch.firstName} {emailMatch.lastName}
                          </button>
                          <small>
                            {emailMatch.company || "Firma neuvedena"} · {emailMatch.role || "Role neuvedena"}
                          </small>
                        </>
                      ) : (
                        <>
                          <b>Kontakt zatím nenalezen</b>
                          <small>Odesílatel není v kontaktních kartách.</small>
                        </>
                      )}
                    </div>
                  </div>
                  {!emailMatch && contactCandidate && (
                    <div className="email-crm-suggestion">
                      <div>
                        <span>NÁVRH KONTAKTU Z E-MAILU</span>
                        <b>{contactCandidate.name}</b>
                        <small>
                          {contactCandidate.email || "E-mail nenalezen"} · {contactCandidate.phone || "Telefon nenalezen"} · {contactCandidate.company || "Firma k doplnění"}
                        </small>
                      </div>
                      <div className="source-tag">Duplicita nenalezena</div>
                    </div>
                  )}
                  <div className="email-body-preview">
                    {(selectedEmail.body || selectedEmail.snippet || "E-mail nemá čitelný text.").slice(0, 6000)}
                  </div>
                  {Boolean(selectedEmail.attachments?.length) && (
                    <div className="email-attachments">
                      <b>Přílohy</b>
                      {selectedEmail.attachments?.map((file) => (
                        <a
                          key={file.id}
                          href={`/api/email/gmail/messages/${encodeURIComponent(selectedEmail.id)}/attachments/${encodeURIComponent(file.id)}?filename=${encodeURIComponent(file.filename)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {file.filename} <span>{Math.ceil((file.size || 0) / 1024)} KB</span>
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <footer>
              <button className="secondary" type="button" onClick={() => {
                if (!selectedEmail) return;
                setCompose({
                  to: selectedEmail.fromEmail,
                  subject: selectedEmail.subject.toLowerCase().startsWith("re:") ? selectedEmail.subject : `Re: ${selectedEmail.subject}`,
                  body: `Dobrý den,\n\n\n\n--- Původní zpráva ---\n${selectedEmail.body || selectedEmail.snippet}`,
                });
                setComposeAttachments([]);
                setTrackOpen(false);
                setSelectedEmail(null);
                setEmailMatch(null);
                setComposeOpen(true);
              }}>
                Odpovědět
              </button>
              {!emailMatch && (
                <button className="secondary" type="button" onClick={() => goTo("Kontakty")}>
                  Otevřít kontakty
                </button>
              )}
              {!emailMatch && contactCandidate && (
                <button className="primary" type="button" disabled={creatingContact || !contactCandidate.email} onClick={createContactFromEmail}>
                  {creatingContact ? "Zakládám…" : "Založit kontakt"}
                </button>
              )}
              <button className="primary" type="button" disabled={!emailMatch || !selectedEmail} onClick={saveEmailActivity}>
                Uložit ke kontaktu
              </button>
            </footer>
          </div>
        </div>
      )}
      {composeOpen && (
        <div className="modal-backdrop">
          <div className="modal email-detail-modal">
            <header>
              <div>
                <p>GMAIL · NOVÝ E-MAIL</p>
                <h2>Nový e-mail v aplikaci</h2>
              </div>
              <button type="button" onClick={() => setComposeOpen(false)}>×</button>
            </header>
            <div className="modal-scroll">
              <div className="form-grid">
                <label className="span-2">
                  Komu
                  <input value={compose.to} onChange={(event) => setCompose((current) => ({ ...current, to: event.target.value }))} placeholder="kontakt@firma.cz" />
                </label>
                <label className="span-2">
                  Předmět
                  <input value={compose.subject} onChange={(event) => setCompose((current) => ({ ...current, subject: event.target.value }))} placeholder="Předmět e-mailu" />
                </label>
                <label className="span-2">
                  Text e-mailu
                  <textarea value={compose.body} onChange={(event) => setCompose((current) => ({ ...current, body: event.target.value }))} placeholder="Napište text e-mailu." />
                </label>
                <label className="span-2">
                  Přílohy
                  <input type="file" multiple onChange={(event) => loadComposeAttachments(event.target.files)} />
                  {composeAttachments.length > 0 && <small>{composeAttachments.map((file) => file.name).join(", ")}</small>}
                </label>
                <label className="checkbox-line span-2">
                  <input type="checkbox" checked={trackOpen} onChange={(event) => setTrackOpen(event.target.checked)} />
                  Sledovat otevření e-mailu
                </label>
              </div>
              <div className="email-setup-warning">
                <CircleAlert size={18} />
                <div>
                  <b>E-mail odejde pouze po ručním potvrzení.</b>
                  <small>Můžete ho uložit jako koncept ke kontrole, nebo rovnou odeslat přes připojený Gmail účet.</small>
                </div>
              </div>
            </div>
            <footer>
              <button className="secondary" type="button" onClick={() => setComposeOpen(false)}>Zavřít</button>
              <button className="primary" type="button" disabled={!compose.to.trim() || !compose.subject.trim()} onClick={saveComposeDraft}>
                Uložit koncept
              </button>
              <button className="primary" type="button" disabled={sendingEmail || !compose.to.trim() || !compose.subject.trim() || !compose.body.trim()} onClick={sendComposeEmail}>
                {sendingEmail ? "Odesílám…" : "Odeslat"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
type ImportedDemand = {
  id: string;
  externalId: string | null;
  companyId: string | null;
  company: string | null;
  companySource: string | null;
  contactId: string | null;
  role: string | null;
  title: string;
  location: string | null;
  source: string;
  relevanceScore: number | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactRole: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactSource: string | null;
  importedAt: string;
  technologies: string[] | null;
  demandText: string | null;
  sourceUrl: string | null;
  workMode: string | null;
};
const DEMAND_KEYWORDS = [
  "IT Security",
  "Cybersecurity",
  "Kybernetická bezpečnost",
  "Kyberbezpečnost",
  "Security",
  "SOC",
  "NIS2",
  "Zákon o kybernetické bezpečnosti",
  "Manažer kybernetické bezpečnosti",
  "MKB",
  "Architekt kybernetické bezpečnosti",
  "AKB",
  "Auditor kybernetické bezpečnosti",
  "Security Manager",
  "Security Architect",
  "Security Auditor",
  "CISO",
  "ISMS",
  "GDPR",
  "DORA",
  "ISO 27001",
  "Penetration",
  "SIEM",
  "Cloud",
  "Azure",
  "AWS",
  "Linux",
  "DevOps",
  "Java",
  ".NET",
  "Python",
  "React",
  "SAP",
  "SQL",
  "Data",
  "QA",
  "Tester",
  "Analyst",
  "Business Analyst",
  "Project Manager",
  "Scrum Master",
  "B2B",
  "Hybrid",
  "Remote",
];
const DEMAND_ROLES = [
  "IT Security Assistant",
  "IT Security Specialist",
  "Cybersecurity Specialist",
  "Specialista kybernetické bezpečnosti",
  "Manažer kybernetické bezpečnosti",
  "MKB",
  "Architekt kybernetické bezpečnosti",
  "AKB",
  "Auditor kybernetické bezpečnosti",
  "CISO",
  "ISMS Manager",
  "Information Security Manager",
  "Incident Response Manager",
  "Security Analyst",
  "SOC Analyst",
  "Security Architect",
  "Security Manager",
  "Security Auditor",
  "Java Developer",
  ".NET Developer",
  "Python Developer",
  "DevOps Engineer",
  "Cloud Engineer",
  "Data Engineer",
  "QA Engineer",
  "Business Analyst",
  "Project Manager",
  "Scrum Master",
];
const standaloneKeywordMatches = (text: string, keyword: string) => {
  const lower = text.toLowerCase();
  const normalized = keyword.toLowerCase();
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (["it", "ict", "qa", "ai"].includes(normalized)) {
    return new RegExp(`(^|[^a-zá-ž0-9])${escaped}([^a-zá-ž0-9]|$)`, "i").test(lower);
  }
  if (/^[a-z0-9.+#-]+$/i.test(normalized) && normalized.length <= 4) {
    return new RegExp(`(^|[^a-zá-ž0-9])${escaped}([^a-zá-ž0-9]|$)`, "i").test(lower);
  }
  return lower.includes(normalized);
};
const keywordPool = (d: ImportedDemand) => {
  const text = `${d.title} ${d.role || ""} ${d.demandText || ""} ${(d.technologies || []).join(" ")}`.toLowerCase();
  const found = [...(d.technologies || []).filter((keyword) => standaloneKeywordMatches(text, keyword))];
  for (const keyword of DEMAND_KEYWORDS) {
    if (standaloneKeywordMatches(text, keyword)) found.push(keyword);
  }
  return [...new Set(found)].slice(0, 18);
};
const rolePool = (d: ImportedDemand) => {
  const text = `${d.title} ${d.role || ""} ${d.demandText || ""}`.toLowerCase();
  const found = [d.role || d.title].filter(Boolean);
  for (const role of DEMAND_ROLES) {
    if (standaloneKeywordMatches(text, role)) found.push(role);
  }
  return [...new Set(found)].slice(0, 8);
};
const hasDemandContact = (d: ImportedDemand) =>
  Boolean(d.contactId || d.contactEmail || d.contactPhone || d.contactFirstName || d.contactLastName);
const hasFullDemandText = (d: ImportedDemand) =>
  Boolean(
    d.demandText &&
      !d.demandText.includes("Detail inzerátu nebyl ve výpisu dostupný") &&
      d.demandText.length > 120,
  );
const demandIntelligence = (d: ImportedDemand) => {
  const text = `${d.title} ${d.role || ""} ${d.demandText || ""} ${(d.technologies || []).join(" ")}`.toLowerCase();
  const tags = keywordPool(d);
  const cyberSignals = tags.filter((tag) =>
    /nis2|kyber|cyber|security|isms|iso 27001|dora|ciso|soc|siem|incident/i.test(tag),
  );
  const b2bSignals = ["b2b", "contractor", "outsourcing", "extern", "freelance", "dodavatel", "konzultant"].filter((word) =>
    text.includes(word),
  );
  let score = Number(d.relevanceScore || 0);
  if (cyberSignals.length) score += 18;
  if (b2bSignals.length) score += 12;
  if (hasDemandContact(d)) score += 10;
  if (d.company) score += 8;
  if (hasFullDemandText(d)) score += 8;
  if (/senior|lead|manager|architekt|architect|auditor|ciso|manažer/i.test(text)) score += 8;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const reasons = [
    cyberSignals.length ? `obsahuje ${cyberSignals.slice(0, 4).join(", ")}` : "",
    b2bSignals.length ? "má B2B nebo dodavatelský signál" : "",
    hasDemandContact(d) ? "má kontaktní osobu nebo kontaktní údaj" : "chybí použitelný kontakt",
    d.company ? "má navázanou firmu" : "chybí firemní karta",
    hasFullDemandText(d) ? "má plné znění inzerátu" : "detail je potřeba ověřit u zdroje",
  ].filter(Boolean);
  const label =
    score >= 90 ? "Ideální obchodní příležitost" :
    score >= 70 ? "Zajímavé, ověřit" :
    score >= 40 ? "Slabší shoda" :
    "Spíš nerelevantní";
  return { score, label, reasons, cyberSignals, b2bSignals };
};
const qualificationItems = (d: ImportedDemand) => {
  const intelligence = demandIntelligence(d);
  return [
    { label: "Firma je identifikovaná", done: Boolean(d.company) },
    { label: "Kontakt je dostupný", done: hasDemandContact(d) },
    { label: "Plné znění je uložené", done: hasFullDemandText(d) },
    { label: "Role je relevantní pro IT/NIS2", done: intelligence.cyberSignals.length > 0 || keywordPool(d).length > 0 },
    { label: "Má obchodní signál B2B/outsourcing", done: intelligence.b2bSignals.length > 0 },
  ];
};
const recommendedNextStep = (d: ImportedDemand) => {
  const intelligence = demandIntelligence(d);
  if (!hasDemandContact(d)) return "Doplnit kontakt";
  if (!hasFullDemandText(d)) return "Ověřit detail inzerátu";
  if (intelligence.score >= 80) return "Zavolat firmě";
  if (intelligence.score >= 60) return "Poslat ověřovací e-mail";
  return "Označit k ruční kvalifikaci";
};
const suggestedDueDate = () => {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  value.setHours(9, 0, 0, 0);
  return value.toISOString();
};
const demandDuplicates = (d: ImportedDemand, rows: ImportedDemand[]) =>
  rows
    .filter((row) => row.id !== d.id)
    .filter((row) =>
      (d.externalId && row.externalId === d.externalId) ||
      ((row.companyId && row.companyId === d.companyId) && (row.role || row.title).toLowerCase() === (d.role || d.title).toLowerCase()) ||
      ((row.company || "").toLowerCase() === (d.company || "").toLowerCase() && (row.role || row.title).toLowerCase() === (d.role || d.title).toLowerCase()),
    )
    .slice(0, 5);
const outreachDraft = (d: ImportedDemand) => {
  const role = d.role || d.title;
  const company = d.company || "vaší společnosti";
  return `Dobrý den,\n\nzaznamenal jsem, že ${company} řeší pozici ${role}. V NEOVIA se zaměřujeme na IT outsourcing a dodávku ověřených specialistů, včetně oblastí kybernetické bezpečnosti, NIS2, ISMS a IT delivery.\n\nRád bych krátce ověřil, jestli má smysl probrat možnost rychlého doplnění kapacity nebo bodyshop spolupráce.\n\nMůžeme si zavolat na 10 minut?`;
};
const saveLocalEmailDraft = (draft: { to: string; subject: string; body: string; source?: string }) => {
  const drafts = JSON.parse(window.localStorage.getItem("neovia-email-drafts") || "[]") as Array<typeof draft & { createdAt: string }>;
  window.localStorage.setItem(
    "neovia-email-drafts",
    JSON.stringify([{ ...draft, createdAt: new Date().toISOString() }, ...drafts].slice(0, 50)),
  );
};
const contactOutreachDraft = (contact: Contact, companyDemands: ImportedDemand[] = []) => {
  const role = companyDemands[0]?.role || companyDemands[0]?.title || contact.role || "IT kapacity";
  return `Dobrý den,\n\nnavazuji na aktuální potřeby kolem role ${role} ve společnosti ${contact.company}. V NEOVIA pomáháme firmám rychle doplňovat ověřené IT specialisty formou outsourcingu, bodyshopu nebo cílené podpory týmu.\n\nRád bych krátce ověřil, jestli má smysl probrat možnosti spolupráce a dostupné kapacity.\n\nMůžeme si zavolat na 10 minut?`;
};
const contactLinkRegex =
  /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+420|00420)?[\s.-]?(?:\d{3}[\s.-]?){3})/gi;
const normalizePhoneHref = (value: string) => {
  const compact = value.replace(/[^\d+]/g, "");
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("00420") && compact.length === 14) return `+${compact.slice(2)}`;
  if (compact.startsWith("420") && compact.length === 12) return `+${compact}`;
  return `+420${compact}`;
};
const isFilledValue = (value?: string | null) => Boolean(value && value.trim() && value.trim() !== "—");
const EmailLink = ({ value }: { value?: string | null }) =>
  isFilledValue(value) ? (
    <a className="contact-action-link" href={`mailto:${value}`}>
      <Mail size={14} />
      {value}
    </a>
  ) : (
    <span className="muted-contact">E-mail není uveden</span>
  );
const PhoneLink = ({ value }: { value?: string | null }) =>
  isFilledValue(value) ? (
    <a className="contact-action-link" href={`tel:${normalizePhoneHref(value!)}`}>
      <Phone size={14} />
      {value}
    </a>
  ) : (
    <span className="muted-contact">Telefon není uveden</span>
  );
const WebsiteLink = ({ value }: { value?: string | null }) => {
  if (!isFilledValue(value)) return <span className="muted-contact">Web není uveden</span>;
  const href = /^https?:\/\//i.test(value!) ? value! : `https://${value}`;
  return (
    <a className="contact-action-link" href={href} target="_blank" rel="noreferrer">
      <ArrowUpRight size={14} />
      {value}
    </a>
  );
};
const HighlightedDemandText = ({
  text,
  keywords,
}: {
  text: string;
  keywords: string[];
}) => {
  const active = keywords
    .filter((x) => x.trim().length > 1)
    .sort((a, b) => b.length - a.length);
  const escaped = active.map((x) => {
    const keyword = x.trim();
    const safe = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return ["it", "ict", "qa", "ai"].includes(keyword.toLowerCase()) || (/^[a-z0-9.+#-]+$/i.test(keyword) && keyword.length <= 4)
      ? `(?<![a-zá-ž0-9])${safe}(?![a-zá-ž0-9])`
      : safe;
  });
  const re = escaped.length ? new RegExp(`(${escaped.join("|")})`, "giu") : null;
  const renderHighlighted = (value: string, prefix: string) =>
    re
      ? value.split(re).map((part, index) =>
          active.some((x) => x.toLowerCase() === part.toLowerCase()) ? (
            <mark key={`${prefix}-mark-${part}-${index}`}>{part}</mark>
          ) : (
            <span key={`${prefix}-text-${part}-${index}`}>{part}</span>
          ),
        )
      : [<span key={`${prefix}-text`}>{value}</span>];
  return (
    <p>
      {text.split(contactLinkRegex).map((part, index) => {
        if (!part) return null;
        if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(part)) {
          return (
            <a className="inline-contact-link" href={`mailto:${part}`} key={`email-${part}-${index}`}>
              {part}
            </a>
          );
        }
        const digits = part.replace(/\D/g, "");
        if (digits.length === 9 || (digits.length === 12 && digits.startsWith("420"))) {
          return (
            <a className="inline-contact-link" href={`tel:${normalizePhoneHref(part)}`} key={`phone-${part}-${index}`}>
              {part}
            </a>
          );
        }
        return renderHighlighted(part, `${part}-${index}`);
      })}
    </p>
  );
};
function Demands({
  query,
  setQuery,
  note,
}: {
  query: string;
  setQuery: (x: string) => void;
  filtered: Demand[];
  note: (s: string) => void;
}) {
  const [rows, setRows] = useState<ImportedDemand[]>([]),
    [loading, setLoading] = useState(true),
    [filtersOpen, setFiltersOpen] = useState(false),
    [sourceFilters, setSourceFilters] = useState<string[]>([]),
    [contactFilters, setContactFilters] = useState<string[]>([]),
    [roleFilters, setRoleFilters] = useState<string[]>([]),
    [minScore, setMinScore] = useState("0"),
    [detailQualityFilters, setDetailQualityFilters] = useState<string[]>([]),
    [searchHistory, setSearchHistory] = useState<string[]>([]),
    [selectedDemandIds, setSelectedDemandIds] = useState<string[]>([]),
    [selected, setSelected] = useState<ImportedDemand | null>(null),
    [companyDetail, setCompanyDetail] = useState<ImportedDemand | null>(null),
    [contactDetail, setContactDetail] = useState<ImportedDemand | null>(null);
  useEffect(() => {
    const stored = window.localStorage.getItem("neovia-demand-search-history");
    if (stored) setSearchHistory(JSON.parse(stored));
  }, []);
  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) return;
    const timeout = window.setTimeout(() => {
      setSearchHistory((current) => {
        const next = [value, ...current.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 10);
        window.localStorage.setItem("neovia-demand-search-history", JSON.stringify(next));
        return next;
      });
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [query]);
  useEffect(() => {
    fetch("/api/demands")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const data = await r.json();
        setRows(data);
        const requested = window.localStorage.getItem("neovia-open-demand");
        if (requested) {
          const item = data.find((x: ImportedDemand) => x.id === requested);
          if (item) {
            window.localStorage.removeItem("neovia-open-demand");
            setSelected(item);
          }
        }
      })
      .catch(() => note("Poptávky se nepodařilo načíst."))
      .finally(() => setLoading(false));
  }, []);
  const sources = [...new Set(rows.map((x) => x.source))];
  const roles = [
    ...new Set(rows.map((x) => x.role || x.title).filter(Boolean)),
  ].sort();
  const contactOptions = ["s kontaktem", "bez kontaktu"];
  const detailQualityOptions = ["plné znění", "chybí detail"];
  const toggleMultiValue = (
    value: string,
    current: string[],
    setter: (next: string[]) => void,
  ) => setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const displayed = rows.filter((d) => {
    const text =
      `${d.company || ""} ${d.role || d.title} ${(d.technologies || []).join(" ")} ${d.demandText || ""}`.toLowerCase();
    const hasContact = Boolean(d.contactFirstName || d.contactLastName);
    const score = Number(d.relevanceScore || 0);
    return (
      text.includes(query.toLowerCase()) &&
      (!sourceFilters.length || sourceFilters.includes(d.source)) &&
      (!roleFilters.length || roleFilters.includes(d.role || d.title)) &&
      score >= Number(minScore || 0) &&
      (!detailQualityFilters.length ||
        (detailQualityFilters.includes("plné znění") && hasFullDemandText(d)) ||
        (detailQualityFilters.includes("chybí detail") && !hasFullDemandText(d))) &&
      (!contactFilters.length ||
        (contactFilters.includes("s kontaktem") && hasContact) ||
        (contactFilters.includes("bez kontaktu") && !hasContact))
    );
  });
  const selectedDemands = rows.filter((row) => selectedDemandIds.includes(row.id));
  const displayedIds = displayed.map((d) => d.id);
  const allDisplayedSelected =
    displayedIds.length > 0 && displayedIds.every((id) => selectedDemandIds.includes(id));
  const toggleDemandSelection = (id: string) =>
    setSelectedDemandIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  const toggleAllDisplayed = () =>
    setSelectedDemandIds((current) =>
      allDisplayedSelected
        ? current.filter((id) => !displayedIds.includes(id))
        : [...new Set([...current, ...displayedIds])],
    );
  const contactName = (d: ImportedDemand) =>
    [d.contactFirstName, d.contactLastName].filter(Boolean).join(" ") ||
    "Kontakt není uveden";
  const openDemandCompanyCard = (d: ImportedDemand) => {
    if (!d.companyId && !d.company) {
      note("Poptávka nemá navázanou firmu.");
      return;
    }
    window.localStorage.setItem("neovia-open-company", d.companyId || d.company || "");
    setSelected(null);
    goTo("Kontakty");
  };
  const openDemandContactCard = (d: ImportedDemand) => {
    if (!d.contactId) {
      note("Poptávka nemá navázanou kontaktní kartu.");
      return;
    }
    window.localStorage.setItem("neovia-open-contact", d.contactId);
    setSelected(null);
    goTo("Kontakty");
  };
  const companyDemands = (d: ImportedDemand) =>
    rows.filter((row) =>
      d.companyId
        ? row.companyId === d.companyId
        : row.company && row.company === d.company,
    );
  const contactDemands = (d: ImportedDemand) =>
    rows.filter((row) =>
      d.contactId
        ? row.contactId === d.contactId
        : contactName(row) === contactName(d),
    );
  const addToPipeline = async () => {
    if (!selected) return;
    const response = await fetch("/api/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: selected.role || selected.title,
        company: selected.company || "Nezařazená firma",
        demandId: selected.id,
        stage: "identified",
        source: selected.source,
      }),
    });
    if (!response.ok) {
      note("Poptávku se nepodařilo vytvořit v Pipeline.");
      return;
    }
    const data = await response.json().catch(() => ({}));
    setSelected(null);
    if (data.alreadyExists) {
      window.localStorage.setItem("neovia-open-opportunity", data.id);
      note("Poptávka už v Pipeline byla, otevírám existující obchodní případ.");
    } else {
      window.localStorage.setItem("neovia-open-opportunity", data.id);
      note("Poptávka byla převedena do Pipeline, fáze Identifikace.");
    }
    goTo("Pipeline");
  };
  const createDemandNextStepTask = async (demand: ImportedDemand, step = recommendedNextStep(demand)) => {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `${step}: ${demand.company || demand.role || demand.title}`,
        dueAt: suggestedDueDate(),
        priority: demandIntelligence(demand).score >= 80 ? 1 : 2,
        companyId: demand.companyId || null,
        contactId: demand.contactId || null,
      }),
    });
    if (!response.ok) {
      note("Úkol se nepodařilo založit.");
      return;
    }
    note(`Úkol byl založen: ${step}.`);
  };
  const saveDemandEmailActivity = async (demand: ImportedDemand, subject: string, body: string) => {
    const response = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "email",
        subject,
        note: `Koncept e-mailu:\n\n${body}`,
        companyId: demand.companyId || null,
        contactId: demand.contactId || null,
      }),
    });
    if (!response.ok) {
      note("Koncept se nepodařilo uložit jako aktivitu.");
      return false;
    }
    note("Koncept e-mailu byl uložen ke komunikaci.");
    return true;
  };
  const openDemandEmailDraft = async (demand: ImportedDemand) => {
    const to = demand.contactEmail || "";
    const subject = `Možnosti spolupráce k roli ${demand.role || demand.title}`;
    const body = outreachDraft(demand);
    await saveDemandEmailActivity(demand, subject, body);
    if (!to) {
      await navigator.clipboard.writeText(body);
      note("Kontakt nemá e-mail. Text konceptu je zkopírovaný do schránky.");
      return;
    }
    saveLocalEmailDraft({ to, subject, body, source: `Poptávka ${demand.title}` });
    note("Koncept je uložený v aplikaci ke kontrole. Gmail se samostatně neotevírá.");
  };
  const removeDemand = async () => {
    if (!selected) return;
    const confirmed = window.confirm(
      "Opravdu chcete odstranit tuto poptávku? Poptávka se přesune do koše a při dalším importu stejného zdroje se znovu nenačte.",
    );
    if (!confirmed) return;
    const response = await fetch("/api/demands", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected.id, reason: "Nerelevantní poptávka" }),
    });
    if (!response.ok) {
      note("Poptávku se nepodařilo odstranit.");
      return;
    }
    setRows(rows.filter((row) => row.id !== selected.id));
    setSelected(null);
    note("Poptávka byla přesunuta do koše a nebude se znovu importovat.");
  };
  const exportDisplayedDemands = () => {
    exportDemands(displayed, "neovia-poptavky.csv");
    note(`Exportováno ${displayed.length} vyfiltrovaných poptávek.`);
  };
  const exportSelectedDemands = () => {
    exportDemands(selectedDemands, "neovia-poptavky-vybrane.csv");
    note(`Exportováno ${selectedDemands.length} označených poptávek.`);
  };
  const exportDemands = (items: ImportedDemand[], filename: string) => {
    const rowsForExport = [
      "Poptávka;Firma;Kontakt;Zdroj;Importní relevance;Obchodní skóre;Důvod relevance;Doporučený další krok;Kvalifikace;Lokalita;Import;URL;Klíčová slova",
      ...items.map((d) =>
        [
          d.role || d.title,
          d.company || "",
          contactName(d),
          d.source,
          `${d.relevanceScore || 0}%`,
          `${demandIntelligence(d).score}%`,
          demandIntelligence(d).reasons.join(", "),
          recommendedNextStep(d),
          qualificationItems(d).map((item) => `${item.done ? "OK" : "CHYBÍ"} ${item.label}`).join(" | "),
          d.location || "",
          new Date(d.importedAt).toLocaleString("cs-CZ"),
          d.sourceUrl || "",
          keywordPool(d).join(", "),
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(";"),
      ),
    ];
    downloadCsv(rowsForExport, filename);
  };
  const bulkDeleteDemands = async () => {
    if (!selectedDemands.length) return;
    const confirmed = window.confirm(
      `Opravdu chcete přesunout do koše ${selectedDemands.length} označených poptávek? Při dalším importu stejného zdroje se znovu nenačtou.`,
    );
    if (!confirmed) return;
    const response = await fetch("/api/demands", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedDemands.map((demand) => demand.id), reason: "Hromadně označeno jako nerelevantní" }),
    });
    if (!response.ok) {
      note("Označené poptávky se nepodařilo přesunout do koše.");
      return;
    }
    const data = await response.json().catch(() => ({}));
    const okIds = Array.isArray(data.ids) ? data.ids : selectedDemands.map((demand) => demand.id);
    setRows(rows.filter((row) => !okIds.includes(row.id)));
    setSelectedDemandIds([]);
    note(`Do koše přesunuto ${okIds.length} poptávek.`);
  };
  const bulkAddToPipeline = async () => {
    if (!selectedDemands.length) return;
    const confirmed = window.confirm(
      `Zařadit ${selectedDemands.length} označených poptávek do Pipeline ve fázi Identifikace?`,
    );
    if (!confirmed) return;
    const results = await Promise.allSettled(
      selectedDemands.map((demand) =>
        fetch("/api/opportunities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: demand.role || demand.title,
            company: demand.company || "Nezařazená firma",
            demandId: demand.id,
            stage: "identified",
            source: demand.source,
          }),
        }).then(async (response) => ({
          ok: response.ok,
          data: await response.json().catch(() => ({})),
        })),
      ),
    );
    const createdOrExisting = results.filter(
      (result) => result.status === "fulfilled" && result.value.ok,
    ).length;
    setSelectedDemandIds([]);
    note(`Do Pipeline zpracováno ${createdOrExisting} poptávek, duplicity se použily jako existující případy.`);
  };
  return (
    <>
      <Title
        eyebrow="INTELIGENCE POPTÁVEK"
        title="Poptávky"
        subtitle="Automaticky sbírané a ručně ověřené obchodní příležitosti."
        button="Importovat data"
        note={note}
      />
      <div className="toolbar">
        <label>
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            list="demand-search-history"
            placeholder="Hledat firmu, roli, technologii nebo text inzerce"
          />
          <datalist id="demand-search-history">
            {searchHistory.map((item) => (
              <option value={item} key={item} />
            ))}
          </datalist>
          {query && (
            <button
              className="search-clear"
              type="button"
              onClick={() => setQuery("")}
              aria-label="Vyčistit vyhledávání"
            >
              ×
            </button>
          )}
        </label>
        <button onClick={() => setFiltersOpen(!filtersOpen)}>
          <Filter size={16} />
          Filtry
        </button>
        <button
          onClick={exportDisplayedDemands}
        >
          <SlidersHorizontal size={16} />
          Export
        </button>
      </div>
      {filtersOpen && (
        <div className="filter-panel">
          <div className="multi-filter">
            Zdroj
            <div>
              {sources.map((x) => (
                <button
                  className={sourceFilters.includes(x) ? "active" : ""}
                  key={x}
                  type="button"
                  onClick={() => toggleMultiValue(x, sourceFilters, setSourceFilters)}
                >
                  {x}
                </button>
              ))}
            </div>
            {!sourceFilters.length && <small>Všechny zdroje</small>}
          </div>
          <div className="multi-filter wide-filter">
            Role
            <div>
              {roles.slice(0, 120).map((x) => (
                <button
                  className={roleFilters.includes(x) ? "active" : ""}
                  key={x}
                  type="button"
                  onClick={() => toggleMultiValue(x, roleFilters, setRoleFilters)}
                >
                  {x}
                </button>
              ))}
            </div>
            {!roleFilters.length && <small>Všechny role</small>}
          </div>
          <label>
            Min. relevance
            <select value={minScore} onChange={(e) => setMinScore(e.target.value)}>
              <option value="0">Vše</option>
              <option value="50">50 % a více</option>
              <option value="70">70 % a více</option>
              <option value="80">80 % a více</option>
              <option value="90">90 % a více</option>
            </select>
          </label>
          <div className="multi-filter">
            Kontakt
            <div>
              {contactOptions.map((x) => (
                <button
                  className={contactFilters.includes(x) ? "active" : ""}
                  key={x}
                  type="button"
                  onClick={() => toggleMultiValue(x, contactFilters, setContactFilters)}
                >
                  {x}
                </button>
              ))}
            </div>
            {!contactFilters.length && <small>Všechny</small>}
          </div>
          <div className="multi-filter">
            Detail inzerátu
            <div>
              {detailQualityOptions.map((x) => (
                <button
                  className={detailQualityFilters.includes(x) ? "active" : ""}
                  key={x}
                  type="button"
                  onClick={() => toggleMultiValue(x, detailQualityFilters, setDetailQualityFilters)}
                >
                  {x}
                </button>
              ))}
            </div>
            {!detailQualityFilters.length && <small>Vše</small>}
          </div>
          <button
            className="secondary"
            onClick={() => {
              setSourceFilters([]);
              setContactFilters([]);
              setRoleFilters([]);
              setMinScore("0");
              setDetailQualityFilters([]);
              setQuery("");
            }}
          >
            Vyčistit filtry
          </button>
          <small>
            {displayed.length} z {rows.length} poptávek
          </small>
        </div>
      )}
      {selectedDemandIds.length > 0 && (
        <section className="bulk-actions panel">
          <div>
            <b>{selectedDemandIds.length}</b>
            <span>označených poptávek</span>
          </div>
          <button type="button" onClick={bulkAddToPipeline}>
            <BriefcaseBusiness size={15} />
            Zařadit do Pipeline
          </button>
          <button type="button" onClick={exportSelectedDemands}>
            <FileBarChart size={15} />
            Export vybraných
          </button>
          <button type="button" className="danger-secondary" onClick={bulkDeleteDemands}>
            <Trash2 size={15} />
            Smazat označené
          </button>
          <button type="button" className="secondary" onClick={() => setSelectedDemandIds([])}>
            Zrušit výběr
          </button>
        </section>
      )}
      <section className="panel list">
        <div className="list-head">
          <label className="select-all">
            <input
              type="checkbox"
              checked={allDisplayedSelected}
              onChange={toggleAllDisplayed}
            />
            Poptávka
          </label>
          <span>Kontakt</span>
          <span>Stav</span>
          <span>Relevance</span>
        </div>
        {loading ? (
          <div className="empty-state">Načítám poptávky z databáze…</div>
        ) : displayed.length === 0 ? (
          <div className="empty-state">
            Žádná poptávka neodpovídá zvolenému filtru.
            <button
              className="inline-cta"
              onClick={() => {
                setSourceFilters([]);
                setContactFilters([]);
                setRoleFilters([]);
                setMinScore("0");
                setDetailQualityFilters([]);
                setQuery("");
              }}
            >
              Vyčistit filtry
            </button>
          </div>
        ) : (
          displayed.map((d) => {
            const tags = keywordPool(d);
            return (
            <div className="list-row" key={d.id} onClick={() => setSelected(d)} role="button" tabIndex={0}>
              <div className="demand-cell">
                <input
                  type="checkbox"
                  checked={selectedDemandIds.includes(d.id)}
                  onChange={() => toggleDemandSelection(d.id)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Označit poptávku ${d.role || d.title}`}
                />
                <div>
                <button
                  className="demand-title-link"
                  type="button"
                  onClick={(event) => { event.stopPropagation(); setSelected(d); }}
                >
                  {d.role || d.title}
                </button>
                <small>
                  {d.company || "Nezařazená firma"} · {d.location || "ČR"} ·{" "}
                  {d.externalId || d.id}
                </small>
                <p>
                  {(tags.length ? tags : [d.source]).slice(0, 5).map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                  <span className={hasFullDemandText(d) ? "detail-ok" : "detail-missing"}>
                    {hasFullDemandText(d) ? "plné znění" : "chybí detail"}
                  </span>
                </p>
                </div>
              </div>
              <div>
                <b>{contactName(d)}</b>
                <small>
                  {new Date(d.importedAt).toLocaleDateString("cs-CZ")}
                </small>
              </div>
              <span className="status new">Nová</span>
              <strong className="big-score">
                {d.relevanceScore || 0}
                <small>%</small>
              </strong>
            </div>
          );
          })
        )}
      </section>
      {selected && (
        <div className="modal-backdrop">
          <section className="modal demand-detail">
            <header>
              <div>
                <p>{selected.source.toUpperCase()} · IMPORTOVANÁ POPTÁVKA</p>
                <h2>{selected.role || selected.title}</h2>
                <span className="source-tag">{selected.source}</span>
              </div>
              <div className="modal-header-actions">
                <button
                  className="danger-icon-button"
                  type="button"
                  onClick={removeDemand}
                  title="Odstranit nerelevantní poptávku"
                >
                  <Trash2 size={17} />
                  Koš
                </button>
                {selected.sourceUrl && (
                  <a
                    className="secondary detail-source-button"
                    href={selected.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Otevřít původní zdroj
                  </a>
                )}
                <button onClick={() => setSelected(null)}>×</button>
              </div>
            </header>
            <div className="detail-meta">
              <span>
                <b>Firma</b>
                <button
                  className="entity-link"
                  type="button"
                  onClick={() => openDemandCompanyCard(selected)}
                >
                  {selected.company || "Nezařazená firma"}
                </button>
              </span>
              <span>
                <b>Lokalita</b>
                {selected.location || "ČR"}
              </span>
              <span>
                <b>Kontakt</b>
                <button
                  className="entity-link"
                  type="button"
                  onClick={() => openDemandContactCard(selected)}
                  disabled={!selected.contactId && contactName(selected) === "Kontakt není uveden"}
                >
                  {contactName(selected)}
                </button>
              </span>
              <span>
                <b>E-mail</b>
                <EmailLink value={selected.contactEmail} />
              </span>
              <span>
                <b>Telefon</b>
                <PhoneLink value={selected.contactPhone} />
              </span>
              <span>
                <b>Import</b>
                {new Date(selected.importedAt).toLocaleString("cs-CZ")}
              </span>
              <span>
                <b>Kvalita detailu</b>
                <span className={hasFullDemandText(selected) ? "detail-ok" : "detail-missing"}>
                  {hasFullDemandText(selected) ? "Plné znění uloženo" : "Detail je potřeba ověřit u zdroje"}
                </span>
              </span>
            </div>
            <section className="sales-intel-card">
              <div>
                <span>OBCHODNÍ SKÓRE</span>
                <strong>{demandIntelligence(selected).score}%</strong>
                <b>{demandIntelligence(selected).label}</b>
              </div>
              <article>
                <h3>Proč je poptávka relevantní</h3>
                <ul>
                  {demandIntelligence(selected).reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </article>
              <article>
                <h3>Doporučený další krok</h3>
                <p>{recommendedNextStep(selected)}</p>
                <div className="intel-actions">
                  <button type="button" onClick={() => createDemandNextStepTask(selected)}>
                    Vytvořit úkol
                  </button>
                  <button type="button" className="secondary" onClick={() => openDemandEmailDraft(selected)}>
                    Otevřít v Gmailu
                  </button>
                  <button type="button" className="secondary" onClick={() => navigator.clipboard.writeText(outreachDraft(selected)).then(() => note("Návrh e-mailu je zkopírovaný do schránky."))}>
                    Zkopírovat cold e-mail
                  </button>
                </div>
              </article>
            </section>
            <section className="qualification-panel">
              <h3>Kvalifikační checklist</h3>
              <div>
                {qualificationItems(selected).map((item) => (
                  <span className={item.done ? "done" : ""} key={item.label}>
                    {item.done ? <Check size={14} /> : <CircleAlert size={14} />}
                    {item.label}
                  </span>
                ))}
              </div>
            </section>
            <article className="detail-text">
              <h3>Kompletní znění inzerce</h3>
              <HighlightedDemandText
                text={
                  selected.demandText ||
                  "Zdroj neposkytl podrobné znění inzerce."
                }
                keywords={keywordPool(selected)}
              />
              <div className="demand-action-strip">
                <span>
                  <b>Další obchodní akce</b>
                  {recommendedNextStep(selected)}. Obchodní případ se založí do Pipeline ve fázi Identifikace.
                </span>
                <button type="button" onClick={addToPipeline}>
                  Vytvořit obchodní případ
                </button>
              </div>
              {demandDuplicates(selected, rows).length > 0 && (
                <div className="duplicate-check">
                  <CircleAlert size={16} />
                  <div>
                    <b>Možné duplicitní poptávky</b>
                    <span>
                      {demandDuplicates(selected, rows).map((item) => `${item.company || "Firma"}: ${item.role || item.title}`).join(" | ")}
                    </span>
                  </div>
                </div>
              )}
              <div className="outreach-box">
                <h3>Návrh cold e-mailu</h3>
                <pre>{outreachDraft(selected)}</pre>
                <button type="button" onClick={() => navigator.clipboard.writeText(outreachDraft(selected)).then(() => note("Návrh e-mailu je zkopírovaný do schránky."))}>
                  Kopírovat text
                </button>
              </div>
              <div className="keyword-pool">
                <h3>Vytěžené role a štítky</h3>
                <div>
                  {rolePool(selected).map((role) => (
                    <span className="role-tag" key={role}>
                      {role}
                    </span>
                  ))}
                  {keywordPool(selected).map((keyword) => (
                    <span key={keyword}>{keyword}</span>
                  ))}
                </div>
              </div>
            </article>
          </section>
        </div>
      )}
      {companyDetail && (
        <div className="modal-backdrop">
          <section className="modal crm-detail">
            <header>
              <div>
                <p>FIRMA</p>
                <h2>{companyDetail.company || "Nezařazená firma"}</h2>
              </div>
              <button onClick={() => setCompanyDetail(null)}>×</button>
            </header>
            <div className="crm-summary">
              <div>
                <b>{companyDemands(companyDetail).length}</b>
                <small>poptávek</small>
              </div>
              <div>
                <b>
                  {
                    new Set(
                      companyDemands(companyDetail)
                        .map((d) => contactName(d))
                        .filter((x) => x !== "Kontakt není uveden"),
                    ).size
                  }
                </b>
                <small>kontaktů</small>
              </div>
              <div>
                <b>{companyDetail.companySource || companyDemands(companyDetail)[0]?.source || "Zdroj"}</b>
                <small>zdroj firmy</small>
              </div>
            </div>
            <article className="crm-list">
              <h3>Poptávky firmy</h3>
              {companyDemands(companyDetail).map((d) => (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => {
                    setSelected(d);
                    setCompanyDetail(null);
                  }}
                >
                  <b>{d.role || d.title}</b>
                  <small>
                    {d.source} · {new Date(d.importedAt).toLocaleDateString("cs-CZ")}
                  </small>
                </button>
              ))}
            </article>
            <footer>
              <button
                className="primary"
                onClick={() => {
                  setCompanyDetail(null);
                  goTo("Pipeline");
                }}
              >
                Otevřít pipeline
              </button>
            </footer>
          </section>
        </div>
      )}
      {contactDetail && (
        <div className="modal-backdrop">
          <section className="modal crm-detail">
            <header>
              <div>
                <p>KONTAKT</p>
                <h2>{contactName(contactDetail)}</h2>
              </div>
              <button onClick={() => setContactDetail(null)}>×</button>
            </header>
            <div className="detail-meta">
              <span>
                <b>Firma</b>
                {contactDetail.company || "Nezařazená firma"}
              </span>
              <span>
                <b>Role</b>
                {contactDetail.contactRole || "Role není uvedena"}
              </span>
              <span>
                <b>E-mail</b>
                <EmailLink value={contactDetail.contactEmail} />
              </span>
              <span>
                <b>Telefon</b>
                <PhoneLink value={contactDetail.contactPhone} />
              </span>
              <span>
                <b>Zdroj</b>
                <span className="source-tag">
                  {contactDetail.contactSource || contactDetail.source}
                </span>
              </span>
            </div>
            <article className="crm-list">
              <h3>Poptávky navázané na kontakt</h3>
              {contactDemands(contactDetail).map((d) => (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => {
                    setSelected(d);
                    setContactDetail(null);
                  }}
                >
                  <b>{d.role || d.title}</b>
                  <small>
                    {d.source} · {new Date(d.importedAt).toLocaleDateString("cs-CZ")}
                  </small>
                </button>
              ))}
            </article>
            <footer>
              <button
                className="secondary"
                onClick={() => note("Editace kontaktní karty bude další krok.")}
              >
                Upravit kartu
              </button>
              <button
                className="primary"
                onClick={() => note("Aktivita ke kontaktu bude další krok.")}
              >
                Přidat aktivitu
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
function Contacts({
  note,
  contacts,
  setContacts,
  setQuery,
}: {
  note: (s: string) => void;
  contacts: Contact[];
  setContacts: (value: Contact[]) => void;
  setQuery: (value: string) => void;
}) {
  const emptyForm = {
    id: "",
    name: "",
    company: "",
    companyId: "",
    role: "",
    email: "",
    secondaryEmail: "",
    phone: "",
    secondaryPhone: "",
    source: "Ručně",
    verified: false,
  };
  const [open, setOpen] = useState(false),
    [detail, setDetail] = useState<Contact | null>(null),
    [crmTab, setCrmTab] = useState<"contacts" | "companies">("contacts"),
    [companies, setCompanies] = useState<CompanyRecord[]>([]),
    [companyOpen, setCompanyOpen] = useState(false),
    [companyDetail, setCompanyDetail] = useState<CompanyRecord | null>(null),
    [crmSearch, setCrmSearch] = useState(""),
    [contactFilter, setContactFilter] = useState("vše"),
    [companyFilter, setCompanyFilter] = useState("vše"),
    [demands, setDemands] = useState<ImportedDemand[]>([]),
    [opportunities, setOpportunities] = useState<DashboardOpportunity[]>([]),
    [activities, setActivities] = useState<ActivityRecord[]>([]),
    [form, setForm] = useState(emptyForm);
  const [mergeGroup, setMergeGroup] = useState<{ type: "contact" | "company"; items: Array<Contact | CompanyRecord> } | null>(null);
  const [mergeMasterId, setMergeMasterId] = useState("");
  const [merging, setMerging] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = useState(false);
  const emptyCompanyForm = {
    id: "",
    name: "",
    ico: "",
    website: "",
    sector: "",
    source: "Ručně",
    priority: "",
    size: "",
    relationshipStatus: "",
    ownerName: "",
    decisionMaker: "",
    nextStep: "",
    nextStepDueAt: "",
    note: "",
    doNotContact: false,
  };
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const emptyActivityForm = {
    type: "call",
    subject: "",
    note: "",
    occurredAt: "",
    nextStep: "",
    nextStepDueAt: "",
    priority: "2",
    companyId: "",
    contactId: "",
    opportunityId: "",
  };
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityForm, setActivityForm] = useState(emptyActivityForm);
  const [loading, setLoading] = useState(true);
  const normalized = (v: string) => v.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const normalizedText = (value: unknown) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  const companyIdentityKey = (value: string) =>
    normalizedText(value)
      .replace(/\bspol\.?\s*s\.?\s*r\.?\s*o\.?\b/g, " ")
      .replace(/\bs\.?\s*r\.?\s*o\.?\b/g, " ")
      .replace(/\ba\.?\s*s\.?\b/g, " ")
      .replace(/\bk\.?\s*s\.?\b/g, " ")
      .replace(/\bv\.?\s*o\.?\s*s\.?\b/g, " ")
      .replace(/\b(ltd|limited|inc|corp|corporation|gmbh|llc)\b/g, " ")
      .replace(/[^a-z0-9]/g, "");
  const companyDomainKey = (value?: string | null) => {
    const text = String(value || "").trim().toLowerCase();
    const domain = text.match(/https?:\/\/([^/\s]+)/)?.[1] || text.match(/(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/)?.[1] || "";
    return domain.replace(/^www\./, "");
  };
  const safeCompanyNameMatch = (leftKey: string, rightKey: string) => {
    if (leftKey.length <= 3 || rightKey.length <= 3) return false;
    if (leftKey === rightKey) return true;
    const shorter = leftKey.length <= rightKey.length ? leftKey : rightKey;
    const longer = leftKey.length > rightKey.length ? leftKey : rightKey;
    return shorter.length >= 8 && longer.length - shorter.length <= 4 && longer.includes(shorter);
  };
  const emailKey = (value?: string) => normalizedText(value).replace(/\s/g, "");
  const phoneKey = (value?: string) => String(value || "").replace(/\D/g, "");
  const isGenericImportedContactName = (value: string) => {
    const key = normalizedText(value);
    return (
      !key ||
      key === "mpsv" ||
      key === "- mpsv" ||
      key === "kontakt mpsv" ||
      /^[a-z]{2,20} mpsv$/.test(key)
    );
  };
  const sameCompanyIdentity = (left: CompanyRecord, right: CompanyRecord) => {
    const leftKey = companyIdentityKey(left.name);
    const rightKey = companyIdentityKey(right.name);
    const sameName = safeCompanyNameMatch(leftKey, rightKey);
    const sameIco = Boolean(left.ico && right.ico && normalized(left.ico) === normalized(right.ico));
    const leftDomain = companyDomainKey(left.website);
    const rightDomain = companyDomainKey(right.website);
    const sameDomain = Boolean(leftDomain && rightDomain && leftDomain === rightDomain);
    return sameName || sameIco || sameDomain;
  };
  const matches = contacts.filter(
    (c) =>
      c.id !== form.id &&
      ((form.email && normalized(c.email) === normalized(form.email)) ||
        (form.secondaryEmail && normalized(c.email) === normalized(form.secondaryEmail)) ||
        (form.email && normalized(c.secondaryEmail || "") === normalized(form.email)) ||
        (form.secondaryEmail && normalized(c.secondaryEmail || "") === normalized(form.secondaryEmail)) ||
        (form.phone && normalized(c.phone) === normalized(form.phone)) ||
        (form.secondaryPhone && normalized(c.phone) === normalized(form.secondaryPhone)) ||
        (form.phone && normalized(c.secondaryPhone || "") === normalized(form.phone)) ||
        (form.secondaryPhone && normalized(c.secondaryPhone || "") === normalized(form.secondaryPhone))),
  );
  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/contacts").then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      }),
      fetch("/api/demands").then((response) => (response.ok ? response.json() : [])),
      fetch("/api/companies").then((response) => (response.ok ? response.json() : [])),
      fetch("/api/opportunities").then((response) => (response.ok ? response.json() : [])),
      fetch("/api/activities").then((response) => (response.ok ? response.json() : [])),
    ])
      .then(([contactRows, demandRows, companyRows, opportunityRows, activityRows]) => {
        setDemands(demandRows);
        setCompanies(companyRows);
        setOpportunities(opportunityRows);
        setActivities(activityRows);
        const mappedContacts = contactRows.map(
          (c: {
            id: string;
            companyId: string | null;
            firstName: string;
            lastName: string;
            company: string | null;
            role: string | null;
            email: string | null;
            secondaryEmail: string | null;
            phone: string | null;
            secondaryPhone: string | null;
            source: string | null;
            companySource: string | null;
            verified: boolean;
            updatedAt: string;
          }) => ({
            id: c.id,
            companyId: c.companyId,
            name: `${c.firstName} ${c.lastName}`,
            company: c.company || "Nezařazená firma",
            role: c.role || "Nezařazená role",
            email: c.email || "—",
            secondaryEmail: c.secondaryEmail || "",
            phone: c.phone || "—",
            secondaryPhone: c.secondaryPhone || "",
            source: c.source || c.companySource || "Zdroj neuveden",
            state: c.verified ? "Ověřený" : "K ověření",
            duplicates: 0,
            last: new Date(c.updatedAt).toLocaleDateString("cs-CZ"),
            verified: c.verified,
          }),
        );
        setContacts(mappedContacts);
        const requestedContact = window.localStorage.getItem("neovia-open-contact");
        if (requestedContact) {
          const contact = mappedContacts.find((x: Contact) => x.id === requestedContact);
          if (contact) {
            window.localStorage.removeItem("neovia-open-contact");
            setCrmTab("contacts");
            openDetail(contact);
            return;
          }
        }
        const requestedCompany = window.localStorage.getItem("neovia-open-company");
        if (requestedCompany) {
          const company = companyRows.find((x: CompanyRecord) => x.name === requestedCompany || x.id === requestedCompany);
          if (company) {
            window.localStorage.removeItem("neovia-open-company");
            setCrmTab("companies");
            openCompanyDetail(company);
          }
        }
      })
      .catch(() => note("Kontakty se nepodařilo načíst."))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);
  const contactDemands = (contact: Contact) =>
    demands.filter((d) =>
      contact.id
        ? d.contactId === contact.id
        : d.contactEmail === contact.email || d.company === contact.company,
    );
  const contactActivities = (contact: Contact) =>
    activities.filter((activity) => activity.contactId === contact.id);
  const openCreate = () => {
    setForm(emptyForm);
    setOpen(true);
  };
  const openCreateForCompany = (company: CompanyRecord) => {
    setForm({
      ...emptyForm,
      company: company.name,
      companyId: company.id,
      source: company.source || "Ručně",
    });
    setCompanyDetail(null);
    setOpen(true);
  };
  const openDetail = (contact: Contact) => {
    setDetail(contact);
    setForm({
      id: contact.id,
      name: contact.name,
      company: contact.company,
      companyId: contact.companyId || "",
      role: contact.role === "Nezařazená role" ? "" : contact.role,
      email: contact.email === "—" ? "" : contact.email,
      secondaryEmail: contact.secondaryEmail || "",
      phone: contact.phone === "—" ? "" : contact.phone,
      secondaryPhone: contact.secondaryPhone || "",
      source: contact.source === "Zdroj neuveden" ? "" : contact.source,
      verified: contact.verified,
    });
  };
  const save = async () => {
    if (!form.name || !form.company || (!form.email && !form.secondaryEmail && !form.phone && !form.secondaryPhone)) {
      note("Doplňte jméno, firmu a alespoň e-mail nebo telefon.");
      return;
    }
    if (matches.length) {
      note(`Karta nebyla uložena. Možná duplicita: ${matches[0].name}.`);
      return;
    }
    const words = form.name.trim().split(/\s+/);
    const method = form.id ? "PATCH" : "POST";
    const response = await fetch("/api/contacts", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: form.id || undefined,
        firstName: words[0],
        lastName: words.slice(1).join(" ") || "[DOPLNIT]",
        company: form.company,
        role: form.role,
        email: form.email,
        secondaryEmail: form.secondaryEmail,
        phone: form.phone,
        secondaryPhone: form.secondaryPhone,
        source: form.source,
        verified: form.verified,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      note(data.error || "Kartu se nepodařilo uložit do databáze.");
      return;
    }
    const savedContact = await response.json().catch(() => null);
    setOpen(false);
    setDetail(null);
    setForm(emptyForm);
    load();
    if (!form.id && savedContact?.companyId && window.confirm("Kontakt je uložený. Chcete teď doplnit informace k firemní kartě?")) {
      window.localStorage.setItem("neovia-open-company", savedContact.companyId);
      setCrmTab("companies");
      setTimeout(load, 200);
      note("Otevírám firemní kartu k doplnění.");
    } else {
      note(form.id ? "Kontaktní karta byla upravena." : "Kontaktní karta byla uložena do společné databáze.");
    }
  };
  const exportContacts = () => {
    const rows = [
      "Jméno;Firma;Role;E-mail;2. e-mail;Telefon;2. telefon;Zdroj;Stav;Navázané poptávky",
      ...displayedContacts.map((c) =>
        [
          c.name,
          c.company,
          c.role,
          c.email,
          c.secondaryEmail || "",
          c.phone,
          c.secondaryPhone || "",
          c.source,
          c.state,
          String(contactDemands(c).length),
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(";"),
      ),
    ];
    downloadCsv(rows, "neovia-kontakty.csv");
    note("Export kontaktů byl připraven.");
  };
  const openDemand = (demand: ImportedDemand) => {
    window.localStorage.setItem("neovia-open-demand", demand.id);
    goTo("Poptávky");
  };
  const openCompanyDemands = (company: string) => {
    setQuery(company);
    goTo("Poptávky");
  };
  const companyContacts = (company: CompanyRecord) =>
    contacts.filter((contact) =>
      contact.companyId
        ? contact.companyId === company.id
        : contact.company === company.name,
    );
  const companyDemands = (company: CompanyRecord) =>
    demands.filter((demand) =>
      demand.companyId ? demand.companyId === company.id : demand.company === company.name,
    );
  const companyOpportunities = (company: CompanyRecord) =>
    opportunities.filter((opportunity) =>
      opportunity.companyId ? opportunity.companyId === company.id : opportunity.company === company.name,
    );
  const companyActivities = (company: CompanyRecord) =>
    activities.filter((activity) => activity.companyId === company.id);
  const companyHealth = (company: CompanyRecord) => {
    const companyDemandRows = companyDemands(company);
    const companyContactRows = companyContacts(company);
    const bestScore = Math.max(0, ...companyDemandRows.map((demand) => demandIntelligence(demand).score));
    const missingNextStep = !company.nextStep && !company.nextStepDueAt;
    const recommended =
      company.doNotContact ? "Neoslovovat" :
      companyContactRows.length === 0 ? "Doplnit kontakt" :
      bestScore >= 80 ? "Zavolat kvůli top poptávce" :
      companyDemandRows.length > 0 ? "Kvalifikovat firmu" :
      "Sledovat nové signály";
    return { bestScore, recommended, missingNextStep };
  };
  const companyDuplicateSignals = (company: CompanyRecord) =>
    companies
      .filter((item) => item.id !== company.id)
      .filter((item) => sameCompanyIdentity(company, item))
      .slice(0, 5);
  const companyDuplicateGroups = () => {
    const visited = new Set<string>();
    const groups: CompanyRecord[][] = [];
    companies.forEach((company) => {
      if (visited.has(company.id)) return;
      const group = companies.filter((item) => item.id === company.id || sameCompanyIdentity(company, item));
      if (group.length > 1) {
        group.forEach((item) => visited.add(item.id));
        groups.push(group);
      }
    });
    return groups;
  };
  const contactDuplicateSignals = (contact: Contact) =>
    contacts
      .filter((item) => item.id !== contact.id)
      .filter((item) => {
        const emails = [contact.email, contact.secondaryEmail]
          .map((value) => emailKey(value))
          .filter((value) => value && value !== "—");
        const itemEmails = [item.email, item.secondaryEmail]
          .map((value) => emailKey(value))
          .filter((value) => value && value !== "—");
        const phones = [contact.phone, contact.secondaryPhone]
          .map((value) => phoneKey(value))
          .filter((value) => value.length >= 9);
        const itemPhones = [item.phone, item.secondaryPhone]
          .map((value) => phoneKey(value))
          .filter((value) => value.length >= 9);
        const sameNameAndCompany =
          !isGenericImportedContactName(contact.name) &&
          !isGenericImportedContactName(item.name) &&
          normalizedText(contact.name) === normalizedText(item.name) &&
          companyIdentityKey(contact.company) === companyIdentityKey(item.company);
        return emails.some((email) => itemEmails.includes(email)) || phones.some((phone) => itemPhones.includes(phone)) || sameNameAndCompany;
      });
  const contactDuplicateGroups = () => {
    const visited = new Set<string>();
    const groups: Contact[][] = [];
    contacts.forEach((contact) => {
      if (visited.has(contact.id)) return;
      const group = [contact, ...contactDuplicateSignals(contact)];
      if (group.length > 1) {
        group.forEach((item) => visited.add(item.id));
        groups.push(group);
      }
    });
    return groups;
  };
  const openMergeGroup = (type: "contact" | "company", items: Array<Contact | CompanyRecord>) => {
    const uniqueItems = [...new Map(items.map((item) => [item.id, item])).values()];
    setMergeGroup({ type, items: uniqueItems });
    setMergeMasterId(uniqueItems[0]?.id || "");
  };
  const performMerge = async () => {
    if (!mergeGroup || !mergeMasterId) return;
    const duplicateIds = mergeGroup.items.map((item) => item.id).filter((id) => id !== mergeMasterId);
    if (duplicateIds.length === 0) return;
    setMerging(true);
    const response = await fetch(mergeGroup.type === "contact" ? "/api/contacts/merge" : "/api/companies/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterId: mergeMasterId, duplicateIds }),
    });
    setMerging(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      note(data.error || "Sloučení se nepodařilo.");
      return;
    }
    setMergeGroup(null);
    setMergeMasterId("");
    setDetail(null);
    setCompanyDetail(null);
    load();
    note(mergeGroup.type === "contact" ? "Kontakty byly sloučeny." : "Firmy byly sloučeny.");
  };
  const performDeleteContact = async () => {
    if (!contactToDelete) return;
    setDeletingContact(true);
    const response = await fetch("/api/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: contactToDelete.id }),
    });
    setDeletingContact(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      note(data.error || "Kontakt se nepodařilo smazat.");
      return;
    }
    setContactToDelete(null);
    setOpen(false);
    setDetail(null);
    load();
    note("Kontakt byl smazán.");
  };
  const displayedContacts = contacts.filter((contact) => {
    const text = `${contact.name} ${contact.company} ${contact.role} ${contact.email} ${contact.secondaryEmail || ""} ${contact.phone} ${contact.secondaryPhone || ""} ${contact.source}`.toLowerCase();
    const hasContactData = contact.email !== "—" && contact.phone !== "—";
    return (
      text.includes(crmSearch.toLowerCase()) &&
      (contactFilter === "vše" ||
        (contactFilter === "ověřené" && contact.verified) ||
        (contactFilter === "k ověření" && !contact.verified) ||
        (contactFilter === "bez údajů" && !hasContactData) ||
        (contactFilter === "duplicity" && contactDuplicateSignals(contact).length > 0))
    );
  });
  const displayedCompanies = companies.filter((company) => {
    const text = `${company.name} ${company.ico || ""} ${company.website || ""} ${company.sector || ""} ${company.source || ""} ${company.priority || ""} ${company.relationshipStatus || ""} ${company.ownerName || ""} ${company.decisionMaker || ""}`.toLowerCase();
    return (
      text.includes(crmSearch.toLowerCase()) &&
      (companyFilter === "vše" ||
        (companyFilter === "prioritní" && ["vysoká", "high", "a"].includes(String(company.priority || "").toLowerCase())) ||
        (companyFilter === "neoslovovat" && company.doNotContact) ||
        (companyFilter === "bez kontaktů" && Number(company.contactsCount || 0) === 0) ||
        (companyFilter === "s poptávkou" && Number(company.demandsCount || 0) > 0) ||
        (companyFilter === "top poptávka" && companyHealth(company).bestScore >= 80) ||
        (companyFilter === "bez dalšího kroku" && companyHealth(company).missingNextStep) ||
        (companyFilter === "duplicity" && companyDuplicateSignals(company).length > 0))
    );
  });
  const openOpportunity = (opportunityId: string) => {
    window.localStorage.setItem("neovia-open-opportunity", opportunityId);
    goTo("Pipeline");
  };
  const openActivityForContact = (contact: Contact) => {
    setActivityForm({
      ...emptyActivityForm,
      companyId: contact.companyId || "",
      contactId: contact.id,
      subject: `Aktivita: ${contact.name}`,
    });
    setActivityOpen(true);
  };
  const saveContactEmailActivity = async (contact: Contact) => {
    const relatedDemands = contactDemands(contact);
    const subject = `Možnosti IT spolupráce pro ${contact.company}`;
    const body = contactOutreachDraft(contact, relatedDemands);
    const response = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "email",
        subject,
        note: `Koncept e-mailu:\n\n${body}`,
        companyId: contact.companyId || null,
        contactId: contact.id,
      }),
    });
    if (!response.ok) {
      note("Koncept e-mailu se nepodařilo uložit ke kontaktu.");
      return;
    }
    if (contact.email === "—") {
      await navigator.clipboard.writeText(body);
      note("Kontakt nemá e-mail. Text je zkopírovaný do schránky.");
      return;
    }
    saveLocalEmailDraft({ to: contact.email, subject, body, source: `Kontakt ${contact.name}` });
    note("Koncept byl uložen ke kontaktu a do interní fronty ke kontrole. Gmail se samostatně neotevírá.");
  };
  const openActivityForCompany = (company: CompanyRecord) => {
    setActivityForm({
      ...emptyActivityForm,
      companyId: company.id,
      subject: `Aktivita: ${company.name}`,
    });
    setActivityOpen(true);
  };
  const openCompanyCreate = () => {
    setCompanyForm(emptyCompanyForm);
    setCompanyDetail(null);
    setCompanyOpen(true);
  };
  const openCompanyDetail = (company: CompanyRecord) => {
    setCompanyDetail(company);
    setCompanyForm({
      id: company.id,
      name: company.name,
      ico: company.ico || "",
      website: company.website || "",
      sector: company.sector || "",
      source: company.source || "Ručně",
      priority: company.priority || "",
      size: company.size || "",
      relationshipStatus: company.relationshipStatus || "",
      ownerName: company.ownerName || "",
      decisionMaker: company.decisionMaker || "",
      nextStep: company.nextStep || "",
      nextStepDueAt: company.nextStepDueAt ? company.nextStepDueAt.slice(0, 16) : "",
      note: company.note || "",
      doNotContact: Boolean(company.doNotContact),
    });
  };
  const saveCompany = async () => {
    if (!companyForm.name.trim()) {
      note("Doplňte název firmy.");
      return;
    }
    const response = await fetch("/api/companies", {
      method: companyForm.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(companyForm),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      note(data.error || "Firemní kartu se nepodařilo uložit.");
      return;
    }
    setCompanyOpen(false);
    setCompanyDetail(null);
    setCompanyForm(emptyCompanyForm);
    if (companyForm.nextStep && companyForm.nextStepDueAt) {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${companyForm.nextStep}: ${companyForm.name}`,
          dueAt: new Date(companyForm.nextStepDueAt).toISOString(),
          priority: companyForm.priority === "Vysoká" ? 1 : 2,
          companyId: companyForm.id || null,
        }),
      });
    }
    load();
    note(
      companyForm.nextStep && companyForm.nextStepDueAt
        ? "Firemní karta byla uložena a další krok je v úkolech."
        : companyForm.id
          ? "Firemní karta byla upravena."
          : "Firemní karta byla založena.",
    );
  };
  const saveActivity = async () => {
    if (!activityForm.subject.trim()) {
      note("Doplňte předmět aktivity.");
      return;
    }
    const response = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(activityForm),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      note(data.error || "Aktivitu se nepodařilo uložit.");
      return;
    }
    setActivityOpen(false);
    setActivityForm(emptyActivityForm);
    load();
    note(activityForm.nextStep && activityForm.nextStepDueAt ? "Aktivita byla uložena a další krok je v úkolech." : "Aktivita byla uložena.");
  };
  const exportCompanies = () => {
    const rows = [
      "Firma;IČO;Web;Sektor;Zdroj;Priorita;Velikost;Stav vztahu;Vlastník;Decision maker;Další krok;Termín;Neoslovovat;Kontakty;Poptávky;Příležitosti",
      ...displayedCompanies.map((company) =>
        [
          company.name,
          company.ico || "",
          company.website || "",
          company.sector || "",
          company.source || "",
          company.priority || "",
          company.size || "",
          company.relationshipStatus || "",
          company.ownerName || "",
          company.decisionMaker || "",
          company.nextStep || "",
          company.nextStepDueAt || "",
          company.doNotContact ? "ano" : "ne",
          String(company.contactsCount || companyContacts(company).length),
          String(company.demandsCount || companyDemands(company).length),
          String(company.opportunitiesCount || companyOpportunities(company).length),
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(";"),
      ),
    ];
    downloadCsv(rows, "neovia-firmy.csv");
    note("Export firem byl připraven.");
  };
  const activeDetail = detail;
  return (
    <>
      <div className="title">
        <div>
          <p>CRM</p>
          <h1>Kontakty a firmy</h1>
          <small>
            Kontakty, firemní karty, zdroje, vazby na poptávky a obchodní práci.
          </small>
        </div>
        <div className="title-actions">
          {crmTab === "contacts" ? (
            <>
              <button className="secondary" onClick={exportContacts}>
                Export kontaktů
              </button>
              <button className="primary" onClick={openCreate}>
                <Plus size={17} />
                Přidat kontakt
              </button>
            </>
          ) : (
            <>
              <button className="secondary" onClick={exportCompanies}>
                Export firem
              </button>
              <button className="primary" onClick={openCompanyCreate}>
                <Plus size={17} />
                Přidat firmu
              </button>
            </>
          )}
        </div>
      </div>
      <div className="notice">
        <Sparkles size={18} />
        <div>
          <b>Kontrola duplicit je aktivní</b>
          <small>Kontakty se porovnávají podle e-mailů, telefonů i jména ve firmě. Firmy podle IČO a očištěného názvu bez právní formy.</small>
        </div>
        <button onClick={() => note("Duplicity se kontrolují při založení i úpravě karty a CRM radar ukazuje sloučené duplicitní skupiny.")}>
          Jak to funguje
        </button>
      </div>
      <div className="toolbar crm-toolbar">
        <label>
          <Search size={17} />
          <input
            value={crmSearch}
            onChange={(e) => setCrmSearch(e.target.value)}
            placeholder="Hledat kontakt, firmu, e-mail, IČO, zdroj nebo decision makera"
          />
        </label>
        {crmTab === "contacts" ? (
          <select value={contactFilter} onChange={(e) => setContactFilter(e.target.value)}>
            <option value="vše">Všechny kontakty</option>
            <option value="ověřené">Ověřené</option>
            <option value="k ověření">K ověření</option>
            <option value="bez údajů">Bez kompletních údajů</option>
            <option value="duplicity">Duplicity</option>
          </select>
        ) : (
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
            <option value="vše">Všechny firmy</option>
            <option value="prioritní">Prioritní</option>
            <option value="s poptávkou">S poptávkou</option>
            <option value="bez kontaktů">Bez kontaktů</option>
            <option value="top poptávka">Top poptávka</option>
            <option value="bez dalšího kroku">Bez dalšího kroku</option>
            <option value="duplicity">Duplicity</option>
            <option value="neoslovovat">Neoslovovat</option>
          </select>
        )}
        <button
          className="secondary"
          onClick={() => {
            setCrmSearch("");
            setContactFilter("vše");
            setCompanyFilter("vše");
          }}
        >
          Vyčistit
        </button>
      </div>
      <section className="crm-kpis">
        <button
          type="button"
          onClick={() => {
            setCrmTab("contacts");
            setContactFilter("ověřené");
            setCrmSearch("");
          }}
        >
          <b>{contacts.filter((contact) => contact.verified).length}</b>
          <small>ověřených kontaktů</small>
        </button>
        <button
          type="button"
          onClick={() => {
            setCrmTab("companies");
            setCompanyFilter("prioritní");
            setCrmSearch("");
          }}
        >
          <b>{companies.filter((company) => ["vysoká", "high", "a"].includes(String(company.priority || "").toLowerCase())).length}</b>
          <small>prioritních firem</small>
        </button>
        <button
          type="button"
          onClick={() => {
            setCrmTab("companies");
            setCompanyFilter("bez kontaktů");
            setCrmSearch("");
          }}
        >
          <b>{companies.filter((company) => Number(company.contactsCount || 0) === 0).length}</b>
          <small>firem bez kontaktu</small>
        </button>
        <button
          type="button"
          onClick={() => {
            goTo("Úkoly");
          }}
        >
          <b>{activities.length}</b>
          <small>zapsaných aktivit</small>
        </button>
      </section>
      <section className="panel sales-radar crm-radar">
        <div className="panel-header">
          <h2>CRM radar</h2>
          <button onClick={() => setCrmTab("companies")}>
            Otevřít firmy
            <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="radar-grid">
          <button
            type="button"
            onClick={() => {
              setCrmTab("companies");
              setCompanyFilter("top poptávka");
              setCrmSearch("");
            }}
          >
            <b>{companies.filter((company) => companyHealth(company).bestScore >= 80).length}</b>
            <span>firem s top poptávkou</span>
            <small>skóre 80 % a více</small>
          </button>
          <button
            type="button"
            onClick={() => {
              setCrmTab("companies");
              setCompanyFilter("bez dalšího kroku");
              setCrmSearch("");
            }}
          >
            <b>{companies.filter((company) => companyHealth(company).missingNextStep).length}</b>
            <span>bez dalšího kroku</span>
            <small>chybí navazující obchodní akce</small>
          </button>
          <button
            type="button"
            onClick={() => {
              setCrmTab("contacts");
              setContactFilter("bez údajů");
              setCrmSearch("");
            }}
          >
            <b>{contacts.filter((contact) => contact.email === "—" || contact.phone === "—").length}</b>
            <span>neúplných kontaktů</span>
            <small>chybí e-mail nebo telefon</small>
          </button>
          <button
            type="button"
            onClick={() => {
              setCrmTab("contacts");
              setContactFilter("duplicity");
              setCrmSearch("");
            }}
          >
            <b>{contactDuplicateGroups().length}</b>
            <span>duplicitních signálů</span>
            <small>skupiny kontaktů podle e-mailu nebo telefonu</small>
          </button>
        </div>
      </section>
      <div className="crm-tabs">
        <button
          className={crmTab === "contacts" ? "active" : ""}
          onClick={() => setCrmTab("contacts")}
        >
          Kontakty
          <span>{displayedContacts.length}/{contacts.length}</span>
        </button>
        <button
          className={crmTab === "companies" ? "active" : ""}
          onClick={() => setCrmTab("companies")}
        >
          Firmy
          <span>{displayedCompanies.length}/{companies.length}</span>
        </button>
      </div>
      {crmTab === "companies" && companyFilter === "duplicity" && (
        <section className="panel duplicate-groups-panel">
          <div className="panel-header">
            <div>
              <h2>Duplicitní skupiny firem</h2>
              <p>Každý řádek je jedna skupina, kterou můžete rovnou sloučit do vybraného master záznamu.</p>
            </div>
            <span className="source-tag">{companyDuplicateGroups().length} skupin</span>
          </div>
          {companyDuplicateGroups().length === 0 ? (
            <div className="empty-state">Aktuálně nevidím žádnou duplicitní skupinu firem.</div>
          ) : (
            <div className="duplicate-group-list">
              {companyDuplicateGroups().map((group) => (
                <div className="duplicate-group-card" key={group.map((company) => company.id).join("-")}>
                  <div>
                    <b>{group.map((company) => company.name).join(" · ")}</b>
                    <small>
                      {group
                        .map((company) => [company.ico ? `IČO ${company.ico}` : "", company.website, company.source].filter(Boolean).join(" · "))
                        .filter(Boolean)
                        .join(" | ") || "Bez doplňujících údajů"}
                    </small>
                  </div>
                  <button type="button" className="merge-trigger" onClick={() => openMergeGroup("company", group)}>
                    Sloučit skupinu
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {crmTab === "contacts" && contactFilter === "duplicity" && (
        <section className="panel duplicate-groups-panel">
          <div className="panel-header">
            <div>
              <h2>Duplicitní skupiny kontaktů</h2>
              <p>Skupiny se skládají jen z bezpečných shod: stejný e-mail, stejný telefon nebo negenerické jméno ve stejné firmě.</p>
            </div>
            <span className="source-tag">{contactDuplicateGroups().length} skupin</span>
          </div>
          {contactDuplicateGroups().length === 0 ? (
            <div className="empty-state">Aktuálně nevidím žádnou duplicitní skupinu kontaktů.</div>
          ) : (
            <div className="duplicate-group-list">
              {contactDuplicateGroups().map((group) => (
                <div className="duplicate-group-card" key={group.map((contact) => contact.id).join("-")}>
                  <div>
                    <b>{group.map((contact) => contact.name).join(" · ")}</b>
                    <small>
                      {group
                        .map((contact) => [contact.company, contact.email !== "—" ? contact.email : "", contact.phone !== "—" ? contact.phone : ""].filter(Boolean).join(" · "))
                        .filter(Boolean)
                        .join(" | ") || "Bez doplňujících údajů"}
                    </small>
                  </div>
                  <button type="button" className="merge-trigger" onClick={() => openMergeGroup("contact", group)}>
                    Sloučit skupinu
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      {crmTab === "contacts" && (
      <section className="panel contact-table">
        <div className="contact-head">
          <span>Kontakt</span>
          <span>Kontaktní údaje</span>
          <span>Stav</span>
          <span>Vazby</span>
        </div>
        {loading ? (
          <div className="empty-state">
            Načítám kontakty ze společné databáze…
          </div>
        ) : displayedContacts.length === 0 ? (
          <div className="empty-state">
            Žádný kontakt neodpovídá aktuálnímu vyhledávání nebo filtru.
          </div>
        ) : (
          displayedContacts.map((c) => (
            <div className="contact-row" key={c.id || c.email} onClick={() => openDetail(c)} role="button" tabIndex={0}>
              <button className="person person-link" onClick={() => openDetail(c)}>
                <span className="avatar color">
                  {c.name
                    .split(" ")
                    .filter((x) => x.length > 2)
                    .map((x) => x[0])
                    .join("") || "K"}
                </span>
                <div>
                  <b>{c.name}</b>
                  <small>
                    {c.role} · {c.company}
                  </small>
                  <span className="source-tag">{c.source}</span>
                </div>
              </button>
              <div className="contact-data" onClick={(event) => event.stopPropagation()}>
                <EmailLink value={c.email} />
                <PhoneLink value={c.phone} />
              </div>
              <div>
                {c.duplicates ? (
                  <b className="duplicate">{c.duplicates} duplicita</b>
                ) : (
                  <b className="verified">
                    <Check size={13} />
                    {c.state}
                  </b>
                )}
              </div>
              <small>{contactDemands(c).length} poptávek · {c.last}</small>
              {contactDuplicateSignals(c).length > 0 && (
                <span className="duplicate mini-duplicate">
                  {contactDuplicateSignals(c).length} možná duplicita
                  <button
                    type="button"
                    className="merge-trigger"
                    onClick={(event) => { event.stopPropagation(); openMergeGroup("contact", [c, ...contactDuplicateSignals(c)]); }}
                  >
                    Sloučit
                  </button>
                </span>
              )}
              <button className="quiet" onClick={() => openDetail(c)}>
                <MoreHorizontal size={18} />
              </button>
            </div>
          ))
        )}
      </section>
      )}
      {crmTab === "companies" && (
        <section className="panel contact-table">
          <div className="contact-head company-head">
            <span>Firma</span>
            <span>Evidence</span>
            <span>Zdroj</span>
            <span>Vazby</span>
          </div>
          {loading ? (
            <div className="empty-state">Načítám firmy ze společné databáze…</div>
          ) : displayedCompanies.length === 0 ? (
            <div className="empty-state">
              Žádná firma neodpovídá aktuálnímu vyhledávání nebo filtru.
            </div>
          ) : (
            displayedCompanies.map((company) => (
              <div className="contact-row company-row" key={company.id} onClick={() => openCompanyDetail(company)} role="button" tabIndex={0}>
                <button className="person person-link" onClick={() => openCompanyDetail(company)}>
                  <span className="avatar blue">
                    {company.name
                      .split(" ")
                      .filter((x) => x.length > 1)
                      .map((x) => x[0])
                      .slice(0, 2)
                      .join("") || "F"}
                  </span>
                  <div>
                    <b>{company.name}</b>
                    <small>{company.sector || "Sektor neuveden"} · IČO {company.ico || "neuvedeno"}</small>
                    {company.website && <span className="source-tag">{company.website}</span>}
                  </div>
                </button>
                <div className="contact-data">
                  <span>{companyContacts(company).length || company.contactsCount || 0} kontaktů</span>
                  <span>{companyDemands(company).length || company.demandsCount || 0} poptávek</span>
                  <span>{companyHealth(company).recommended}</span>
                </div>
                <div>
                  <span className="source-tag">{company.source || "Zdroj neuveden"}</span>
                </div>
                <small>{companyOpportunities(company).length || company.opportunitiesCount || 0} příležitostí · {new Date(company.updatedAt).toLocaleDateString("cs-CZ")}</small>
                {companyDuplicateSignals(company).length > 0 && (
                  <span className="duplicate mini-duplicate">
                    {companyDuplicateSignals(company).length} možná duplicita
                    <button
                      type="button"
                      className="merge-trigger"
                      onClick={(event) => { event.stopPropagation(); openMergeGroup("company", [company, ...companyDuplicateSignals(company)]); }}
                    >
                      Sloučit
                    </button>
                  </span>
                )}
                <button className="quiet" onClick={() => openCompanyDetail(company)}>
                  <MoreHorizontal size={18} />
                </button>
              </div>
            ))
          )}
        </section>
      )}
      {(open || activeDetail) && (
        <div className="modal-backdrop">
          <form
            className="modal crm-detail"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <header>
              <div>
                <p>{form.id ? "DETAIL KONTAKTU" : "NOVÝ KONTAKT"}</p>
                <h2>{form.id ? form.name : "Kontaktní karta"}</h2>
              </div>
              <button type="button" onClick={() => { setOpen(false); setDetail(null); }}>
                ×
              </button>
            </header>
            {activeDetail && (
              <div className="crm-summary">
                <div>
                  <b>{contactDemands(activeDetail).length}</b>
                  <small>navázaných poptávek</small>
                </div>
                <div>
                  <b>{activeDetail.company}</b>
                  <small>firma</small>
                </div>
                <div>
                  <b>{activeDetail.source}</b>
                  <small>zdroj kontaktu</small>
                </div>
              </div>
            )}
            {activeDetail && (
              <div className="quick-contact-actions">
                <EmailLink value={activeDetail.email} />
                <PhoneLink value={activeDetail.phone} />
                {activeDetail.secondaryEmail && <EmailLink value={activeDetail.secondaryEmail} />}
                {activeDetail.secondaryPhone && <PhoneLink value={activeDetail.secondaryPhone} />}
              </div>
            )}
            {activeDetail && (
              <section className="qualification-panel">
                <h3>Stav kontaktu</h3>
                <div>
                  <span className={activeDetail.email !== "—" ? "done" : ""}>
                    {activeDetail.email !== "—" ? <Check size={14} /> : <CircleAlert size={14} />}
                    E-mail
                  </span>
                  <span className={activeDetail.phone !== "—" ? "done" : ""}>
                    {activeDetail.phone !== "—" ? <Check size={14} /> : <CircleAlert size={14} />}
                    Telefon
                  </span>
                  <span className={activeDetail.verified ? "done" : ""}>
                    {activeDetail.verified ? <Check size={14} /> : <CircleAlert size={14} />}
                    Ověřený kontakt
                  </span>
                  <span className={contactDemands(activeDetail).length ? "done" : ""}>
                    {contactDemands(activeDetail).length ? <Check size={14} /> : <CircleAlert size={14} />}
                    Vazba na poptávku
                  </span>
                </div>
                {contactDuplicateSignals(activeDetail).length > 0 && (
                  <div className="duplicate-check">
                    <CircleAlert size={16} />
                    <div>
                      <b>Možná duplicita kontaktu</b>
                      <span>{contactDuplicateSignals(activeDetail).map((item) => item.name).join(", ")}</span>
                    </div>
                  </div>
                )}
              </section>
            )}
            <div className="form-grid">
              {[
                ["name", "Jméno a příjmení"],
                ["company", "Firma"],
                ["role", "Pracovní role"],
                ["email", "Služební e-mail"],
                ["secondaryEmail", "2. e-mail"],
                ["phone", "Služební telefon"],
                ["secondaryPhone", "2. telefon"],
                ["source", "Zdroj"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    value={form[key as keyof typeof form] as string}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                    placeholder={
                      key === "email"
                        ? "jmeno@firma.cz"
                        : key === "phone"
                          ? "+420 ..."
                          : ""
                    }
                  />
                </label>
              ))}
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={form.verified}
                  onChange={(e) => setForm({ ...form, verified: e.target.checked })}
                />
                Kontakt je ověřený
              </label>
            </div>
            {matches.length > 0 && (
              <div className="duplicate-check">
                <CircleAlert size={16} />
                <div>
                  <b>Možná duplicita</b>
                  <span>
                    {matches.map((x) => x.name).join(", ")} má stejný e-mail
                    nebo telefon.
                  </span>
                </div>
              </div>
            )}
            {activeDetail && (
              <article className="crm-list">
                <h3>Obchodní aktivity</h3>
                {contactActivities(activeDetail).length === 0 ? (
                  <div className="empty-state">Kontakt zatím nemá zapsanou aktivitu.</div>
                ) : (
                  contactActivities(activeDetail).map((activity) => (
                    <button type="button" key={activity.id}>
                      <b>{activity.subject}</b>
                      <small>{activity.type} · {new Date(activity.occurredAt).toLocaleString("cs-CZ")}</small>
                    </button>
                  ))
                )}
                <h3>Navázané poptávky</h3>
                {contactDemands(activeDetail).length === 0 ? (
                  <div className="empty-state">Kontakt zatím nemá navázanou poptávku.</div>
                ) : (
                  contactDemands(activeDetail).map((d) => (
                    <button type="button" key={d.id} onClick={() => openDemand(d)}>
                      <b>{d.role || d.title}</b>
                      <small>{d.company || activeDetail.company} · {d.source}</small>
                    </button>
                  ))
                )}
                <button type="button" onClick={() => openCompanyDemands(form.company)}>
                  <b>Otevřít poptávky firmy</b>
                  <small>{form.company}</small>
                </button>
              </article>
            )}
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => activeDetail ? openActivityForContact(activeDetail) : setOpen(false)}
              >
                {activeDetail ? "Přidat aktivitu" : "Zavřít"}
              </button>
              {activeDetail && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => saveContactEmailActivity(activeDetail)}
                >
                  Připravit e-mail
                </button>
              )}
              {form.id && (
                <button
                  type="button"
                  className="danger"
                  onClick={() => setContactToDelete(activeDetail || (contacts.find((c) => c.id === form.id) ?? null))}
                >
                  Smazat kontakt
                </button>
              )}
              <button type="submit" className="primary">
                {form.id ? "Uložit změny" : "Založit kartu"}
              </button>
            </footer>
          </form>
        </div>
      )}
      {(companyOpen || companyDetail) && (
        <div className="modal-backdrop">
          <form
            className="modal crm-detail"
            onSubmit={(e) => {
              e.preventDefault();
              saveCompany();
            }}
          >
            <header>
              <div>
                <p>{companyForm.id ? "DETAIL FIRMY" : "NOVÁ FIRMA"}</p>
                <h2>{companyForm.id ? companyForm.name : "Firemní karta"}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCompanyOpen(false);
                  setCompanyDetail(null);
                }}
              >
                ×
              </button>
            </header>
            {companyDetail && (
              <div className="crm-summary">
                <div>
                  <b>{companyContacts(companyDetail).length}</b>
                  <small>kontaktů</small>
                </div>
                <div>
                  <b>{companyDemands(companyDetail).length}</b>
                  <small>poptávek</small>
                </div>
                <div>
                  <b>{companyOpportunities(companyDetail).length || companyDetail.opportunitiesCount || 0}</b>
                  <small>příležitostí</small>
                </div>
              </div>
            )}
            {companyDetail && (
              <div className="quick-contact-actions">
                <WebsiteLink value={companyDetail.website} />
                <button type="button" className="entity-link" onClick={() => openCompanyDemands(companyDetail.name)}>
                  Otevřít poptávky firmy
                </button>
                {companyOpportunities(companyDetail).length > 0 && (
                  <button type="button" className="entity-link" onClick={() => openOpportunity(companyOpportunities(companyDetail)[0].id)}>
                    Otevřít pipeline
                  </button>
                )}
              </div>
            )}
            {companyDetail && (
              <section className="sales-intel-card company-intel-card">
                <div>
                  <span>FIREMNÍ SKÓRE</span>
                  <strong>{companyHealth(companyDetail).bestScore}%</strong>
                  <b>{companyHealth(companyDetail).recommended}</b>
                </div>
                <article>
                  <h3>Doporučení</h3>
                  <p>{companyHealth(companyDetail).recommended}</p>
                  <small>
                    {companyContacts(companyDetail).length} kontaktů, {companyDemands(companyDetail).length} poptávek, {companyOpportunities(companyDetail).length || companyDetail.opportunitiesCount || 0} příležitostí.
                  </small>
                </article>
                <article>
                  <h3>Rizika evidence</h3>
                  <ul>
                    {companyContacts(companyDetail).length === 0 && <li>Firma nemá žádný kontakt.</li>}
                    {companyHealth(companyDetail).missingNextStep && <li>Firma nemá nastavený další krok.</li>}
                    {companyDuplicateSignals(companyDetail).length > 0 && <li>Existuje možná duplicita firmy.</li>}
                    {companyDetail.doNotContact && <li>Firma je označená jako neoslovovat.</li>}
                    {companyContacts(companyDetail).length > 0 && !companyHealth(companyDetail).missingNextStep && companyDuplicateSignals(companyDetail).length === 0 && !companyDetail.doNotContact && <li>Evidence je v pořádku.</li>}
                  </ul>
                </article>
              </section>
            )}
            <div className="form-grid">
              {[
                ["name", "Název firmy"],
                ["ico", "IČO"],
                ["website", "Web"],
                ["sector", "Sektor"],
                ["source", "Zdroj"],
                ["priority", "Priorita"],
                ["size", "Velikost firmy"],
                ["relationshipStatus", "Stav vztahu"],
                ["ownerName", "Vlastník v týmu"],
                ["decisionMaker", "Decision maker"],
                ["nextStep", "Další krok"],
                ["nextStepDueAt", "Termín dalšího kroku"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type={key === "nextStepDueAt" ? "datetime-local" : "text"}
                    value={companyForm[key as keyof typeof companyForm] as string}
                    onChange={(e) =>
                      setCompanyForm({ ...companyForm, [key]: e.target.value })
                    }
                    placeholder={key === "website" ? "https://..." : ""}
                  />
                </label>
              ))}
              <label>
                Poznámka obchodníka
                <textarea
                  value={companyForm.note}
                  onChange={(e) => setCompanyForm({ ...companyForm, note: e.target.value })}
                />
              </label>
              <label className="checkbox-line">
                <input
                  type="checkbox"
                  checked={companyForm.doNotContact}
                  onChange={(e) => setCompanyForm({ ...companyForm, doNotContact: e.target.checked })}
                />
                Neoslovovat
              </label>
            </div>
            {companyDetail && (
              <article className="crm-list">
                <h3>Obchodní aktivity firmy</h3>
                {companyDuplicateSignals(companyDetail).length > 0 && (
                  <div className="duplicate-check">
                    <CircleAlert size={16} />
                    <div>
                      <b>Možná duplicita firmy</b>
                      <span>{companyDuplicateSignals(companyDetail).map((company) => company.name).join(", ")}</span>
                    </div>
                    <button
                      type="button"
                      className="merge-trigger"
                      onClick={() => openMergeGroup("company", [companyDetail, ...companyDuplicateSignals(companyDetail)])}
                    >
                      Sloučit
                    </button>
                  </div>
                )}
                {companyActivities(companyDetail).length === 0 ? (
                  <div className="empty-state">Firma zatím nemá zapsanou aktivitu.</div>
                ) : (
                  companyActivities(companyDetail).map((activity) => (
                    <button type="button" key={activity.id}>
                      <b>{activity.subject}</b>
                      <small>{activity.type} · {new Date(activity.occurredAt).toLocaleString("cs-CZ")}</small>
                    </button>
                  ))
                )}
                <h3>Kontakty firmy</h3>
                {companyContacts(companyDetail).length === 0 ? (
                  <div className="empty-state">
                    Firma zatím nemá navázaný kontakt.
                    <button
                      className="inline-cta"
                      type="button"
                      onClick={() => openCreateForCompany(companyDetail)}
                    >
                      Přidat kontakt k firmě
                    </button>
                  </div>
                ) : (
                  <>
                    {companyContacts(companyDetail).map((contact) => (
                      <button
                        type="button"
                        key={contact.id}
                        onClick={() => {
                          setCompanyDetail(null);
                          openDetail(contact);
                        }}
                      >
                        <b>{contact.name}</b>
                        <small>{contact.role} · {contact.email}</small>
                      </button>
                    ))}
                    <button type="button" onClick={() => openCreateForCompany(companyDetail)}>
                      <b>Přidat další kontakt</b>
                      <small>{companyDetail.name}</small>
                    </button>
                  </>
                )}
                <h3>Poptávky firmy</h3>
                {companyDemands(companyDetail).length === 0 ? (
                  <div className="empty-state">Firma zatím nemá navázanou poptávku.</div>
                ) : (
                  companyDemands(companyDetail).map((demand) => (
                    <button type="button" key={demand.id} onClick={() => openDemand(demand)}>
                      <b>{demand.role || demand.title}</b>
                      <small>{demand.source} · {new Date(demand.importedAt).toLocaleDateString("cs-CZ")}</small>
                    </button>
                  ))
                )}
                <button type="button" onClick={() => openCompanyDemands(companyForm.name)}>
                  <b>Otevřít všechny poptávky firmy</b>
                  <small>{companyForm.name}</small>
                </button>
                <h3>Obchodní příležitosti firmy</h3>
                {companyOpportunities(companyDetail).length === 0 ? (
                  <div className="empty-state">Firma zatím nemá obchodní případ v Pipeline.</div>
                ) : (
                  companyOpportunities(companyDetail).map((opportunity) => (
                    <button
                      type="button"
                      key={opportunity.id}
                      onClick={() => openOpportunity(opportunity.id)}
                    >
                      <b>{opportunity.title}</b>
                      <small>
                        {opportunity.stage} · {opportunity.probability} % · {opportunity.source || "Zdroj neuveden"}
                      </small>
                    </button>
                  ))
                )}
              </article>
            )}
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => companyDetail ? openActivityForCompany(companyDetail) : setCompanyOpen(false)}
              >
                {companyDetail ? "Přidat aktivitu" : "Zavřít"}
              </button>
              <button type="submit" className="primary">
                {companyForm.id ? "Uložit firmu" : "Založit firmu"}
              </button>
            </footer>
          </form>
        </div>
      )}
      {activityOpen && (
        <div className="modal-backdrop">
          <form
            className="modal crm-detail"
            onSubmit={(e) => {
              e.preventDefault();
              saveActivity();
            }}
          >
            <header>
              <div>
                <p>OBCHODNÍ AKTIVITA</p>
                <h2>Zápis komunikace a další krok</h2>
              </div>
              <button type="button" onClick={() => setActivityOpen(false)}>
                ×
              </button>
            </header>
            <div className="form-grid">
              <label>
                Typ aktivity
                <select
                  value={activityForm.type}
                  onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value })}
                >
                  <option value="call">Telefonát</option>
                  <option value="email">E-mail</option>
                  <option value="linkedin">LinkedIn zpráva</option>
                  <option value="meeting">Schůzka</option>
                  <option value="note">Poznámka</option>
                  <option value="follow-up">Follow-up</option>
                </select>
              </label>
              <label>
                Předmět
                <input
                  value={activityForm.subject}
                  onChange={(e) => setActivityForm({ ...activityForm, subject: e.target.value })}
                />
              </label>
              <label>
                Datum aktivity
                <input
                  type="datetime-local"
                  value={activityForm.occurredAt}
                  onChange={(e) => setActivityForm({ ...activityForm, occurredAt: e.target.value })}
                />
              </label>
              <label>
                Další krok
                <select
                  value={activityForm.nextStep}
                  onChange={(e) => setActivityForm({ ...activityForm, nextStep: e.target.value })}
                >
                  <option value="">Bez dalšího kroku</option>
                  <option value="Zavolat kontaktu">Zavolat kontaktu</option>
                  <option value="Poslat úvodní e-mail">Poslat úvodní e-mail</option>
                  <option value="Domluvit discovery call">Domluvit discovery call</option>
                  <option value="Připravit nabídku">Připravit nabídku</option>
                  <option value="Follow-up po nabídce">Follow-up po nabídce</option>
                </select>
              </label>
              <label>
                Termín dalšího kroku
                <input
                  type="datetime-local"
                  value={activityForm.nextStepDueAt}
                  onChange={(e) => setActivityForm({ ...activityForm, nextStepDueAt: e.target.value })}
                />
              </label>
              <label>
                Poznámka
                <textarea
                  value={activityForm.note}
                  onChange={(e) => setActivityForm({ ...activityForm, note: e.target.value })}
                />
              </label>
            </div>
            <footer>
              <button type="button" className="secondary" onClick={() => setActivityOpen(false)}>
                Zavřít
              </button>
              <button type="submit" className="primary">
                Uložit aktivitu
              </button>
            </footer>
          </form>
        </div>
      )}
      {mergeGroup && (
        <div className="modal-backdrop">
          <div className="modal merge-modal">
            <header>
              <div>
                <p>{mergeGroup.type === "contact" ? "KONTAKTY" : "FIRMY"}</p>
                <h2>Sloučit duplicitní {mergeGroup.type === "contact" ? "kontakty" : "firmy"}</h2>
              </div>
              <button type="button" onClick={() => setMergeGroup(null)}>×</button>
            </header>
            <p className="merge-hint">
              Vyberte, který záznam zůstane jako <b>hlavní (master)</b>. Ostatní se do něj sloučí — jejich poptávky, příležitosti, úkoly a aktivity se přepíšou na hlavní záznam a duplicitní karty se smažou. Prázdná pole na hlavním záznamu se doplní z duplicit.
            </p>
            <div className="merge-options">
              {mergeGroup.items.map((item) => {
                const isContact = mergeGroup.type === "contact";
                const label = isContact ? `${(item as Contact).name}` : (item as CompanyRecord).name;
                const detail = isContact
                  ? [(item as Contact).company, (item as Contact).email, (item as Contact).phone].filter((v) => v && v !== "—").join(" · ")
                  : [(item as CompanyRecord).ico ? `IČO ${(item as CompanyRecord).ico}` : "", (item as CompanyRecord).website, (item as CompanyRecord).source].filter(Boolean).join(" · ");
                return (
                  <label key={item.id} className={`merge-option ${mergeMasterId === item.id ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="merge-master"
                      checked={mergeMasterId === item.id}
                      onChange={() => setMergeMasterId(item.id)}
                    />
                    <span>
                      <b>{label}</b>
                      <small>{detail || "Bez doplňujících údajů"}</small>
                    </span>
                    {mergeMasterId === item.id && <span className="master-tag">Master</span>}
                  </label>
                );
              })}
            </div>
            <footer>
              <button type="button" className="secondary" onClick={() => setMergeGroup(null)}>Zrušit</button>
              <button type="button" className="primary" disabled={merging} onClick={performMerge}>
                {merging ? "Slučuji…" : "Sloučit do vybraného"}
              </button>
            </footer>
          </div>
        </div>
      )}
      {contactToDelete && (
        <div className="modal-backdrop">
          <div className="modal delete-choice">
            <header>
              <div>
                <p>KONTAKTY</p>
                <h2>Smazat „{contactToDelete.name}"</h2>
              </div>
              <button type="button" onClick={() => setContactToDelete(null)}>×</button>
            </header>
            <p className="merge-hint">
              <b>Tuto akci nelze vrátit zpět.</b> Kontakt bude trvale odstraněn.
              {(contactDemands(contactToDelete).length > 0 || contactActivities(contactToDelete).length > 0) && (
                <>
                  {" "}Má navázáno {contactDemands(contactToDelete).length} poptávek a {contactActivities(contactToDelete).length} aktivit — tyto záznamy zůstanou zachované, jen se od kontaktu odpojí.
                </>
              )}
            </p>
            <footer>
              <button type="button" className="secondary" onClick={() => setContactToDelete(null)}>Zrušit</button>
              <button type="button" className="danger" disabled={deletingContact} onClick={performDeleteContact}>
                {deletingContact ? "Mažu…" : "Ano, smazat kontakt"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
function Pool({ note }: { note: (s: string) => void }) {
  const [rows, setRows] = useState<
      {
        id: string;
        name: string;
        role: string;
        skills: string[];
        location: string | null;
        availability: string | null;
      }[]
    >([]),
    [open, setOpen] = useState(false),
    [editingId, setEditingId] = useState<string | null>(null),
    [form, setForm] = useState({
      name: "",
      role: "",
      skills: "",
      location: "",
      availability: "",
    });
  const load = () =>
    fetch("/api/capacities")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows);
  useEffect(() => {
    load();
  }, []);
  const openEdit = (c: { id: string; name: string; role: string; skills: string[]; location: string | null; availability: string | null }) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      role: c.role,
      skills: c.skills.join(", "),
      location: c.location || "",
      availability: c.availability || "",
    });
    setOpen(true);
  };
  const deleteCapacity = async (id: string) => {
    if (!window.confirm("Opravdu chcete tuto kapacitu odstranit?")) return;
    const r = await fetch("/api/capacities", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!r.ok) {
      note("Kapacitu se nepodařilo odstranit.");
      return;
    }
    setOpen(false);
    load();
    note("Kapacita byla odstraněna.");
  };
  const save = async () => {
    const r = await fetch("/api/capacities", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { ...form, id: editingId } : form),
    });
    if (!r.ok) {
      note("Doplňte jméno a roli kapacity.");
      return;
    }
    setOpen(false);
    setEditingId(null);
    setForm({ name: "", role: "", skills: "", location: "", availability: "" });
    load();
    note(editingId ? "Kapacita byla upravena." : "Kapacita byla uložena.");
  };
  return (
    <>
      <div className="title">
        <div>
          <p>DOSTUPNÉ KAPACITY</p>
          <h1>Pool kapacit</h1>
          <small>
            Párujte skutečně evidované specialisty s obchodními příležitostmi.
          </small>
        </div>
        <button className="primary" onClick={() => { setEditingId(null); setForm({ name: "", role: "", skills: "", location: "", availability: "" }); setOpen(true); }}>
          <Plus size={17} />
          Přidat kapacitu
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="panel empty-state">
          Zatím není evidovaná žádná kapacita. Přidejte prvního specialistu.
        </div>
      ) : (
        <div className="pool">
          {rows.map((c) => (
            <article key={c.id} onClick={() => openEdit(c)} role="button" tabIndex={0}>
              <div>
                <span className="avatar blue">
                  {c.name
                    .split(" ")
                    .map((x) => x[0])
                    .join("")}
                </span>
                <b>{c.availability || "Termín neuveden"}</b>
              </div>
              <h2>{c.name}</h2>
              <p>{c.role}</p>
              <section>
                {c.skills.map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </section>
              <footer>
                <small>{c.location || "Lokalita neuvedena"}</small>
                <button onClick={(event) => { event.stopPropagation(); goTo("Poptávky"); }}>
                  Najít poptávky <ArrowUpRight size={15} />
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
      {open && (
        <div className="modal-backdrop">
          <form
            className="modal crm-detail"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <header>
              <div>
                <p>{editingId ? "DETAIL KAPACITY" : "NOVÁ KAPACITA"}</p>
                <h2>{editingId ? form.name : "Specialista"}</h2>
              </div>
              <button type="button" onClick={() => { setOpen(false); setEditingId(null); }}>
                ×
              </button>
            </header>
            <div className="form-grid">
              {[
                ["name", "Jméno"],
                ["role", "Role"],
                ["skills", "Dovednosti, oddělené čárkou"],
                ["location", "Lokalita"],
                ["availability", "Dostupnost"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    required={key === "name" || key === "role"}
                    value={form[key as keyof typeof form]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => { setOpen(false); setEditingId(null); }}
              >
                Zrušit
              </button>
              {editingId && (
                <button type="button" className="danger" onClick={() => deleteCapacity(editingId)}>
                  Odstranit
                </button>
              )}
              <button className="primary">{editingId ? "Uložit změny" : "Uložit kapacitu"}</button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
function Pipeline({ note }: { note: (s: string) => void }) {
  const nextStepOptions = [
    "Zavolat kontaktu",
    "Poslat úvodní e-mail",
    "Ověřit potřebu a rozpočet",
    "Domluvit discovery call",
    "Připravit nabídku",
    "Poslat návrh kontraktu",
    "Follow-up po nabídce",
    "Uzavřít jako vyhráno nebo ztraceno",
  ];
  const [rows, setRows] = useState<
      {
        id: string;
        title: string;
        company: string | null;
        companyId: string | null;
        contactId: string | null;
        contactFirstName: string | null;
        contactLastName: string | null;
        demandId: string | null;
        demandTitle: string | null;
        stage: string;
        valueCzk: number | null;
        probability: number;
        expectedCloseDate: string | null;
        nextStep: string | null;
        note: string | null;
        source: string | null;
        updatedAt: string | null;
      }[]
    >([]),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState<any>(null),
    [dragged, setDragged] = useState<string | null>(null),
    [pipelineQuery, setPipelineQuery] = useState(""),
    [pipelineSource, setPipelineSource] = useState("vše"),
    [minProbability, setMinProbability] = useState("0"),
    [nextStepFilter, setNextStepFilter] = useState("vše"),
    [pipelineArchiveFilter, setPipelineArchiveFilter] = useState("aktivní"),
    [form, setForm] = useState({
      title: "",
      company: "",
      stage: "identified",
      valueCzk: "",
      probability: "20",
      source: "Ručně",
    });
  const openDetail = (item: (typeof rows)[number]) =>
    setSelected({
      ...item,
      expectedCloseDate: item.expectedCloseDate
        ? item.expectedCloseDate.slice(0, 10)
        : "",
      nextStepDueAt: "",
    });
  const openPipelineCompany = () => {
    if (!selected?.companyId && !selected?.company) {
      note("Případ nemá navázanou firmu.");
      return;
    }
    window.localStorage.setItem("neovia-open-company", selected.companyId || selected.company);
    setSelected(null);
    goTo("Kontakty");
  };
  const openPipelineDemand = () => {
    if (!selected?.demandId) {
      note("Případ nemá navázanou původní poptávku.");
      return;
    }
    window.localStorage.setItem("neovia-open-demand", selected.demandId);
    setSelected(null);
    goTo("Poptávky");
  };
  const openPipelineTasks = () => {
    setSelected(null);
    goTo("Úkoly");
  };
  const load = () =>
    Promise.all([
      fetch("/api/opportunities").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/activities").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/tasks").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([data, activityRows, taskRows]) => {
        setRows(data);
        setOpportunityActivities(activityRows);
        setOpportunityTasks(taskRows);
        const requested = window.localStorage.getItem("neovia-open-opportunity");
        if (requested) {
          const item = data.find((x: (typeof rows)[number]) => x.id === requested);
          if (item) {
            window.localStorage.removeItem("neovia-open-opportunity");
            openDetail(item);
          }
        }
      });
  useEffect(() => {
    load();
  }, []);
  const [opportunityActivities, setOpportunityActivities] = useState<ActivityRecord[]>([]);
  const [opportunityTasks, setOpportunityTasks] = useState<TaskRecord[]>([]);
  const emptyActivityForm = {
    type: "call",
    subject: "",
    note: "",
    occurredAt: "",
    nextStep: "",
    nextStepDueAt: "",
    priority: "2",
  };
  const [activityForm, setActivityForm] = useState(emptyActivityForm);
  const todayKey = localDateKey(new Date());
  const sources = [...new Set(rows.map((x) => x.source || "Zdroj neuveden"))].sort();
  const openOpportunityTasks = opportunityTasks.filter((task) => task.status !== "done");
  const stageLabel = (stage: string) =>
    ({
      identified: "Identifikace",
      qualified: "Kvalifikace",
      contacted: "Kontaktováno",
      discovery: "Discovery",
      solution: "Řešení",
      proposal: "Nabídka",
      negotiation: "Vyjednávání",
      contract: "Kontrakt",
      won: "Vyhráno",
      lost: "LOST",
    })[stage] || stage;
  const filteredRows = rows.filter((item) => {
    const text = `${item.title} ${item.company || ""} ${item.source || ""} ${item.note || ""}`.toLowerCase();
    const tasksForItem = openOpportunityTasks.filter((task) => task.opportunityId === item.id);
    const hasNextStep = Boolean(item.nextStep || tasksForItem.length);
    const hasOverdueTask = tasksForItem.some((task) => {
      const due = task.dueAt ? new Date(task.dueAt) : null;
      return due && localDateKey(due) < todayKey;
    });
    return (
      text.includes(pipelineQuery.toLowerCase()) &&
      (pipelineArchiveFilter === "vše" ||
        (pipelineArchiveFilter === "aktivní" && item.stage !== "lost") ||
        (pipelineArchiveFilter === "lost" && item.stage === "lost")) &&
      (pipelineSource === "vše" || (item.source || "Zdroj neuveden") === pipelineSource) &&
      Number(item.probability || 0) >= Number(minProbability || 0) &&
      (nextStepFilter === "vše" ||
        (nextStepFilter === "má další krok" && hasNextStep) ||
        (nextStepFilter === "bez dalšího kroku" && !hasNextStep) ||
        (nextStepFilter === "po termínu" && hasOverdueTask))
    );
  });
  const weightedPipelineValue = filteredRows.reduce(
    (sum, item) => sum + Math.round(Number(item.valueCzk || 0) * (Number(item.probability || 0) / 100)),
    0,
  );
  const exportPipeline = () => {
    const rowsForExport = [
      "Případ;Firma;Fáze;Zdroj;Hodnota Kč;Pravděpodobnost;Vážená hodnota;Očekávané uzavření;Další krok",
      ...filteredRows.map((item) =>
        [
          item.title,
          item.company || "",
          stageLabel(item.stage),
          item.source || "",
          String(item.valueCzk || ""),
          `${item.probability || 0}%`,
          String(Math.round(Number(item.valueCzk || 0) * (Number(item.probability || 0) / 100))),
          item.expectedCloseDate ? new Date(item.expectedCloseDate).toLocaleDateString("cs-CZ") : "",
          item.nextStep || "",
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(";"),
      ),
    ];
    downloadCsv(rowsForExport, "neovia-pipeline.csv");
    note(`Exportováno ${filteredRows.length} obchodních případů.`);
  };
  const save = async () => {
    const r = await fetch("/api/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!r.ok) {
      note("Doplňte název případu a firmu.");
      return;
    }
    setOpen(false);
    setForm({
      title: "",
      company: "",
      stage: "identified",
      valueCzk: "",
      probability: "20",
      source: "Ručně",
    });
    load();
    note("Obchodní případ byl uložen.");
  };
  const move = async (stage: string) => {
    if (!dragged) return;
    const original = rows.find((x) => x.id === dragged);
    if (!original || original.stage === stage) {
      setDragged(null);
      return;
    }
    setRows(rows.map((x) => (x.id === dragged ? { ...x, stage } : x)));
    setDragged(null);
    const r = await fetch("/api/opportunities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: original.id, stage }),
    });
    if (!r.ok) {
      load();
      note("Přesun se nepodařilo uložit.");
      return;
    }
    note(`Případ přesunut do fáze ${cols.find((x) => x[1] === stage)?.[0]}.`);
  };
  const markSelectedLost = async () => {
    if (!selected) return;
    const confirmed = window.confirm(
      "Opravdu chcete označit tento obchodní případ jako LOST? Přesune se do archivu LOST a v běžné Pipeline se nebude zobrazovat.",
    );
    if (!confirmed) return;
    const r = await fetch("/api/opportunities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selected.id,
        stage: "lost",
        probability: 0,
        nextStep: selected.nextStep || "Uzavřeno jako LOST",
        note: selected.note,
        source: selected.source,
      }),
    });
    if (!r.ok) {
      note("Případ se nepodařilo označit jako LOST.");
      return;
    }
    setSelected(null);
    setPipelineArchiveFilter("lost");
    load();
    note("Případ byl přesunut do archivu LOST.");
  };
  const saveDetail = async () => {
    const r = await fetch("/api/opportunities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selected),
    });
    if (!r.ok) {
      note("Detail se nepodařilo uložit.");
      return;
    }
    if (selected.nextStep && selected.nextStepDueAt) {
      const taskResponse = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${selected.nextStep}: ${selected.company || selected.title}`,
          dueAt: new Date(selected.nextStepDueAt).toISOString(),
          priority: selected.probability >= 60 ? 1 : 2,
          opportunityId: selected.id,
        }),
      });
      if (!taskResponse.ok) {
        note("Detail je uložený, ale úkol se nepodařilo založit.");
        return;
      }
    }
    setSelected(null);
    load();
    note(
      selected.nextStep && selected.nextStepDueAt
        ? "Obchodní případ byl aktualizován a další krok je v úkolech."
        : "Obchodní případ byl aktualizován.",
    );
  };
  const relatedActivities = selected
    ? opportunityActivities.filter((activity) => activity.opportunityId === selected.id)
    : [];
  const relatedTasks = selected
    ? opportunityTasks.filter((task) => task.opportunityId === selected.id)
    : [];
  const saveOpportunityActivity = async () => {
    if (!selected) return;
    if (!activityForm.subject.trim()) {
      note("Doplňte předmět aktivity.");
      return;
    }
    const response = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...activityForm,
        opportunityId: selected.id,
        companyId: selected.companyId || null,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      note(data.error || "Aktivitu se nepodařilo uložit.");
      return;
    }
    setActivityForm(emptyActivityForm);
    load();
    note(
      activityForm.nextStep && activityForm.nextStepDueAt
        ? "Aktivita byla uložena a další krok je v úkolech."
        : "Aktivita byla uložena k obchodnímu případu.",
    );
  };
  const cols: [string, string][] = [
    ["Identifikace", "identified"],
    ["Kvalifikace", "qualified"],
    ["Nabídka", "proposal"],
    ["Vyjednávání", "negotiation"],
  ];
  return (
    <>
      <Title
        eyebrow="OBCHODNÍ PŘÍPADY"
        title="Pipeline"
        subtitle="Skutečné obchodní případy uložené v databázi."
        button="Nový případ"
        note={note}
        onAction={() => setOpen(true)}
      />
      <div className="toolbar pipeline-toolbar">
        <label>
          <Search size={17} />
          <input
            value={pipelineQuery}
            onChange={(e) => setPipelineQuery(e.target.value)}
            placeholder="Hledat firmu, příležitost, zdroj nebo poznámku"
          />
          {pipelineQuery && (
            <button
              className="search-clear"
              type="button"
              onClick={() => setPipelineQuery("")}
              aria-label="Vyčistit vyhledávání"
            >
              ×
            </button>
          )}
        </label>
        <select value={pipelineSource} onChange={(e) => setPipelineSource(e.target.value)}>
          <option value="vše">Všechny zdroje</option>
          {sources.map((source) => (
            <option key={source}>{source}</option>
          ))}
        </select>
        <select value={minProbability} onChange={(e) => setMinProbability(e.target.value)}>
          <option value="0">Všechny šance</option>
          <option value="30">30 % a více</option>
          <option value="50">50 % a více</option>
          <option value="70">70 % a více</option>
        </select>
        <select value={nextStepFilter} onChange={(e) => setNextStepFilter(e.target.value)}>
          <option value="vše">Všechny kroky</option>
          <option value="má další krok">Má další krok</option>
          <option value="bez dalšího kroku">Bez dalšího kroku</option>
          <option value="po termínu">Po termínu</option>
        </select>
        <select value={pipelineArchiveFilter} onChange={(e) => setPipelineArchiveFilter(e.target.value)}>
          <option value="aktivní">Jen aktivní Pipeline</option>
          <option value="lost">Archiv LOST</option>
          <option value="vše">Aktivní i LOST</option>
        </select>
        <button onClick={exportPipeline}>
          <FileBarChart size={16} />
          Export
        </button>
      </div>
      <div className="pipeline-summary">
        <article>
          <b>{filteredRows.length}</b>
          <small>případů ve výběru</small>
        </article>
        <article>
          <b>{filteredRows.reduce((sum, item) => sum + Number(item.valueCzk || 0), 0).toLocaleString("cs-CZ")} Kč</b>
          <small>nominální hodnota</small>
        </article>
        <article>
          <b>{weightedPipelineValue.toLocaleString("cs-CZ")} Kč</b>
          <small>vážená hodnota</small>
        </article>
        <article className={filteredRows.some((item) => openOpportunityTasks.some((task) => task.opportunityId === item.id && task.dueAt && localDateKey(new Date(task.dueAt)) < todayKey)) ? "warn" : ""}>
          <b>
            {
              filteredRows.filter((item) =>
                openOpportunityTasks.some((task) => task.opportunityId === item.id && task.dueAt && localDateKey(new Date(task.dueAt)) < todayKey),
              ).length
            }
          </b>
          <small>případů po termínu</small>
        </article>
        <article className="warn">
          <b>{rows.filter((item) => item.stage === "lost").length}</b>
          <small>LOST archiv</small>
        </article>
      </div>
      {pipelineArchiveFilter !== "aktivní" && (
        <section className="panel lost-archive">
          <header>
            <div>
              <b>Archiv LOST</b>
              <small>Ztracené obchodní případy zůstávají v reportech a exportech.</small>
            </div>
            <span>{filteredRows.filter((item) => item.stage === "lost").length}</span>
          </header>
          {filteredRows.filter((item) => item.stage === "lost").length === 0 ? (
            <div className="empty-state">V tomto filtru není žádný LOST případ.</div>
          ) : (
            filteredRows
              .filter((item) => item.stage === "lost")
              .map((item) => (
                <button className="archive-row" type="button" key={item.id} onClick={() => openDetail(item)}>
                  <span>
                    <b>{item.company || "Firma"}</b>
                    <small>{item.title}</small>
                  </span>
                  <span>{item.source || "Zdroj neuveden"}</span>
                  <span>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString("cs-CZ") : "bez data"}</span>
                </button>
              ))
          )}
        </section>
      )}
      <div className="pipeline">
        {cols.map(([label, stage]) => (
          <section
            key={stage}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => move(stage)}
            className={dragged ? "drop-target" : ""}
          >
            <header>
              <b>{label}</b>
              <span>{filteredRows.filter((x) => x.stage === stage).length}</span>
            </header>
            {filteredRows
              .filter((x) => x.stage === stage)
              .map((x) => (
                <article
                  key={x.id}
                  draggable
                  onDragStart={() => setDragged(x.id)}
                  onDragEnd={() => setDragged(null)}
                  onClick={() => openDetail(x)}
                  className={dragged === x.id ? "dragging" : ""}
                >
                  <small>Obchodní případ</small>
                  <h3>{x.company || "Firma"}</h3>
                  <p>{x.title}</p>
                  <span className="source-tag">{x.source || "Zdroj neuveden"}</span>
                  {!x.nextStep && !openOpportunityTasks.some((task) => task.opportunityId === x.id) && (
                    <span className="pipeline-warning">bez dalšího kroku</span>
                  )}
                  {openOpportunityTasks.some((task) => task.opportunityId === x.id && task.dueAt && localDateKey(new Date(task.dueAt)) < todayKey) && (
                    <span className="pipeline-warning">po termínu</span>
                  )}
                  <footer>
                    <b>
                      {x.valueCzk
                        ? `${x.valueCzk.toLocaleString("cs-CZ")} Kč`
                        : `${x.probability} %`}
                    </b>
                    <span className="avatar soft">LH</span>
                  </footer>
                </article>
              ))}
            {filteredRows.filter((x) => x.stage === stage).length === 0 && (
              <div className="pipeline-empty">V tomto filtru není žádný případ.</div>
            )}
            <button
              onClick={() => {
                setForm({ ...form, stage });
                setOpen(true);
              }}
            >
              <Plus size={15} /> Přidat
            </button>
          </section>
        ))}
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
                <p>NOVÝ OBCHODNÍ PŘÍPAD</p>
                <h2>Pipeline</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                ×
              </button>
            </header>
            <div className="form-grid">
              {[
                ["title", "Název případu"],
                ["company", "Firma"],
                ["valueCzk", "Hodnota Kč"],
                ["probability", "Pravděpodobnost %"],
                ["source", "Zdroj"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    value={form[key as keyof typeof form]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => setOpen(false)}
              >
                Zrušit
              </button>
              <button className="primary">Uložit případ</button>
            </footer>
          </form>
        </div>
      )}
      {selected && (
        <div className="modal-backdrop">
          <form
            className="modal crm-detail pipeline-detail-modal"
            onSubmit={(e) => {
              e.preventDefault();
              saveDetail();
            }}
          >
            <header>
              <div>
                <p>OBCHODNÍ PŘÍPAD</p>
                <h2>{selected.title}</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)}>
                ×
              </button>
            </header>
            <div className="modal-scroll">
              <section className="relation-strip">
                <button type="button" onClick={openPipelineCompany}>
                  <b>{selected.company || "Firma není navázaná"}</b>
                  <small>Otevřít firemní kartu</small>
                </button>
                <button type="button" onClick={openPipelineDemand} disabled={!selected.demandId}>
                  <b>{selected.demandTitle || "Poptávka není navázaná"}</b>
                  <small>Otevřít původní poptávku</small>
                </button>
                <button type="button" onClick={openPipelineTasks}>
                  <b>{relatedTasks.length}</b>
                  <small>Navázané úkoly</small>
                </button>
                <button type="button" onClick={() => note(selected.contactId ? "Detail kontaktu otevřu v dalším kroku přes CRM kartu firmy." : "Kontakt zatím není navázaný.")}>
                  <b>
                    {[selected.contactFirstName, selected.contactLastName].filter(Boolean).join(" ") ||
                      "Kontakt není navázaný"}
                  </b>
                  <small>Kontaktní vazba</small>
                </button>
              </section>
              <div className="form-grid">
                <label>
                  Hodnota Kč
                  <input
                    type="number"
                    value={selected.valueCzk || ""}
                    onChange={(e) =>
                      setSelected({ ...selected, valueCzk: e.target.value })
                    }
                  />
                </label>
                <label>
                  Pravděpodobnost %
                  <input
                    type="number"
                    value={selected.probability || ""}
                    onChange={(e) =>
                      setSelected({ ...selected, probability: e.target.value })
                    }
                  />
                </label>
                <label>
                  Očekávané uzavření
                  <input
                    type="date"
                    value={selected.expectedCloseDate || ""}
                    onChange={(e) =>
                      setSelected({
                        ...selected,
                        expectedCloseDate: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Zdroj
                  <input
                    value={selected.source || ""}
                    onChange={(e) =>
                      setSelected({ ...selected, source: e.target.value })
                    }
                  />
                </label>
                <label>
                  Další krok
                  <select
                    value={selected.nextStep || ""}
                    onChange={(e) =>
                      setSelected({ ...selected, nextStep: e.target.value })
                    }
                  >
                    <option value="">Vyberte další krok</option>
                    {nextStepOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Termín dalšího kroku
                  <input
                    type="datetime-local"
                    value={selected.nextStepDueAt || ""}
                    onChange={(e) =>
                      setSelected({ ...selected, nextStepDueAt: e.target.value })
                    }
                  />
                </label>
                <label>
                  Poznámka z jednání
                  <textarea
                    value={selected.note || ""}
                    onChange={(e) =>
                      setSelected({ ...selected, note: e.target.value })
                    }
                  />
                </label>
              </div>
              <section className="detail-section">
              <h3>Navázané úkoly</h3>
              {relatedTasks.length === 0 ? (
                <div className="empty-state">K tomuto případu zatím není žádný úkol.</div>
              ) : (
                relatedTasks.slice(0, 5).map((task) => (
                  <div className={task.status === "done" ? "timeline-item done" : "timeline-item"} key={task.id}>
                    <b>{task.title}</b>
                    <small>
                      {task.dueAt ? new Date(task.dueAt).toLocaleString("cs-CZ") : "Bez termínu"} · priorita {task.priority}
                    </small>
                  </div>
                ))
              )}
            </section>
              <section className="detail-section">
              <h3>Časová osa aktivit</h3>
              {relatedActivities.length === 0 ? (
                <div className="empty-state">
                  Zatím není zapsaná komunikace k tomuto obchodnímu případu.
                </div>
              ) : (
                relatedActivities.slice(0, 6).map((activity) => (
                  <div className="timeline-item" key={activity.id}>
                    <b>{activity.subject}</b>
                    <small>
                      {activity.type} · {new Date(activity.occurredAt).toLocaleString("cs-CZ")}
                    </small>
                    {activity.note && <p>{activity.note}</p>}
                  </div>
                ))
              )}
            </section>
              <section className="detail-section">
              <h3>Zapsat aktivitu</h3>
              <div className="form-grid">
                <label>
                  Typ
                  <select
                    value={activityForm.type}
                    onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value })}
                  >
                    <option value="call">Telefonát</option>
                    <option value="email">E-mail</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="meeting">Schůzka</option>
                    <option value="note">Poznámka</option>
                    <option value="follow-up">Follow-up</option>
                  </select>
                </label>
                <label>
                  Předmět
                  <input
                    value={activityForm.subject}
                    onChange={(e) => setActivityForm({ ...activityForm, subject: e.target.value })}
                    placeholder="Například volal jsem s nákupem"
                  />
                </label>
                <label>
                  Datum aktivity
                  <input
                    type="datetime-local"
                    value={activityForm.occurredAt}
                    onChange={(e) => setActivityForm({ ...activityForm, occurredAt: e.target.value })}
                  />
                </label>
                <label>
                  Další krok
                  <select
                    value={activityForm.nextStep}
                    onChange={(e) => setActivityForm({ ...activityForm, nextStep: e.target.value })}
                  >
                    <option value="">Bez dalšího kroku</option>
                    {nextStepOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Termín dalšího kroku
                  <input
                    type="datetime-local"
                    value={activityForm.nextStepDueAt}
                    onChange={(e) => setActivityForm({ ...activityForm, nextStepDueAt: e.target.value })}
                  />
                </label>
                <label>
                  Poznámka
                  <textarea
                    value={activityForm.note}
                    onChange={(e) => setActivityForm({ ...activityForm, note: e.target.value })}
                  />
                </label>
              </div>
              <button className="secondary detail-action" type="button" onClick={saveOpportunityActivity}>
                Zapsat aktivitu k případu
              </button>
              </section>
            </div>
            <footer>
              {selected.stage !== "lost" && (
                <button
                  type="button"
                  className="danger-secondary"
                  onClick={markSelectedLost}
                >
                  Označit jako LOST
                </button>
              )}
              <button
                type="button"
                className="secondary"
                onClick={() => setSelected(null)}
              >
                Zavřít
              </button>
              <button className="primary">Uložit změny</button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
function Tasks({ note }: { note: (s: string) => void }) {
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
function CalendarView({ note }: { note: (s: string) => void }) {
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
function Sources({ note }: { note: (s: string) => void }) {
  const mappingFields = [
    ["", "Neimportovat"],
    ["company", "Firma"],
    ["contact", "Kontakt"],
    ["email", "E-mail"],
    ["phone", "Telefon"],
    ["role", "Role / pozice"],
    ["demand", "Název poptávky"],
    ["text", "Text inzerátu"],
    ["source", "Zdroj"],
    ["sourceUrl", "URL zdroje"],
    ["location", "Lokalita"],
    ["ico", "IČO"],
    ["website", "Web firmy"],
  ];
  const [running, setRunning] = useState(false),
    [result, setResult] = useState(""),
    [monitorRunning, setMonitorRunning] = useState(false),
    [monitorResult, setMonitorResult] = useState(""),
    [history, setHistory] = useState<ImportRunRecord[]>([]),
    [manualOpen, setManualOpen] = useState(false),
    [manualText, setManualText] = useState(
      "firma;kontakt;email;telefon;role;poptávka;text;zdroj\n",
    ),
    [manualFileName, setManualFileName] = useState(""),
    [manualRows, setManualRows] = useState<string[][]>([]),
    [manualMapping, setManualMapping] = useState<Record<string, string>>({}),
    [manualRunning, setManualRunning] = useState(false),
    [manualResult, setManualResult] = useState("");
  const splitManualLine = (line: string) => {
    const separator = line.includes(";") ? ";" : line.includes("\t") ? "\t" : ",";
    return line.split(separator).map((cell) => cell.trim().replace(/^"|"$/g, ""));
  };
  const detectMapping = (headers: string[]) => {
    const aliases: Record<string, string> = {
      firma: "company",
      company: "company",
      společnost: "company",
      spolecnost: "company",
      kontakt: "contact",
      jméno: "contact",
      jmeno: "contact",
      name: "contact",
      email: "email",
      "e-mail": "email",
      telefon: "phone",
      phone: "phone",
      role: "role",
      pozice: "role",
      poptávka: "demand",
      poptavka: "demand",
      inzerát: "demand",
      inzerat: "demand",
      text: "text",
      detail: "text",
      zdroj: "source",
      source: "source",
      url: "sourceUrl",
      odkaz: "sourceUrl",
      lokalita: "location",
      location: "location",
      ico: "ico",
      ičo: "ico",
      web: "website",
      website: "website",
    };
    return Object.fromEntries(
      headers.map((header, index) => [
        String(index),
        aliases[header.toLowerCase().trim()] || "",
      ]),
    );
  };
  const updateManualPreview = (text: string) => {
    const parsed = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 8)
      .map(splitManualLine);
    setManualRows(parsed);
    if (parsed[0]) setManualMapping(detectMapping(parsed[0]));
  };
  const handleManualFile = async (file: File | null) => {
    if (!file) return;
    setManualFileName(file.name);
    setManualResult("");
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false });
      const text = rows.map((row) => row.map((cell) => String(cell ?? "")).join(";")).join("\n");
      setManualText(text);
      updateManualPreview(text);
      note("Excel soubor byl načtený, zkontrolujte mapování sloupců.");
      return;
    }
    if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
      const text = await file.text();
      setManualText(text);
      updateManualPreview(text);
      note("Soubor byl načtený, zkontrolujte mapování sloupců.");
      return;
    }
    setManualResult("PDF a obrázky jsou připravené jako vstup, ale zatím vyžadují textovou vrstvu nebo ruční vložení vytěženého textu do pole níže. OCR doplníme jako další krok.");
  };
  const loadHistory = () =>
    fetch("/api/import-runs")
      .then((r) => (r.ok ? r.json() : []))
      .then(setHistory)
      .catch(() => setHistory([]));
  useEffect(() => {
    loadHistory();
  }, []);
  const run = async () => {
    setRunning(true);
    setResult("");
    const response = await fetch("/api/imports/mpsv", { method: "POST" });
    const data = await response.json();
    setRunning(false);
    if (!response.ok) {
      note(data.error || "Import se nepodařil spustit.");
      return;
    }
    setResult(
      `MPSV ${data.file}: celkem ${data.received}, IT shoda ${data.matched}, zpracováno ${data.processed}, nové poptávky ${data.created}, aktualizace ${data.updated}, koš/limit ${data.skipped + (data.limitedByRun || 0)}. Firmy nové/spárované ${data.companiesCreated}/${data.companiesMatched}, kontakty nové/spárované ${data.contactsCreated}/${data.contactDuplicates}.`,
    );
    loadHistory();
    note("Import MPSV byl dokončen.");
  };
  const runMonitor = async () => {
    setMonitorRunning(true);
    setMonitorResult("");
    const response = await fetch("/api/imports/job-monitor", {
      method: "POST",
    });
    const data = await response.json();
    setMonitorRunning(false);
    if (!response.ok) {
      note(data.error || "Job Monitor se nepodařilo spustit.");
      return;
    }
    setMonitorResult(
      `Nalezeno ${data.found}, nově uloženo ${data.created}, aktualizováno ${data.updated}, přeskočeno ${data.skipped}.${data.warnings?.length ? ` První upozornění: ${data.warnings[0]}` : ""}`,
    );
    loadHistory();
    note("Ruční kontrola Job Monitoru byla dokončena.");
  };
  const runManualImport = async () => {
    if (!manualText.trim()) {
      note("Vložte data pro import.");
      return;
    }
    setManualRunning(true);
    setManualResult("");
    const response = await fetch("/api/imports/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: manualText, mapping: manualMapping }),
    });
    const data = await response.json();
    setManualRunning(false);
    if (!response.ok) {
      note(data.error || "Ruční import se nepodařilo spustit.");
      return;
    }
    setManualResult(
      `Přijato ${data.received}, firmy ${data.companiesCreated}, duplicitní firmy ${data.companyDuplicatesFound}, kontakty ${data.contactsCreated}, duplicity kontaktů ${data.contactDuplicatesFound}, nové poptávky ${data.demandsCreated}, aktualizace ${data.demandsUpdated}, přeskočeno ${data.skipped}.${data.warnings?.length ? ` První upozornění: ${data.warnings[0]}` : ""}`,
    );
    loadHistory();
    note("Ruční import dokončen, kontakty a firmy byly zpracovány.");
  };
  const previewManualImport = async () => {
    if (!manualText.trim()) {
      note("Vložte data pro kontrolu importu.");
      return;
    }
    setManualRunning(true);
    setManualResult("");
    const response = await fetch("/api/imports/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: manualText, mapping: manualMapping, preview: true }),
    });
    const data = await response.json();
    setManualRunning(false);
    if (!response.ok) {
      note(data.error || "Kontrola importu se nepodařila.");
      return;
    }
    setManualResult(
      `Náhled: ${data.received} řádků, nové firmy ${data.companiesToCreate}, spárované firmy ${data.companiesToMatch}, nové kontakty ${data.contactsToCreate}, spárované kontakty ${data.contactsToMatch}, nové poptávky ${data.demandsToCreate}, aktualizace poptávek ${data.demandsToUpdate}, přeskočeno ${data.skippedRows}.${data.warnings?.length ? ` První upozornění: ${data.warnings[0]}` : ""}`,
    );
    note("Náhled importu je připravený, zatím se nic neuložilo.");
  };
  return (
    <>
      <div className="title">
        <div>
          <p>DATOVÉ KONEKTORY</p>
          <h1>Zdroje poptávek</h1>
          <small>
            Každý import je dohledatelný, deduplikovaný a běží jen přes povolený
            zdroj dat.
          </small>
        </div>
      </div>
      <div className="source-grid">
        <article className="source-card active-source">
          <div>
            <span className="source-logo dark">JM</span>
            <b>RUČNĚ</b>
          </div>
          <h2>Job Monitor, pracovní portály</h2>
          <p>
            Spustí aktuální kontrolu Jobs.cz, Prace.cz, ITjobs.cz a Profesia.cz
            podle vašich uložených filtrů a uloží jen nové shody.
          </p>
          <footer>
            <span>Využívá nastavení níže</span>
            <button
              className="primary"
              disabled={monitorRunning}
              onClick={runMonitor}
            >
              {monitorRunning ? "Kontroluji…" : "Spustit nyní"}
            </button>
          </footer>
          {monitorResult && (
            <div className="source-result">
              <Check size={15} />
              {monitorResult}
            </div>
          )}
        </article>
        <article className="source-card active-source">
          <div>
            <span className="source-logo">M</span>
            <b>AKTIVNÍ</b>
          </div>
          <h2>MPSV, volná místa</h2>
          <p>
            Oficiální otevřená data Úřadu práce ČR. Importuje nové IT a
            cybersecurity pozice a vytěží dostupné kontaktní údaje.
          </p>
          <footer>
            <span>Aktualizace podle veřejného přírůstku</span>
            <button className="primary" disabled={running} onClick={run}>
              {running ? "Importuji…" : "Spustit import"}
            </button>
          </footer>
          {result && (
            <div className="source-result">
              <Check size={15} />
              {result}
            </div>
          )}
        </article>
        <article className="source-card">
          <div>
            <span className="source-logo dark">in</span>
            <b className="pending">ČEKÁ NA PŘÍSTUP</b>
          </div>
          <h2>LinkedIn Talent Solutions</h2>
          <p>
            Aktivace až po schváleném partnerském přístupu nebo napojení
            licencovaného datového partnera.
          </p>
          <footer>
            <span>OAuth a smluvní přístup</span>
            <button
              className="secondary"
              onClick={() =>
                note(
                  "Pro LinkedIn je nutný schválený Talent Solutions přístup.",
                )
              }
            >
              Zjistit podmínky
            </button>
          </footer>
        </article>
        <article className="source-card active-source">
          <div>
            <span className="source-logo">GM</span>
            <b>KONCEPTY</b>
          </div>
          <h2>Firemní Gmail</h2>
          <p>
            Generuje cold e-maily, ukládá je jako komunikaci ke kontaktu a
            otevře Gmail compose ke kontrole před odesláním. Plné API čtení a
            odesílání čeká na Google OAuth přístupy.
          </p>
          <footer>
            <span>Bezpečný režim bez automatického odeslání</span>
            <button
              className="secondary"
              onClick={() => {
                goTo("Nastavení");
                note("Gmail nastavíte v sekci Nastavení.");
              }}
            >
              Nastavit Gmail
            </button>
          </footer>
        </article>
        <article className="source-card">
          <div>
            <span className="source-logo">SJ</span>
            <b className="pending">ČEKÁ NA TOKEN</b>
          </div>
          <h2>StartupJobs API</h2>
          <p>
            StartupJobs má API pro kariérní weby a ATS. Pro automatický import
            je potřeba Bearer token od StartupJobs, potom půjde zdroj zapnout
            jako čistý API konektor.
          </p>
          <footer>
            <span>Připraveno pro API přístup</span>
            <button
              className="secondary"
              onClick={() =>
                note(
                  "StartupJobs API potřebuje Bearer token z firemního účtu. Jakmile ho budete mít, doplním plně automatický konektor.",
                )
              }
            >
              Co chybí
            </button>
          </footer>
        </article>
        <article className="source-card">
          <div>
            <span className="source-logo orange">JP</span>
            <b className="pending">KANDIDÁT</b>
          </div>
          <h2>JenPráce.cz</h2>
          <p>
            Portál je vhodný jako další zdroj, ale aktuální veřejné hledání
            vrací hodně obecných katalogových odkazů. Zapnu ho až po ověření
            stabilního detailního výpisu nebo přes placený scraper.
          </p>
          <footer>
            <span>Čeká na ověřený zdroj dat</span>
            <button
              className="secondary"
              onClick={() =>
                note(
                  "JenPráce zatím nechávám mimo automatický import, aby do databáze nepadaly nerelevantní katalogové položky.",
                )
              }
            >
              Stav zdroje
            </button>
          </footer>
        </article>
        <article className="source-card">
          <div>
            <span className="source-logo orange">CSV</span>
            <b>AKTIVNÍ</b>
          </div>
          <h2>Ruční CSV import</h2>
          <p>
            Vloží export z portálu nebo tabulky, vytěží firmy, kontakty,
            poptávky a zkontroluje duplicity podle e-mailu a telefonu.
          </p>
          <footer>
            <span>CSV, TSV nebo řádkový text</span>
            <button className="primary" onClick={() => setManualOpen(true)}>
              Importovat
            </button>
          </footer>
          {manualResult && (
            <div className="source-result">
              <Check size={15} />
              {manualResult}
            </div>
          )}
        </article>
      </div>
      {manualOpen && (
        <div className="modal-backdrop">
          <form
            className="modal import-modal"
            onSubmit={(e) => {
              e.preventDefault();
              runManualImport();
            }}
          >
            <header>
              <div>
                <p>RUČNÍ IMPORT</p>
                <h2>Vytěžení firem, kontaktů a poptávek</h2>
              </div>
              <button type="button" onClick={() => setManualOpen(false)}>
                ×
              </button>
            </header>
            <div className="import-help">
              <b>Podporované sloupce</b>
              <small>
                firma, kontakt, email, telefon, role, poptávka, text, zdroj,
                url. Nahrajte Excel, CSV, TXT, případně vložte text z PDF nebo obrázku.
              </small>
            </div>
            <label className="file-import-box">
              Soubor k importu
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.tsv,.txt,.pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => handleManualFile(e.target.files?.[0] || null)}
              />
              <small>
                {manualFileName || "Excel, CSV a TXT se načtou přímo. PDF a obrázek zatím použijte s vloženým textem."}
              </small>
            </label>
            <label className="import-textarea">
              Data k importu
              <textarea
                value={manualText}
                onChange={(e) => {
                  setManualText(e.target.value);
                  updateManualPreview(e.target.value);
                }}
                spellCheck={false}
              />
            </label>
            {manualRows.length > 0 && (
              <section className="mapping-panel">
                <h3>Mapování sloupců</h3>
                <div className="mapping-grid">
                  {manualRows[0].map((header, index) => (
                    <label key={`${header}-${index}`}>
                      <span>{header || `Sloupec ${index + 1}`}</span>
                      <select
                        value={manualMapping[String(index)] || ""}
                        onChange={(e) =>
                          setManualMapping({
                            ...manualMapping,
                            [String(index)]: e.target.value,
                          })
                        }
                      >
                        {mappingFields.map(([value, label]) => (
                          <option key={value || "empty"} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="mapping-preview">
                  {manualRows.slice(0, 4).map((row, rowIndex) => (
                    <div key={rowIndex}>
                      {manualRows[0].map((_, cellIndex) => (
                        <span key={cellIndex}>{row[cellIndex] || " "}</span>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            )}
            {manualResult && <div className="source-result">{manualResult}</div>}
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => setManualOpen(false)}
              >
                Zavřít
              </button>
              <button
                type="button"
                className="secondary"
                disabled={manualRunning}
                onClick={previewManualImport}
              >
                Zkontrolovat import
              </button>
              <button className="primary" disabled={manualRunning}>
                {manualRunning ? "Importuji…" : "Spustit import"}
              </button>
            </footer>
          </form>
        </div>
      )}
      <ImportHistory runs={history} />
      <MonitorSettings note={note} />
    </>
  );
}
function ImportHistory({ runs }: { runs: ImportRunRecord[] }) {
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const statusLabel: Record<string, string> = {
    completed: "Hotovo",
    completed_with_warnings: "Hotovo s upozorněním",
    failed: "Chyba",
    running: "Běží",
    queued: "Čeká",
  };
  const warningsFor = (run: ImportRunRecord) => {
    if (!run.errorSummary) return [];
    try {
      const parsed = JSON.parse(run.errorSummary) as { warnings?: string[]; summary?: Record<string, unknown> };
      return parsed.warnings || [run.errorSummary];
    } catch {
      return [run.errorSummary];
    }
  };
  const exportImportLog = () => {
    const rows = [
      "Zdroj;Stav;Spuštěno;Dokončeno;Přijato;Nové;Aktualizované;Přeskočené;Upozornění",
      ...runs.map((run) =>
        [
          run.sourceName || "Zdroj",
          statusLabel[run.status] || run.status,
          run.startedAt ? new Date(run.startedAt).toLocaleString("cs-CZ") : "",
          run.completedAt ? new Date(run.completedAt).toLocaleString("cs-CZ") : "",
          String(run.receivedCount || 0),
          String(run.createdCount || 0),
          String(run.updatedCount || 0),
          String(run.skippedCount || 0),
          warningsFor(run).join(" | "),
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(";"),
      ),
    ];
    downloadCsv(rows, "neovia-import-log.csv");
  };
  const totalWarnings = runs.reduce((sum, run) => sum + warningsFor(run).length, 0);
  return (
    <section className="panel import-history">
      <div className="panel-header">
        <h2>Log importů a důvody přeskočení</h2>
        <button onClick={exportImportLog}>
          Export logu
          <ChevronDown size={14} />
        </button>
      </div>
      <div className="import-summary">
        <article>
          <b>{runs.length}</b>
          <small>běhů importu</small>
        </article>
        <article>
          <b>{runs.reduce((sum, run) => sum + Number(run.createdCount || 0), 0)}</b>
          <small>nových záznamů</small>
        </article>
        <article>
          <b>{runs.reduce((sum, run) => sum + Number(run.updatedCount || 0), 0)}</b>
          <small>aktualizací</small>
        </article>
        <article className={totalWarnings ? "warn" : ""}>
          <b>{totalWarnings}</b>
          <small>upozornění</small>
        </article>
      </div>
      {runs.length === 0 ? (
        <div className="empty-state">
          Zatím tu není žádný běh importu. Spusťte Job Monitor nebo MPSV import.
        </div>
      ) : (
        runs.map((run) => {
          const warnings = warningsFor(run);
          const expanded = expandedRun === run.id;
          return (
            <div className="import-run" key={run.id}>
              <div>
                <b>{run.sourceName || "Zdroj"}</b>
                <small>
                  {run.completedAt || run.startedAt
                    ? new Date(run.completedAt || run.startedAt!).toLocaleString(
                        "cs-CZ",
                      )
                    : "Bez času"}
                </small>
              </div>
              <span className={`import-status ${run.status}`}>
                {statusLabel[run.status] || run.status}
              </span>
              <small>
                Přijato {run.receivedCount}, nové {run.createdCount},
                aktualizované {run.updatedCount}, přeskočené {run.skippedCount}
              </small>
              <button
                className="link-action import-detail-toggle"
                type="button"
                onClick={() => setExpandedRun(expanded ? null : run.id)}
              >
                {warnings.length
                  ? expanded
                    ? "Skrýt důvody"
                    : `Zobrazit důvody (${warnings.length})`
                  : "Bez upozornění"}
              </button>
              {expanded && warnings.length > 0 && (
                <ul className="import-warnings">
                  {warnings.slice(0, 12).map((warning, index) => (
                    <li key={`${run.id}-${index}`}>{warning}</li>
                  ))}
                  {warnings.length > 12 && (
                    <li>Dalších {warnings.length - 12} upozornění je v exportu logu.</li>
                  )}
                </ul>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
function MonitorSettings({ note }: { note: (s: string) => void }) {
  const [data, setData] = useState<any>(null),
    [saving, setSaving] = useState(false);
  const [blacklistPreview, setBlacklistPreview] = useState<{ matchedCompanies: string[]; affectedDemands: number } | null>(null);
  const [applyingBlacklist, setApplyingBlacklist] = useState(false);
  const previewBlacklist = async () => {
    setApplyingBlacklist(true);
    const r = await fetch("/api/monitor-settings/apply-blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dryRun: true }),
    });
    setApplyingBlacklist(false);
    if (!r.ok) {
      note("Kontrolu se nepodařilo provést.");
      return;
    }
    const result = await r.json();
    if (result.affectedDemands === 0) {
      note("Žádné existující poptávky neodpovídají blacklistu — nic k odstranění.");
      return;
    }
    setBlacklistPreview(result);
  };
  const confirmApplyBlacklist = async () => {
    setApplyingBlacklist(true);
    const r = await fetch("/api/monitor-settings/apply-blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setApplyingBlacklist(false);
    setBlacklistPreview(null);
    if (!r.ok) {
      note("Odstranění se nepodařilo.");
      return;
    }
    const result = await r.json();
    note(`Odstraněno ${result.affectedDemands} poptávek od firem na blacklistu (${result.matchedCompanies.join(", ")}).`);
  };
  useEffect(() => {
    fetch("/api/monitor-settings")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData);
  }, []);
  if (!data)
    return (
      <div className="panel empty-state">Načítám nastavení Job Monitoru…</div>
    );
  const split = (v: string) =>
    v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  const updateSchedule = (i: number, key: string, value: string | boolean) =>
    setData({
      ...data,
      schedules: data.schedules.map((x: any, n: number) =>
        n === i ? { ...x, [key]: value } : x,
      ),
    });
  const save = async () => {
    setSaving(true);
    const r = await fetch("/api/monitor-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (!r.ok) {
      note("Nastavení se nepodařilo uložit.");
      return;
    }
    note("Filtry, exporty a harmonogram Job Monitoru byly uloženy.");
  };
  return (
    <section className="panel monitor-settings">
      <div className="panel-header">
        <h2>Job Monitor, filtry a harmonogram</h2>
      </div>
      <p>
        RSS a manuální zdroje lze plánovat. HTML portály zůstanou vypnuté, dokud
        nebude ověřený povolený přístup.
      </p>
      <div className="form-grid">
        <label>
          Klíčová slova
          <input
            value={data.keywords.join(", ")}
            onChange={(e) =>
              setData({ ...data, keywords: split(e.target.value) })
            }
          />
        </label>
        <label>
          Vyloučit slova
          <input
            value={data.excludedKeywords.join(", ")}
            onChange={(e) =>
              setData({ ...data, excludedKeywords: split(e.target.value) })
            }
          />
        </label>
        <label>
          Blacklist personálních agentur
          <input
            value={data.blacklistedCompanies.join(", ")}
            onChange={(e) =>
              setData({ ...data, blacklistedCompanies: split(e.target.value) })
            }
          />
          <small>Poptávky od těchto firem se při automatickém importu přeskočí (porovnává se podle názvu bez právní formy).</small>
          <button
            type="button"
            className="secondary"
            style={{ marginTop: 8 }}
            disabled={applyingBlacklist}
            onClick={previewBlacklist}
          >
            {applyingBlacklist ? "Kontroluji…" : "Použít i na minulé importy"}
          </button>
        </label>
        <label>
          Lokality
          <input
            value={data.locations.join(", ")}
            onChange={(e) =>
              setData({ ...data, locations: split(e.target.value) })
            }
          />
        </label>
        <label>
          Minimální mzda Kč
          <input
            type="number"
            value={data.minimumSalary}
            onChange={(e) =>
              setData({ ...data, minimumSalary: Number(e.target.value) })
            }
          />
        </label>
      </div>
      <h3>Plánované kontroly</h3>
      {data.schedules.map((s: any, i: number) => (
        <div className="schedule-row" key={s.name}>
          <input
            type="checkbox"
            checked={s.enabled}
            onChange={(e) => updateSchedule(i, "enabled", e.target.checked)}
          />
          <b>{s.name}</b>
          <input
            value={s.cron}
            onChange={(e) => updateSchedule(i, "cron", e.target.value)}
            aria-label={`Čas ${s.name}`}
          />
        </div>
      ))}
      <h3>Možnosti exportu</h3>
      <div className="export-options">
        {["CSV", "JSON", "XLSX", "PDF"].map((format) => (
          <label key={format}>
            <input
              type="checkbox"
              checked={data.exports.includes(format)}
              onChange={(e) =>
                setData({
                  ...data,
                  exports: e.target.checked
                    ? [...data.exports, format]
                    : data.exports.filter((x: string) => x !== format),
                })
              }
            />
            {format}
          </label>
        ))}
      </div>
      <button className="primary" disabled={saving} onClick={save}>
        {saving ? "Ukládám…" : "Uložit nastavení monitoru"}
      </button>
      {blacklistPreview && (
        <div className="modal-backdrop">
          <div className="modal delete-choice">
            <header>
              <div>
                <p>ZDROJE</p>
                <h2>Odstranit poptávky od agentur na blacklistu?</h2>
              </div>
              <button type="button" onClick={() => setBlacklistPreview(null)}>×</button>
            </header>
            <p className="merge-hint">
              <b>Tuto akci nelze vrátit zpět.</b> Bude odstraněno <b>{blacklistPreview.affectedDemands}</b>{" "}
              {blacklistPreview.affectedDemands === 1 ? "poptávka" : "poptávek"} od těchto firem:
              <br />
              {blacklistPreview.matchedCompanies.join(", ")}
            </p>
            <footer>
              <button type="button" className="secondary" onClick={() => setBlacklistPreview(null)}>Zrušit</button>
              <button type="button" className="danger" disabled={applyingBlacklist} onClick={confirmApplyBlacklist}>
                {applyingBlacklist ? "Odstraňuji…" : `Ano, odstranit (${blacklistPreview.affectedDemands})`}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
