import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { users } from "@/lib/schema";
import { NextResponse } from "next/server";

const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (url.pathname.includes("/sign-up")) {
    // Appka je jednouživatelská — registrace je povolená jen dokud neexistuje žádný účet.
    const existing = await getDb().select({ id: users.id }).from(users).limit(1);
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Registrace nových účtů je vypnutá. Přístup uděluje pouze správce pracovního prostoru." },
        { status: 403 },
      );
    }
  }
  return handlers.POST(request);
}
