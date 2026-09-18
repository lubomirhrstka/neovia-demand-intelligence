# NEOVIA Demand Intelligence

Next.js full-stack app pro správu poptávek, obchodních příležitostí a kontaktů s integrací NIS2/nZOKB compliance.

## Technologie

- **Frontend**: Next.js 16.3.5 (Turbopack), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes + Drizzle ORM
- **Database**: PostgreSQL (Vercel Postgres)
- **Auth**: Better-auth
- **Integrations**: MPSV, LinkedIn, custom webhooks

## Setup

### 1. Instalace

```bash
npm install
```

### 2. Environment

Zkopíruj `.env.example` na `.env.local` a vyplň:

```env
# Database
DATABASE_URL=postgresql://user:password@host/db

# Vercel Postgres (pokud používáš)
POSTGRES_PRISMA_URL=...

# Auth (Better-auth)
BETTER_AUTH_SECRET=<generate-random-string>
BETTER_AUTH_URL=http://localhost:3000

# API Keys
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...

# Integrations
MPSV_API_KEY=...
```

### 3. Database migrations

```bash
npm run db:push
```

### 4. Dev server

```bash
npm run dev
```

Otevři [http://localhost:3000](http://localhost:3000)

## Build

```bash
npm run build
npm run start
```

## Deploy

### Vercel

Přes CLI:

```bash
npx vercel
```

### GitHub Actions + Vercel

1. Pushni do GitHub
2. Nastav secrets v repo settings:
   - `VERCEL_TOKEN` - z Vercel account
   - `VERCEL_ORG_ID` - Vercel org ID
   - `VERCEL_PROJECT_ID` - Vercel project ID

Workflow v `.github/workflows/ci-cd.yml` se spustí automaticky.

## API Endpoints

| Endpoint | Metoda | Popis |
|----------|--------|-------|
| `/api/demands` | GET | Všechny poptávky |
| `/api/demands` | POST | Vytvoř poptávku |
| `/api/opportunities` | GET/POST | Obchodní příležitosti |
| `/api/contacts` | GET/POST | Kontakty |
| `/api/capacities` | GET/POST | Pool kapacit |
| `/api/companies` | GET/POST | Firmy |
| `/api/tasks` | GET/POST | Úkoly |
| `/api/imports/manual` | POST | Ruční import |
| `/api/imports/mpsv` | POST | Import z MPSV |
| `/api/monitor-settings` | GET/PUT | Nastavení monitoring |

## Matching & Scoring

Algoritmus porovnává poptávky s kapacitami:

- **Role matching**: levenshtein distance + exact keyword match
- **Location match**: pokud je zadaná
- **Technology stack**: tag-based similarity
- **Relevance score**: kombinace všech faktorů (0-100%)

Viz `src/lib/matching.ts`

## Struktura

```
src/
├── app/           # Pages + API routes
├── components/    # React komponenty
├── lib/           # Utils + matching logika
├── styles/        # CSS
└── schema/        # DB schema (Drizzle)
```

## Development

```bash
npm run lint       # ESLint
npm run type-check # TypeScript
npm run build      # Full build
```

## License

© 2025 Neovia CZ
