import type { DemandConnector, RawDemand } from "./types";

/** Adapter for exports obtained with the portal's permission. It intentionally never logs into or scrapes a portal. */
export class AuthorizedCsvConnector implements DemandConnector {
  key: string; displayName: string; kind = "authorized_export" as const; termsUrl?: string;
  constructor(key: string, displayName: string, termsUrl?: string) { this.key = key; this.displayName = displayName; this.termsUrl = termsUrl; }
  async validateConfiguration() { return []; }
  async fetchDemands(): Promise<RawDemand[]> { throw new Error("CSV export se předává importnímu endpointu, ne přes vzdálené přihlášení."); }
}
