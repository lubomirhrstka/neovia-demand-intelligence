/**
 * Pravidla pipeline — sdílená serverem (vynucení) i UI (dotaz na chybějící údaje).
 * Jedna definice = server a formulář se nikdy nerozejdou.
 */

export type PipelineKind = "sales" | "career";
export type StageId =
  | "identified" | "qualified" | "contacted" | "discovery" | "solution"
  | "proposal" | "negotiation" | "contract" | "won" | "lost";

export const ACTIVE_STAGES: StageId[] = [
  "identified", "qualified", "contacted", "discovery", "solution", "proposal", "negotiation", "contract",
];
export const CLOSED_STAGES: StageId[] = ["won", "lost"];

/** Pipeline "Moje kariéra" používá stejné interní fáze, ale vlastní (užší) sadu a popisky. */
export const PIPELINE_STAGES: Record<PipelineKind, { id: StageId; label: string }[]> = {
  sales: [
    { id: "identified", label: "Identifikace" },
    { id: "qualified", label: "Kvalifikace" },
    { id: "contacted", label: "Osloveno" },
    { id: "discovery", label: "Discovery" },
    { id: "solution", label: "Návrh řešení" },
    { id: "proposal", label: "Nabídka odeslána" },
    { id: "negotiation", label: "Vyjednávání" },
    { id: "contract", label: "Smlouva" },
    { id: "won", label: "Vyhráno" },
    { id: "lost", label: "Prohráno" },
  ],
  career: [
    { id: "identified", label: "Zajímavá pozice" },
    { id: "qualified", label: "Připravuji podklady" },
    { id: "contacted", label: "CV odesláno" },
    { id: "discovery", label: "Pohovor" },
    { id: "proposal", label: "Nabídka" },
    { id: "won", label: "Přijato" },
    { id: "lost", label: "Zamítnuto / staženo" },
  ],
};

export const stageLabelFor = (pipeline: PipelineKind, stage: string) =>
  PIPELINE_STAGES[pipeline].find((s) => s.id === stage)?.label ||
  PIPELINE_STAGES.sales.find((s) => s.id === stage)?.label ||
  stage;

/** Po kolika dnech v jedné fázi upozornit na stagnaci. */
export const STAGNATION_DAYS: Partial<Record<StageId, number>> = {
  identified: 14, qualified: 10, contacted: 7, discovery: 10, solution: 10,
  proposal: 7, negotiation: 10, contract: 7,
};

export type OpportunityFields = {
  stage: string;
  valueCzk?: number | null;
  nextStep?: string | null;
  nextStepDueAt?: string | Date | null;
  closeReason?: string | null;
  pipeline?: string | null;
};

export type MissingField = "nextStep" | "nextStepDueAt" | "valueCzk" | "closeReason";

export const MISSING_LABELS: Record<MissingField, string> = {
  nextStep: "další krok",
  nextStepDueAt: "termín dalšího kroku",
  valueCzk: "hodnota obchodu",
  closeReason: "důvod uzavření",
};

/** Co musí být vyplněné, aby případ smět stát v dané fázi. */
export function missingForStage(o: OpportunityFields): MissingField[] {
  const missing: MissingField[] = [];
  const stage = o.stage as StageId;
  const career = o.pipeline === "career";
  if (CLOSED_STAGES.includes(stage)) {
    if (!o.closeReason?.trim()) missing.push("closeReason");
    return missing;
  }
  if (stage !== "identified") {
    if (!o.nextStep?.trim()) missing.push("nextStep");
    if (!o.nextStepDueAt) missing.push("nextStepDueAt");
  }
  // u kariéry se "hodnota" nevyžaduje (mzdová nabídka není povinná)
  if (!career && ["proposal", "negotiation", "contract"].includes(stage) && !o.valueCzk) missing.push("valueCzk");
  return missing;
}

export function daysInStage(stageChangedAt: string | Date | null | undefined, now = Date.now()) {
  if (!stageChangedAt) return 0;
  const t = new Date(stageChangedAt).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now - t) / 86_400_000));
}

export function isStagnating(stage: string, stageChangedAt: string | Date | null | undefined, now = Date.now()) {
  const limit = STAGNATION_DAYS[stage as StageId];
  return Boolean(limit && daysInStage(stageChangedAt, now) >= limit);
}

export function isNextStepOverdue(nextStepDueAt: string | Date | null | undefined, now = Date.now()) {
  if (!nextStepDueAt) return false;
  const t = new Date(nextStepDueAt).getTime();
  return !Number.isNaN(t) && t < now;
}
