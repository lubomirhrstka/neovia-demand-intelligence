import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", [
  "admin",
  "sales_lead",
  "sales",
  "recruiter",
  "viewer",
]);
export const opportunityStage = pgEnum("opportunity_stage", [
  "identified",
  "qualified",
  "contacted",
  "discovery",
  "solution",
  "proposal",
  "negotiation",
  "contract",
  "won",
  "lost",
]);
export const taskStatus = pgEnum("task_status", [
  "open",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
]);
export const connectorStatus = pgEnum("connector_status", [
  "draft",
  "configured",
  "active",
  "paused",
  "error",
]);
export const importStatus = pgEnum("import_status", [
  "queued",
  "running",
  "completed",
  "completed_with_warnings",
  "failed",
]);

// Better Auth tables
export const users = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("sales"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const sessions = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});
export const accounts = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const verifications = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  ico: varchar("ico", { length: 16 }),
  website: text("website"),
  sector: varchar("sector", { length: 100 }),
  source: varchar("source", { length: 100 }),
  priority: varchar("priority", { length: 40 }),
  size: varchar("size", { length: 80 }),
  relationshipStatus: varchar("relationship_status", { length: 80 }),
  ownerName: varchar("owner_name", { length: 160 }),
  decisionMaker: varchar("decision_maker", { length: 180 }),
  nextStep: text("next_step"),
  nextStepDueAt: timestamp("next_step_due_at"),
  note: text("note"),
  doNotContact: boolean("do_not_contact").notNull().default(false),
  ownerId: text("owner_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const contacts = pgTable("contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  firstName: varchar("first_name", { length: 120 }).notNull(),
  lastName: varchar("last_name", { length: 120 }).notNull(),
  role: varchar("role", { length: 180 }),
  email: varchar("email", { length: 255 }),
  secondaryEmail: varchar("secondary_email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  secondaryPhone: varchar("secondary_phone", { length: 50 }),
  linkedinUrl: text("linkedin_url"),
  source: varchar("source", { length: 100 }),
  verified: boolean("verified").notNull().default(false),
  companyId: uuid("company_id").references(() => companies.id),
  ownerId: text("owner_id").references(() => users.id),
  mergedIntoId: uuid("merged_into_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const demands = pgTable("demands", {
  id: uuid("id").defaultRandom().primaryKey(),
  externalId: varchar("external_id", { length: 160 }),
  title: text("title").notNull(),
  source: varchar("source", { length: 100 }).notNull(),
  sourceUrl: text("source_url"),
  role: varchar("role", { length: 180 }),
  technologies: jsonb("technologies").$type<string[]>().default([]),
  location: varchar("location", { length: 180 }),
  workMode: varchar("work_mode", { length: 80 }),
  demandText: text("demand_text"),
  relevanceScore: integer("relevance_score"),
  companyId: uuid("company_id").references(() => companies.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  ownerId: text("owner_id").references(() => users.id),
  importedAt: timestamp("imported_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedById: text("deleted_by_id").references(() => users.id),
  deleteReason: text("delete_reason"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const opportunities = pgTable("opportunities", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  stage: opportunityStage("stage").notNull().default("identified"),
  valueCzk: integer("value_czk"),
  probability: integer("probability").notNull().default(0),
  expectedCloseDate: timestamp("expected_close_date"),
  nextStep: text("next_step"),
  note: text("note"),
  source: varchar("source", { length: 100 }),
  companyId: uuid("company_id").references(() => companies.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  demandId: uuid("demand_id").references(() => demands.id),
  ownerId: text("owner_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const capacities = pgTable("capacities", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  role: varchar("role", { length: 180 }).notNull(),
  skills: jsonb("skills").$type<string[]>().default([]),
  location: varchar("location", { length: 180 }),
  availability: varchar("availability", { length: 120 }),
  ownerId: text("owner_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  kind: varchar("kind", { length: 40 }).notNull().default("task"),
  status: taskStatus("status").notNull().default("open"),
  priority: integer("priority").notNull().default(2),
  tag: varchar("tag", { length: 120 }),
  dueAt: timestamp("due_at"),
  externalProvider: varchar("external_provider", { length: 80 }),
  externalId: text("external_id"),
  syncedAt: timestamp("synced_at"),
  assigneeId: text("assignee_id").references(() => users.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  companyId: uuid("company_id").references(() => companies.id),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const activities = pgTable("activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: varchar("type", { length: 40 }).notNull(),
  subject: text("subject").notNull(),
  note: text("note"),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  contactId: uuid("contact_id").references(() => contacts.id),
  companyId: uuid("company_id").references(() => companies.id),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id),
  authorId: text("author_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const emailAccounts = pgTable("email_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: varchar("provider", { length: 40 }).notNull().default("gmail"),
  email: varchar("email", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 180 }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  scope: text("scope"),
  tokenType: varchar("token_type", { length: 40 }),
  expiresAt: timestamp("expires_at"),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
  lastSyncAt: timestamp("last_sync_at"),
  ownerId: text("owner_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  entityId: text("entity_id").notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  actorId: text("actor_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const contactDuplicates = pgTable("contact_duplicates", {
  id: uuid("id").defaultRandom().primaryKey(),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  reason: text("reason").notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolvedById: text("resolved_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const connectorSources = pgTable("connector_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  kind: varchar("kind", { length: 40 }).notNull(),
  status: connectorStatus("status").notNull().default("draft"),
  termsUrl: text("terms_url"),
  credentialReference: varchar("credential_reference", { length: 160 }),
  refreshMinutes: integer("refresh_minutes"),
  lastSuccessAt: timestamp("last_success_at"),
  createdById: text("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const importRuns = pgTable("import_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => connectorSources.id),
  status: importStatus("status").notNull().default("queued"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  receivedCount: integer("received_count").notNull().default(0),
  createdCount: integer("created_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  errorSummary: text("error_summary"),
  triggeredById: text("triggered_by_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const monitorSettings = pgTable("monitor_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  locations: jsonb("locations").$type<string[]>().notNull().default([]),
  excludedKeywords: jsonb("excluded_keywords")
    .$type<string[]>()
    .notNull()
    .default([]),
  minimumSalary: integer("minimum_salary").notNull().default(80000),
  schedules: jsonb("schedules")
    .$type<{ name: string; cron: string; enabled: boolean }[]>()
    .notNull()
    .default([]),
  exports: jsonb("exports")
    .$type<string[]>()
    .notNull()
    .default(["CSV", "JSON"]),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
