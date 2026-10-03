"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { FileBarChart, Plus, Search } from "lucide-react";
import { goTo, localDateKey, downloadCsv } from "@/lib/app-helpers";
import type { ActivityRecord, TaskRecord } from "@/lib/app-types";
import { Title } from "@/components/dashboard-widgets";
import { ExportFieldPicker, type ExportField } from "@/components/ExportFieldPicker";
import {
  ACTIVE_STAGES,
  CLOSED_STAGES,
  MISSING_LABELS,
  PIPELINE_STAGES,
  daysInStage,
  isNextStepOverdue,
  isStagnating,
  missingForStage,
  stageLabelFor,
  type MissingField,
  type PipelineKind,
} from "@/lib/pipeline-rules";

/** ISO čas → hodnota pro <input type="datetime-local"> v místním čase */
const toLocalInput = (value?: string | null) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const ActivityNoteLink = ({ note }: { note?: string | null }) => {
  if (!note) return null;
  const url = note.match(/https?:\/\/\S+/)?.[0] || "";
  if (url) {
    return (
      <a className="activity-note-link" href={url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
        Otevřít archivovaný e-mail
      </a>
    );
  }
  return <p>{note}</p>;
};

export function Pipeline({ note }: { note: (s: string) => void }) {
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
        nextStepDueAt: string | null;
        stageChangedAt: string | null;
        closeReason: string | null;
        pipeline: string | null;
        note: string | null;
        source: string | null;
        updatedAt: string | null;
      }[]
    >([]),
    [open, setOpen] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [selected, setSelected] = useState<any>(null),
    [dragged, setDragged] = useState<string | null>(null),
    [pipelineQuery, setPipelineQuery] = useState(""),
    [pipelineSource, setPipelineSource] = useState("vše"),
    [minProbability, setMinProbability] = useState("0"),
    [nextStepFilter, setNextStepFilter] = useState("vše"),
    [pipelineArchiveFilter, setPipelineArchiveFilter] = useState("aktivní"),
    [pipelineKind, setPipelineKind] = useState("vše"),
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
      nextStepDueAt: toLocalInput(item.nextStepDueAt),
      _origNextStep: item.nextStep || "",
      _origNextStepDueAt: toLocalInput(item.nextStepDueAt),
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
        const hashQuery = window.location.hash.includes("?")
          ? window.location.hash.slice(window.location.hash.indexOf("?") + 1)
          : "";
        const requestedFromUrl = new URLSearchParams(hashQuery).get("opportunity");
        const requested = requestedFromUrl || window.localStorage.getItem("neovia-open-opportunity");
        if (requested) {
          const item = data.find((x: (typeof rows)[number]) => x.id === requested);
          if (item) {
            window.localStorage.removeItem("neovia-open-opportunity");
            if (requestedFromUrl) window.history.replaceState(null, "", "#Pipeline");
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
  type StageGate = {
    id: string;
    stage: string;
    label: string;
    taskTitle: string;
    missing: MissingField[];
    values: { nextStep: string; nextStepDueAt: string; valueCzk: string; closeReason: string };
    extra: Record<string, unknown>;
    after?: () => void;
  };
  const [gate, setGate] = useState<StageGate | null>(null);
  const todayKey = localDateKey(new Date());
  const isClosed = (stage: string) => (CLOSED_STAGES as string[]).includes(stage);
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
      (pipelineKind === "vše" || (item.pipeline || "sales") === pipelineKind) &&
      (pipelineArchiveFilter === "vše" ||
        (pipelineArchiveFilter === "aktivní" && !isClosed(item.stage)) ||
        (pipelineArchiveFilter === "uzavřené" && isClosed(item.stage)) ||
        pipelineArchiveFilter === item.stage) &&
      (pipelineSource === "vše" || (item.source || "Zdroj neuveden") === pipelineSource) &&
      Number(item.probability || 0) >= Number(minProbability || 0) &&
      (nextStepFilter === "vše" ||
        (nextStepFilter === "má další krok" && hasNextStep) ||
        (nextStepFilter === "bez dalšího kroku" && !hasNextStep) ||
        (nextStepFilter === "po termínu" && (hasOverdueTask || isNextStepOverdue(item.nextStepDueAt))))
    );
  });
  const weightedPipelineValue = filteredRows.reduce(
    (sum, item) => sum + Math.round(Number(item.valueCzk || 0) * (Number(item.probability || 0) / 100)),
    0,
  );
  const pipelineExportFields: ExportField[] = [
    { key: "appLink", label: "Odkaz do aplikace" },
    { key: "title", label: "Případ" },
    { key: "company", label: "Firma" },
    { key: "stage", label: "Fáze" },
    { key: "source", label: "Zdroj" },
    { key: "valueCzk", label: "Hodnota Kč" },
    { key: "probability", label: "Pravděpodobnost" },
    { key: "weightedValue", label: "Vážená hodnota" },
    { key: "expectedCloseDate", label: "Očekávané uzavření" },
    { key: "nextStep", label: "Další krok" },
  ];
  const pipelineFieldValue = (item: (typeof filteredRows)[number], key: string): string => {
    switch (key) {
      case "appLink": return `${window.location.origin}/#Pipeline?opportunity=${encodeURIComponent(item.id)}`;
      case "title": return item.title;
      case "company": return item.company || "";
      case "stage": return stageLabel(item.stage);
      case "source": return item.source || "";
      case "valueCzk": return String(item.valueCzk || "");
      case "probability": return `${item.probability || 0}%`;
      case "weightedValue": return String(Math.round(Number(item.valueCzk || 0) * (Number(item.probability || 0) / 100)));
      case "expectedCloseDate": return item.expectedCloseDate ? new Date(item.expectedCloseDate).toLocaleDateString("cs-CZ") : "";
      case "nextStep": return item.nextStep || "";
      default: return "";
    }
  };
  const exportPipeline = (fieldKeys: string[]) => {
    const activeFields = pipelineExportFields.filter((f) => fieldKeys.includes(f.key));
    const rowsForExport = [
      activeFields.map((f) => f.label).join(";"),
      ...filteredRows.map((item) =>
        activeFields
          .map((f) => `"${pipelineFieldValue(item, f.key).replace(/"/g, '""')}"`)
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
  const stageName = (item: { pipeline?: string | null }, stage: string) =>
    stageLabelFor((item.pipeline === "career" ? "career" : "sales") as PipelineKind, stage);
  const patchStage = async (id: string, stage: string, payload: Record<string, unknown>) => {
    const r = await fetch("/api/opportunities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, id, stage }),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  };
  const openGate = (
    item: (typeof rows)[number],
    stage: string,
    missing: MissingField[],
    extra: Record<string, unknown>,
    after?: () => void,
  ) =>
    setGate({
      id: item.id,
      stage,
      label: stageName(item, stage),
      taskTitle: `${item.company || item.title}`,
      missing,
      values: {
        nextStep: item.nextStep || "",
        nextStepDueAt: toLocalInput(item.nextStepDueAt),
        valueCzk: item.valueCzk ? String(item.valueCzk) : "",
        closeReason: item.closeReason || "",
      },
      extra,
      after,
    });
  /** Posun do fáze: když chybí povinné údaje, nejdřív se na ně zeptá. */
  const requestStage = async (
    item: (typeof rows)[number],
    stage: string,
    extra: Record<string, unknown> = {},
    after?: () => void,
  ) => {
    const missing = missingForStage({
      stage,
      pipeline: item.pipeline,
      valueCzk: item.valueCzk,
      nextStep: item.nextStep,
      nextStepDueAt: item.nextStepDueAt,
      closeReason: item.closeReason,
    });
    // u uzavření (vyhráno / LOST) se důvod potvrzuje vždy — slouží i jako potvrzení akce
    if (isClosed(stage) && !missing.includes("closeReason")) missing.push("closeReason");
    if (missing.length) {
      openGate(item, stage, missing, extra, after);
      return;
    }
    setRows((prev) => prev.map((x) => (x.id === item.id ? { ...x, stage, stageChangedAt: new Date().toISOString() } : x)));
    const res = await patchStage(item.id, stage, extra);
    if (res.status === 422 && Array.isArray(res.data.missing)) {
      load();
      openGate(item, stage, res.data.missing, extra, after);
      return;
    }
    if (!res.ok) {
      load();
      note(res.data.error || "Přesun se nepodařilo uložit.");
      return;
    }
    load();
    note(`Případ přesunut do fáze ${stageName(item, stage)}.`);
    after?.();
  };
  const submitGate = async () => {
    if (!gate) return;
    const v = gate.values;
    const empty = gate.missing.filter((m) => !String(v[m] || "").trim());
    if (empty.length) {
      note(`Doplňte: ${empty.map((m) => MISSING_LABELS[m]).join(", ")}.`);
      return;
    }
    const payload: Record<string, unknown> = { ...gate.extra };
    if (gate.missing.includes("nextStep")) payload.nextStep = v.nextStep.trim();
    if (gate.missing.includes("nextStepDueAt")) payload.nextStepDueAt = new Date(v.nextStepDueAt).toISOString();
    if (gate.missing.includes("valueCzk")) payload.valueCzk = v.valueCzk;
    if (gate.missing.includes("closeReason")) payload.closeReason = v.closeReason.trim();
    const res = await patchStage(gate.id, gate.stage, payload);
    if (!res.ok) {
      note(res.data.error || "Přesun se nepodařilo uložit.");
      return;
    }
    // nový termín dalšího kroku → úkol, stejně jako v detailu případu
    if (gate.missing.includes("nextStepDueAt")) {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${v.nextStep.trim()}: ${gate.taskTitle}`,
          dueAt: new Date(v.nextStepDueAt).toISOString(),
          priority: 2,
          opportunityId: gate.id,
        }),
      }).catch(() => null);
    }
    const done = gate;
    setGate(null);
    load();
    note(`Případ přesunut do fáze ${done.label}.`);
    done.after?.();
  };
  const move = async (stage: string) => {
    if (!dragged) return;
    const original = rows.find((x) => x.id === dragged);
    setDragged(null);
    if (!original || original.stage === stage) return;
    await requestStage(original, stage);
  };
  const markSelectedWon = async () => {
    if (!selected) return;
    const item = rows.find((x) => x.id === selected.id);
    if (!item) return;
    await requestStage(
      item,
      "won",
      { probability: 100, nextStep: selected.nextStep || "Uzavřeno jako vyhráno", note: selected.note, source: selected.source },
      () => {
        setSelected(null);
        setPipelineArchiveFilter("won");
      },
    );
  };
  const markSelectedLost = async () => {
    if (!selected) return;
    const item = rows.find((x) => x.id === selected.id);
    if (!item) return;
    await requestStage(
      item,
      "lost",
      {
        probability: 0,
        nextStep: selected.nextStep || "Uzavřeno jako LOST",
        note: selected.note,
        source: selected.source,
      },
      () => {
        setSelected(null);
        setPipelineArchiveFilter("lost");
      },
    );
  };
  const saveDetail = async () => {
    const payload = {
      ...selected,
      nextStepDueAt: selected.nextStepDueAt ? new Date(selected.nextStepDueAt).toISOString() : null,
    };
    delete payload._origNextStep;
    delete payload._origNextStepDueAt;
    const nextStepChanged =
      (selected.nextStep || "") !== selected._origNextStep ||
      (selected.nextStepDueAt || "") !== selected._origNextStepDueAt;
    const r = await fetch("/api/opportunities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      note(err.error || "Detail se nepodařilo uložit.");
      return;
    }
    if (selected.nextStep && selected.nextStepDueAt && nextStepChanged) {
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
      selected.nextStep && selected.nextStepDueAt && nextStepChanged
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
  const boardKind: PipelineKind = pipelineKind === "career" ? "career" : "sales";
  const baseStages: string[] =
    boardKind === "career"
      ? PIPELINE_STAGES.career.map((x) => x.id).filter((id) => !isClosed(id))
      : ["identified", "qualified", "proposal", "negotiation"];
  // fáze mimo základní sadu se ukážou, jakmile v nich leží případ — nic se neschová
  const boardStages = (ACTIVE_STAGES as string[]).filter(
    (id) => baseStages.includes(id) || filteredRows.some((x) => x.stage === id),
  );
  const cols: [string, string][] = boardStages.map((id) => [stageLabelFor(boardKind, id), id]);
  const archiveRows = filteredRows.filter((item) => isClosed(item.stage));
  const archiveTitle =
    pipelineArchiveFilter === "won" ? "Archiv vyhraných" : pipelineArchiveFilter === "lost" ? "Archiv LOST" : "Uzavřené případy";
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
          <option value="won">Archiv vyhraných</option>
          <option value="lost">Archiv LOST</option>
          <option value="uzavřené">Všechny uzavřené</option>
          <option value="vše">Aktivní i uzavřené</option>
        </select>
        <select value={pipelineKind} onChange={(e) => setPipelineKind(e.target.value)}>
          <option value="vše">Obchod i kariéra</option>
          <option value="sales">Jen obchod</option>
          <option value="career">Jen moje kariéra</option>
        </select>
        <button onClick={() => setExportOpen(true)}>
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
              filteredRows.filter(
                (item) =>
                  !isClosed(item.stage) &&
                  (isNextStepOverdue(item.nextStepDueAt) ||
                    openOpportunityTasks.some((task) => task.opportunityId === item.id && task.dueAt && localDateKey(new Date(task.dueAt)) < todayKey)),
              ).length
            }
          </b>
          <small>případů po termínu</small>
        </article>
        <article className="warn">
          <b>
            {rows.filter((item) => item.stage === "won").length} / {rows.filter((item) => item.stage === "lost").length}
          </b>
          <small>vyhráno / LOST</small>
        </article>
      </div>
      {pipelineArchiveFilter !== "aktivní" && (
        <section className="panel lost-archive">
          <header>
            <div>
              <b>{archiveTitle}</b>
              <small>Uzavřené obchodní případy zůstávají v reportech a exportech.</small>
            </div>
            <span>{archiveRows.length}</span>
          </header>
          {archiveRows.length === 0 ? (
            <div className="empty-state">V tomto filtru není žádný uzavřený případ.</div>
          ) : (
            archiveRows.map((item) => (
              <button className="archive-row" type="button" key={item.id} onClick={() => openDetail(item)}>
                <span>
                  <b>{item.company || "Firma"}</b>
                  <small>{item.title}</small>
                </span>
                <span>
                  {stageName(item, item.stage)}
                  {item.closeReason ? ` · ${item.closeReason}` : ""}
                </span>
                <span>
                  {item.stageChangedAt || item.updatedAt
                    ? new Date((item.stageChangedAt || item.updatedAt) as string).toLocaleDateString("cs-CZ")
                    : "bez data"}
                </span>
              </button>
            ))
          )}
        </section>
      )}
      <div className="pipeline" style={{ "--pipeline-cols": cols.length } as CSSProperties}>
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
                  {x.pipeline === "career" && <span className="source-tag">Moje kariéra</span>}
                  {isStagnating(x.stage, x.stageChangedAt) && (
                    <span className="pipeline-warning">stagnuje {daysInStage(x.stageChangedAt)} dní</span>
                  )}
                  {!x.nextStep && !openOpportunityTasks.some((task) => task.opportunityId === x.id) && (
                    <span className="pipeline-warning">bez dalšího kroku</span>
                  )}
                  {(isNextStepOverdue(x.nextStepDueAt) ||
                    openOpportunityTasks.some((task) => task.opportunityId === x.id && task.dueAt && localDateKey(new Date(task.dueAt)) < todayKey)) && (
                    <span className="pipeline-warning">po termínu</span>
                  )}
                  <footer>
                    <b>
                      {x.valueCzk
                        ? `${x.valueCzk.toLocaleString("cs-CZ")} Kč`
                        : `${x.probability} %`}
                    </b>
                    <small title="Dní v aktuální fázi">{daysInStage(x.stageChangedAt)} d ve fázi</small>
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
                {(selected.stage === "won" || selected.stage === "lost") && (
                  <label>
                    Důvod uzavření
                    <input
                      value={selected.closeReason || ""}
                      onChange={(e) => setSelected({ ...selected, closeReason: e.target.value })}
                    />
                  </label>
                )}
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
                    <ActivityNoteLink note={activity.note} />
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
              {!isClosed(selected.stage) && (
                <button type="button" className="secondary" onClick={markSelectedWon}>
                  Označit jako vyhráno
                </button>
              )}
              {!isClosed(selected.stage) && (
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
      {gate && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              submitGate();
            }}
          >
            <header>
              <div>
                <p>
                  {gate.stage === "lost"
                    ? "UZAVŘÍT JAKO LOST"
                    : gate.stage === "won"
                      ? "UZAVŘÍT JAKO VYHRÁNO"
                      : `PŘESUN DO FÁZE ${gate.label.toUpperCase()}`}
                </p>
                <h2>
                  {gate.stage === "lost"
                    ? "Proč případ končí?"
                    : gate.stage === "won"
                      ? "Co rozhodlo o výhře?"
                      : "Doplňte údaje pro tuto fázi"}
                </h2>
              </div>
              <button type="button" onClick={() => setGate(null)}>
                ×
              </button>
            </header>
            <div className="form-grid">
              {gate.missing.includes("nextStep") && (
                <label>
                  Další krok
                  <select
                    value={gate.values.nextStep}
                    onChange={(e) => setGate({ ...gate, values: { ...gate.values, nextStep: e.target.value } })}
                  >
                    <option value="">Vyberte další krok</option>
                    {[...new Set([gate.values.nextStep, ...nextStepOptions].filter(Boolean))].map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {gate.missing.includes("nextStepDueAt") && (
                <label>
                  Termín dalšího kroku
                  <input
                    type="datetime-local"
                    value={gate.values.nextStepDueAt}
                    onChange={(e) => setGate({ ...gate, values: { ...gate.values, nextStepDueAt: e.target.value } })}
                  />
                </label>
              )}
              {gate.missing.includes("valueCzk") && (
                <label>
                  Hodnota obchodu Kč
                  <input
                    type="number"
                    value={gate.values.valueCzk}
                    onChange={(e) => setGate({ ...gate, values: { ...gate.values, valueCzk: e.target.value } })}
                  />
                </label>
              )}
              {gate.missing.includes("closeReason") && (
                <label>
                  Důvod uzavření
                  <input
                    autoFocus
                    value={gate.values.closeReason}
                    placeholder={
                      gate.stage === "lost"
                        ? "např. vybrali jiného dodavatele, nemají rozpočet"
                        : gate.stage === "won"
                          ? "např. reference z bankovnictví, rychlé nasazení týmu"
                          : ""
                    }
                    onChange={(e) => setGate({ ...gate, values: { ...gate.values, closeReason: e.target.value } })}
                  />
                </label>
              )}
            </div>
            <footer>
              <button type="button" className="secondary" onClick={() => setGate(null)}>
                Zrušit
              </button>
              <button className={gate.stage === "lost" ? "danger-secondary" : "primary"}>
                {gate.stage === "lost" ? "Uzavřít jako LOST" : gate.stage === "won" ? "Uzavřít jako vyhráno" : "Uložit a přesunout"}
              </button>
            </footer>
          </form>
        </div>
      )}
      {exportOpen && (
        <ExportFieldPicker
          title="Export Pipeline"
          fields={pipelineExportFields}
          storageKey="neovia-export-fields-pipeline"
          count={filteredRows.length}
          onClose={() => setExportOpen(false)}
          onExport={(fieldKeys) => {
            exportPipeline(fieldKeys);
            setExportOpen(false);
          }}
        />
      )}
    </>
  );
}
