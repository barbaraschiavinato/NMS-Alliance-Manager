---
title: NMS Alliance Manager
description: Project instructions for Copilot
---

# NMS Alliance Manager

**`AGENTS.md` at the repository root is the source of truth for this project. Read and follow it before making any change.** This file only repeats the rules that must never be missed.

- Next.js 16 App Router, React 19, TypeScript. This Next.js version differs from older ones: check `node_modules/next/dist/docs/` before writing code.
- Code, comments, tests, commit messages and developer docs are in English. Only user-facing text (UI strings, `docs/manuale-utente.md`) is Italian.
- There is no database: each domain has a `*-store.ts` in its `src/lib/` folder that reads and writes a JSON document (local `data/`, private Vercel Blob in production). Never persist to the local filesystem in production, and never commit tokens, `.env*` files or runtime data.
- When a stored shape changes, add a migration on read in the matching store.
- Every API route checks session, approved membership and role itself. Simple view downgrades staff to user-level permissions on the server too.
- Minimize calls to the external NMS Almanac API (limited, shared weekly quota): reuse cached data, deduplicate lookups and respect the rate-limit pause.
- Telegram member notifications must never contain email addresses.
- Reuse the shared components (`Tabs`, `Pagination`, `Toast`, `DetailSection`, `MessageCard`) instead of writing copies.
- Tests live in `tests/`, mirroring the source. Verify changes with `npm test`, `npm run lint` and `npm run build`.
- If a request conflicts with a documented domain rule, explain the conflict and ask for confirmation first.
