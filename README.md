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

- Node.js 20+
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

Apply the Supabase migrations in order from `supabase/migrations/001_initial.sql` through `016_transfer_ownership.sql`. Ensure the `team-logos` storage bucket exists for team logo uploads.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |

## Project Structure

```
app/            # Next.js App Router (routes, layouts, API routes)
components/     # React components
lib/            # Utilities, i18n, Supabase clients
messages/       # i18n translations (en, es)
supabase/       # Database migrations
types/          # TypeScript interfaces
public/         # Static assets
```

## License

MIT
