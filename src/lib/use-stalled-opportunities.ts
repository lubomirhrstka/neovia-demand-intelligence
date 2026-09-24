"use client";

import { useEffect, useState } from "react";

export type StalledOpportunity = {
  id: string;
  title: string;
  company: string | null;
  stage: string;
  nextStep: string | null;
  updatedAt: string | null;
  reason: "bez dalšího kroku" | "po termínu";
};

/**
 * Zjistí obchodní případy, které se neposouvají dál:
 * - aktivní fáze (ne won/lost)
 * - a buď nemají žádný další krok / navázaný otevřený úkol,
 * - nebo mají navázaný úkol po termínu.
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
      .then(([opportunities, tasks]) => {
        const now = new Date();
        const openTasksByOpp = new Map<string, any[]>();
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
          const overdueTask = linkedTasks.some((t) => t.dueAt && new Date(t.dueAt) < now);
          const hasNextStep = Boolean(opp.nextStep) || linkedTasks.length > 0;
          if (overdueTask) {
            result.push({ id: opp.id, title: opp.title, company: opp.company, stage: opp.stage, nextStep: opp.nextStep, updatedAt: opp.updatedAt, reason: "po termínu" });
          } else if (!hasNextStep) {
            result.push({ id: opp.id, title: opp.title, company: opp.company, stage: opp.stage, nextStep: opp.nextStep, updatedAt: opp.updatedAt, reason: "bez dalšího kroku" });
          }
        }
        result.sort((a, b) => (a.reason === "po termínu" ? -1 : 1) - (b.reason === "po termínu" ? -1 : 1));
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
