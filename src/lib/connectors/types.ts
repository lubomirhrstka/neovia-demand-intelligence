export type RawDemand = {
  externalId: string;
  title: string;
  company?: string;
  role?: string;
  location?: string;
  workMode?: string;
  description?: string;
  sourceUrl?: string;
  publishedAt?: Date;
  contact?: { name?: string; email?: string; phone?: string };
  technologies?: string[];
};

export type ImportResult = { received: number; created: number; updated: number; skipped: number; warnings: string[] };

export interface DemandConnector {
  key: string;
  displayName: string;
  kind: "official_api" | "partner_feed" | "authorized_export";
  termsUrl?: string;
  validateConfiguration(): Promise<string[]>;
  fetchDemands(since?: Date): Promise<RawDemand[]>;
}
