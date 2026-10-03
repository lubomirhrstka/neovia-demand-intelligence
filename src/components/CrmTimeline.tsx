import { useState } from "react";
"use client";

import type { ActivityRecord, TaskRecord } from "@/lib/app-types";
import styles from "./CrmCardExtras.module.css";

type Item = {
  id: string;
  kind: "email" | "call" | "meeting" | "task" | "note";
  title: string;
  meta: string;
  at: number;
  overdue?: boolean;
  onOpen?: () => void;
};

const kindLabel: Record<Item["kind"], string> = {
  email: "E-mail",
  call: "Hovor",
  meeting: "Schůzka",
  task: "Úkol",
  note: "Aktivita",
};

function activityKind(type: string): Item["kind"] {
  const t = type.toLowerCase();
  if (t.includes("mail") || t === "email") return "email";
  if (t.includes("call") || t.includes("hovor") || t === "phone") return "call";
  if (t.includes("meet") || t.includes("schůz") || t.includes("schuz")) return "meeting";
  return "note";
}

export function CrmTimeline({
  activities,
  tasks,
  onOpenEmail,
  onOpenTask,
}: {
  activities: ActivityRecord[];
  tasks: TaskRecord[];
  onOpenEmail?: () => void;
  onOpenTask?: () => void;
}) {
  const [now] = useState(() => Date.now());
  const items: Item[] = [
    ...activities.map((a) => ({
      id: `a-${a.id}`,
      kind: activityKind(a.type),
      title: a.subject,
      meta: [a.note?.split("\n")[0]?.slice(0, 90), a.contactFirstName && `${a.contactFirstName} ${a.contactLastName || ""}`.trim()]
        .filter(Boolean)
        .join(" · "),
      at: Date.parse(a.occurredAt) || 0,
      onOpen: activityKind(a.type) === "email" ? onOpenEmail : undefined,
    })),
    ...tasks.map((t) => {
      const due = t.dueAt ? Date.parse(t.dueAt) : 0;
      const meeting = (t.kind || "").toLowerCase().includes("meet") || (t.title || "").toLowerCase().includes("schůz");
      return {
        id: `t-${t.id}`,
        kind: meeting ? ("meeting" as const) : ("task" as const),
        title: t.title,
        meta: [t.status, t.opportunityTitle].filter(Boolean).join(" · "),
        at: due || Date.parse(t.syncedAt || "") || 0,
        overdue: Boolean(due && due < now && t.status !== "done" && t.status !== "completed"),
        onOpen: onOpenTask,
      };
    }),
  ].sort((a, b) => b.at - a.at);

  if (items.length === 0) {
    return (
      <section className={styles.timeline} aria-label="Historie">
        <h3>Historie vztahu</h3>
        <p className={styles.empty}>Zatím tu není e-mail, úkol ani schůzka. První záznam přidáte akcí nahoře.</p>
      </section>
    );
  }

  return (
    <section className={styles.timeline} aria-label="Historie">
      <h3>Historie vztahu</h3>
      <ol>
        {items.slice(0, 20).map((item) => {
          const inner = (
            <>
              <span className={`${styles.kind} ${styles[item.kind]}`}>{kindLabel[item.kind]}</span>
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.at ? new Date(item.at).toLocaleString("cs-CZ", { dateStyle: "medium", timeStyle: "short" }) : "bez data"}
                  {item.meta ? ` · ${item.meta}` : ""}
                  {item.overdue ? " · po termínu" : ""}
                  {item.onOpen ? " ↗" : ""}
                </small>
              </div>
            </>
          );
          return (
            <li key={item.id}>
              {item.onOpen ? (
                <button type="button" className={`${styles.row} ${item.overdue ? styles.overdue : ""}`} onClick={item.onOpen}>
                  {inner}
                </button>
              ) : (
                <div className={`${styles.row} ${item.overdue ? styles.overdue : ""}`}>{inner}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
