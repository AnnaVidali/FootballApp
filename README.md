# Squad HQ

A full-stack web application for managing amateur and semi-professional football (soccer) teams. Built with Next.js, Supabase, and Tailwind CSS.

## Features

- **Team Management** — Create and manage teams with invite codes, customizable colors, and logos
- **Roster Management** — Add/remove players, assign positions and shirt numbers, designate admins and coaches
- **Events** — Schedule matches and trainings with date, time, and location
- **Availability Tracking** — Players can RSVP Yes/Maybe/No with automated deadlines
- **Lineup Builder** — Drag-and-drop visual lineup editor on a pitch with multiple formations (5 variants of 7v7)
- **Set Pieces** — Assign players to free kicks, corners, and penalties
- **Captain Assignment** — Designate a match captain displayed on the pitch
- **Calendar Export** — Google Calendar links and .ics downloads for events
- **Pitch Reservations** — Split the cost of training pitches and track Bizum repayments
- **Internationalization** — English and Spanish language support
- **Authentication** — Email/password auth with password reset and account management

## Tech Stack

| Category | Technology |
|---|---|
| **Framework** | [Next.js](https://nextjs.org/) 16 (App Router) |
| **UI Library** | React 19 |
| **Language** | TypeScript |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) v4 |
| **Database** | [Supabase](https://supabase.com/) (PostgreSQL with Row Level Security) |
| **Auth** | Supabase Auth (email/password) |
| **Fonts** | Geist Sans + Geist Mono |

## Getting Started

### Prerequisites

- Node.js 22.12+ (or 24 LTS) — required by Vitest 5
- A Supabase project with the migrations applied

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### Installation

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Database Setup

Apply the Supabase migrations **in filename order** from
`supabase/migrations/001_initial.sql` through
`supabase/migrations/044_drop_redundant_events_index.sql`. The history is
applied by hand (the numeric prefix is the ordering), and each migration is
written to be idempotent so a re-run is safe. Ensure the `team-logos` storage
bucket exists for team logo uploads.

New tables must grant the Data API commands the app uses in the same migration
(see the note in `AGENTS.md`); from 30 October 2026 Supabase no longer grants
`public` schema access automatically.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm test` | Run the unit tests once (Vitest) |
| `npm run test:watch` | Run the unit tests in watch mode |

### Testing

Unit tests live next to the code as `*.test.ts` and run with Vitest. There is
also an end-to-end account lifecycle check in `scripts/e2e-account.mjs`; it
needs a production build and a running server (`npm run build && npm start`)
plus the `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`.

### Continuous Integration

Every push to `master` and every pull request runs the checks in
`.github/workflows/ci.yml`: ESLint, `tsc --noEmit`, the Vitest unit tests, and
a production build. Run the same four locally with `npm run lint`,
`npm run typecheck`, `npm test`, and `npm run build`.

## Project Structure

```
app/            # Next.js App Router (routes, layouts, API routes)
components/     # React components
lib/            # Utilities, i18n, Supabase clients
messages/       # i18n translations (en, es)
scripts/        # One-off and end-to-end scripts (not part of the app bundle)
supabase/       # Database migrations
types/          # TypeScript interfaces
public/         # Static assets
```

## License

[MIT](LICENSE)
