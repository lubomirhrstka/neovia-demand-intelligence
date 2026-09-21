import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${url.origin}/#Nastaven%C3%AD?gmail=error&reason=${encodeURIComponent(error)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(`${url.origin}/#Nastaven%C3%AD?gmail=missing-code`);
  }

  return new NextResponse(
    `<html lang="cs"><body style="font-family:system-ui;padding:32px;line-height:1.5"><h1>Gmail OAuth přihlášení proběhlo</h1><p>Aplikace přijala autorizační kód. Další bezpečnostní krok je výměna kódu za refresh token a jeho šifrované uložení k uživatelskému účtu.</p><p>Zatím token neukládám, aby nevzniklo nechráněné napojení pošty.</p><p><a href="/#E-mail">Zpět do e-mailového klienta</a></p></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
