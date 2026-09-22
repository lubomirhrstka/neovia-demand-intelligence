# NEOVIA Demand Intelligence, export pro Claude

Tento dokument je přenosný kontext pro další vývoj aplikace v Claude. Je psaný jako zadání pro vibe coding, tedy aby Claude pochopil produkt, styl práce, aktuální stav, technické hranice a další doporučené kroky bez nutnosti znovu objevovat aplikaci.

## 1. Co je aplikace

NEOVIA Demand Intelligence je interní CRM a obchodní intelligence aplikace pro NEOVIA. Slouží k vyhledávání, importu, třídění a obchodnímu zpracování poptávek z pracovních a veřejných zdrojů, správě firem a kontaktů, pipeline, úkolů, e-mailové komunikace a kalendáře.

Hlavní uživatel je obchodník nebo obchodní tým, který potřebuje:

- získávat relevantní poptávky z MPSV, jobs.cz, prace.cz, ručních importů a dalších zdrojů,
- zakládat z poptávek obchodní případy,
- evidovat firmy, kontakty, aktivity, historii komunikace a další kroky,
- propojit CRM s firemním Gmailem a Google kalendářem,
- udržet duplicity, zdroje, štítky, kontakty a firmy pod kontrolou.

Produkční URL:

```text
https://neovia-demand-intelligence.vercel.app
```

Aktuální verze v době exportu:

```text
1.1.7
```

Verze se zobrazuje v patičce levého menu.

## 2. Produktová filozofie

Aplikace má působit jako pracovní nástroj pro obchodní tým, ne jako demo. Priorita je rychlost práce, jasná evidence a minimum zbytečného klikání.

Zásady UX:

- čeština všude v uživatelském rozhraní,
- žádné technické chyby typu “Invalid input”,
- mazání vždy jen po potvrzení,
- raději archivovat / skrýt než nevratně mazat,
- každá karta má být aktivní a proklikávací,
- kontakty, firmy, poptávky, obchodní případy, úkoly a e-maily mají být provázané,
- exporty musí být čitelné v Excelu s korektní češtinou,
- importy musí hlídat duplicity a zdroj,
- žádné falešné automatizace, co vypadají funkčně, ale nic nedělají.

## 3. Technologický stack

Projekt:

```text
/Users/lubomirhrstka/Downloads/NEOVIA/neovia-demand-intelligence
```

Stack:

- Next.js 16.3.5, App Router,
- React 19,
- TypeScript,
- Drizzle ORM,
- PostgreSQL,
- Better Auth,
- Vercel,
- lucide-react,
- vlastní CSS v `src/app/globals.css`.

Hlavní příkazy:

```bash
npm run build
npx vercel deploy --prod --yes --scope luboss
```

Na lokálním Macu může být potřeba Node z lokální cesty:

```bash
export PATH="/Users/lubomirhrstka/.local/node-v24.21.0-darwin-arm64/bin:$PATH"
```

## 4. Hlavní soubory

Klíčové soubory:

```text
src/app/page.tsx
src/app/globals.css
src/lib/schema.ts
src/lib/gmail.ts
src/lib/google-calendar.ts
src/lib/matching.ts
src/app/api/*
drizzle/*.sql
package.json
vercel.json
```

Hlavní frontend je zatím ve velkém souboru:

```text
src/app/page.tsx
```

Do budoucna je vhodné ho rozdělit na komponenty:

```text
src/components/dashboard/*
src/components/demands/*
src/components/contacts/*
src/components/pipeline/*
src/components/email/*
src/components/calendar/*
src/components/tasks/*
```

## 5. Navigace aplikace

Typ `View` obsahuje hlavní obrazovky:

```text
Přehled
E-mail
Kalendář
Poptávky
Kontakty
Pool kapacit
Pipeline
Úkoly
Zdroje
Analýzy
Nastavení
```

Levé menu má pořadí:

```text
Přehled
E-mail
Kalendář
Poptávky
Kontakty
Pool kapacit
Pipeline
Úkoly
Zdroje
Analýzy
Nastavení dole
```

## 6. Datový model

Databázové schéma je v:

```text
src/lib/schema.ts
```

Hlavní tabulky:

- `user`, `session`, `account`, `verification`, Better Auth,
- `companies`, firemní karty,
- `contacts`, kontaktní karty,
- `demands`, poptávky,
- `opportunities`, obchodní případy,
- `capacities`, pool kapacit,
- `tasks`, úkoly, schůzky a kalendářové záznamy,
- `activities`, historie aktivit kontaktů, firem a příležitostí,
- `email_accounts`, Gmail a Google Calendar OAuth účty,
- `audit_log`, audit změn,
- `contact_duplicates`, duplicity kontaktů,
- `connector_sources`, zdroje importů,
- `import_runs`, historie importů,
- `monitor_settings`, nastavení monitoringu.

### Důležité vazby

Poptávka:

```text
demands.companyId -> companies.id
demands.contactId -> contacts.id
demands.ownerId -> user.id
```

Obchodní případ:

```text
opportunities.companyId -> companies.id
opportunities.contactId -> contacts.id
opportunities.demandId -> demands.id
```

Úkol / schůzka / poznámka:

```text
tasks.companyId -> companies.id
tasks.contactId -> contacts.id
tasks.opportunityId -> opportunities.id
tasks.externalProvider, externalId, syncedAt pro Google Calendar vazbu
```

Aktivita:

```text
activities.contactId -> contacts.id
activities.companyId -> companies.id
activities.opportunityId -> opportunities.id
```

## 7. Mazání a archivace

Aktuální logika:

- Poptávky mají soft delete: `deletedAt`, `deletedById`, `deleteReason`.
- Úkoly / kalendářové záznamy mají zatím tvrdší odstranění přes API `DELETE /api/tasks`, vždy s potvrzením v UI.
- Google události se při smazání v CRM zatím automaticky nemažou z Google kalendáře.

Doporučené vylepšení:

Při mazání synchronizovaných kalendářových záznamů nabídnout volbu:

```text
Smazat jen v CRM
Smazat v CRM i v Google kalendáři
Archivovat / skrýt a už znovu neimportovat
```

Pro Google import je potřeba přidat seznam ignorovaných externích ID, jinak se smazaná Google událost může znovu importovat, pokud pořád existuje v Google kalendáři.

## 8. Importy

### Ruční import

Endpoint:

```text
POST /api/imports/manual
```

Funkce:

- textový import,
- soubory Excel, PDF, text a obrázek jsou v UI připravované jako workflow,
- mapování sloupců,
- založení minimálně firemních a kontaktních karet,
- kontrola duplicity,
- zdroj jako štítek.

### MPSV import

Endpoint:

```text
POST /api/imports/mpsv
```

Důležitá oprava z vývoje:

- malé české slovo `it` se nesmí brát jako IT relevance,
- IT/NIS2 role a klíčová slova mají být kontextová,
- NIS2 / kybernetický zákon role:
  - architekt kybernetické bezpečnosti,
  - manažer kybernetické bezpečnosti,
  - specialista kybernetické bezpečnosti,
  - SOC analyst,
  - bezpečnostní administrátor,
  - security engineer,
  - GRC,
  - risk manager,
  - compliance,
  - incident response,
  - DORA / NIS2 / kybernetický zákon.

### Job monitor

Endpoint:

```text
POST /api/imports/job-monitor
```

Zdroje:

- jobs.cz,
- prace.cz,
- další portály podle budoucích konektorů.

## 9. Exporty

Exporty jsou řešené na frontendu funkcí `downloadCsv` v `src/app/page.tsx`.

Důležité požadavky:

- čeština musí být čitelná v Excelu,
- export se generuje jako `.xls` HTML workbook s UTF-16LE,
- nahoře je informační řádek,
- hlavička má AutoFilter,
- obsah je escapeovaný přes `escapeHtml`,
- starší problém byl špatné kódování znaků typu `PÝÚpad`.

Pokud Claude upravuje exporty, nesmí vrátit obyčejné CSV bez řešení kódování.

## 10. Gmail integrace

Soubor:

```text
src/lib/gmail.ts
```

Scopes:

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.modify
```

Endpointy:

```text
/api/email/gmail/status
/api/email/gmail/callback
/api/email/gmail/folders
/api/email/gmail/messages/[id]
/api/email/gmail/messages/[id]/attachments/[attachmentId]
/api/email/gmail/send
/api/email/track/[id]
```

Funkce:

- připojení Gmailu přes OAuth,
- načítání složek,
- detail zprávy,
- přílohy,
- odesílání,
- tracking pixel endpoint připravený,
- vazba e-mailu na CRM kontakt.

Známé požadavky / otevřené ladění:

- počítadla složek musí odpovídat skutečnému Gmailu,
- nový e-mail se má psát v aplikaci, ne otevírat externí Gmail,
- ručně zadaný e-mail musí mít jasné tlačítko odeslat,
- u nového e-mailu má být možné přiložit přílohu,
- volitelně tracking přečtení e-mailu,
- párování na CRM nesmí chybně ukazovat stále jeden kontakt,
- kontakt může mít 2 e-maily a 2 telefony.

## 11. Google Calendar integrace

Soubor:

```text
src/lib/google-calendar.ts
```

Scopes:

```text
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/userinfo.email
```

Endpointy:

```text
/api/calendar/google/status
/api/calendar/google/callback
/api/calendar/google/events
/api/calendar/google/tasks
/api/calendar/google/sync
```

Stav:

- Google Calendar API je v Google Cloud projektu zapnuté,
- OAuth funguje,
- obousměrná synchronizace je implementovaná jako dávková near realtime synchronizace,
- aplikace ukládá vazbu `tasks.externalProvider = google_calendar`, `tasks.externalId`, `tasks.syncedAt`.

Logika synchronizace:

- Google -> CRM:
  - stáhne události z Google kalendáře,
  - pokud `externalId` existuje, aktualizuje CRM záznam,
  - pokud neexistuje, založí CRM schůzku se štítkem `Google`.
- CRM -> Google:
  - pošle jen záznamy s termínem,
  - posílá jen nové nebo změněné záznamy,
  - běží po dávkách, aby nenarazila na Google rate limit,
  - status ukazuje, kolik položek zbývá do další dávky.

Známá omezení:

- není to plný Google push webhook,
- near realtime funguje při otevřené aplikaci přes interval,
- pro skutečný push je potřeba doplnit Google watch kanál, webhook endpoint a obnovování watch kanálu.

## 12. Kontakty a firmy

Kontakty:

- pole `email`,
- pole `secondaryEmail`,
- pole `phone`,
- pole `secondaryPhone`,
- vazba na firmu,
- kontrola duplicit podle e-mailů a telefonů.

Firmy:

- IČO,
- web,
- sektor,
- zdroj,
- priorita,
- velikost,
- stav vztahu,
- vlastník v týmu,
- decision maker,
- další krok,
- termín dalšího kroku,
- poznámka obchodníka,
- neoslovovat.

Požadavky:

- kontakty a firmy mají být proklikávací z detailů poptávek, e-mailů, úkolů a pipeline,
- dlaždice v CRM radaru mají být aktivní,
- duplicity firem mají fungovat i pro varianty typu `Neovia` vs `Neovia s.r.o.`,
- při založení kontaktu a vyplnění firmy má aplikace nabídnout doplnění firmy, pokud firma neexistuje.

## 13. Poptávky

Obrazovka:

```text
Poptávky
```

Funkce:

- vyhledávání,
- našeptávač již hledaných textů,
- filtry,
- hromadný výběr,
- hromadné operace,
- import dat,
- detail poptávky,
- založení obchodního případu,
- koš s potvrzením,
- ochrana proti opětovnému importu odstraněných nerelevantních poptávek.

Požadavky:

- CTA `Zařadit do pipeline` se na detailu odstranilo,
- hlavní CTA je `Vytvořit obchodní případ`,
- `Otevřít původní zdroj` má být nahoře vpravo,
- e-maily a telefony v textu mají být aktivní odkazy,
- firma a kontakt v detailu mají být aktivní proklik na kartu.

## 14. Pipeline

Obrazovka:

```text
Pipeline
```

Stavy obchodního případu:

```text
identified
qualified
contacted
discovery
solution
proposal
negotiation
contract
won
lost
```

Požadavky:

- obchodní případ může jít do LOST v každé fázi,
- LOST má být archivovaný, ale reportovatelný,
- pipeline karty mají mít detail,
- detail nesmí být přes celou obrazovku bez scrollu,
- export pipeline musí mít správnou češtinu.

## 15. Úkoly a kalendář

Úkoly jsou v tabulce `tasks`.

Pole:

```text
title
kind
status
priority
tag
dueAt
externalProvider
externalId
syncedAt
assigneeId
contactId
companyId
opportunityId
createdById
```

`kind`:

```text
task
meeting
note
```

Funkce:

- založení úkolu,
- plánování,
- priorita,
- štítek,
- firma přes hledání od 3 znaků,
- kontakt přes hledání od 3 znaků,
- propis do historie kontaktu a firmy,
- koš s potvrzením,
- export .ics,
- Google Calendar sync.

Kalendář:

- samostatná položka v levém menu,
- pohled den,
- pracovní týden,
- měsíc,
- manuální založení schůzky, úkolu, poznámky,
- obousměrný sync s Google.

## 16. Aktivity a historie

Tabulka:

```text
activities
```

Používat pro historii:

- kontaktu,
- firmy,
- obchodního případu,
- e-mailu,
- schůzky,
- úkolu,
- telefonátu,
- importované události.

Když se vytvoří úkol nebo kalendářový záznam s firmou/kontaktem, má vzniknout aktivita.

## 17. Bezpečnostní zásady

Nikdy neukládat:

- OAuth client secret do kódu,
- access token do frontendu,
- refresh token do frontendu,
- API klíče do repozitáře.

OAuth účty jsou uložené v `email_accounts`, tokeny obnovuje backend.

Mazání externích dat:

- neprovádět automaticky bez jasné volby uživatele,
- Google kalendář nemaž automaticky jen proto, že uživatel smazal záznam v CRM, dokud není hotová volba typu `Smazat i v Google`.

## 18. Proměnné prostředí

Nepoužívat reálné hodnoty v dokumentaci. Potřebné názvy:

```text
DATABASE_URL
BETTER_AUTH_SECRET
BETTER_AUTH_URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_GMAIL_CLIENT_ID
GOOGLE_GMAIL_CLIENT_SECRET
GOOGLE_GMAIL_REDIRECT_URI
GOOGLE_CALENDAR_CLIENT_ID
GOOGLE_CALENDAR_CLIENT_SECRET
GOOGLE_CALENDAR_REDIRECT_URI
NEXT_PUBLIC_APP_RELEASE_DATE
```

Redirect URI:

```text
https://neovia-demand-intelligence.vercel.app/api/email/gmail/callback
https://neovia-demand-intelligence.vercel.app/api/calendar/google/callback
```

## 19. Vercel a nasazení

Scope:

```text
luboss
```

Produkční deploy:

```bash
export PATH="/Users/lubomirhrstka/.local/node-v24.21.0-darwin-arm64/bin:$PATH"
npm run build
npx vercel deploy --prod --yes --scope luboss
curl -I -L https://neovia-demand-intelligence.vercel.app | head
```

Před deploy vždy:

```bash
npm run build
```

Po deploy ověřit:

```bash
curl -I -L https://neovia-demand-intelligence.vercel.app | head
```

Pro runtime chyby:

```bash
npx vercel logs neovia-demand-intelligence.vercel.app --scope luboss --since 20m
```

## 20. Databázové migrace

Migrace jsou v:

```text
drizzle/*.sql
```

Nedávné důležité migrace:

```text
0008_deleted_demands.sql
0009_email_accounts.sql
0010_contact_secondary_fields.sql
0011_task_calendar_fields.sql
0012_calendar_sync_fields.sql
```

Při přidání nového pole:

1. upravit `src/lib/schema.ts`,
2. přidat SQL migraci do `drizzle/`,
3. aplikovat na produkční databázi,
4. teprve pak nasadit kód, který na pole sahá.

## 21. Aktuální otevřené problémy a doporučené další kroky

### 1. Mazání synchronizovaných kalendářových záznamů

Doplnit volbu:

```text
Smazat jen v CRM
Smazat v CRM i v Google kalendáři
Archivovat a už znovu neimportovat
```

K tomu přidat tabulku nebo pole pro ignorované Google `externalId`.

### 2. Plný Google push sync

Doplnit:

```text
/api/calendar/google/webhook
Google events.watch
ukládání channelId/resourceId/expiration
obnovování watch kanálu
```

### 3. Rozdělit `page.tsx`

Soubor je příliš velký. Rozdělit po modulech:

```text
Dashboard
EmailClient
CalendarView
Demands
Contacts
Pipeline
Tasks
Sources
Settings
```

### 4. Duplicity

Zlepšit:

- normalizaci názvu firmy,
- odstranění právních forem,
- fuzzy match,
- duplicitní návrhy jako aktivní dlaždice,
- merge workflow.

Příklad:

```text
Neovia
Neovia s.r.o.
NEOVIA Intelligence
```

### 5. Gmail

Doplnit:

- přílohy v novém e-mailu,
- přesné počty složek,
- lepší párování kontaktů podle více e-mailů a telefonu,
- volitelný tracking přečtení,
- odeslání bez otevírání externího Gmailu.

### 6. Importy

Doplnit:

- robustní Excel/PDF/OCR parser,
- preview před importem,
- validace sloupců,
- možnost uložit importní šablonu,
- ochrana proti znovunačtení smazaných poptávek.

### 7. Reporty

Doplnit:

- LOST report,
- aktivita obchodníka,
- zdroje poptávek,
- úspěšnost zdrojů,
- firmy bez dalšího kroku,
- kontakty bez e-mailu/telefonu,
- přehled NIS2 / kyber role.

## 22. Jak má Claude pokračovat

Když Claude dostane tento export, měl by:

1. Nejdřív si otevřít aktuální soubory, hlavně:

```text
src/app/page.tsx
src/app/globals.css
src/lib/schema.ts
src/app/api/*
```

2. Nehádat stav aplikace, ale ověřit build:

```bash
npm run build
```

3. Při každé větší změně:

- upravit schéma,
- přidat migraci,
- ošetřit API,
- ošetřit UI,
- ošetřit prázdné a chybové stavy,
- zkontrolovat mobilní šířku,
- zkontrolovat češtinu.

4. Nikdy nerozbít:

- přihlášení,
- importy,
- exporty s češtinou,
- vazby kontakt/firma/poptávka/pipeline,
- Gmail OAuth,
- Google Calendar OAuth.

5. Komunikovat s uživatelem česky, prakticky, stručně a bez technických zbytečností.

## 23. Rychlý prompt pro vložení do Claude

Použij tento prompt:

```text
Pokračuj ve vývoji aplikace NEOVIA Demand Intelligence podle přiloženého exportu. Jde o interní CRM a demand intelligence nástroj pro NEOVIA. Pracuj česky, prakticky, bez přepisování celé aplikace. Nejdřív si načti aktuální soubory, ověř build a potom implementuj jen požadovanou úpravu. Dávej pozor na vazby firma, kontakt, poptávka, obchodní případ, úkol, aktivita, e-mail a kalendář. Nemazat externí data bez potvrzení. Exporty musí mít správnou češtinu v Excelu. Každou změnu ověř buildem a připrav k nasazení na Vercel.
```

## 24. Stav exportu

Tento export vznikl po verzi:

```text
1.1.7
```

Poslední relevantní úprava:

```text
Google Calendar sync hotfix, dávkování kvůli Google rate limitu, konkrétnější chybové hlášky.
```
