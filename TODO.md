---
title: TODO
description: Features and work that are still missing
---

# TODO

Things that are still missing. Remove an item once it is done.

## T-x4lihk: Complete the user guide

`src/app/guide/page.tsx` (the in-app guide) and `docs/manuale-utente.md` (the Italian user manual for the simple view).

- The "Pagina per pagina" section has only one-line descriptions for each page. Add examples and detail, like the Stazioni, Missioni and Pianeti sections have.
- Admin and moderator features are not covered: the Utenti page (approving, blocking and deleting accounts, changing roles), offline players, the Excel export of stations, alliance branding, and turning the simple view on or off.
- Keep the in-app guide and `docs/manuale-utente.md` consistent, in both Italian and English.

## T-e7flz1: Format the whole project with Prettier

Prettier is configured (`prettier.config.mjs`, `npm run format`), but only the newest files and `src/components/guide/` are formatted. About 100 other files still differ.

- Run `npm run format` once, in a separate commit that contains no other change.
- Add `npm run format:check` to the `CI` workflow, and then drop the "format only the files you edit" note from `AGENTS.md` and the README.
- Decide whether to also format the Markdown files and `src/styles/`, which are ignored now.
