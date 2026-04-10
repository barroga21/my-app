# Hibi

Hibi is a private daily companion built with Next.js + Supabase for:
- journal writing
- habit tracking
- calendar reflection
- lightweight profile and preference management

It is optimized for both desktop and mobile interaction patterns.

## Stack

- Next.js App Router
- React client-heavy pages
- Supabase auth + tables + storage
- Local-first persistence with sync to Supabase
- Vitest for utility tests

## Core App Areas

- Home: app/page.tsx
- Journal: app/today/page.jsx
- Habits: app/habits/page.jsx
- Calendar: app/calendar/page.jsx
- Profile: app/profile/page.jsx
- Login: app/login/page.jsx

Shared modules:
- Auth bootstrapping: lib/hooks/useAuthBootstrap.js
- Command palette: lib/hooks/useCommandPalette.js
- Storage schema guards: lib/storageSchema.js
- Media storage/signed URLs: lib/mediaStorage.js
- Date/storage key helpers: lib/dateKeys.js

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Set environment variables in .env.local:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_OBSERVABILITY_ENABLED=true
NEXT_PUBLIC_OBSERVABILITY_SAMPLE_RATE=1
# Optional override (defaults to /api/observability)
NEXT_PUBLIC_OBSERVABILITY_ENDPOINT=/api/observability
# Optional external sink for server-side forwarding
OBSERVABILITY_WEBHOOK_URL=
```

3. Run development server:

```bash
npm run dev
```

If port 3000 is already in use by an existing Next process, stop it first or let Next auto-pick the next port.

## Lint and Tests

```bash
npm run lint
npm run test
```

Targeted lint while iterating:

```bash
npm run lint -- app/today/page.jsx app/habits/page.jsx app/calendar/page.jsx
```

## Data Strategy

Hibi uses a local-first approach:
- UI writes immediately to localStorage for responsiveness.
- Sync queues and Supabase writes persist remotely.
- Schema guards sanitize malformed local data before hydration.

Storage keys are generated with helpers in lib/dateKeys.js to reduce key drift bugs.

## Media Strategy

- Images are uploaded to Supabase storage as private objects.
- Client stores `sb://` storage references.
- Runtime resolves references to signed URLs.
- SQL bootstrap for bucket/policies is in supabase/storage_hibi_media.sql.

## Mobile UX Notes

- Fixed bottom nav with safe-area handling
- Pull-to-refresh affordance on Home
- Long-press interactions for quick actions
- Reduced motion support hook for accessible animations

## Iteration Roadmap (Active)

- Continue component extraction from large page files
- Expand integration tests for auth and page workflows
- Add sync-state indicators for offline/retry transparency
- Complete PWA/offline shell behavior
- Keep tightening performance for large journal/habit histories

## Security

- Do not commit secrets.
- Keep Supabase RLS enabled for user-owned rows/objects.
- Validate all storage payloads before use.

## Release Hardening Runbooks

- Real-device QA matrix: docs/release/qa-matrix.md
- Accessibility verification: docs/release/accessibility-audit.md
- Store compliance pack: docs/release/store-compliance.md
- Network chaos checks: docs/release/network-chaos.md
- Device QA execution log: docs/release/evidence/device-qa-execution-log.md
- Accessibility sign-off: docs/release/evidence/accessibility-screen-reader-signoff.md
- Store submission packet: docs/release/evidence/store-submission-packet.md
- Final go/no-go gate: docs/release/final-go-no-go.md

Support and privacy URLs for store metadata:
- https://hibi.app/support
- https://hibi.app/privacy
