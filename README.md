# GuideFlow

Turn everyday processes into visual, step-by-step guides. Includes a Next.js workspace and a Manifest V3 Chrome extension.

## What works

- A responsive product site with a keyboard-accessible interactive demo.
- A searchable guide library: search titles, descriptions and individual steps; sort by title or update time; filter, archive and restore guides.
- Three starter templates for onboarding, customer support and repeatable operations.
- A screenshot editor with step reordering, notes, version checks and transactional saves. Publishing saves the latest edits first.
- Token-based shared guides with checklists, browser-local progress and print/PDF output. Progress resets when a guide version changes.
- Account registration/login, workspace membership checks, expiring/revocable links and export endpoints.

## Run locally

Use a current Node.js LTS version compatible with Next.js 16 (20.9+).

```sh
npm ci
cp .env.example .env
npm run db:setup
npm run dev
```

On PowerShell use `Copy-Item .env.example .env` instead of `cp`. If SQLite cannot create the initial file, run `New-Item -ItemType File prisma/dev.db` before the setup command.

Open http://localhost:3000 and register an account. Choose a starter from the workspace or create a blank guide. Add steps/screenshots, save, and publish to obtain a reader link.

Set `JWT_SECRET` to a long random value before production. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Production authentication refuses to use the development fallback. Set `NEXT_PUBLIC_APP_URL` to your deployed origin so extension-generated links point to the correct host.

## Browser extension

```sh
cd extension
npm ci
npm run build
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist`. Configure the app URL in the extension settings. The extension has not been published to the Chrome Web Store.

## Verification

```sh
npm run lint
npm run check:types
npm run build
npm --prefix extension run build
```

Integration tests create synthetic accounts and guides. Run them **only against a disposable local database**, separate from your own data. In a PowerShell terminal:

```powershell
New-Item -ItemType File prisma/qa.db -ErrorAction SilentlyContinue
$env:DATABASE_URL='file:./qa.db'
$env:JWT_SECRET='local-test-only-replace-for-production'
npx prisma db push
npm run build
npm run start -- --port 3100
```

In a second terminal run `npm run test:integration`. `TEST_BASE_URL` can override the default `http://localhost:3100`; remote hosts are rejected. The suite exercises account creation/login, step persistence/reordering, optimistic concurrency, input validation, archive/restore, publishing, shared rendering, and private/revoked link access. Synthetic test records remain in the disposable database for manual inspection.

## Deployment scope

This is a self-hosted beta, not a claim of full Scribe feature parity. SQLite and screenshot uploads require durable disk storage; ephemeral/serverless hosting needs a database and object-storage migration. Reader progress is local to a browser, not synchronized between devices. An unlisted link is a bearer link: anyone with it can read the guide. Screenshot files currently use unguessable public URLs; revoking a guide link does not revoke a screenshot URL already obtained. Editor annotations are stored separately and must not be relied on for permanent redaction of sensitive source images. Review screenshots before sharing. Add rate limiting, account recovery, operational monitoring and a full security review before a public multi-tenant launch.

No AI generation service, billing, invitations or cloud deployment is configured. The homepage workspace invitation flow is explicitly an interactive demo.
