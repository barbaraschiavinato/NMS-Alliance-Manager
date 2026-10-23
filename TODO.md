---
title: TODO
description: Features and work that are still missing
---

# TODO

Things that are still missing. Remove an item once it is done.

## T-cik3i5: Extend alerts to help requests and private messages

Agreed scope (2026-10-22). Taxi is implemented with separate Discord/Telegram credentials, admin settings and tests, and per-member, multi-device Web Push preferences. Extend the same notification infrastructure to the remaining services:

1. Shared Discord channel and Telegram group alerts for new help requests and their replies, using dedicated help credentials separate from taxi. Destinations may be the same or different channels/groups. Never send private-message alerts to shared channels.
2. Personal Telegram alerts through a third, dedicated messages bot for private messages and replies, addressed only to the recipient. Do not send help or taxi alerts to personal Telegram chats. Link each member only to the messages bot using an expiring, single-use code generated in their profile and sent through `/start`.
3. Extend existing Taxi Web Push to private messages (recipient only) and help requests, including when the app is closed on supported platforms. Reuse multi-device support and expired-subscription cleanup.

- Exclude the event author from personal notifications and restrict recipients to approved members.
- In **My NMS Profile**, provide separate Web Push preferences for messages, help and taxi, plus one personal Telegram preference for private messages. Preferences default to enabled once the corresponding channel is connected; browser push requires explicit permission.
- Keep `DISCORD_HELP_WEBHOOK_URL`, `DISCORD_TAXI_WEBHOOK_URL`, `TELEGRAM_HELP_BOT_TOKEN`, `TELEGRAM_TAXI_BOT_TOKEN`, `TELEGRAM_MESSAGES_BOT_TOKEN`, `TELEGRAM_MESSAGES_WEBHOOK_SECRET` and Web Push VAPID key pair/contact in environment variables. Document setup in `.env.example` and developer documentation. Never expose these credentials in the administration UI.
- The existing verified local Discord webhook and Telegram bot are assigned to taxi; help and personal messages require separate credentials.
- Extend the existing admin-only Taxi notification section with persisted per-service Discord and Telegram switches (disabled by default), shared-channel reply preferences and a separate Telegram group chat ID for help. Changes must not require a restart or deploy. Personal Telegram remains limited to private messages.
- Show configuration readiness without secrets and provide an admin-only test-notification action respecting the channel switches. Validate group chat IDs, enforce admin authorization server-side, and persist settings privately using the existing local/Blob backend with migration defaults for existing installations.
- Enforce the administrative switches server-side even when credentials exist. Report missing required configuration when an enabled channel is used, and test authorization, migration defaults and that disabled providers make no external calls. Keep personal member preferences separate from alliance-wide settings.
- Use a shared event dispatcher with independent channel providers. Save the message/request before dispatching; provider failures must be logged without failing an already-saved operation or preventing other channels from being attempted. Define rate-limit handling and document best-effort delivery; durable queues, guaranteed retries and digests are outside the initial scope.
- Include a brief summary and a link to the existing detail page, reusing `src/lib/navigation/detail-links.ts`. Do not expose full message bodies in shared channels.
- Persist notification preferences, Telegram chat associations and per-device push subscriptions privately, with migrations for existing members. Never expose credentials or subscription details through public member APIs. Protect the Telegram webhook and account-linking flow.
- Add matching tests, update the Italian user manual and relevant in-app guidance, and validate with tests, lint and build. Mission and station alerts are outside this scope.

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
