# NMS Alliance Manager

- App Next.js App Router in TypeScript; interfaccia e testi rivolti all'utente sono in italiano.
- Il modello delle missioni è definito in `src/lib/missions.ts`; gli esempi iniziali sono in `src/lib/seed.ts`.
- Ogni missione deve avere un codice sistema di 8 glifi oppure un indirizzo portale di 12 glifi esadecimali validato e un indice galattico 0-255; i glifi sono in `public/glyphs/`.
- Ogni membro ha ruolo server-side, nome in gioco, codice amico NMS alfanumerico di 13 caratteri (i trattini sono ignorati), una o più piattaforme e specializzazione Costruttore/Ranger/Esploratore. Il profilo è modificabile solo dal proprietario; i ruoli solo dall'admin.
- I nuovi account sono `pending` per default; solo moderatori/admin li possono approvare. Tutti gli endpoint operativi richiedono `membershipStatus: approved`.
- Le Route Handlers API leggono e scrivono JSON tramite `src/lib/store.ts`: locale in `data/missions.json`, produzione su Vercel Blob privato.
- Non usare il filesystem locale per la persistenza in produzione e non esporre né committare token o dati runtime.
- Verifica le modifiche con `npm run lint` e `npm run build`.