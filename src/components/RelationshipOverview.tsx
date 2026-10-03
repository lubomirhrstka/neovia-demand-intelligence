import { useState } from "react";
import type { ActivityRecord, CompanyRecord, DashboardOpportunity } from "@/lib/app-types";
import styles from "./RelationshipOverview.module.css";

const dateLabel = (value: string | null | undefined) => {
  if (!value) return "Termín není nastaven";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Neplatný termín" : date.toLocaleString("cs-CZ", { dateStyle: "medium", timeStyle: "short" });
};

export function RelationshipOverview({ company, activities, opportunities, onCompany, onOpportunity }: {
  company?: CompanyRecord;
  activities: ActivityRecord[];
  opportunities: DashboardOpportunity[];
  onCompany?: () => void;
  onOpportunity: (id: string) => void;
}) {
  const [now] = useState(() => Date.now());
  const last = [...activities].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
  const active = opportunities.filter((item) => !["won", "lost"].includes(item.stage));
  const overdue = Boolean(company?.nextStep && company.nextStepDueAt && Date.parse(company.nextStepDueAt) < now);
  return (
    <section className={styles.overview} aria-label="Přehled vztahu">
      <div className={styles.heading}>
        <h3>Přehled vztahu</h3>
        {onCompany && company && <button type="button" onClick={onCompany}>Otevřít firmu ↗</button>}
      </div>
      <div className={styles.grid}>
        <article>
          <small>Poslední zaznamenaná aktivita</small>
          <strong>{last?.subject || "Zatím bez aktivity"}</strong>
          {last && <span>{dateLabel(last.occurredAt)} · {last.type}</span>}
        </article>
        <article>
          <small>Další krok firmy{overdue ? " · po termínu" : ""}</small>
          <strong>{company?.nextStep || "Další krok není nastaven"}</strong>
          <span>{dateLabel(company?.nextStepDueAt)}</span>
          {company?.ownerName && <span>Odpovídá: {company.ownerName}</span>}
          {company?.doNotContact && <strong>Neoslovovat</strong>}
        </article>
      </div>
      <details className={styles.opportunities} open>
        <summary>Otevřené příležitosti firmy ({active.length})</summary>
        {active.length === 0 ? <p>Žádná otevřená příležitost.</p> : active.map((item) => (
          <button type="button" key={item.id} onClick={() => onOpportunity(item.id)}>
            <span>{item.title}</span>
            <small>{item.valueCzk == null ? "Hodnota neuvedena" : new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(item.valueCzk)} ↗</small>
          </button>
        ))}
      </details>
    </section>
  );
}
