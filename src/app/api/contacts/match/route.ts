import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { companies, contacts } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Nepřihlášený uživatel" }, { status: 401 });
  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.trim().toLowerCase();
  const name = url.searchParams.get("name")?.trim().toLowerCase() || "";
  const text = url.searchParams.get("text")?.trim().toLowerCase() || "";
  if (!email && !name && !text) return NextResponse.json({ match: null });

  const rows = await getDb()
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      role: contacts.role,
      email: contacts.email,
      secondaryEmail: contacts.secondaryEmail,
      phone: contacts.phone,
      secondaryPhone: contacts.secondaryPhone,
      companyId: contacts.companyId,
      company: companies.name,
    })
    .from(contacts)
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(eq(contacts.ownerId, session.user.id))
    .limit(500);

  const normalizePhone = (value: string | null) => (value || "").replace(/\D/g, "");
  const isSystemSender = /no-?reply|noreply|notification|drive-shares|google|mailer-daemon/.test(email || "");
  const haystack = `${name} ${text}`;
  const candidates = rows
    .map((contact) => {
      let score = 0;
      const reasons: string[] = [];
      const contactEmails = [contact.email, contact.secondaryEmail].filter(Boolean).map((value) => value!.toLowerCase());
      const contactPhones = [contact.phone, contact.secondaryPhone].filter(Boolean).map(normalizePhone).filter((value) => value.length >= 9);
      if (email && contactEmails.includes(email)) {
        score += 100;
        reasons.push("shodný e-mail");
      }
      if (!isSystemSender && contactEmails.some((value) => value && text.includes(value))) {
        score += 90;
        reasons.push("e-mail v těle zprávy");
      }
      if (contactPhones.some((phone) => normalizePhone(text).includes(phone))) {
        score += 80;
        reasons.push("telefon v podpisu");
      }
      if (!isSystemSender) {
        const fullName = `${contact.firstName} ${contact.lastName}`.trim().toLowerCase();
        if (fullName.length > 7 && haystack.includes(fullName)) {
          score += 70;
          reasons.push("jméno odesílatele");
        }
      }
      return { contact, score, reasons };
    })
    .filter((item) => item.score >= 80)
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const match = best?.contact || null;

  return NextResponse.json({ match, score: best?.score || 0, reasons: best?.reasons || [] });
}
