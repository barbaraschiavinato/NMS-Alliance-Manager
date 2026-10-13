---
title: NMS Alliance Manager
description: Next.js dashboard to coordinate alliance missions and stations in No Man Sky
---

# NMS Alliance Manager

Next.js dashboard to coordinate an alliance's missions: status, assignee, sector, priority, due date and progress. It includes search, filters and full mission management.

## Languages

The interface is available in Italian and English. The first visit uses the browser's preferred language (English if the browser language is English, Italian otherwise); the choice can be changed from the selector in the header and is saved in the browser. The selected language does not change the URLs.

The catalogs are split by language in `src/lib/translations/`. Canonical keys are English strings; `en.ts` uses these keys as source text, while `it.ts` groups the translations by area (`common`, `navigation`, `missions`, `stations`, `members`, `profile`, `admin`, `planet`, `auth`, `system`, `errors`). To add a language, create a catalog in this folder using the same English keys, add it to the `Locale` type and register it in `src/lib/translations.ts`. New entries without a translation automatically use the English key. The Italian forms currently used as keys in components are mapped back to the translation starting from the catalog; `aliases` in `it.ts` only holds the additional legacy variants.

## Local setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without `NMS_READ_WRITE_TOKEN` (or `BLOB_READ_WRITE_TOKEN` as a fallback), the app saves its data in `data/` in the project folder. The data files are excluded from Git.

### Local mode without Google

To try the app without configuring Google OAuth, either run `npm run dev:local` or set this in `.env.local`:

```bash
LOCAL_AUTH=true
```

The sign-in screen shows one button for each account of the selected set (defined in `src/lib/local-auth.ts`). Every button has a `data-testid="local-login-<email>"` to identify it.

**Development set** (`npm run dev:local`, or `LOCAL_AUTH=true` in `.env.local`): three accounts, one per role.

| Account | Role | Specialty |
| --- | --- | --- |
| `ADMIN_EMAIL`, or `adminovr@local` if it is not set | admin | Explorer |
| `moderator@local` | moderator | Explorer |
| `user@local` | regular user | Ranger |

Profiles are editable from the profile panel and the changes persist across sign-ins, so the specialty can be changed there. Data is saved in `data/`.

**Test set** (`npm run dev:test`): nine fixed accounts, one for every role and specialty combination, named `test-<role>-<specialty>@local` (for example `test-moderator-builder@local`). Their profile cannot be edited from the panel and is reset to the values in `testLocalAccounts` on every sign-in (the simplified view toggle still works). Data is saved in `data-test/`, which is recreated on every start from `fixtures/test-data/`, so the development data is never touched and every run starts from the same populated state: 13 members (the 9 test accounts, 2 offline players, 1 pending and 1 blocked member), 9 missions covering every status and specialty, 5 stations with their system task status, a help request with a reply and two private messages. The set is chosen with `LOCAL_AUTH_SET=test`, and the data folder with `NMS_DATA_DIR`. `tests/stores/test-data.test.ts` loads the fixtures with the real store readers, so a fixture the app cannot read fails the tests: keep them valid when you edit them.

In both sets the accounts are already approved and have a complete profile; role and approval are restored on every sign-in. Google accounts are not affected. In this mode the Google variables and `ALLIANCE_ADMIN_EMAIL` are not needed, and data is always saved in local files, even if a Blob store is configured. The mode is ignored in production (`NODE_ENV=production`, so also with `npm run build` / `npm start`) and on Vercel.

## Deploying to Vercel

1. Import the repository into Vercel and create a private Blob Store from the project's Storage panel.
2. In the store's **Projects** tab choose **Connect to Project** and enable **Production**. Vercel configures `BLOB_STORE_ID`; the app also supports `NMS_STORE_ID`. The SDK automatically retrieves and refreshes the OIDC token provided by Vercel: do not copy it manually, and no read-write token is needed. Blob and OIDC are also available on the Hobby plan, within the plan's limits. For environments without OIDC you can use `NMS_READ_WRITE_TOKEN` (or `BLOB_READ_WRITE_TOKEN`).
3. Deploy, or **Redeploy** if you have just connected the store or changed the variables. The service uses the private file `alliance-manager/missions.json` in the Blob store; it does not use the Function's ephemeral filesystem.

In production the app rejects storage operations if OIDC authentication or a read-write token is not configured. `NMS_WEBHOOK_PUBLIC_KEY` does not authenticate Blob operations. The `.env.example` file documents the variables; do not commit tokens to Git.

`vercel.json` limits automatic deployments to the `main` branch, so pull requests and other branches do not create Vercel previews. If your production branch is not `main`, change it there.

If after signing in with Google you get a 500 error with a log asking for the Blob configuration, check that the store is connected to the project and that `BLOB_STORE_ID` or `NMS_STORE_ID` is present in the **Production** environment, then redeploy. Profile registration requires storage even before the account is approved.

## Access and roles

Sign-in uses Google OAuth through Auth.js. Create OAuth credentials in Google Cloud and set `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `AUTH_URL` and `ALLIANCE_ADMIN_EMAIL` in `.env.local` for development and in the Vercel environment variables. Locally use `AUTH_URL=http://localhost:3000/api/auth`, so the callback stays on localhost even if the server listens on all interfaces. Configure `http://localhost:3000/api/auth/callback/google` as the Google redirect URI locally and `https://<vercel-domain>/api/auth/callback/google` in production. In production set `AUTH_URL=https://<vercel-domain>/api/auth`. Set `ALLIANCE_ADMIN_EMAIL=youremail@gmail.com` for the first admin.

Verified Google accounts join as regular users; the admin can promote registered users to moderator or admin. Users take unassigned missions, moderators create/edit/assign missions, and the admin also manages roles and the alliance branding. The logo and banner are served through an authenticated endpoint from the private Blob. The APIs always check the session and role on the server.

Every new Google account stays pending until a moderator or admin approves it. Pending accounts can only complete their own profile; missions, members and branding stay inaccessible until approval. Moderators and admins can also block accounts or remove them from the alliance list; blocking denies access, while deletion removes the profile and a later new sign-in requires a new approval. Moderators can manage regular users, the admin can also manage moderators; the configured admin account cannot be blocked or deleted. The initial admin configured in `ALLIANCE_ADMIN_EMAIL` is approved automatically.

Each member completes their own profile with an in-game name, a 13-character alphanumeric NMS friend code, one or more platforms (PC, PlayStation, Xbox, Nintendo Switch, Mac) and a specialty (Builder, Ranger or Explorer). The role cannot be changed by the user. Missions cannot be taken by or assigned to incomplete profiles.

## App sections

- **Missions**: cards with status, assignee, progress and indicators for the system tasks (Ranger, Explorer, Builder). Completing a mission does not change the progress bar.
- **Stations**: discovered stations with discoverer, Almanac planet and notes. The discoverer can tick "Station claimed" and "System renamed" on their own stations. Admins and moderators can export the list to Excel, with the completed tasks and the related missions.
- **Planets**: search and filters on the planets of the alliance's systems.
- **Users**: management of approvals, roles and profiles, restricted to admins and moderators. When editing another member, an admin can also set that member's simplified view.
- **Leaderboard**: alliance widgets (stations, missions, tasks, planets, active members) and rankings for discovered stations, completed missions and each role's tasks. A task with no mission covering it is credited to the station's discoverer.

All sections are shown as cards. Regular users always use the simplified view; admins and moderators can turn it on or off from their own profile, and in that case their permissions are those of a regular user.

## Development and verification

```bash
npm test               # all tests (Vitest)
npm run test:watch     # tests in watch mode
npm run test:coverage  # tests with a coverage report in coverage/ (git-ignored, open coverage/index.html)
npm run lint           # ESLint
npm run format         # Prettier (write)
npm run format:check   # Prettier (check only)
npm run build          # production build, includes the TypeScript type check
npm run audit:prod     # npm audit on the production dependencies only
```

All tests live in `tests/`, mirroring the source: pure logic, stores, API routes, components and pages. `src/lib/nms-core/` is vendored third-party code and is excluded from tests, coverage and formatting. The existing code is not fully formatted with Prettier yet, so format only the files you create or edit.

GitHub CI runs lint, tests with coverage and the build on every push to `main` and every pull request, plus `npm run audit:prod`. The coverage summary appears on the job page and the HTML report is uploaded as the `coverage-report` artifact.

The `CI` GitHub Actions workflow (`.github/workflows/ci.yml`) runs the tests and `npm run audit:prod` on every pull request.

The initial demo data is defined in `src/lib/seed.ts`. The CRUD endpoints are `/api/missions` and `/api/missions/[id]`.

## System addresses

Every mission requires a full portal address of 12 hexadecimal glyphs (`0`-`F`) and a galaxy index (`0`-`255`). The interface shows the decoded `Planet / System / Y / Z / X` parameters and flags reserved or invalid values. The glyph PNGs are in `public/glyphs/` and come from [NMS Galactic Map](https://github.com/elegra1965-source/nms-galactic-map/tree/main/glyphs). They are No Man's Sky images, owned by their respective holders and not covered by the source repository's software license; this fan-made project is not affiliated with or endorsed by Hello Games.

Addresses are verified through the [NMS Almanac](https://nmsalmanac.com/api/docs) API, using the selected galaxy. A positive result confirms that the planet is present in the Almanac and fills `System/sector` with a descriptive label made of star, economy, conflict and race; Almanac does not provide the system's proper name. The full JSON response is kept in `data/almanac.json`, indexed by portal code and galaxy, or in the private Blob in production; later checks reuse the stored data. The `systemVerified` flag is saved on the mission and reset if the address or galaxy changes. A `404` means the planet is not catalogued, but it does not prove that it does not exist in the game, and it does not prevent saving. The service allows up to 500 requests per hour and may be unavailable; in those cases saving is still possible without verification.
