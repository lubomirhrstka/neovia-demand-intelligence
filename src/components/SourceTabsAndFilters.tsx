"use client";

type Props = {
  sources: string[];
  sourceCounts: Record<string, number>;
  totalCount: number;
  sourceTab: string;
  setSourceTab: (v: string) => void;
  filtersOpen: boolean;
  roles: string[];
  roleFilters: string[];
  setRoleFilters: (v: string[] | ((c: string[]) => string[])) => void;
  contactOptions: string[];
  contactFilters: string[];
  setContactFilters: (v: string[] | ((c: string[]) => string[])) => void;
  detailQualityOptions: string[];
  detailQualityFilters: string[];
  setDetailQualityFilters: (v: string[] | ((c: string[]) => string[])) => void;
  minScore: string;
  setMinScore: (v: string) => void;
  query: string;
  setQuery: (v: string) => void;
  displayedCount: number;
  toggleMultiValue: (
    value: string,
    current: string[],
    setter: (next: string[]) => void,
  ) => void;
};

export function SourceTabsAndFilters({
  sources,
  sourceCounts,
  totalCount,
  sourceTab,
  setSourceTab,
  filtersOpen,
  roles,
  roleFilters,
  setRoleFilters,
  contactOptions,
  contactFilters,
  setContactFilters,
  detailQualityOptions,
  detailQualityFilters,
  setDetailQualityFilters,
  minScore,
  setMinScore,
  query,
  setQuery,
  displayedCount,
  toggleMultiValue,
}: Props) {
  const scopeTotal = sourceTab ? sourceCounts[sourceTab] || 0 : totalCount;
  const hasActiveFilters =
    roleFilters.length > 0 ||
    contactFilters.length > 0 ||
    detailQualityFilters.length > 0 ||
    minScore !== "0" ||
    Boolean(query);

  return (
    <>
      <nav className="source-tabs" aria-label="Zdroje poptávek">
        <button type="button" className={!sourceTab ? "active" : ""} onClick={() => setSourceTab("")}>
          Vše
          <span className="source-tab-count">{totalCount}</span>
        </button>
        {sources.map((src) => (
          <button
            key={src}
            type="button"
            className={sourceTab === src ? "active" : ""}
            onClick={() => setSourceTab(src)}
          >
            {src}
            <span className="source-tab-count">{sourceCounts[src] || 0}</span>
          </button>
        ))}
      </nav>
      {filtersOpen && (
        <div className="filter-panel filter-panel-pro">
          <div className="filter-panel-head">
            <div>
              <strong>Filtry</strong>
              <span>{sourceTab ? `v rámci zdroje ${sourceTab}` : "napříč všemi zdroji"}</span>
            </div>
            <small>
              {displayedCount} z {scopeTotal} poptávek
            </small>
          </div>
          <div className="filter-grid">
            <div className="filter-field filter-field-wide">
              <span className="filter-label">Role</span>
              <div className="filter-chips">
                {roles.slice(0, 80).map((x) => (
                  <button
                    className={roleFilters.includes(x) ? "active" : ""}
                    key={x}
                    type="button"
                    onClick={() =>
                      toggleMultiValue(x, roleFilters, (next) => setRoleFilters(next))
                    }
                  >
                    {x}
                  </button>
                ))}
                {!roles.length && <span className="filter-hint">Žádné role v tomto zdroji</span>}
              </div>
            </div>
            <div className="filter-field">
              <span className="filter-label">Min. skóre</span>
              <select value={minScore} onChange={(e) => setMinScore(e.target.value)}>
                <option value="0">Bez minima</option>
                <option value="50">50 % a více</option>
                <option value="70">70 % a více</option>
                <option value="80">80 % a více</option>
                <option value="90">90 % a více</option>
              </select>
            </div>
            <div className="filter-field">
              <span className="filter-label">Kontakt</span>
              <div className="filter-chips compact">
                {contactOptions.map((x) => (
                  <button
                    className={contactFilters.includes(x) ? "active" : ""}
                    key={x}
                    type="button"
                    onClick={() =>
                      toggleMultiValue(x, contactFilters, (next) => setContactFilters(next))
                    }
                  >
                    {x}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-field">
              <span className="filter-label">Detail inzerátu</span>
              <div className="filter-chips compact">
                {detailQualityOptions.map((x) => (
                  <button
                    className={detailQualityFilters.includes(x) ? "active" : ""}
                    key={x}
                    type="button"
                    onClick={() =>
                      toggleMultiValue(x, detailQualityFilters, (next) =>
                        setDetailQualityFilters(next),
                      )
                    }
                  >
                    {x}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="filter-panel-foot">
            <button
              className="secondary"
              type="button"
              onClick={() => {
                setContactFilters([]);
                setRoleFilters([]);
                setMinScore("0");
                setDetailQualityFilters([]);
                setQuery("");
              }}
            >
              Vyčistit filtry
            </button>
            {hasActiveFilters && (
              <span className="filter-active-hint">Aktivní filtry jsou aplikované na zvolený zdroj</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
