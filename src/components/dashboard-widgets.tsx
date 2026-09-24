"use client";

import type { ReactNode } from "react";
import { ArrowUpRight, ChevronDown, MoreHorizontal, Plus } from "lucide-react";
import { goTo, downloadCsv } from "@/lib/app-helpers";
import type { Demand } from "@/lib/app-types";

export function Title({
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
  tools?: ReactNode;
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
export function Metric({
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
  icon: ReactNode;
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

export function Header({ title, action }: { title: string; action: string }) {
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

export function Row({ d, note }: { d: Demand; note: (s: string) => void }) {
  const openDemand = () => {
    window.localStorage.setItem("neovia-open-demand", d.id);
    goTo("Poptávky");
  };
  return (
    <div
      className="demand-row clickable-card"
      onClick={openDemand}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDemand();
        }
      }}
      role="button"
      tabIndex={0}
    >
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
