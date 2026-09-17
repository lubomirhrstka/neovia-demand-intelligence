"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
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
  Users,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Analytics } from "@/components/analytics";

type View =
  | "Přehled"
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
  phone: string;
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
  updatedAt: string;
  contactsCount: number;
  demandsCount: number;
  opportunitiesCount: number;
};
const initialContacts: Contact[] = [];
type TaskRecord = {
  id: string;
  title: string;
  priority: number;
  dueAt: string | null;
  status: string;
  opportunityId?: string | null;
  opportunityTitle?: string | null;
  company?: string | null;
};
type DashboardOpportunity = {
  id: string;
  title: string;
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
  phone: string | null;
  verified: boolean;
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
    [done, setDone] = useState<number[]>([]),
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
          {view === "Úkoly" && <Tasks {...{ done, setDone, note }} />}
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
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  button: string;
  note: (s: string) => void;
  onAction?: () => void;
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
      const csv = "Metrika;Hodnota\n";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      link.download = "neovia-analyza-role.csv";
      link.click();
      URL.revokeObjectURL(link.href);
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
      <button className="primary" onClick={action}>
        <Plus size={17} />
        {button}
      </button>
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
  return (
    <div className="demand-row">
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
        onClick={() => note(`${d.id} otevřena v detailu.`)}
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
    ])
      .then(([taskData, demandData, opportunityData, contactData]) => {
        setNextTasks(taskData);
        setDashboardDemands(demandData);
        setOpportunities(opportunityData);
        setContacts(contactData);
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
  const openTasks = nextTasks.filter((t) => t.status !== "done");
  const todayTasks = openTasks.filter((t) => {
    const due = t.dueAt ? new Date(t.dueAt) : null;
    return due && due >= startOfToday && due <= endOfToday;
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
  return (
    <>
      <Title
        eyebrow={dateLabel}
        title={`${greeting}, Lubomíre.`}
        subtitle={
          loading
            ? "Načítám aktuální stav pracovního prostoru."
            : `${newToday} nových poptávek dnes, ${openTasks.length} otevřených úkolů, ${contactsToCheck} kontaktů k ověření.`
        }
        button="Importovat data"
        note={note}
      />
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
          change="Doplnit e-mail nebo telefon"
          alert
          icon={<CircleAlert size={19} />}
          onClick={() => goTo("Kontakty")}
        />
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
              <div className="demand-row" key={d.id}>
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
                <button className="quiet" onClick={() => goTo("Poptávky")}>
                  <MoreHorizontal size={18} />
                </button>
              </div>
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
          {todayTasks.length === 0 && (
            <div className="empty-state">
              Dnes není naplánovaný žádný další krok.
              <button className="inline-cta" onClick={() => goTo("Pipeline")}>
                Vytvořit z pipeline
              </button>
            </div>
          )}
          {todayTasks.slice(0, 3).map((t, i) => (
            <div className="mini-task" key={t.id}>
              <button onClick={() => note("Úkol označen jako dokončený.")} />
              <div>
                <b>{t.title}</b>
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
          <Header title="Kvalita kontaktů" action="Otevřít kontakty" />
          <div className="quality">
            <div
              className="donut"
              style={{
                background: `conic-gradient(#12917f 0 ${contacts.length ? Math.round(((contacts.length - contactsToCheck) / contacts.length) * 100) : 0}%, #e6eeec 0)`,
              }}
            >
              <b>
                {contacts.length
                  ? Math.round(((contacts.length - contactsToCheck) / contacts.length) * 100)
                  : 0}
                <small>%</small>
              </b>
            </div>
            <div>
              <b>
                {contactsToCheck === 0
                  ? "Kontakty jsou bez otevřených kontrol"
                  : "Kontakty čekají na doplnění"}
              </b>
              <small>
                {contacts.length - contactsToCheck} z {contacts.length} kontaktů
                má ověřený e-mail i telefon.
              </small>
              <button onClick={() => goTo("Kontakty")}>
                Otevřít kontakty <ArrowUpRight size={14} />
              </button>
            </div>
          </div>
        </section>
      </div>
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
  "Security",
  "SOC",
  "NIS2",
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
  "Security Analyst",
  "SOC Analyst",
  "Security Architect",
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
const keywordPool = (d: ImportedDemand) => {
  const text = `${d.title} ${d.role || ""} ${d.demandText || ""} ${(d.technologies || []).join(" ")}`.toLowerCase();
  const found = [...(d.technologies || [])];
  for (const keyword of DEMAND_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) found.push(keyword);
  }
  return [...new Set(found)].slice(0, 18);
};
const rolePool = (d: ImportedDemand) => {
  const text = `${d.title} ${d.role || ""} ${d.demandText || ""}`.toLowerCase();
  const found = [d.role || d.title].filter(Boolean);
  for (const role of DEMAND_ROLES) {
    if (text.includes(role.toLowerCase())) found.push(role);
  }
  return [...new Set(found)].slice(0, 8);
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
  if (!active.length) return <p>{text}</p>;
  const escaped = active.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return (
    <p>
      {text.split(re).map((part, index) =>
        active.some((x) => x.toLowerCase() === part.toLowerCase()) ? (
          <mark key={`${part}-${index}`}>{part}</mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
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
    [source, setSource] = useState("vše"),
    [contact, setContact] = useState("vše"),
    [selected, setSelected] = useState<ImportedDemand | null>(null),
    [companyDetail, setCompanyDetail] = useState<ImportedDemand | null>(null),
    [contactDetail, setContactDetail] = useState<ImportedDemand | null>(null);
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
  const displayed = rows.filter((d) => {
    const text =
      `${d.company || ""} ${d.role || d.title} ${(d.technologies || []).join(" ")} ${d.demandText || ""}`.toLowerCase();
    const hasContact = Boolean(d.contactFirstName || d.contactLastName);
    return (
      text.includes(query.toLowerCase()) &&
      (source === "vše" || d.source === source) &&
      (contact === "vše" ||
        (contact === "s kontaktem" && hasContact) ||
        (contact === "bez kontaktu" && !hasContact))
    );
  });
  const contactName = (d: ImportedDemand) =>
    [d.contactFirstName, d.contactLastName].filter(Boolean).join(" ") ||
    "Kontakt není uveden";
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
    setSelected(null);
    note("Poptávka byla převedena do Pipeline, fáze Identifikace.");
    goTo("Pipeline");
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
            placeholder="Hledat firmu, roli, technologii nebo text inzerce"
          />
          <kbd>⌘ K</kbd>
        </label>
        <button onClick={() => setFiltersOpen(!filtersOpen)}>
          <Filter size={16} />
          Filtry
        </button>
        <button
          onClick={() =>
            note(
              "Zobrazené sloupce odpovídají zdroji a detail najdete po otevření poptávky.",
            )
          }
        >
          <SlidersHorizontal size={16} />
          Sloupce
        </button>
      </div>
      {filtersOpen && (
        <div className="filter-panel">
          <label>
            Zdroj
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="vše">Všechny zdroje</option>
              {sources.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Kontakt
            <select
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            >
              <option value="vše">Všechny</option>
              <option value="s kontaktem">Jen s kontaktem</option>
              <option value="bez kontaktu">Bez kontaktu</option>
            </select>
          </label>
          <button
            className="secondary"
            onClick={() => {
              setSource("vše");
              setContact("vše");
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
      <section className="panel list">
        <div className="list-head">
          <span>Poptávka</span>
          <span>Kontakt</span>
          <span>Stav</span>
          <span>Relevance</span>
        </div>
        {loading ? (
          <div className="empty-state">Načítám poptávky z databáze…</div>
        ) : displayed.length === 0 ? (
          <div className="empty-state">
            Žádná poptávka neodpovídá zvolenému filtru.
          </div>
        ) : (
          displayed.map((d) => {
            const tags = keywordPool(d);
            return (
            <div className="list-row" key={d.id}>
              <div>
                <button
                  className="demand-title-link"
                  type="button"
                  onClick={() => setSelected(d)}
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
                </p>
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
              <button onClick={() => setSelected(null)}>×</button>
            </header>
            <div className="detail-meta">
              <span>
                <b>Firma</b>
                <button
                  className="entity-link"
                  type="button"
                  onClick={() => setCompanyDetail(selected)}
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
                  onClick={() => setContactDetail(selected)}
                  disabled={!selected.contactId && contactName(selected) === "Kontakt není uveden"}
                >
                  {contactName(selected)}
                </button>
              </span>
              <span>
                <b>Import</b>
                {new Date(selected.importedAt).toLocaleString("cs-CZ")}
              </span>
            </div>
            <article className="detail-text">
              <h3>Kompletní znění inzerce</h3>
              <HighlightedDemandText
                text={
                  selected.demandText ||
                  "Zdroj neposkytl podrobné znění inzerce."
                }
                keywords={keywordPool(selected)}
              />
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
            <footer>
              {selected.sourceUrl && (
                <a
                  className="secondary"
                  href={selected.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Otevřít původní zdroj
                </a>
              )}
              <button className="primary" onClick={addToPipeline}>
                Zařadit do pipeline
              </button>
            </footer>
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
                {contactDetail.contactEmail || "E-mail není uveden"}
              </span>
              <span>
                <b>Telefon</b>
                {contactDetail.contactPhone || "Telefon není uveden"}
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
    phone: "",
    source: "Ručně",
    verified: false,
  };
  const [open, setOpen] = useState(false),
    [detail, setDetail] = useState<Contact | null>(null),
    [crmTab, setCrmTab] = useState<"contacts" | "companies">("contacts"),
    [companies, setCompanies] = useState<CompanyRecord[]>([]),
    [companyOpen, setCompanyOpen] = useState(false),
    [companyDetail, setCompanyDetail] = useState<CompanyRecord | null>(null),
    [demands, setDemands] = useState<ImportedDemand[]>([]),
    [form, setForm] = useState(emptyForm);
  const emptyCompanyForm = {
    id: "",
    name: "",
    ico: "",
    website: "",
    sector: "",
    source: "Ručně",
  };
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [loading, setLoading] = useState(true);
  const normalized = (v: string) => v.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const matches = contacts.filter(
    (c) =>
      c.id !== form.id &&
      ((form.email && normalized(c.email) === normalized(form.email)) ||
        (form.phone && normalized(c.phone) === normalized(form.phone))),
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
    ])
      .then(([contactRows, demandRows, companyRows]) => {
        setDemands(demandRows);
        setCompanies(companyRows);
        setContacts(
          contactRows.map(
            (c: {
              id: string;
              companyId: string | null;
              firstName: string;
              lastName: string;
              company: string | null;
              role: string | null;
              email: string | null;
              phone: string | null;
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
              phone: c.phone || "—",
              source: c.source || c.companySource || "Zdroj neuveden",
              state: c.verified ? "Ověřený" : "K ověření",
              duplicates: 0,
              last: new Date(c.updatedAt).toLocaleDateString("cs-CZ"),
              verified: c.verified,
            }),
          ),
        );
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
  const openCreate = () => {
    setForm(emptyForm);
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
      phone: contact.phone === "—" ? "" : contact.phone,
      source: contact.source === "Zdroj neuveden" ? "" : contact.source,
      verified: contact.verified,
    });
  };
  const save = async () => {
    if (!form.name || !form.company || (!form.email && !form.phone)) {
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
        phone: form.phone,
        source: form.source,
        verified: form.verified,
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      note(data.error || "Kartu se nepodařilo uložit do databáze.");
      return;
    }
    setOpen(false);
    setDetail(null);
    setForm(emptyForm);
    load();
    note(form.id ? "Kontaktní karta byla upravena." : "Kontaktní karta byla uložena do společné databáze.");
  };
  const exportContacts = () => {
    const rows = [
      "Jméno;Firma;Role;E-mail;Telefon;Zdroj;Stav;Navázané poptávky",
      ...contacts.map((c) =>
        [
          c.name,
          c.company,
          c.role,
          c.email,
          c.phone,
          c.source,
          c.state,
          String(contactDemands(c).length),
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(";"),
      ),
    ];
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }),
    );
    link.download = "neovia-kontakty.csv";
    link.click();
    URL.revokeObjectURL(link.href);
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
    load();
    note(companyForm.id ? "Firemní karta byla upravena." : "Firemní karta byla založena.");
  };
  const exportCompanies = () => {
    const rows = [
      "Firma;IČO;Web;Sektor;Zdroj;Kontakty;Poptávky;Příležitosti",
      ...companies.map((company) =>
        [
          company.name,
          company.ico || "",
          company.website || "",
          company.sector || "",
          company.source || "",
          String(company.contactsCount || companyContacts(company).length),
          String(company.demandsCount || companyDemands(company).length),
          String(company.opportunitiesCount || 0),
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(";"),
      ),
    ];
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }),
    );
    link.download = "neovia-firmy.csv";
    link.click();
    URL.revokeObjectURL(link.href);
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
          <small>Každá nová i upravená karta se porovnává podle e-mailu a telefonu.</small>
        </div>
        <button onClick={() => note("Duplicity se kontrolují při založení i úpravě karty.")}>
          Jak to funguje
        </button>
      </div>
      <div className="crm-tabs">
        <button
          className={crmTab === "contacts" ? "active" : ""}
          onClick={() => setCrmTab("contacts")}
        >
          Kontakty
          <span>{contacts.length}</span>
        </button>
        <button
          className={crmTab === "companies" ? "active" : ""}
          onClick={() => setCrmTab("companies")}
        >
          Firmy
          <span>{companies.length}</span>
        </button>
      </div>
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
        ) : contacts.length === 0 ? (
          <div className="empty-state">
            Zatím není uložený žádný kontakt. Vytvořte kartu ručně nebo spusťte import.
          </div>
        ) : (
          contacts.map((c) => (
            <div className="contact-row" key={c.id || c.email}>
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
              <div className="contact-data">
                <span>
                  <Mail size={14} />
                  {c.email}
                </span>
                <span>
                  <Phone size={14} />
                  {c.phone}
                </span>
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
          ) : companies.length === 0 ? (
            <div className="empty-state">
              Zatím není založená žádná firemní karta. Přidejte firmu ručně nebo spusťte import.
            </div>
          ) : (
            companies.map((company) => (
              <div className="contact-row company-row" key={company.id}>
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
                </div>
                <div>
                  <span className="source-tag">{company.source || "Zdroj neuveden"}</span>
                </div>
                <small>{company.opportunitiesCount || 0} příležitostí · {new Date(company.updatedAt).toLocaleDateString("cs-CZ")}</small>
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
            <div className="form-grid">
              {[
                ["name", "Jméno a příjmení"],
                ["company", "Firma"],
                ["role", "Pracovní role"],
                ["email", "Služební e-mail"],
                ["phone", "Služební telefon"],
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
                onClick={() => { setOpen(false); setDetail(null); }}
              >
                Zavřít
              </button>
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
                  <b>{companyDetail.opportunitiesCount || 0}</b>
                  <small>příležitostí</small>
                </div>
              </div>
            )}
            <div className="form-grid">
              {[
                ["name", "Název firmy"],
                ["ico", "IČO"],
                ["website", "Web"],
                ["sector", "Sektor"],
                ["source", "Zdroj"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    value={companyForm[key as keyof typeof companyForm]}
                    onChange={(e) =>
                      setCompanyForm({ ...companyForm, [key]: e.target.value })
                    }
                    placeholder={key === "website" ? "https://..." : ""}
                  />
                </label>
              ))}
            </div>
            {companyDetail && (
              <article className="crm-list">
                <h3>Kontakty firmy</h3>
                {companyContacts(companyDetail).length === 0 ? (
                  <div className="empty-state">Firma zatím nemá navázaný kontakt.</div>
                ) : (
                  companyContacts(companyDetail).map((contact) => (
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
                  ))
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
              </article>
            )}
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setCompanyOpen(false);
                  setCompanyDetail(null);
                }}
              >
                Zavřít
              </button>
              <button type="submit" className="primary">
                {companyForm.id ? "Uložit firmu" : "Založit firmu"}
              </button>
            </footer>
          </form>
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
  const save = async () => {
    const r = await fetch("/api/capacities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!r.ok) {
      note("Doplňte jméno a roli kapacity.");
      return;
    }
    setOpen(false);
    setForm({ name: "", role: "", skills: "", location: "", availability: "" });
    load();
    note("Kapacita byla uložena.");
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
        <button className="primary" onClick={() => setOpen(true)}>
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
            <article key={c.id}>
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
                <button onClick={() => goTo("Poptávky")}>
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
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <header>
              <div>
                <p>NOVÁ KAPACITA</p>
                <h2>Specialista</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
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
                onClick={() => setOpen(false)}
              >
                Zrušit
              </button>
              <button className="primary">Uložit kapacitu</button>
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
        stage: string;
        valueCzk: number | null;
        probability: number;
        expectedCloseDate: string | null;
        nextStep: string | null;
        note: string | null;
        source: string | null;
      }[]
    >([]),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState<any>(null),
    [dragged, setDragged] = useState<string | null>(null),
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
  const load = () =>
    fetch("/api/opportunities")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setRows(data);
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
          dueAt: selected.nextStepDueAt,
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
              <span>{rows.filter((x) => x.stage === stage).length}</span>
            </header>
            {rows
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
            className="modal"
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
            <footer>
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
function Tasks({
  done,
  setDone,
  note,
}: {
  done: number[];
  setDone: (x: number[]) => void;
  note: (s: string) => void;
}) {
  const [rows, setRows] = useState<TaskRecord[]>([]),
    [loading, setLoading] = useState(true),
    [open, setOpen] = useState(false),
    [title, setTitle] = useState(""),
    [dueAt, setDueAt] = useState(""),
    [saving, setSaving] = useState(false);
  const load = () =>
    fetch("/api/tasks")
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setRows(await r.json());
      })
      .catch(() => note("Úkoly se nepodařilo načíst."))
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);
  const save = async () => {
    if (!title.trim()) {
      note("Doplňte název úkolu.");
      return;
    }
    setSaving(true);
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dueAt: dueAt || null }),
    });
    setSaving(false);
    if (!response.ok) {
      note("Úkol se nepodařilo uložit.");
      return;
    }
    setOpen(false);
    setTitle("");
    setDueAt("");
    load();
    note("Úkol byl uložen do společné databáze.");
  };
  const openOpportunity = (opportunityId: string) => {
    window.localStorage.setItem("neovia-open-opportunity", opportunityId);
    goTo("Pipeline");
  };
  return (
    <>
      <div className="title">
        <div>
          <p>AKTIVITY</p>
          <h1>Úkoly a kalendář</h1>
          <small>Další kroky obchodního týmu na jednom místě.</small>
        </div>
        <button className="primary" onClick={() => setOpen(true)}>
          <Plus size={17} />
          Nový úkol
        </button>
      </div>
      <div className="task-grid">
        <section className="panel">
          <Header title="Moje úkoly" action="Dnes" />
          {loading ? (
            <div className="empty-state">
              Načítám úkoly ze společné databáze…
            </div>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              Zatím nemáte žádný úkol. Vytvořte první další krok.
            </div>
          ) : (
            rows.map((task, i) => (
              <div
                className={done.includes(i) ? "task done" : "task"}
                key={task.id}
              >
                <button
                  onClick={() =>
                    setDone(
                      done.includes(i)
                        ? done.filter((x) => x !== i)
                        : [...done, i],
                    )
                  }
                >
                  {done.includes(i) && <Check size={14} />}
                </button>
                <div>
                  <b>{task.title}</b>
                  <small>
                    {task.dueAt
                      ? new Date(task.dueAt).toLocaleString("cs-CZ")
                      : "Bez termínu"}{" "}
                    · Priorita {task.priority}
                    {task.company ? ` · ${task.company}` : ""}
                  </small>
                  {task.opportunityId && (
                    <button
                      className="link-action"
                      type="button"
                      onClick={() => openOpportunity(task.opportunityId!)}
                    >
                      Otevřít obchodní kartu
                    </button>
                  )}
                </div>
                <span className="avatar soft">LH</span>
              </div>
            ))
          )}
        </section>
        <section className="panel">
          <Header title="Dnešní agenda" action="Kalendář" />
          {rows
            .filter((x) => x.dueAt)
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
          {!loading && rows.filter((x) => x.dueAt).length === 0 && (
            <div className="empty-state">Žádné termíny v kalendáři.</div>
          )}
          <button
            className="calendar"
            onClick={() =>
              note(
                "Připojení Microsoft 365 a Google Calendar bude další integrační krok.",
              )
            }
          >
            <CalendarDays size={16} /> Připojit kalendář Microsoft 365 nebo
            Google
          </button>
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
                <h2>Další krok</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
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
                Termín
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </label>
            </div>
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => setOpen(false)}
              >
                Zrušit
              </button>
              <button disabled={saving} type="submit" className="primary">
                {saving ? "Ukládám…" : "Uložit úkol"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
function Sources({ note }: { note: (s: string) => void }) {
  const [running, setRunning] = useState(false),
    [result, setResult] = useState(""),
    [monitorRunning, setMonitorRunning] = useState(false),
    [monitorResult, setMonitorResult] = useState(""),
    [history, setHistory] = useState<ImportRunRecord[]>([]),
    [manualOpen, setManualOpen] = useState(false),
    [manualText, setManualText] = useState(
      "firma;kontakt;email;telefon;role;poptávka;text;zdroj\n",
    ),
    [manualRunning, setManualRunning] = useState(false),
    [manualResult, setManualResult] = useState("");
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
      `Zpracováno ${data.received} záznamů, IT shoda ${data.matched}, nové ${data.created}, aktualizované ${data.updated}, přeskočeno ${data.skipped}.`,
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
      `Nalezeno ${data.found}, nově uloženo ${data.created}, aktualizováno ${data.updated}, přeskočeno ${data.skipped}.`,
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
      body: JSON.stringify({ text: manualText }),
    });
    const data = await response.json();
    setManualRunning(false);
    if (!response.ok) {
      note(data.error || "Ruční import se nepodařilo spustit.");
      return;
    }
    setManualResult(
      `Přijato ${data.received}, firmy ${data.companiesCreated}, kontakty ${data.contactsCreated}, duplicity kontaktů ${data.contactDuplicatesFound}, nové poptávky ${data.demandsCreated}, aktualizace ${data.demandsUpdated}.`,
    );
    loadHistory();
    note("Ruční import dokončen, kontakty a firmy byly zpracovány.");
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
          <h2>Job Monitor, IT Security</h2>
          <p>
            Spustí aktuální kontrolu Jobs.cz a Prace.cz podle vašich uložených
            filtrů a uloží jen nové shody.
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
                url. Oddělovač může být středník, čárka nebo tabulátor.
              </small>
            </div>
            <label className="import-textarea">
              Data k importu
              <textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                spellCheck={false}
              />
            </label>
            {manualResult && <div className="source-result">{manualResult}</div>}
            <footer>
              <button
                type="button"
                className="secondary"
                onClick={() => setManualOpen(false)}
              >
                Zavřít
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
  const statusLabel: Record<string, string> = {
    completed: "Hotovo",
    completed_with_warnings: "Hotovo s upozorněním",
    failed: "Chyba",
    running: "Běží",
    queued: "Čeká",
  };
  const describe = (run: ImportRunRecord) => {
    if (!run.errorSummary) return "";
    try {
      const parsed = JSON.parse(run.errorSummary) as { warnings?: string[] };
      return parsed.warnings?.join(" ") || run.errorSummary;
    } catch {
      return run.errorSummary;
    }
  };
  return (
    <section className="panel import-history">
      <div className="panel-header">
        <h2>Log importů a důvody přeskočení</h2>
      </div>
      {runs.length === 0 ? (
        <div className="empty-state">
          Zatím tu není žádný běh importu. Spusťte Job Monitor nebo MPSV import.
        </div>
      ) : (
        runs.map((run) => (
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
            {describe(run) && <p>{describe(run)}</p>}
          </div>
        ))
      )}
    </section>
  );
}
function MonitorSettings({ note }: { note: (s: string) => void }) {
  const [data, setData] = useState<any>(null),
    [saving, setSaving] = useState(false);
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
    </section>
  );
}
function Analytics() {
  const [demands, setDemands] = useState<ImportedDemand[]>([]),
    [opportunities, setOpportunities] = useState<DashboardOpportunity[]>([]);
  useEffect(() => {
    Promise.all([
      fetch("/api/demands").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/opportunities").then((r) => (r.ok ? r.json() : [])),
    ]).then(([demandData, opportunityData]) => {
      setDemands(demandData);
      setOpportunities(opportunityData);
    });
  }, []);
  const roleCounts = Array.from(
    demands
      .reduce((map, demand) => {
        const key = demand.role || demand.title || "Role neuvedena";
        map.set(key, (map.get(key) || 0) + 1);
        return map;
      }, new Map<string, number>())
      .entries(),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const sourceCounts = Array.from(
    demands
      .reduce((map, demand) => {
        map.set(demand.source, (map.get(demand.source) || 0) + 1);
        return map;
      }, new Map<string, number>())
      .entries(),
  ).sort((a, b) => b[1] - a[1]);
  const maxRole = Math.max(1, ...roleCounts.map((x) => x[1]));
  const exportReport = () => {
    const rows = [
      "Typ;Název;Počet",
      ...roleCounts.map(([name, count]) => `Role;${name};${count}`),
      ...sourceCounts.map(([name, count]) => `Zdroj;${name};${count}`),
      `Pipeline;Obchodní případy;${opportunities.length}`,
    ];
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }),
    );
    link.download = "neovia-analyza.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <>
      <Title
        eyebrow="TRH A VÝKON"
        title="Analýzy"
        subtitle="Vývoj poptávky, zdroje příležitostí a obchodní výkon."
        button="Export reportu"
        note={() => {}}
        onAction={exportReport}
      />
      <div className="analysis">
        <section className="panel">
          <Header
            title="Nejžádanější role"
            action={new Date().toLocaleDateString("cs-CZ", {
              month: "long",
              year: "numeric",
            })}
          />
          {roleCounts.length === 0 ? (
            <div className="empty-state">
              Žádné role k analýze. Spusťte import poptávek ve zdrojích.
            </div>
          ) : (
            roleCounts.map(([role, count]) => (
              <div className="rank" key={role}>
                <span>{role}</span>
                <i>
                  <b style={{ width: `${(count / maxRole) * 100}%` }} />
                </i>
                <strong>{count}</strong>
              </div>
            ))
          )}
        </section>
        <section className="panel">
          <Header title="Výkon zdrojů" action="Aktuální data" />
          {sourceCounts.length === 0 ? (
            <div className="empty-state">
              Zatím tu není žádný zdroj s importovanými poptávkami.
            </div>
          ) : (
            sourceCounts.map(([source, count]) => (
              <div className="source-stat" key={source}>
                <b>{source}</b>
                <span>{count} poptávek</span>
                <strong>
                  {demands.length
                    ? `${Math.round((count / demands.length) * 100)} % podíl`
                    : "0 % podíl"}
                </strong>
              </div>
            ))
          )}
        </section>
        <section className="panel">
          <Header title="Pipeline podle fáze" action="Pipeline" />
          {opportunities.length === 0 ? (
            <div className="empty-state">
              Žádné obchodní případy k analýze. Přidejte první z poptávky nebo v
              pipeline.
            </div>
          ) : (
            Array.from(
              opportunities
                .reduce((map, opportunity) => {
                  map.set(
                    opportunity.stage,
                    (map.get(opportunity.stage) || 0) + 1,
                  );
                  return map;
                }, new Map<string, number>())
                .entries(),
            ).map(([stage, count]) => (
              <div className="source-stat" key={stage}>
                <b>{stage}</b>
                <span>{count} případů</span>
                <strong>
                  {Math.round((count / opportunities.length) * 100)} %
                </strong>
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}
