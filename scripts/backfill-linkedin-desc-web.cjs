// Doplnění plného znění inzerátu (LinkedIn guest API) a webu firmy z textu inzerátu.
// Použití: node scripts/backfill-linkedin-desc-web.cjs [--apply]
const postgres = require("postgres");
const APPLY = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL);
const OWNER = "mg7a7d8AUX9HCHn4ypQrFya3hl2Lj9tJ";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (v) => v.split("&" + "quot;").join('"').split("&" + "lt;").join("<").split("&" + "gt;").join(">")
  .replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, " ").split("&" + "amp;").join("&");
const decode = (v) => { let o = v; for (let i = 0; i < 3; i++) { const n = once(o); if (n === o) break; o = n; } return o.replace(/\u00a0/g, " ").trim(); };
const IGNORED = /(^|\.)(linkedin\.com|google\.[a-z.]+|gmail\.com|facebook\.com|instagram\.com|youtube\.com|twitter\.com|x\.com|tiktok\.com|jobs\.cz|prace\.cz|startupjobs\.cz|indeed\.com|mpsv\.cz|seznam\.cz|email\.cz|microsoft\.com|apple\.com|lever\.co|greenhouse\.io|myworkdayjobs\.com|workday\.com|smartrecruiters\.com|recruitee\.com|bamboohr\.com|teamio\.com|jobs\.personio\.de|personio\.de|join\.com|workable\.com|breezy\.hr|lmc\.cz|almacareer\.com)$/i;

const jobId = (raw) => { const m = (raw || "").match(/\/jobs\/view\/(\d+)/i) || (raw || "").match(/^linkedin:(\d+)$/i); return m ? m[1] : null; };

async function description(id) {
  try {
    const r = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`, { headers: { "User-Agent": UA, "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8" } });
    if (!r.ok) return { status: r.status };
    const m = (await r.text()).match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/i);
    if (!m) return { status: "no-markup" };
    const text = decode(m[1].replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|ul|ol|h\d)>/gi, "\n").replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n")).split("\n").map((l) => l.trim()).join("\n").trim().slice(0, 12000);
    return { text };
  } catch { return { status: "err" }; }
}

function domainsFromText(text, companyName) {
  const tokens = companyName.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !["service", "services", "group", "czech", "republic", "solutions"].includes(t));
  const found = new Map();
  const re = /(?:^|[\s(,;:"'„“])((?:www\.)?[a-z0-9][a-z0-9-]{1,62}(?:\.[a-z0-9-]{2,63})*\.(?:cz|sk|com|eu|io|net|org|de|ai|tech|cloud|app|dev|agency))(?=$|[\s),;:"'“.!?/])/gi;
  let m;
  while ((m = re.exec(text))) {
    const host = m[1].toLowerCase().replace(/^www\./, "");
    if (IGNORED.test(host)) continue;
    const before = text.slice(Math.max(0, m.index - 40), m.index).toLowerCase();
    let s = (found.get(host) || 0) + 1;
    if (/(jsme|we are|o nás|about us|náš web|our website|web:|www)\s*$/.test(before.trim()) || /jsme|we are/.test(before)) s += 10;
    if (tokens.some((t) => host.includes(t))) s += 8;
    found.set(host, s);
  }
  return [...found.entries()].filter(([, s]) => s >= 8).sort((a, b) => b[1] - a[1]).slice(0, 2);
}

async function liveHtml(url) {
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000);
    const r = await fetch(url, { signal: c.signal, redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html" } });
    clearTimeout(t);
    return r.ok && (r.headers.get("content-type") || "").includes("text/html") ? new URL(r.url).origin : null;
  } catch { return null; }
}

(async () => {
  const rows = await sql`SELECT d.id, d.title, d.source_url, d.external_id, d.demand_text, c.id AS cid, c.name AS cname, c.website
    FROM demands d LEFT JOIN companies c ON c.id = d.company_id
    WHERE d.owner_id = ${OWNER} AND d.deleted_at IS NULL AND d.source ILIKE '%linkedin%' ORDER BY c.name`;
  let textCount = 0, webCount = 0;
  const webDone = new Set();
  for (const d of rows) {
    const id = jobId(d.source_url) || jobId(d.external_id);
    if (!id) continue;
    const res = await description(id);
    await sleep(700);
    const desc = res.text || "";
    const cur = d.demand_text || "";
    const takeDesc = desc.length > 80 && desc.length > cur.length;
    const textForWeb = takeDesc ? desc : cur;
    let web = null, webCand = [];
    if (d.cid && !d.website && !webDone.has(d.cid)) {
      webCand = domainsFromText(textForWeb, d.cname || "");
      for (const [host] of webCand) { web = await liveHtml(`https://${host}`); if (web) break; }
    }
    console.log(`${d.cname} | ${d.title.slice(0, 50)}\n   znění: ${takeDesc ? `${cur.length} → ${desc.length} znaků` : `beze změny (${res.status || cur.length})`}${webCand.length ? `\n   web kandidáti: ${webCand.map(([h, s]) => `${h}(${s})`).join(", ")} → ${web || "nedostupné"}` : ""}`);
    if (takeDesc) { textCount += 1; if (APPLY) await sql`UPDATE demands SET demand_text = ${desc} WHERE id = ${d.id}`; }
    if (web) { webCount += 1; webDone.add(d.cid); if (APPLY) await sql`UPDATE companies SET website = ${web}, updated_at = now() WHERE id = ${d.cid} AND website IS NULL`; }
  }
  console.log(`\n${APPLY ? "APLIKOVÁNO" : "NÁHLED"}: plné znění ${textCount}, web firmy ${webCount}`);
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
