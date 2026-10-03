"use client";

import { useEffect, useState } from "react";
import { daysInStage, isNextStepOverdue, isStagnating } from "@/lib/pipeline-rules";

export type StalledKind = "overdue" | "stagnating" | "no-next-step";

export type StalledOpportunity = {
  id: string;
  title: string;
  company: string | null;
  stage: string;
  nextStep: string | null;
  updatedAt: string | null;
  kind: StalledKind;
  /** text pro zobrazení, např. "po termínu", "stagnuje 12 dní" */
  reason: string;
};

type TaskLite = { opportunityId?: string | null; status?: string | null; dueAt?: string | null };
type OpportunityLite = {
  id: string;
  title: string;
  company: string | null;
  stage: string;
  nextStep: string | null;
  nextStepDueAt?: string | null;
  stageChangedAt?: string | null;
  updatedAt: string | null;
};

const KIND_ORDER: Record<StalledKind, number> = { overdue: 0, stagnating: 1, "no-next-step": 2 };

/**
 * Zjistí obchodní případy, které se neposouvají dál (jen aktivní fáze, ne won/lost):
 * - po termínu: prošlý termín dalšího kroku nebo navázaný úkol po termínu
 * - stagnuje: případ je ve fázi déle, než povolují pravidla pipeline
 * - bez dalšího kroku: chybí další krok i otevřený navázaný úkol
 */
export function useStalledOpportunities() {
  const [stalled, setStalled] = useState<StalledOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/opportunities").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/tasks").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([opportunities, tasks]: [OpportunityLite[], TaskLite[]]) => {
        const now = Date.now();
        const openTasksByOpp = new Map<string, TaskLite[]>();
        for (const task of tasks) {
          if (!task.opportunityId || task.status === "done" || task.status === "archived") continue;
          const list = openTasksByOpp.get(task.opportunityId) || [];
          list.push(task);
          openTasksByOpp.set(task.opportunityId, list);
        }
        const result: StalledOpportunity[] = [];
        for (const opp of opportunities) {
          if (opp.stage === "won" || opp.stage === "lost") continue;
          const linkedTasks = openTasksByOpp.get(opp.id) || [];
          const overdue =
            isNextStepOverdue(opp.nextStepDueAt, now) ||
            linkedTasks.some((t) => t.dueAt && new Date(t.dueAt).getTime() < now);
          const hasNextStep = Boolean(opp.nextStep) || linkedTasks.length > 0;
          const base = {
            id: opp.id,
            title: opp.title,
            company: opp.company,
            stage: opp.stage,
            nextStep: opp.nextStep,
            updatedAt: opp.updatedAt,
          };
          if (overdue) {
            result.push({ ...base, kind: "overdue", reason: "po termínu" });
          } else if (isStagnating(opp.stage, opp.stageChangedAt, now)) {
            result.push({ ...base, kind: "stagnating", reason: `stagnuje ${daysInStage(opp.stageChangedAt, now)} dní` });
          } else if (!hasNextStep) {
            result.push({ ...base, kind: "no-next-step", reason: "bez dalšího kroku" });
          }
        }
        result.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
        setStalled(result);
      })
      .catch(() => setStalled([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  return { stalled, loading, reload: load };
}
