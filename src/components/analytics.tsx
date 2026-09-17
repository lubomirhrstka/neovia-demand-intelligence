"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, TrendingUp, Users, Target, AlertCircle } from "lucide-react";

type ImportedDemand = {
  id: string;
  title?: string;
  role?: string;
  company?: string;
  source: string;
  relevanceScore?: number;
  importedAt?: string;
};

type DashboardOpportunity = {
  id: string;
  title: string;
  company: string | null;
  stage: string;
  valueCzk: number | null;
  probability: number;
  expectedCloseDate: string | null;
};

type PipelineMetrics = {
  stageDistribution: Record<string, number>;
  revenueByStage: Record<string, number>;
  winRate: number;
  avgDealValue: number;
  averageCycleDays: number;
  atRiskDeals: number;
  closesSoon: number;
};

export function Analytics() {
  const [demands, setDemands] = useState<ImportedDemand[]>([]);
  const [opportunities, setOpportunities] = useState<DashboardOpportunity[]>([]);
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [demandRes, oppRes, analyticsRes] = await Promise.all([
          fetch("/api/demands"),
          fetch("/api/opportunities"),
          fetch("/api/analytics/pipeline"),
        ]);

        const demandData = demandRes.ok ? await demandRes.json() : [];
        const oppData = oppRes.ok ? await oppRes.json() : [];
        const analyticsData = analyticsRes.ok ? await analyticsRes.json() : null;

        setDemands(demandData);
        setOpportunities(oppData);
        setMetrics(analyticsData);
      } catch (error) {
        console.error("Error fetching analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="analysis">
        <section className="panel">
          <div className="empty-state">Načítám data...</div>
        </section>
      </div>
    );
  }

  const stages = [
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
  ];

  const stageCounts: Record<string, number> = {};
  opportunities.forEach((opp) => {
    stageCounts[opp.stage] = (stageCounts[opp.stage] || 0) + 1;
  });

  const maxCount = Math.max(1, ...Object.values(stageCounts));

  const proposalStages = new Set(["proposal", "negotiation", "contract", "won"]);
  const conversion =
    opportunities.length > 0
      ? Math.round(
          (opportunities.filter((x) => proposalStages.has(x.stage)).length /
            opportunities.length) *
            100,
        )
      : 0;

  const monthBuckets = Array.from({ length: 6 }, (_, index) => {
    const today = new Date();
    const date = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1);
    const label = date.toLocaleDateString("cs-CZ", { month: "short" });
    const count = demands.filter((d) => {
      const imported = d.importedAt ? new Date(d.importedAt) : null;
      return (
        imported &&
        imported.getFullYear() === date.getFullYear() &&
        imported.getMonth() === date.getMonth()
      );
    }).length;
    return { label, count };
  });

  const maxMonth = Math.max(1, ...monthBuckets.map((x) => x.count));

  const roleCounts = Array.from(
    demands
      .reduce((map, demand) => {
        const key = demand.role || demand.title || "Role neuvedena";
        map.set(key, (map.get(key) || 0) + 1);
        return map;
      }, new Map<string, number>())
      .entries(),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const maxRole = Math.max(1, ...roleCounts.map((x) => x[1]));

  const sourceCounts = Array.from(
    demands
      .reduce((map, demand) => {
        map.set(demand.source, (map.get(demand.source) || 0) + 1);
        return map;
      }, new Map<string, number>())
      .entries(),
  ).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <div className="title">
        <div>
          <p>TRH A VÝKON</p>
          <h1>Analýzy</h1>
          <small>Vývoj poptávky, zdroje příležitostí a obchodní výkon.</small>
        </div>
      </div>

      <section className="metrics">
        <div className="metric">
          <div className="metric-icon">
            <TrendingUp size={19} />
          </div>
          <div>
            <small>Pipeline hodnota</small>
            <b>
              {opportunities
                .reduce((sum, item) => sum + Number(item.valueCzk || 0), 0)
                .toLocaleString("cs-CZ")}{" "}
              Kč
            </b>
            <span className="positive">
              <ArrowUpRight size={13} /> {opportunities.length} případů
            </span>
          </div>
        </div>

        <div className="metric">
          <div className="metric-icon">
            <Target size={19} />
          </div>
          <div>
            <small>Konverze na nabídku</small>
            <b>{conversion}%</b>
            <span className="positive">
              <ArrowUpRight size={13} />{" "}
              {opportunities.filter((x) => proposalStages.has(x.stage)).length}{" "}
              v nabídce
            </span>
          </div>
        </div>

        <div className="metric">
          <div className="metric-icon">
            <Users size={19} />
          </div>
          <div>
            <small>Nové poptávky</small>
            <b>{demands.length}</b>
            <span className="positive">
              <ArrowUpRight size={13} /> ze zdrojů
            </span>
          </div>
        </div>

        <div className="metric">
          <div className="metric-icon">
            <AlertCircle size={19} />
          </div>
          <div>
            <small>Problémy</small>
            <b>0</b>
            <span className="positive">
              Všechno v pořádku
            </span>
          </div>
        </div>
      </section>

      <div className="analysis">
        <section className="panel wide">
          <div className="panel-header">
            <h2>Pipeline funnel (10 stages)</h2>
            <button>Všechny fáze</button>
          </div>
          {opportunities.length === 0 ? (
            <div className="empty-state">
              Žádné obchodní případy k analýze. Přidejte první z poptávky nebo v pipeline.
            </div>
          ) : (
            <div>
              {stages.map((stage) => {
                const count = stageCounts[stage] || 0;
                const percentage = (count / Math.max(1, maxCount)) * 100;
                return (
                  <div className="rank" key={stage}>
                    <span>{stage}</span>
                    <i>
                      <b style={{ width: `${Math.max(5, percentage)}%` }} />
                    </i>
                    <strong>{count}</strong>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Nejžádanější role</h2>
            <button>Poslední měsíc</button>
          </div>
          {roleCounts.length === 0 ? (
            <div className="empty-state">
              Žádné role k analýze. Spusťte import poptávek.
            </div>
          ) : (
            roleCounts.map(([role, count]) => (
              <div className="rank" key={role}>
                <span>{role}</span>
                <i>
                  <b style={{ width: `${(count / maxRole) * 100}%` }} />
                </i>
                <strong>{count}</strong>
              </div>
            ))
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Výkon zdrojů</h2>
            <button>Aktuální data</button>
          </div>
          {sourceCounts.length === 0 ? (
            <div className="empty-state">
              Žádné poptávky k analýze.
            </div>
          ) : (
            sourceCounts.map(([source, count]) => (
              <div className="source-stat" key={source}>
                <b>{source}</b>
                <span>{count} poptávek</span>
                <strong>
                  {demands.length
                    ? `${Math.round((count / demands.length) * 100)}%`
                    : "0%"}
                </strong>
              </div>
            ))
          )}
        </section>

        <section className="panel wide">
          <div className="panel-header">
            <h2>Vývoj poptávky - 6 měsíců</h2>
            <button>Zobrazit všechno</button>
          </div>
          {demands.length === 0 ? (
            <div className="empty-state">
              Graf se zobrazí po prvním importu poptávek.
            </div>
          ) : (
            <div className="chart">
              <div className="axis">
                <span>{maxMonth}</span>
                <span>{Math.ceil(maxMonth / 2)}</span>
                <span>0</span>
              </div>
              <div className="bars">
                {monthBuckets.map((bucket) => (
                  <div key={bucket.label}>
                    <i
                      style={{
                        height: `${Math.max(6, (bucket.count / maxMonth) * 100)}%`,
                      }}
                    />
                    <small>{bucket.label}</small>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="legend">
            <span><i /> Importované poptávky</span>
            <b>{demands.length} celkem</b>
          </div>
        </section>
      </div>
    </>
  );
}
