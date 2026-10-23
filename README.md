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

Mission and Station lists paginate after 50 items; Planets paginates after 20 systems, keeping each system's planets together. Set `NEXT_PUBLIC_LIST_PAGE_SIZE` and `NEXT_PUBLIC_PLANET_SYSTEMS_PAGE_SIZE` to positive integers to override these defaults. Empty or unset values use the defaults; invalid values throw an explicit configuration error. These public settings are inlined at build time: restart development after editing `.env.local`, or rebuild/redeploy for production. Search and filters apply before pagination and reset it to the first page. Pagination limits rendered cards, not server-side Almanac loading or export results.

1. Import the repository into Vercel and create a private Blob Store from the project's Storage panel.
2. In the store's **Projects** tab choose **Connect to Project** and enable **Production**. Vercel configures `BLOB_STORE_ID`; the app also supports `NMS_STORE_ID`. The SDK automatically retrieves and refreshes the OIDC token provided by Vercel: do not copy it manually, and no read-write token is needed. Blob and OIDC are also available on the Hobby plan, within the plan's limits. For environments without OIDC you can use `NMS_READ_WRITE_TOKEN` (or `BLOB_READ_WRITE_TOKEN`).
3. Deploy, or **Redeploy** if you have just connected the store or changed the variables. The service uses the private file `alliance-manager/missions.json` in the Blob store; it does not use the Function's ephemeral filesystem.

In production the app rejects storage operations if OIDC authentication or a read-write token is not configured. `NMS_WEBHOOK_PUBLIC_KEY` does not authenticate Blob operations. The `.env.example` file documents the variables; do not commit tokens to Git.

`vercel.json` limits automatic deployments to the `main` branch, so pull requests and other branches do not create Vercel previews. If your production branch is not `main`, change it there.

Server errors captured by Next.js are logged through `src/instrumentation.ts` with the prefix `[NMS server error]`, the error digest (when available), route context and the original error. After deploying, reproduce the failure and search the production deployment's **Runtime Logs**, not Build Logs, for that prefix or digest. Request headers, cookies and query parameters are not included. These diagnostics stay server-side; the production browser still receives the sanitized error.

The Planets page reads an unmodified cache snapshot and normalizes only the requested planets, in batches of at most six. An individual cache migration or upstream request failure is logged and shown through the existing partial-loading warning, without hiding healthy planets or deleting the failed cache entry. Successful migrations are saved even if another planet fails; cache read and write errors are logged explicitly. Cache-only consumers do not trigger a global migration or network requests. Station batch reads likewise isolate individual enrichment failures.

Almanac image paths may include a 1-based `?galaxy=` query. Image normalization preserves that query and adds the leading slash expected by the UI, including for already adapted cache entries, without fetching metadata.

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

## Taxi service

The authenticated `/taxi` board uses `/api/taxi-requests` and stores requests and replies in the existing private message document with `subjectType: "taxi"`. It shares board handlers and UI with Help Requests, but the feeds and thread operations are isolated by type. All approved members may read and reply; only authors or moderators/admins may delete. Simple view continues to enforce user-level permissions.

The hero opens a message dialog with a required destination galaxy (0–255 internally) and a meeting point: Offline (preselected), arrange in the replies, the alliance hub (third, when configured), or a station from all alliance stations. Both selectors share the same searchable combobox, with a consistent 16px font for inputs and options. Clicking either field or its visible arrow opens a scrollable list. Galaxies can be filtered by their displayed number (1–256) or name; meeting stations by name, portal and galaxy. Arrow keys, Enter and Escape navigate, select and close the list; only listed choices can be submitted. The server validates the meeting kind and resolves station identifiers against the station store, persisting a minimal meeting-point snapshot (portal, galaxy, optional name), rather than trusting client-supplied station details. The hub uses `alliance.portalCode` and `alliance.galaxy`, resolved server-side and snapshotted on creation; subsequent configuration changes do not alter existing requests. The destination and meeting galaxy are independent. Existing messages retain their format; older taxi entries without a meeting kind are interpreted as arrange in replies or their saved station. Legacy email migrations preserve meeting metadata. Request storage continues to use the existing message document; notification configuration is stored separately as described below.

### Taxi notifications

Discord alerts display the profile's Discord contact as plain text after each participant's friend code, using "Discord del richiedente" / "Discord di chi risponde". Empty contacts are omitted. No ID lookup or ping is performed (`allowed_mentions.parse` stays empty); these contacts are not sent to Telegram or Web Push.

Shared alert contact blocks use this order: NMS name, valid friend code, then Telegram username (Telegram only). New-request alerts show the requester block before destination/meeting details. Reply alerts show the responder block first, then the original requester block and the original trip details.

Only Taxi currently sends alerts. In **Administration → Taxi notifications**, admins can independently enable Discord, a Telegram group and Web Push, set the Telegram group chat ID (including its leading minus sign), and enable/disable reply alerts across all three channels. Channels default to disabled for existing and new installations. Save before sending a test; settings apply without a restart. In simple view the server enforces user permissions, so switch back to admin view to manage alerts.

- Set `DISCORD_TAXI_WEBHOOK_URL` to the dedicated Discord incoming webhook and `TELEGRAM_TAXI_BOT_TOKEN` to the dedicated Telegram bot token. Add the bot to the target group with permission to send messages. No Telegram webhook or public tunnel is needed for group alerts.
- Optionally set **Taxi Telegram topic ID** in Administration to route alerts and tests to a specific forum topic. Use the positive `message_thread_id` from a bot update for a message in that topic, separately from the negative group chat ID. Leave it empty for groups/channels without topics or to send without selecting a topic. Existing settings migrate to an empty topic ID without changing delivery.
- Set `AUTH_URL` to the canonical app authentication URL (`https://your-app.example/api/auth`, or `http://localhost:3000/api/auth` locally). Only its origin is used for notification detail links; localhost links work only on the development computer.
- Generate a VAPID pair once with `npx web-push generate-vapid-keys` and store it in `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`. Set `VAPID_SUBJECT` to a contact URI such as `mailto:admin@example.com`. Keep the private key secret and the pair stable. Credentials belong in `.env.local` or deployment variables, never in the admin UI or Git.
- Members open **My NMS Profile → Taxi browser notifications**, enable their personal preference and connect each browser explicitly. Permission and HTTPS (or localhost) are required. Multiple devices are supported (up to ten per member). On iPhone/iPad, add the app to the Home Screen first (iOS 16.4+). Browser/OS support determines background delivery; a force-quit browser may not receive alerts.
- Admin tests respect the saved switches. Web Push tests reach only the admin's approved, opted-in devices. Shared-channel tests send one message to the configured channel/group.

Settings, personal opt-outs and push subscriptions are stored separately in `data/taxi-notifications.json` locally or `alliance-manager/taxi-notifications.json` in private Blob storage. Missing documents default to disabled channels, enabled personal preferences and no devices; malformed documents raise errors. Public member APIs never include subscriptions.

New requests and replies schedule best-effort delivery with Next `after()` only after saving. Alerts contain the destination galaxy and a link to `/taxi/ID`, not message bodies. Discord and Telegram also include the original requester's current, valid friend code in `XXXX-XXXX-XXXXX` format, including on reply alerts (reply alerts also place the responder's NMS name and valid friend code at the top); missing or invalid codes are omitted. The code is visible to channel/group participants without app authentication. Web Push payloads never include friend codes. Web Push excludes the event author, offline/unapproved members and opted-out members; shared channels remain visible to their own Discord/Telegram membership. Archived/deleted threads are skipped when dispatch starts. Provider failures are logged without credentials and do not fail the saved request or stop other channels. Requests use timeouts; HTTP 429 and other failures are logged, not automatically retried. Expired push subscriptions (404/410) are removed. There is no durable queue or delivery guarantee. Writes are serialized within one process and local files are replaced atomically; cross-instance Blob read-modify-write races remain the existing limitation described by C-uu5uon in `CONCERNS.md`.

Help, personal Telegram messages and their account-linking webhook remain future work; their environment placeholders are not used.

Telegram Taxi alerts mention the original requester as `@username` when their profile's `telegramName` contains a valid standard username (optional leading `@`, 5–32 letters/digits/underscores, starting with a letter). Reply alerts place the responder's NMS name, valid friend code and Telegram mention at the top, while retaining the original requester's details and mention below. Missing/invalid usernames are omitted; links and display names are not interpreted as usernames. Profile usernames are self-reported, not verified Telegram associations. Actual mention notifications depend on Telegram settings. Discord and Web Push never include this mention.

Shared Taxi alerts include a station-detail link for station/hub meetings when a current station matches the saved meeting system and galaxy, using the same `portalSearchMatches` rule as the Taxi board (planet glyph differences are ignored). Links reuse `stationDetailHref(..., "taxi")`. Missing/deleted stations remain plain meeting text; Web Push does not include station links.

Shared alerts place the detail invitation immediately before the final link. Telegram uses HTML formatting with escaped dynamic text, a bold heading and a clickable "Vai al dettaglio Taxi" link; Discord keeps the visible URL. Development localhost links still require the development computer.

Discord and Telegram Taxi alerts also include the original request's saved meeting point, on both new requests and replies: Offline, arrange in replies, alliance hub, or station. Hub/station summaries include the saved portal address and meeting galaxy (which may differ from the destination); a station name is included when available. Legacy requests use their saved station or default to arrange in replies. Web Push remains a short summary without meeting details.

## User notifications

In **Administration → User notifications**, admins can enable a Telegram alert, with its own group chat ID and optional topic ID, for two events: a new account that registered and is waiting for approval, and a pending account that was just approved. Alerts are disabled by default, show only the NMS name (or the Google name before the profile is filled in) and, for approvals, the approver's name, never email addresses, and link to `/users`. Re-approving a blocked account and the auto-approved `ALLIANCE_ADMIN_EMAIL` account send nothing.

- Set `TELEGRAM_MEMBERS_BOT_TOKEN` to a Telegram bot token (it may be the same bot as Taxi) and add the bot to the target group with permission to send messages. `AUTH_URL` is required for the link, as for Taxi.
- Settings live in `data/member-notifications.json` locally or `alliance-manager/member-notifications.json` in private Blob storage; the token is never stored there.
- Delivery is best-effort through Next `after()`, scheduled only when alerts are enabled, and a failed alert never affects the registration or approval. Registration alerts are sent when the account is first created, so two simultaneous first requests (the store has no locking) could rarely produce a duplicate alert.

## System addresses

Every mission requires a full portal address of 12 hexadecimal glyphs (`0`-`F`) and a galaxy index (`0`-`255`). The interface shows the decoded `Planet / System / Y / Z / X` parameters and flags reserved or invalid values. The glyph PNGs are in `public/glyphs/` and come from [NMS Galactic Map](https://github.com/elegra1965-source/nms-galactic-map/tree/main/glyphs). They are No Man's Sky images, owned by their respective holders and not covered by the source repository's software license; this fan-made project is not affiliated with or endorsed by Hello Games.

Addresses are verified through the [NMS Almanac](https://nmsalmanac.com/api/docs) API, using the selected galaxy. A positive result confirms that the planet is present in the Almanac and fills `System/sector` with a descriptive label made of star, economy, conflict and race. The structured API provides planet data, a versioned English dictionary and a separate system endpoint; `src/lib/almanac-normalize.ts` converts them to the display format used throughout the app, including descriptions, discovery counts, resource names and image paths. Dictionary and system requests are shared. The full response and normalized display fields are kept in `data/almanac.json`, indexed by portal code and galaxy, or in the private Blob in production; later checks reuse the stored data. Legacy cached responses remain compatible, and structured responses cached before this update are adapted on read and persisted. If a versioned dictionary has expired (404), refresh the planet once to obtain its matching current dictionary, rather than decoding old phrase indexes with a different table. The `systemVerified` flag is saved on the mission and reset if the address or galaxy changes. A planet `404` means it is not catalogued, but it does not prove that it does not exist in the game, and it does not prevent saving. The service now advertises weekly quotas in `RateLimit` and `RateLimit-Policy` headers, rather than the former hourly allowance; `Retry-After` indicates when a rate-limited verification can be retried. Saving remains possible without verification when the service is unavailable.
