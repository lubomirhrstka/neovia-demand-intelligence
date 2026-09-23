import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { normalizeCompanyName } from "@/lib/matching";
import {
  auditLog,
  companies,
  connectorSources,
  contactDuplicates,
  contacts,
  demands,
  importRuns,
  monitorSettings,
} from "@/lib/schema";
import { and, desc, eq, or } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const normalize = (value: unknown) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");
const emailFrom = (value: string) =>
  value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
const phoneFrom = (value: string) =>
  value.match(/(?:\+420\s*)?(?:\d[\s-]?){9,}/)?.[0]?.trim() || "";
const companyKey = (value: string) =>
  normalize(value)
    .toLowerCase()
    .replace(/\b(s\.?r\.?o\.?|a\.?s\.?|spol\.?|inc\.?|ltd\.?)\b/g, "")
    .replace(/[^a-z0-9á-ž]/gi, "");
const domainFrom = (value: string) => {
  const text = normalize(value).toLowerCase();
  const url = text.match(/https?:\/\/([^/\s]+)/)?.[1] || text.match(/(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/)?.[1] || "";
  return url.replace(/^www\./, "");
};

function splitLine(line: string) {
  const separator = line.includes(";") ? ";" : line.includes("\t") ? "\t" : ",";
  return line.split(separator).map((x) => normalize(x.replace(/^"|"$/g, "")));
}

function keyFor(value: string) {
  const map: Record<string, string> = {
    firma: "company",
    company: "company",
    spolecnost: "company",
    společnost: "company",
    kontakt: "contact",
    jmeno: "contact",
    jméno: "contact",
    name: "contact",
    email: "email",
    "e-mail": "email",
    telefon: "phone",
    phone: "phone",
    role: "role",
    pozice: "role",
    poptavka: "demand",
    poptávka: "demand",
    demand: "demand",
    inzerat: "demand",
    inzerát: "demand",
    text: "text",
    detail: "text",
    zdroj: "source",
    source: "source",
    url: "sourceUrl",
    odkaz: "sourceUrl",
  };
  return map[value.toLowerCase().replace(/\s+/g, "")] || value;
}

function parseRows(input: string, mapping?: Record<string, string>) {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const first = splitLine(lines[0]);
  const hasHeader = first.some((cell) =>
    ["firma", "company", "kontakt", "email", "telefon", "role", "poptávka"].includes(
      cell.toLowerCase(),
    ),
  );
  const headers = hasHeader ? first.map(keyFor) : [];
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines.map((line) => {
    const cells = splitLine(line);
    if (mapping && Object.values(mapping).some(Boolean)) {
      const row: Record<string, string> = {};
      cells.forEach((cell, index) => {
        const key = mapping[String(index)] || "";
        if (key) row[key] = cell;
      });
      row.text ||= line;
      row.source ||= "Ruční import";
      row.demand ||= row.role || row.text || "Importovaná poptávka";
      return row;
    }
    if (hasHeader) {
      return Object.fromEntries(headers.map((key, index) => [key, cells[index] || ""]));
    }
    const email = emailFrom(line);
    const phone = phoneFrom(line);
    return {
      company: cells[0] || "Nezařazená firma",
      contact: cells[1] || "",
      role: cells[2] || "",
      demand: cells[3] || cells[2] || "Importovaná poptávka",
      text: line,
      email,
      phone,
      source: "Ruční import",
    };
  });
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user)
    return NextResponse.json(
      { error: "Nepřihlášený uživatel" },
      { status: 401 },
    );
  const body = await request.json();
  const rows = parseRows(String(body.text || ""), body.mapping || undefined);
  if (!rows.length)
    return NextResponse.json(
      { error: "Import neobsahuje žádný čitelný řádek." },
      { status: 400 },
    );

  const db = getDb();
  const [settingsRow] = await db
    .select()
    .from(monitorSettings)
    .where(eq(monitorSettings.ownerId, session.user.id))
    .orderBy(desc(monitorSettings.updatedAt))
    .limit(1);
  const blacklist = (settingsRow?.blacklistedCompanies || []).map((x) => normalizeCompanyName(x)).filter(Boolean);
  const isBlacklisted = (name: string) => {
    const key = normalizeCompanyName(name);
    return Boolean(key && blacklist.some((b) => b.length >= 3 && (key.includes(b) || b.includes(key))));
  };
  if (body.preview) {
    const existingCompanies = await db
      .select()
      .from(companies)
      .where(eq(companies.ownerId, session.user.id));
    const existingContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.ownerId, session.user.id));
    const existingDemands = await db
      .select()
      .from(demands)
      .where(eq(demands.ownerId, session.user.id));
    let companiesToCreate = 0;
    let companiesToMatch = 0;
    let contactsToCreate = 0;
    let contactsToMatch = 0;
    let demandsToCreate = 0;
    let demandsToUpdate = 0;
    let skippedRows = 0;
    const warnings: string[] = [];
    const seenCompanies = new Set<string>();
    for (const raw of rows) {
      const companyName = normalize(raw.company);
      const title = normalize(raw.demand || raw.role || "Importovaná poptávka");
      if (!companyName || companyName === "Nezařazená firma") {
        skippedRows++;
        warnings.push(`Řádek bez firmy bude přeskočen: ${title}`);
        continue;
      }
      if (isBlacklisted(companyName)) {
        skippedRows++;
        warnings.push(`Řádek přeskočen — firma "${companyName}" je na blacklistu personálních agentur: ${title}`);
        continue;
      }
      const importedDomain = domainFrom(raw.sourceUrl || raw.website || raw.email || "");
      const matchedCompany = existingCompanies.find((company) => {
        const sameName = company.name === companyName || companyKey(company.name) === companyKey(companyName);
        const sameIco = raw.ico && company.ico && normalize(raw.ico) === normalize(company.ico);
        const sameDomain = importedDomain && company.website && domainFrom(company.website) === importedDomain;
        return sameName || sameIco || sameDomain;
      });
      if (matchedCompany) companiesToMatch++;
      else if (!seenCompanies.has(companyKey(companyName))) {
        companiesToCreate++;
        seenCompanies.add(companyKey(companyName));
      }
      const email = normalize(raw.email || emailFrom(String(raw.text || ""))).toLowerCase();
      const phone = normalize(raw.phone || phoneFrom(String(raw.text || "")));
      if (email || phone || raw.contact) {
        const matchedContact = existingContacts.find((contact) => Boolean((email && contact.email === email) || (phone && contact.phone === phone)));
        if (matchedContact) contactsToMatch++;
        else contactsToCreate++;
      }
      const companyId = matchedCompany?.id || "";
      const matchedDemand = existingDemands.find((demand) => demand.companyId === companyId && demand.title === title);
      if (matchedDemand) demandsToUpdate++;
      else demandsToCreate++;
    }
    return NextResponse.json({
      preview: true,
      received: rows.length,
      companiesToCreate,
      companiesToMatch,
      contactsToCreate,
      contactsToMatch,
      demandsToCreate,
      demandsToUpdate,
      skippedRows,
      warnings,
    });
  }
  const [source] = await db
    .select()
    .from(connectorSources)
    .where(eq(connectorSources.key, "manual-import"))
    .limit(1);
  const connector =
    source ||
    (
      await db
        .insert(connectorSources)
        .values({
          key: "manual-import",
          name: "Ruční CSV import",
          kind: "manual",
          status: "active",
          createdById: session.user.id,
        })
        .returning()
    )[0];
  const [run] = await db
    .insert(importRuns)
    .values({
      sourceId: connector.id,
      status: "running",
      startedAt: new Date(),
      triggeredById: session.user.id,
    })
    .returning();

  let companiesCreated = 0;
  let contactsCreated = 0;
  let contactDuplicatesFound = 0;
  let companyDuplicatesFound = 0;
  let demandsCreated = 0;
  let demandsUpdated = 0;
  let skipped = 0;
  const warnings: string[] = [];

  for (const raw of rows) {
    const companyName = normalize(raw.company);
    const title = normalize(raw.demand || raw.role || "Importovaná poptávka");
    const sourceTag = normalize(raw.source || "Ruční import");
    if (!companyName || companyName === "Nezařazená firma") {
      skipped++;
      warnings.push(`Řádek bez firmy byl přeskočen: ${title}`);
      continue;
    }
    if (isBlacklisted(companyName)) {
      skipped++;
      warnings.push(`Řádek přeskočen — firma "${companyName}" je na blacklistu personálních agentur: ${title}`);
      continue;
    }

    const allCompanies = await db
      .select()
      .from(companies)
      .where(eq(companies.ownerId, session.user.id));
    const importedDomain = domainFrom(raw.sourceUrl || raw.website || raw.email || "");
    const knownCompany = allCompanies.find((company) => {
      const sameName = company.name === companyName || companyKey(company.name) === companyKey(companyName);
      const sameIco = raw.ico && company.ico && normalize(raw.ico) === normalize(company.ico);
      const sameDomain = importedDomain && company.website && domainFrom(company.website) === importedDomain;
      return sameName || sameIco || sameDomain;
    });
    const company =
      knownCompany ||
      (
        await db
          .insert(companies)
          .values({ name: companyName, source: sourceTag, ownerId: session.user.id })
          .returning()
      )[0];
    if (!knownCompany) companiesCreated++;
    else {
      companyDuplicatesFound++;
      if (!knownCompany.source) {
      await db
        .update(companies)
        .set({ source: sourceTag, updatedAt: new Date() })
        .where(eq(companies.id, knownCompany.id));
      }
    }

    const email = normalize(raw.email || emailFrom(String(raw.text || ""))).toLowerCase();
    const phone = normalize(raw.phone || phoneFrom(String(raw.text || "")));
    let contactId: string | null = null;
    if (email || phone || raw.contact) {
      const rules = [];
      if (email) rules.push(eq(contacts.email, email));
      if (phone) rules.push(eq(contacts.phone, phone));
      const [existingContact] = rules.length
        ? await db
            .select()
            .from(contacts)
            .where(and(eq(contacts.ownerId, session.user.id), or(...rules)))
            .limit(1)
        : [];
      if (existingContact) {
        contactId = existingContact.id;
        contactDuplicatesFound++;
        await db.insert(contactDuplicates).values({
          contactId: existingContact.id,
          candidateId: existingContact.id,
          score: 100,
          reason: "Shoda e-mailu nebo telefonu při ručním importu",
        });
      } else if (raw.contact || email || phone) {
        const nameParts = normalize(raw.contact || email || "Kontakt Import").split(/\s+/);
        const [createdContact] = await db
          .insert(contacts)
          .values({
            firstName: nameParts[0] || "Kontakt",
            lastName: nameParts.slice(1).join(" ") || "Import",
            role: normalize(raw.role) || null,
            email: email || null,
            phone: phone || null,
            source: sourceTag,
            companyId: company.id,
            ownerId: session.user.id,
          })
          .returning();
        contactId = createdContact.id;
        contactsCreated++;
        await db.insert(auditLog).values({
          entityType: "contact",
          entityId: createdContact.id,
          action: "created_from_import",
          after: createdContact,
          actorId: session.user.id,
        });
      }
    }

    const [existingDemand] = await db
      .select()
      .from(demands)
      .where(
        and(
          eq(demands.ownerId, session.user.id),
          eq(demands.companyId, company.id),
          eq(demands.title, title),
        ),
      )
      .limit(1);
    if (existingDemand?.deletedAt) {
      warnings.push(`Poptávka "${title}" byla přeskočena, protože je v koši.`);
      continue;
    }
    const demandValues = {
      title,
      role: normalize(raw.role || title) || null,
      source: sourceTag,
      sourceUrl: normalize(raw.sourceUrl) || null,
      demandText: normalize(raw.text || raw.demand || title),
      location: normalize(raw.location || "") || null,
      companyId: company.id,
      contactId,
      ownerId: session.user.id,
      externalId: `manual:${company.name}:${title}`.slice(0, 150),
    };
    if (existingDemand) {
      await db
        .update(demands)
        .set({ ...demandValues, updatedAt: new Date() })
        .where(eq(demands.id, existingDemand.id));
      demandsUpdated++;
    } else {
      await db.insert(demands).values(demandValues);
      demandsCreated++;
    }
  }

  const status = warnings.length ? "completed_with_warnings" : "completed";
  await db
    .update(importRuns)
    .set({
      status,
      completedAt: new Date(),
      receivedCount: rows.length,
      createdCount: demandsCreated + contactsCreated + companiesCreated,
      updatedCount: demandsUpdated,
      skippedCount: skipped + contactDuplicatesFound,
      errorSummary: warnings.length ? JSON.stringify({ warnings }) : null,
    })
    .where(eq(importRuns.id, run.id));
  await db
    .update(connectorSources)
    .set({ lastSuccessAt: new Date(), updatedAt: new Date() })
    .where(eq(connectorSources.id, connector.id));

  return NextResponse.json({
    received: rows.length,
    companiesCreated,
    companyDuplicatesFound,
    contactsCreated,
    contactDuplicatesFound,
    demandsCreated,
    demandsUpdated,
    skipped,
    warnings,
  });
}
