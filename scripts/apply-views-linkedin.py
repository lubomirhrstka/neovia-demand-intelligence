#!/usr/bin/env python3
from pathlib import Path
import json

page = Path("src/app/page.tsx")
text = page.read_text()
changed = []

if "SavedViewsBar" not in text:
    old = 'import { BookingSettings } from "@/components/BookingSettings";'
    new = old + '\nimport { SavedViewsBar } from "@/components/SavedViewsBar";'
    if old not in text:
        raise SystemExit("BookingSettings import missing")
    text = text.replace(old, new, 1)
    changed.append("import")

if "enrichingDemandId" not in text:
    old = "[verifyingDemandId, setVerifyingDemandId] = useState<string | null>(null),"
    new = old + "\n    [enrichingDemandId, setEnrichingDemandId] = useState<string | null>(null),"
    if old not in text:
        raise SystemExit("verifyingDemandId state missing")
    text = text.replace(old, new, 1)
    changed.append("state")

if "enrichFromLinkedIn" not in text:
    marker = "  const removeDemand = async () => {"
    fn = """  const enrichFromLinkedIn = async (demand: ImportedDemand) => {
    setEnrichingDemandId(demand.id);
    try {
      const response = await fetch("/api/demands/linkedin-enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demandId: demand.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Doplnění z LinkedIn se nepodařilo.");
      await loadDemands();
      setSelected((current) =>
        current?.id === demand.id
          ? {
              ...current,
              title: data.title || current.title,
              role: data.title || current.role,
              location: data.location || current.location,
              company: data.company || current.company,
            }
          : current,
      );
      note(
        `LinkedIn doplněno: ${data.company || "?"} · ${data.title || "?"}${data.location ? ` · ${data.location}` : ""}`,
      );
    } catch (error) {
      note(error instanceof Error ? error.message : "Doplnění z LinkedIn se nepodařilo.");
    } finally {
      setEnrichingDemandId(null);
    }
  };
  """
    if marker not in text:
        raise SystemExit("removeDemand marker missing")
    text = text.replace(marker, fn + marker, 1)
    changed.append("enrichFn")

if "Doplnit z LinkedIn" not in text:
    old = """                <button
                  type="button"
                  className="secondary"
                  disabled={verifyingDemandId === selected.id || !selected.companyId}
                  onClick={() => verifyDemandCompanyWeb(selected)}
                >
                  {verifyingDemandId === selected.id ? "Ověřuji…" : "Ověřit web a kontakty"}
                </button>
              </div>
            </section>
            <section className="demand-source-panel next-step-panel">"""
    new = """                <button
                  type="button"
                  className="secondary"
                  disabled={verifyingDemandId === selected.id || !selected.companyId}
                  onClick={() => verifyDemandCompanyWeb(selected)}
                >
                  {verifyingDemandId === selected.id ? "Ověřuji…" : "Ověřit web a kontakty"}
                </button>
                {(selected.sourceUrl || selected.externalId || selected.source || "").toString().match(/linkedin/i) && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={enrichingDemandId === selected.id}
                    onClick={() => enrichFromLinkedIn(selected)}
                  >
                    {enrichingDemandId === selected.id ? "Doplňuji…" : "Doplnit z LinkedIn"}
                  </button>
                )}
              </div>
            </section>
            <section className="demand-source-panel next-step-panel">"""
    if old not in text:
        raise SystemExit("verify button block missing")
    text = text.replace(old, new, 1)
    changed.append("linkedinBtn")

if 'view="demands"' not in text:
    old = """        <button
          onClick={exportDisplayedDemands}
        >
          <SlidersHorizontal size={16} />
          Export
        </button>
      </div>
      {filtersOpen && ("""
    new = """        <button
          onClick={exportDisplayedDemands}
        >
          <SlidersHorizontal size={16} />
          Export
        </button>
      </div>
      <SavedViewsBar
        view="demands"
        note={note}
        currentFilters={{
          query,
          sourceFilters,
          contactFilters,
          roleFilters,
          minScore,
          detailQualityFilters,
        }}
        onApply={(f) => {
          if (typeof f.query === "string") setQuery(f.query);
          if (Array.isArray(f.sourceFilters)) setSourceFilters(f.sourceFilters as string[]);
          if (Array.isArray(f.contactFilters)) setContactFilters(f.contactFilters as string[]);
          if (Array.isArray(f.roleFilters)) setRoleFilters(f.roleFilters as string[]);
          if (typeof f.minScore === "string" || typeof f.minScore === "number") setMinScore(String(f.minScore));
          if (Array.isArray(f.detailQualityFilters)) setDetailQualityFilters(f.detailQualityFilters as string[]);
          setFiltersOpen(true);
          note("Pohled aplikován.");
        }}
      />
      {filtersOpen && ("""
    if old not in text:
        raise SystemExit("demands toolbar export block missing")
    text = text.replace(old, new, 1)
    changed.append("demandsViews")

if 'view="contacts"' not in text:
    needle = """            setCrmSearch("");
            setContactFilter("vše");
            setCompanyFilter("vše");
          }}
"""
    m = text.find(needle)
    if m < 0:
        print("WARN: contacts clear filters not found")
    else:
        rest = text[m:]
        close_pos = rest.find("\n      </div>\n")
        if close_pos < 0:
            print("WARN: toolbar close not found")
        else:
            abs_pos = m + close_pos + len("\n      </div>\n")
            insert = """      <SavedViewsBar
        view="contacts"
        note={note}
        currentFilters={{
          crmSearch,
          contactFilter,
          companyFilter,
          crmTab,
        }}
        onApply={(f) => {
          if (typeof f.crmSearch === "string") setCrmSearch(f.crmSearch);
          if (typeof f.contactFilter === "string") setContactFilter(f.contactFilter);
          if (typeof f.companyFilter === "string") setCompanyFilter(f.companyFilter);
          if (f.crmTab === "contacts" || f.crmTab === "companies") setCrmTab(f.crmTab);
          note("Pohled aplikován.");
        }}
      />
"""
            text = text[:abs_pos] + insert + text[abs_pos:]
            changed.append("contactsViews")

page.write_text(text)
print("page changes:", changed)

css_path = Path("src/app/globals.css")
css = css_path.read_text()
if ".saved-views-bar" not in css:
    css += """

/* Uložené pohledy */
.saved-views-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
  background: color-mix(in srgb, var(--card) 92%, var(--bg));
}
.saved-views-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.saved-views-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  opacity: 0.75;
  margin-right: 4px;
}
.saved-views-empty {
  opacity: 0.55;
}
.saved-view-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg);
  overflow: hidden;
}
.saved-view-chip > button:first-child {
  border: 0;
  background: transparent;
  padding: 5px 10px;
  font-size: 13px;
  cursor: pointer;
}
.saved-view-chip > button:first-child:hover {
  background: color-mix(in srgb, var(--primary) 12%, transparent);
}
.saved-view-delete {
  border: 0;
  background: transparent;
  padding: 4px 8px;
  opacity: 0.55;
  cursor: pointer;
  line-height: 1;
}
.saved-view-delete:hover {
  opacity: 1;
  color: #c0392b;
}
.saved-views-save {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.saved-views-save input {
  min-width: 140px;
  max-width: 220px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
}
"""
    css_path.write_text(css)
    print("css added")
else:
    print("css already present")

pkg = Path("package.json")
data = json.loads(pkg.read_text())
data["version"] = "1.1.72"
pkg.write_text(json.dumps(data, indent=2) + "\n")
print("version", data["version"])

t = page.read_text()
assert "SavedViewsBar" in t
assert "enrichFromLinkedIn" in t
assert "Doplnit z LinkedIn" in t
assert 'view="demands"' in t
print("sanity ok")
