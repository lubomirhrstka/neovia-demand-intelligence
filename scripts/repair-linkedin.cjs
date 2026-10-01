// Jednorázová oprava LinkedIn poptávek v produkci: ověření proti veřejné stránce pozice.
// Použití: node scripts/repair-linkedin.cjs [--apply]
const postgres = require("postgres");
const APPLY = process.argv.includes("--apply");
const sql = postgres(process.env.DATABASE_URL);
const OWNER = "mg7a7d8AUX9HCHn4ypQrFya3hl2Lj9tJ";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const once = (v) => v.split("&" + "quot;").join('"').split("&" + "lt;").join("<").split("&" + "gt;").join(">")
  .replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, " ").split("&" + "amp;").join("&");
const decode = (v) => { let o = v; for (let i = 0; i < 3; i++) { const n = once(o); if (n === o) break; o = n; } return o.replace(/\u00a0/g, " ").trim(); };
const cleanRole = (v) => v.replace(/^\s*(job title|název pozice|pozice)\s*(\([a-z]{2}\))?\s*:\s*/i, "").trim();
const WORK_MODE = /\((Hybrid|Hybridní|Remote|Na dálku|Na místě|On-site|Onsite)\)/i;
const mergeMode = (n, o) => { const m = (o || "").match(WORK_MODE)?.[0]; return !m || !n || WORK_MODE.test(n) ? n : `${n} ${m}`; };

function jobId(raw) {
  raw = (raw || "").trim();
  const m = raw.match(/\/jobs\/view\/(\d+)/i) || raw.match(/^linkedin:(\d+)$/i);
  return m ? m[1] : null;
}
function cleanLoc(v) {
  v = (v || "").replace(/\s+/g, " ").trim();
  if (!v) return "";
  v = v.replace(/\b(Probíhá nábor|Actively recruiting|Snadná žádost|Easy Apply|Promoted|Propagováno)\b.*$/i, "")
    .replace(/\d[\d\s,.]*\s*(mil\.|tis\.|K)?\s*(Kč|CZK|EUR|€|\$)[\s\S]*$/i, "")
    .replace(/\s+\d{1,3}\s*(spojení|connections?)\s*$/i, "")
    .replace(/\)\s+\d{1,3}\s*$/, ")")
    .replace(/[–\-·|,;]+\s*$/g, "").trim();
  if (/https?:|trackingid|refid|\/(view|jobs|comm)\//i.test(v)) return "";
  return v.slice(0, 120);
}
const plausible = (v) => {
  v = (v || "").trim();
  if (v.length < 2 || v.length > 160) return false;
  if (/^job title|^firma neuvedena|linkedin$/i.test(v)) return false;
  if (/https?:|trackingid|refid|%2[a-f0-9]|\/(view|jobs|comm)\//i.test(v)) return false;
  return true;
};
const norm = (v) => (v || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  .replace(/\b(s\.?\s?r\.?\s?o\.?|a\.?\s?s\.?|spol\.?|inc\.?|ltd\.?|gmbh)\b/g, "").replace(/[^a-z0-9]+/g, "");

function parseTitle(raw) {
  const t = decode(raw).replace(/\s*\|\s*(Pracovní příležitosti LinkedIn|LinkedIn Jobs|LinkedIn)\s*$/i, "").replace(/\s+/g, " ").trim();
  const mk = (c, r, l) => ({ company: c.trim(), title: cleanRole(r), location: l.trim(), via: "og" });
  let m = t.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+(.+)$/i); if (m) return mk(m[1], m[2], m[3]);
  m = t.match(/^(.+)\s+ve společnosti\s+(.+?)\s+[–—-]\s+(.+)$/i); if (m) return mk(m[2], m[1], m[3]);
  m = t.match(/^(.+)\s+at\s+(.+?)\s+[–—-]\s+(.+)$/i); if (m) return mk(m[2], m[1], m[3]);
  return null;
}
async function get(url) {
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA, "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8" } });
    return { status: r.status, html: r.ok ? await r.text() : "" };
  } catch { return { status: 0, html: "" }; }
}
async function fetchMeta(id) {
  const page = await get(`https://www.linkedin.com/jobs/view/${id}`);
  const og = page.html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || page.html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const parsed = og ? parseTitle(og[1]) : null;
  if (parsed) return parsed;
  await sleep(400);
  const guest = await get(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`);
  const g = (re) => decode((guest.html.match(re) || [])[1] || "");
  const title = cleanRole(g(/topcard__title[^>]*>([^<]+)/i) || g(/top-card-layout__title[^>]*>([^<]+)/i));
  const company = g(/topcard__org-name-link[^>]*>([^<]+)/i) || g(/public_jobs_topcard-org-name[^"]*"[^>]*>([^<]+)/i);
  const location = g(/topcard__flavor--bullet[^>]*>([^<]+)/i);
  if (title && company) return { title, company, location, via: "guest" };
  return { failed: true, status: `${page.status}/${guest.status}` };
}

(async () => {
  const comps = await sql`SELECT id, name FROM companies WHERE owner_id = ${OWNER}`;
  const rows = await sql`SELECT d.id, d.title, d.location, d.source_url, d.external_id, d.demand_text, d.company_id, c.name AS cname
    FROM demands d LEFT JOIN companies c ON c.id = d.company_id
    WHERE d.owner_id = ${OWNER} AND d.deleted_at IS NULL AND (d.source ILIKE '%linkedin%' OR d.external_id LIKE 'linkedin:%')`;
  let fixed = 0; const unavailable = [];
  for (const d of rows) {
    const id = jobId(d.source_url) || jobId(d.external_id);
    let meta = id ? await fetchMeta(id) : null;
    await sleep(700);
    if (!meta || meta.failed) { unavailable.push(`${d.title} [${meta?.status || "bez ID"}]`); meta = null; }
    const vloc = cleanLoc(meta?.location);
    const loc = vloc ? mergeMode(vloc, d.location) : cleanLoc(d.location);
    let companyId = d.company_id, companyName = d.cname;
    if (meta && plausible(meta.company)) {
      companyName = meta.company;
      let match = comps.find((c) => !/neuvedena/i.test(c.name) && norm(c.name) === norm(meta.company));
      if (!match && APPLY) {
        [match] = await sql`INSERT INTO companies (name, source, owner_id) VALUES (${meta.company}, 'LinkedIn', ${OWNER}) RETURNING id, name`;
        comps.push(match);
      }
      companyId = match ? match.id : "(nová)";
    }
    const title = meta?.title || cleanRole(decode(d.title));
    const text = d.demand_text || "";
    const stub = !text || /Firma neuvedena/i.test(text) || (text.length < 260 && text.startsWith(d.title) && text.includes(" — "));
    const demandText = stub ? `${title} — ${companyName || "Firma neuvedena (LinkedIn)"}${loc ? ` · ${loc}` : ""}` : text;
    const changed = title !== d.title || (loc || null) !== (d.location || null) || companyId !== d.company_id;
    if (!changed) continue;
    fixed += 1;
    console.log(`${meta ? `OVĚŘENO(${meta.via})` : "jen čištění"} | ${d.title}\n   firma: ${d.cname} → ${companyName}\n   lokalita: ${d.location} → ${loc || "∅"}${title !== d.title ? `\n   název: → ${title}` : ""}`);
    if (APPLY && companyId !== "(nová)") {
      await sql`UPDATE demands SET title = ${title}, role = ${title}, location = ${loc || null}, company_id = ${companyId}, demand_text = ${demandText} WHERE id = ${d.id}`;
    }
  }
  console.log(`\n${APPLY ? "APLIKOVÁNO" : "NÁHLED"}: změn ${fixed} / ${rows.length}`);
  console.log(`Nedostupné ze zdroje (${unavailable.length}):\n  ` + unavailable.join("\n  "));
  if (APPLY) {
    const orphans = await sql`DELETE FROM companies c WHERE c.owner_id = ${OWNER} AND c.name ILIKE 'Firma neuvedena%' AND NOT EXISTS (SELECT 1 FROM demands d WHERE d.company_id = c.id) RETURNING name`;
    console.log("Odstraněn nepoužitý placeholder:", orphans.length);
  }
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
