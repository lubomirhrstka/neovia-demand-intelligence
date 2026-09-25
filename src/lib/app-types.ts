export type View =
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

export const views: View[] = [
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

export type Demand = {
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

export type Contact = {
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

export type CompanyRecord = {
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
export type ActivityRecord = {
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

export type TaskRecord = {
  id: string;
  title: string;
  kind?: string | null;
  priority: number;
  tag?: string | null;
  note?: string | null;
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

export type CalendarStatus = {
  configured: boolean;
  connected: boolean;
  account: string;
  oauthUrl: string | null;
  redirectUri: string;
  missing: string[];
  mode: string;
  lastSyncAt: string | null;
};

export type CalendarEventRecord = {
  id: string;
  title: string;
  description?: string;
  start: string | null;
  end: string | null;
  link: string;
};

export type DashboardOpportunity = {
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

export type ContactRecord = {
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

export type ImportRunRecord = {
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
