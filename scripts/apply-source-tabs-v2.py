#!/usr/bin/env python3
from pathlib import Path
import json

page = Path("src/app/page.tsx")
text = page.read_text()

if "SourceTabsAndFilters" not in text:
    old = 'import { SavedViewsBar } from "@/components/SavedViewsBar";'
    new = old + '\nimport { SourceTabsAndFilters } from "@/components/SourceTabsAndFilters";'
    if old not in text:
        raise SystemExit("SavedViewsBar import missing")
    text = text.replace(old, new, 1)
    print("import ok")

old = "[sourceFilters, setSourceFilters] = useState<string[]>([]),"
new = '[sourceTab, setSourceTab] = useState<string>(""),'
if old in text:
    text = text.replace(old, new, 1)
    print("state ok")
elif "sourceTab" in text:
    print("state already")
else:
    raise SystemExit("state missing")

old = "(!sourceFilters.length || sourceFilters.includes(d.source)) &&"
new = "(!sourceTab || d.source === sourceTab) &&"
if old in text:
    text = text.replace(old, new, 1)
    print("logic ok")

old = """  const roles = [
    ...new Set(rows.map((x) => x.role || x.title).filter(Boolean)),
  ].sort();
"""
new = """  const roles = [
    ...new Set(
      rows
        .filter((x) => !sourceTab || x.source === sourceTab)
        .map((x) => x.role || x.title)
        .filter(Boolean),
    ),
  ].sort();
  const sourceCounts = sources.reduce(
    (acc, src) => {
      acc[src] = rows.filter((r) => r.source === src).length;
      return acc;
    },
    {} as Record<string, number>,
  );
"""
if old in text:
    text = text.replace(old, new, 1)
    print("roles ok")
elif "sourceCounts" in text:
    print("roles already")

text = text.replace("setSourceFilters([requestedSource]);", "setSourceTab(requestedSource);")
text = text.replace("setSourceFilters([]);", 'setSourceTab("");')
text = text.replace("setSourceFilters([])", 'setSourceTab("")')

start = text.find('      <SavedViewsBar\n        view="demands"')
if start < 0:
    raise SystemExit("SavedViewsBar demands not found")
end = text.find("      {selectedDemandIds.length > 0 && (", start)
if end < 0:
    raise SystemExit("selectedDemandIds marker missing")

insert = '''      <SourceTabsAndFilters
        sources={sources}
        sourceCounts={sourceCounts}
        totalCount={rows.length}
        sourceTab={sourceTab}
        setSourceTab={setSourceTab}
        filtersOpen={filtersOpen}
        roles={roles}
        roleFilters={roleFilters}
        setRoleFilters={setRoleFilters}
        contactOptions={contactOptions}
        contactFilters={contactFilters}
        setContactFilters={setContactFilters}
        detailQualityOptions={detailQualityOptions}
        detailQualityFilters={detailQualityFilters}
        setDetailQualityFilters={setDetailQualityFilters}
        minScore={minScore}
        setMinScore={setMinScore}
        query={query}
        setQuery={setQuery}
        displayedCount={displayed.length}
        toggleMultiValue={toggleMultiValue}
      />
      <SavedViewsBar
        view="demands"
        note={note}
        currentFilters={{
          query,
          sourceTab,
          contactFilters,
          roleFilters,
          minScore,
          detailQualityFilters,
        }}
        onApply={(f) => {
          if (typeof f.query === "string") setQuery(f.query);
          if (typeof f.sourceTab === "string") setSourceTab(f.sourceTab);
          else if (Array.isArray(f.sourceFilters) && f.sourceFilters.length === 1) setSourceTab(String(f.sourceFilters[0]));
          if (Array.isArray(f.contactFilters)) setContactFilters(f.contactFilters as string[]);
          if (Array.isArray(f.roleFilters)) setRoleFilters(f.roleFilters as string[]);
          if (typeof f.minScore === "string" || typeof f.minScore === "number") setMinScore(String(f.minScore));
          if (Array.isArray(f.detailQualityFilters)) setDetailQualityFilters(f.detailQualityFilters as string[]);
          setFiltersOpen(true);
          note("Pohled aplikován.");
        }}
      />
'''
text = text[:start] + insert + text[end:]
print("ui ok")

page.write_text(text)
assert "setSourceFilters" not in page.read_text()
assert "SourceTabsAndFilters" in page.read_text()
print("page sanity ok")

css_path = Path("src/app/globals.css")
css = css_path.read_text()
if ".source-tabs" not in css:
    css += open("scripts/source-tabs.css").read() if Path("scripts/source-tabs.css").exists() else ""
    if ".source-tabs" not in css:
        raise SystemExit("CSS snippet missing - add scripts/source-tabs.css")
    css_path.write_text(css)
    print("css ok")
else:
    print("css already")

pkg = Path("package.json")
data = json.loads(pkg.read_text())
data["version"] = "1.1.73"
pkg.write_text(json.dumps(data, indent=2) + "\n")
print("version", data["version"])
print("done")
