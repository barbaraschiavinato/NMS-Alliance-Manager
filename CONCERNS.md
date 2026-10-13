---
title: Concerns
description: Things noticed during code changes that look wrong or risky and need a closer look
---

# Concerns

Things noticed during code changes that look wrong or risky and need a closer look. Remove an entry once it has been resolved or ruled out.

## C-uu5uon: Blob writes overwrite the whole document with no concurrency check (2026-10-11)

`src/lib/store.ts:153`, `src/lib/access-store.ts:116`, `src/lib/stations-store.ts:152`, `src/lib/private-messages-store.ts:165`, `src/lib/planet-system-status-store.ts:75`, `src/lib/almanac-store.ts:53`

Every store reads the full JSON, modifies it in memory and writes it back with `allowOverwrite: true`. Two concurrent requests (e.g. two members claiming missions at the same time) can lose one of the updates. Check whether the Blob SDK supports conditional writes (ETag / `ifMatch`) or whether a lock or retry is needed.

## C-kl5mdm: Migration on read writes during GET requests (2026-10-11)

`src/lib/store.ts:114`

`readMissions()` writes back to storage whenever legacy values are found. Plain reads therefore cause writes, and concurrent GETs can race with each other or with a real update (see C-uu5uon).

## C-b1h4i5: Missing missions blob falls back to demo seed data (2026-10-11)

`src/lib/store.ts:122`

If the Blob `get` returns nothing (or a 304), `readMissions()` returns `initialMissions` from `seed.ts`. In production, a missing or misconfigured blob would show demo missions instead of an error. The next write would then persist the seed data. Check that this is intended.

## C-qto0bo: Docs disagree on accepted mission address formats (2026-10-11)

`.github/copilot-instructions.md:5` vs `README.md` ("Indirizzi dei sistemi")

The Copilot instructions allow either an 8-glyph system code or a 12-glyph portal address. The README only mentions the 12-glyph portal address plus a galaxy index. Check what `isMissionInput` in `src/lib/missions.ts` actually accepts and align the docs.

## C-1yjcy9: Missions for "Explorers and Builders" are read back as "all" (2026-10-12)

`src/lib/store.ts:112`

`migrateMissions()` only keeps `builder`, `ranger`, `explorer`, `other` and `all` as `targetSpecialty` and turns every other value into `all`. `explorer_builder` is a valid specialty (`missionSpecialties` in `src/lib/missions.ts`, and `isMissionInput` accepts it), so a mission created for Explorers and Builders is saved correctly but read back as `all`, which changes who can see and take it. Check whether this is intended; if not, add `explorer_builder` to the accepted values. As a side effect, the `explorer_builder` branch in `src/app/api/missions/[id]/claim/route.ts` is unreachable.

## C-qb2awt: Local file stores write directly, so concurrent requests can corrupt the file (2026-10-12)

`src/lib/store.ts:175`, `src/lib/stations-store.ts:188`, `src/lib/private-messages-store.ts:189`, `src/lib/planet-system-status-store.ts:83`

With the local backend (`data/`) these stores call `writeFile(localPath, ...)` directly. Two overlapping writes can leave a file with leftover text after the closing brace, and every later read then fails with `SyntaxError: Unexpected non-whitespace character after JSON`. This already happened to `almanac.json` when many planet thumbnails were requested at once; `almanac-store.ts` now writes a temporary file and renames it, and runs its read-modify-write cycles one at a time, and `access-store.ts` already writes through a temporary file. Apply the same to the other four (a shared helper in `src/lib/` would avoid repeating it). It is a local-development problem; production uses Blob (see C-uu5uon).

## C-rd3po4: Path traversal in the alliance image route exposes private data (2026-10-11)

`src/app/api/alliance/image/route.ts:10`

The only check on `path` is `startsWith("alliance-manager/branding/")`. `@vercel/blob`'s `get()` builds `https://<store>.private.blob.vercel-storage.com/${path}` and passes it through `new URL()`, which resolves `..`. So `?path=alliance-manager/branding/../access.json` returns `alliance-manager/access.json` (every member's email and role) to any approved member, and the same works for `private-messages.json`. It only affects deployments with a Blob store, i.e. production. `login-logo/route.ts:26` already validates with a strict regex; use the same approach here. Test placeholder: `it.todo` in `tests/api/alliance/image.test.ts`.

## C-1tpyag: Shared default access data is mutated by callers (2026-10-11)

`src/lib/access-store.ts:43` (returned at lines 58, 146 and 159), `src/lib/store.ts:137`, `:144`

When the file or blob is missing (or Blob returns 304, or the payload is not an object), `readAccessData()` returns the module-level `defaultData` object itself, not a copy. `registerMember`, `updateAllianceSettings` and the others then mutate it, so in a long-lived process a later missing read brings back stale members and settings and writes them to storage. `readMissions()` returns the shared `initialMissions` array the same way (harmless while it is empty).

## C-txcf5e: Private messages become unreadable after migrating an unknown legacy email (2026-10-11)

`src/lib/private-messages-store.ts:96-112`

If a legacy `senderEmail` or `recipientEmail` matches no member (e.g. a deleted member), the migration drops the email without setting a member ID and writes the record back. The next read rejects it in `parseMessages` (lines 50-51; a missing recipient is tolerated only for `help` messages) with "Invalid private message in storage.", and every later read of the messages store throws. Test placeholder: `it.todo` in `tests/stores/private-messages-store.test.ts`.

## C-20ei47: Moderator mission edit can erase the station owner (2026-10-11)

`src/app/api/missions/[id]/route.ts:66-70`, `:81-82`

If the submitted owner is unchanged but no longer owns the station, the edit is accepted and `stationOwnerMemberId: stationOwner?.publicId` stores `undefined` (and so does `stationOwnerName`). The assignee path has a `?? assignedMemberId` fallback (line 85) that keeps the old value; the owner path doesn't. Test placeholder: `it.todo` in `tests/api/missions/id.test.ts`.

## C-5s39iw: Rangers can create duplicate missions for a specialty (2026-10-11)

`src/app/api/missions/route.ts:82-87` (Ranger branch at `:57-69`)

The "specialty already covered" 409 check only runs for Explorer/Builder creators and follow-ups. A Ranger can create an Explorer, Builder or Explorer-and-Builder mission for their own station even if one already exists for that system. Test placeholder: `it.todo` in `tests/api/missions/route.test.ts`.

## C-3e3oqx: Station available specialties ignore combined mission specialties (2026-10-11)

`src/app/api/stations/route.ts:322-338`

`availableSpecialties` adds `mission.targetSpecialty` as-is instead of expanding it with `coveredSpecialties()`. A station with an `explorer_builder` mission still offers Builder and Explorer, which `specialtyAlreadyCovered` then rejects. Hidden today because reads turn `explorer_builder` into `all` (C-1yjcy9) and POST splits it into two missions; it shows up once C-1yjcy9 is fixed. Test placeholder: `it.todo` in `tests/api/stations/route.test.ts`.

## C-ed61fh: Prototype keys leak out of lookup maps (2026-10-11)

`src/lib/missions.ts:30`, `:36`, `src/lib/planet-system-status.ts:59`, `src/lib/translations.ts:61`

The legacy lookup maps are plain objects, so `normalizeMissionStatus("toString")`, `normalizeMissionPriority("constructor")`, `normalizeMissionSystemStatus("constructor")` and `translate("en", "constructor")` return a function instead of `null` / the fallback string (and `translate` with `values` throws a TypeError at `translated.replace`). `translateAlmanacValue` already guards with `Object.hasOwn`. Test placeholders: `it.todo` in `tests/lib/missions.test.ts`, `planet-system-status.test.ts`, `translations.test.ts`.

## C-fwcsl5: Locale provider crashes when localStorage throws (2026-10-11)

`src/components/providers/locale-provider.tsx:28`, `:45`

`currentBrowserLocale` reads `localStorage` without try/catch, and runs even when `fixedLocale` is set; `setLocale` writes it unguarded too. If storage access throws (blocked site data, some private modes) the whole app tree crashes. `readPlanetCount` in the sidebar already guards this.

## C-xklfgl: Message sent confirmation in the member dialog is unreachable (2026-10-11)

`src/components/modals/member-card-dialog.tsx:55`, `:211-226`

`messageSent` is never set to `true`, so the "message sent / back to profile" view never renders; after a successful send the dialog just closes.

## C-701dwd: Untranslated user-facing strings (2026-10-11)

- English-only: `"Mission started."` (`src/components/pages/mission-dashboard.tsx:284`), `"Mission reopened."` (`:296`) and `"Link failed."` (`src/components/pages/offline-players-page.tsx:104`) go through `t()` but have no catalog entry. `"Former member"` (`src/components/cards/station-card/parts.tsx:133`, also produced by `src/lib/store.ts`, `src/lib/mission-view.ts`, `src/app/api/stations/route.ts:343`, `src/app/api/messages/route.ts:57`, `:59` and `src/app/api/help-requests/route.ts:32`) is never translated.
- Italian-only: `" · opzionale"` is hard-coded in `src/components/modals/member-profile-panel.tsx:155`; the `profile.optional` key already exists and is used at `:171` and `:183`.

## C-vc754i: System index 000 crashes nms-core planet generation (2026-10-11)

`src/lib/planet-addresses.ts:6`

`decodePortalAddress` accepts system index 0, but `planetSeeds(BigInt("0x0000FF001001"), 0)` in the vendored `nms-core` throws "Cannot mix BigInt and other types", so `getSystemPlanetAddresses` throws for such addresses.

## C-hhldfs: AGENTS.md describes translation keys incorrectly (2026-10-11)

`AGENTS.md` ("i18n")

It says canonical keys are English strings, but every catalog key is now a dotted id (`common.all`, `missions.create_ranger_mission`, ...); English values shared by several ids ("All", "Completed", ...) make legacy string lookups ambiguous (last id wins, e.g. `translate("it", "All")` gives "Tutte"). Some keys also sit in the wrong namespace (`missions.create_*_mission` in `common`).

## C-ehkvo3: Minor dead code and incomplete migration found while writing tests (2026-10-11)

- `src/lib/store.ts:41-46`: the legacy `systemStatus` migration doesn't set `hasLegacyValues`, so `missions.json` keeps the field and it is re-scanned on every read.
- `src/lib/missions.ts:161-162`: `rawZ === null` / `rawX === null` can never be true.
- `src/lib/almanac-lookup.ts:59`: `!results.has(key)` is always true in that branch.
- `src/app/api/missions/[id]/planet-notes/route.ts:27-31`: choosing among several stations can't happen, since the station list keeps one station per portal and galaxy.
- `src/lib/access-store.ts:203-220`: `registerMember` drops `offline: true` when rewriting a member not seen in 15 minutes (not exploitable today, since nobody can log in as an offline email).

## C-uytlgm: A station cannot be added from a mission (2026-10-12)

`src/components/pages/stations-page.tsx:91-93`, `:705-717`

When the page opens with `initialCreateStation` (adding the station of a mission), `validation` starts as `{ valid: true, lookup: null }` and the address field is hidden (`!creatingFromMission`, `:613`, `:634`), so nothing ever updates it. The submit button is disabled while `!editingStation && validation.valid && !validation.lookup`, so it stays disabled with a spinner and the station can never be saved. `tests/pages/stations-page-names.test.tsx` documents the current behaviour.

## C-a515pe: Header's `onProfileSaved` callback is never called (2026-10-12)

`src/components/layout/header.tsx:18`, `:25`, `:91`

`Header` only checks whether `onProfileSaved` is passed (to show the simple-view toggle) and never calls it; the toggle reloads or redirects instead. Every page still passes a callback (`stations-page.tsx:527`, `mission-dashboard.tsx:430`, `planets-page.tsx:229`, `offline-players-page.tsx:153`, `help-requests-page.tsx:174`, `messages-page.tsx:349`, `members-page.tsx:139`, `leaderboard-page.tsx:72`, `guide-app-page.tsx:48`), which is dead code and the main gap left in test coverage. Replace the prop with a boolean, or call it.

## C-5rjw6s: Unreachable defensive branches left out of test coverage (2026-10-12)

These branches can't be reached with the current types and call sites, so they are the rest of what keeps coverage below 100% (besides C-uytlgm, C-a515pe, C-xklfgl and the `missions.ts:161-162` item of C-ehkvo3). Remove them, or keep them knowingly.

- `src/components/pages/stations-page.tsx:231`: `?? ""` after `cachedPlanetTitle()`, which always returns a string. `:303`: the `savingStatusKeys` guard, since the checkbox is disabled while saving. `:579`: `note ?? ""`, since the button renders only when `station.note` is set. `:781`, `:793`, `:795`: fallbacks for a mission form whose station has left the list. `:807`: `onDelete` with `mission={null}`.
- `src/components/pages/mission-dashboard.tsx:334`: `member.specialty ?? ""` (never nullish). `:368`: `if (!target) return;`, recomputed from the same state that rendered the button.
- `src/components/pages/messages-page.tsx:246`: the no-delete-button case needs a non-admin viewing someone else's message, which no tab shows.
- `src/components/cards/mission-card/extended.tsx:91`, `:96`, `simple.tsx:92`, `:96`, `parts.tsx:518`: `mission.systemAddress ?? ""` on a required string. `simple.tsx:53`: `|| !canManage`, always short-circuited in the simple view.
- `src/components/cards/member-card.tsx:234`, `:244`: `member.nmsName || member.name` inside a `member.nmsName &&` guard.
- `src/components/cards/station-card/parts.tsx:147`: `|| "—"` after `stationOwnerName()`, which is never empty.
- `src/components/shared/mission-system-progress.tsx:48`: `editable && !itemEditable`, already excluded by the role filter at `:43`.
- `src/app/leaderboard/page.tsx:93`: `?? 0` after a `counts.has()` filter. `src/app/api/messages/route.ts:84`: `?? ""` after `params.has("recipientId")`. `src/app/api/stations/export/route.ts:53`: `codePointAt(0) ?? 0` on a non-empty character. `src/lib/private-messages-store.ts:101`: the `undefined` side, already rejected by `parseMessages`.

`src/lib/access-store.ts:280` also shows as uncovered in the full-suite report although `tests/stores/access-store.test.ts` runs it; it is 100% when that file is measured alone (a V8 coverage merge artefact).
