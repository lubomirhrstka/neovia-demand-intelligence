# Konektory zdrojů poptávek

## Bezpečný model

Každý zdroj má vlastní záznam, stav konfigurace, odkaz na jeho podmínky, odkaz na uložené přístupové údaje a historii importů. Přístupy se neukládají do databázových záznamů ani do zdrojového kódu, pouze do šifrovaných nastavení nasazení.

## Režimy připojení

1. **Oficiální API**. Pouze se schváleným klientským přístupem a s dokumentovaným rozsahem dat.
2. **Partnerský feed**. CSV, XML, SFTP nebo webhook, pokud jej portál či jeho datový partner poskytne ve smluvním režimu.
3. **Autorizovaný export**. Ruční nebo plánovaný CSV export z účtu NEOVIA. Aplikace jej importuje, normalizuje a deduplikuje, ale nepřihlašuje se na portál za uživatele.

## LinkedIn

LinkedIn Talent API je partnerské rozhraní. Přístup k Talent a Job Posting API vyžaduje schválení LinkedInem, OAuth a smlouvu s datovými omezeními. Aplikace proto připraví konektor až po dodání schválených přístupů nebo licencovaného zdroje. Neimplementuje scraping LinkedInu ani obcházení jeho přístupů.

## První pořadí napojení

1. NEN a další zdroje veřejných zakázek, podle veřejného exportu či API.
2. Portály, pro které má NEOVIA partnerský export nebo placený datový přístup.
3. LinkedIn Talent Solutions nebo licencovaný datový partner.
4. Ruční CSV import jako okamžitě použitelná záloha pro každý schválený zdroj.
