# ADR-0004: Split Statico/Dinamico (GitHub Pages + Cloud Run), Isolamento AI Gateway e Posizionamento Profilo

- **Stato:** Accettato
- **Data:** 2026-11-23
- **Decisori:** `Noobucodonosor`
- **Formato:** MADR 4.0.0
- **ADR correlati:** [ADR-0001](./0001-profilo-vetrina-github.md), [ADR-0002](./0002-hub-vetrina-servizi-prescaricati-free-tier.md), [ADR-0003](./0003-hardening-sicurezza-cost-control.md)

---

## Context and Problem Statement

Dopo l'implementazione di ADR-0001, ADR-0002 e ADR-0003, il repository `Noobucodonosor/Noobucodonosor` svolge quattro ruoli sovrapposti nello stesso runtime:
1. Profilo GitHub vetrina (`README.md` + HUD SVG).
2. Frontend statico dell'Hub web (`web/`).
3. Proxy AI multi-provider free-tier (`server/`).
4. Generatore del bundle offline portabile (`bundles/noobucodonosor-portable.html`).

Servire `web/` direttamente dal container Cloud Run (`min-instances=0`) introduce cold-start di 1–3 secondi sulla navigazione iniziale dell'Hub, mentre tenere `min-instances=1` supera il credito mensile del free tier Cloud Run ($6,02/mese equivalenti Tier 1). Inoltre, un audit tecnico pre-congelamento ha evidenziato quattro rischi critici:
1. **CORS non protegge da abusi non-browser:** `curl` e bot possono falsificare `Origin`, erodendo le quote LLM e forzando lo scaling di Cloud Run.
2. **Limiti header HTTP su GitHub Pages:** cache fissa `max-age=600`, nessun header `Content-Security-Policy` o `Permissions-Policy` custom (solo `<meta>` CSP, che ignora `frame-ancestors`).
3. **Storage Partitioning cross-browser sugli `<iframe>`:** `localStorage`/IndexedDB sono partizionati su Chrome/Firefox/Safari e Safari ITP cancella lo storage script-writable dopo 7 giorni; la Storage Access API non-cookie è limitata a Chrome desktop.
4. **Vincoli `file://` e matrice CORS BYOK frammentata:** `Origin: null` blocca `<script type="module">` e Service Worker; Safari blocca `localStorage` su `file://`; endpoint diretti OpenAI `/v1/responses` e Gemini OpenAI-compat presentano incompatibilità CORS verificate dal browser, mentre OpenRouter, Groq, Anthropic (`anthropic-dangerous-direct-browser-access: true`) e Ollama locale funzionano stabilmente.

## Decision Drivers

- **Costo infrastrutturale ~€0 verificabile:** rimanere integralmente nel free tier Cloud Run (request-based Tier 1, `min-instances=0`) con tetti rigidi di spesa e protezione anti-abuso reale.
- **Zero latenza di navigazione:** servire l'interfaccia statica dell'Hub da CDN (GitHub Pages / Fastly) e riscaldare il gateway AI solo su richiesta (`GET /health` semplice senza preflight).
- **Basso attrito operativo per sviluppatore singolo:** evitare il sovraccarico di versioning multi-repo prematuro, ma isolare il motore AI in un modulo zero-brand estraibile al primo incarico consulenziale.
- **Affidabilità cross-browser:** eliminare dipendenze fragili da `<iframe>` stateful e rendere l'Offline Kit resiliente su `file://` (Safari/Firefox/Chrome).
- **Chiarezza di posizionamento GitHub:** ridurre il `README.md` di profilo a una plancia essenziale orientata ai 7 prodotti reali (con disambiguazione di `scooterlab` rispetto a UTSA ScooterLab).

## Considered Options

1. **Stato attuale (4 mestieri in 1 su Cloud Run):** mantiene cold-start sulla navigazione e accoppiamento fra brand e gateway AI.
2. **Opzione 1 pura (Pages + Cloud Run + `<iframe>` primari):** elimina il cold-start UI ma resta fragile su Storage Partitioning e priva di difese anti-bot reali oltre CORS.
3. **Opzione 2 immediata (Split subito in 2 repo core + 7 satelliti):** massima pulizia white-label ma introduce costi immediati di sincronizzazione contratti e CI per uno sviluppatore singolo.
4. **Opzione 3 (Indice puro nel README, zero Hub UI):** attrito minimo ma nasconde i 4 playground AI prescaricati.
5. **Opzione Raccomandata — Ibrida 1→2 Hardened (Scelta):** split statico/dinamico nel repo unico, isolamento zero-brand in `packages/ai-gateway/`, difesa a 3 livelli (GCP Spend Cap + `--max-instances=2` + ALTCHA self-hosted), zero `<iframe>` primari, Offline Kit declassato a GitHub Releases / sezione secondaria.

## Decision Outcome

Scelta l'architettura **Ibrida 1→2 Hardened** con le quattro decisioni bloccate:

| # | Area | Decisione Bloccata | Dettaglio |
| :--- | :--- | :--- | :--- |
| **1** | **Funzione primaria Hub Web** | **1A — Vetrina interattiva esterna** | Link diretti ai 7 prodotti (`embedPolicy: "link-only"` in `showcase.config.json`) + 4 playground AI on-demand con pre-warming silenzioso `GET /health`; nessun `<iframe>` primario. |
| **2** | **Orizzonte consulenziale motore AI** | **2A — Confine netto pronto allo split (Ibrida 1→2)** | Isolamento zero-brand in `packages/ai-gateway/` (`free-tier-router.mjs`, `approval-gate.mjs`, `url-ingestor.mjs`, `altcha.mjs`, `server.mjs`, `package.json`, `Dockerfile`, test dedicati) senza riferimenti hardcodati al brand. Trigger di estrazione in Opzione 2 (`git subtree split --prefix=packages/ai-gateway`): **primo cliente pagante** o **prima richiesta di accesso esterno al gateway**. |
| **3** | **Ruolo di `noobucodonosor-portable.html`** | **3A — Offline / Data-Sovereignty Kit** | Declassato a deliverable secondario / GitHub Releases. Build single-file IIFE (no `type="module"`), wrapper `try/catch` su storage con fallback RAM + export/import JSON, default BYOK su provider CORS-compatibili (**OpenRouter**, **Groq**, **Anthropic**, **Ollama locale**) + fallback deterministico offline. |
| **4** | **Identità del dominio Hub** | **4A — `noobucodonosor.github.io` ora** | Zero costi DNS/TLS ora; `hubBaseUrl` punta a `https://noobucodonosor.github.io/Noobucodonosor/` (o `https://noobucodonosor.github.io/`) per la UI statica e `gatewayBaseUrl` punta a Cloud Run (`https://noobucodonosor-hub-664856461640.us-central1.run.app`) per le sole API AI. |

### Difesa a Tre Livelli sul Gateway AI (`packages/ai-gateway/`)

1. **Livello 1 — Hard Spend Cap (GCP):** Budget Spend Cap mensile via Cloud Billing Budget API su Cloud Run (`EXCLUDE_ALL_CREDITS`, soglia all'80–90% del tetto desiderato, es. $1–$5/mese) + alert Pub/Sub sul network egress.
2. **Livello 2 — Quote, Concurrency & Rate Limit:** Cloud Run Node.js 22 con `1 vCPU` (minimo richiesto da Cloud Run per `concurrency > 1`), `256 MiB`, `--min-instances=0`, `--max-instances=2`, `--concurrency=40`, `--cpu-boost`, `NODE_COMPILE_CACHE` pre-riscaldata nel Dockerfile e rate limiter per IP/sessione + daily global cap.
3. **Livello 3 — Anti-Bot & CORS Hardening:**
   - Middleware CORS con **allowlist esatta** (`ALLOWED_ORIGINS`, mai `*` o `null` in produzione), `Vary: Origin` e `Access-Control-Max-Age: 7200` su `OPTIONS`.
   - Verifica Proof-of-Work **ALTCHA self-hosted** (SHA-256 HMAC zero-dependency in `packages/ai-gateway/src/altcha.mjs`, `GET /api/altcha/challenge`, header `X-Altcha-Payload` opzionale/attivabile via `ALTCHA_ENABLED=1`) per neutralizzare `curl`/bot senza cookie né terze parti USA.

### Pipeline CI/CD Disaccoppiate (Keyless WIF)

- `.github/workflows/deploy-pages.yml`: filtrato su `web/**` e `showcase.config.json`, pubblica la vetrina statica su GitHub Pages.
- `.github/workflows/deploy-gateway.yml`: filtrato su `packages/ai-gateway/**`, esegue i test del gateway, autentica su GCP tramite **Workload Identity Federation (OIDC)** con `attribute-condition` vincolata a repo + branch `main` (zero chiavi JSON statiche) e distribuisce su Cloud Run.

## Consequences

### Positive
- Navigazione della vetrina e dei 7 prodotti istantanea via CDN Fastly (zero cold-start).
- ~10.700–14.600 sessioni AI complete/mese nel free tier Cloud Run (`min-instances=0` + pre-warm `GET /health` + finestra warm ~15 min).
- Motore AI completamente disaccoppiato dal brand `Noobucodonosor`, testabile e distribuibile come package indipendente (`packages/ai-gateway/`).
- Protezione reale da abusi `curl`/bot e da sorprese di fatturazione.
- Bundle portabile `file://` affidabile su Chrome, Firefox e Safari senza errori CORS sui provider BYOK principali.

### Negative / Trade-offs
- GitHub Pages impone `Cache-Control: max-age=600` e non consente header HTTP custom (mitigato con `<meta http-equiv="Content-Security-Policy">` come primo tag in `<head>`).
- Il rate limiter in memoria si azzera allo scale-to-zero (accettabile con `--max-instances=2` e Budget Spend Cap GCP).
- La verifica ALTCHA introduce un breve calcolo PoW client-side (~50–150 ms) quando `ALTCHA_ENABLED=1`.

## Confirmation

L'implementazione di ADR-0004 è considerata confermata quando:
- `packages/ai-gateway/` supera la propria suite `node --test` con 0 riferimenti hardcodati al brand `Noobucodonosor` o a `showcase.config.json`.
- `node --test tests/*.test.mjs` supera tutti i test esistenti e nuovi (CORS allowlist + `Vary: Origin` + `Access-Control-Max-Age: 7200`, `GET /health`, ALTCHA PoW challenge/verify, Offline Kit IIFE + BYOK OpenRouter/Groq/Anthropic/Ollama).
- `showcase.config.json` espone `gatewayBaseUrl`, `embedPolicy: "link-only"` su tutti i 7 prodotti e la disambiguazione descrittiva di `scooterlab`.
- `.github/workflows/deploy-pages.yml` e `.github/workflows/deploy-gateway.yml` sono presenti con `paths:` filter e autenticazione OIDC WIF.
- `README.md` è compatto (orientato ai 7 prodotti reali + link alla plancia GitHub Pages + rimando secondario all'Offline Kit).

---

## Backlog Operativo (ADR-0004)

- [x] **TASK-SPLIT-01:** Redazione ADR-0004 (MADR 4.0.0) e aggiornamento indice `docs/adr/README.md`
- [x] **TASK-SPLIT-02:** Isolamento zero-brand in `packages/ai-gateway/` (router, approval-gate, url-ingestor, ALTCHA self-hosted, CORS allowlist, `GET /health`, Dockerfile Node 22 + `NODE_COMPILE_CACHE`)
- [x] **TASK-SPLIT-03:** Pipeline CI/CD disaccoppiate (`deploy-pages.yml` + `deploy-gateway.yml` con WIF) e documentazione GCP Budget Spend Cap
- [x] **TASK-SPLIT-04:** Aggiornamento `showcase.config.json` (`embedPolicy`, `gatewayBaseUrl`, disambiguazione `scooterlab`), `README.md` 1-schermata e `.github/scripts/update-profile.mjs`
- [x] **TASK-SPLIT-05:** Aggiornamento `web/` (CSP `<meta>`, pre-warming `GET /health` sui tab AI, routing API su `gatewayBaseUrl`, supporto ALTCHA PoW, BYOK CORS-compatibile)
- [x] **TASK-SPLIT-06:** Aggiornamento Offline Kit (`scripts/build-bundles.mjs` + `bundles/noobucodonosor-portable.html` IIFE, `try/catch` storage + export/import JSON, default OpenRouter/Groq/Anthropic/Ollama)
