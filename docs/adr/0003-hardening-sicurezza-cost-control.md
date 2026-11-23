# ADR-0003: Hardening, Sicurezza, Cost-Control e Limiti di Scalabilità (~€0)

- **Stato:** Accettato & Implementato
- **Priorità:** P0 / P1 — Critica & Alta
- **Data:** 2026-11-22
- **Autori:** `Noobucodonosor`
- **Estende:** [ADR-0002](./0002-hub-vetrina-servizi-prescaricati-free-tier.md), [VISION.md](../../VISION.md)

---

## 1. Contesto e Problema

L'architettura di **Noobucodonosor** definita in [ADR-0002](./0002-hub-vetrina-servizi-prescaricati-free-tier.md) (Node.js 22 zero-dependency, Cloud Run scale-to-zero, pacchetto portabile `file://`) resta sostenibile a costo infrastrutturale **~€0**, ma la stretta ai free tier AI nel 2026 e l'analisi di sicurezza sul proxy e sul frontend evidenziano quattro vulnerabilità strutturali:

1. **Fragilità della catena di failover statica:**
   - I test indipendenti sui progetti gratuiti Google AI Studio mostrano che `gemini-3.8-flash` è sceso a ~20 richieste giornaliere (RPD), mentre `gemini-3.5-flash-lite` sostiene ~500 RPD.
   - Groq applica un tetto rigido di **8.000 TPM** (200.000 TPD, 30 RPM, 1.000 RPD): instradare lì in failover richieste lunghe (`kn5`, `ScooterLab`) causa errori `429` immediati.
   - Mistral ha sostituito "Experiment" con "Free mode" (tetti non pubblicati, ID datati necessari al posto di `-latest`, dati usati per training) e OpenRouter `:free` limita a 50 RPD base (1.000 RPD solo dopo acquisto una tantum di $10 di crediti).
   - Il credito Google Cloud Free Trial da $300 esclude i consumi Gemini API: la API key del proxy deve appartenere a un progetto GCP **senza billing account collegato**.
2. **Coerenza in RAM e assenza di hard cap su Cloud Run:**
   - Lo scale-out multi-istanza frammenta cache LRU, rate limiter e `DAILY_FREE_CAP`.
   - GCP non offre un hard cap automatico nativo di spesa.
3. **Bypass del rate limiter, cache-busting e payload abuse:**
   - `extractClientIp()` in `server/index.mjs` legge il primo IP a sinistra di `X-Forwarded-For` (facilmente falsificabile dal client).
   - `#cacheKey()` in `server/free-tier-router.mjs` non normalizza Unicode/spazi; il body limit attuale è 32 KB invece di 16 KB; la `Map` del rate limiter non ha un tetto massimo di chiavi.
4. **Compatibilità DOM e `file://`:**
   - `Element.prototype.setHTML()` è classificato *Limited availability* (assente su Safari stabile, presente con caveat su Chrome pre-153).
   - Il Binario B (`file://`, `Origin: null`) può subire blocchi CORS preflight `OPTIONS` o `SecurityError` su `sessionStorage`.

---

## 2. Decisione Architetturale

### 2.1 Router AI Orientato al Profilo del Payload (`server/free-tier-router.mjs`)
Sostituire la catena fissa con due profili di instradamento basati su tipologia di task e stima token (~4 char/token):

1. **`long-rag` (Q&A / sintesi medio-lunga: `kn5`, `ScooterLab`, `assistant`; input > 4.000 token):**
   `Gemini (gemini-3.5-flash-lite)` → `Gemini (gemini-3.8-flash)` → `OpenRouter (:free)` → `Mistral (mistral-small-2603)` → `Fallback Deterministico`
2. **`compact-json` (Estrazione strutturata su payload compatti: `leslie`, `resuscipack`; input ≤ 4.000 token, `max_tokens` ≤ 600):**
   `Groq (openai/gpt-oss-20b / qwen/qwen3.8-27b)` → `Gemini (gemini-3.5-flash-lite)` → `OpenRouter (:free)` → `Mistral (ministral-8b-2512)` → `Fallback Deterministico`

**Circuit breaker differenziato & igiene provider:**
- Ispezionare il body dei `429`: distinguere esaurimento **RPM/TPM** (transitorio → salto immediato + cooldown 60s) da esaurimento **RPD** (persistente → circuit breaker 15–60 min).
- Non ritentare errori `400`/`500` o JSON malformati sullo stesso provider Gemini (consumano quota comunque).
- Fissare model ID datati per Mistral (`ministral-8b-2512`, `mistral-small-2603`), escludendo `-latest` e `mistral-large-4`, con flag server-side opzionale per escludere Mistral se si vuole evitare il training sui prompt.

### 2.2 Hardening Cloud Run & Proxy Node.js 22 (`server/index.mjs`)
- **Single-instance coerente in RAM (Always Free `us-central1`):**
  Deploy con `--max-instances=1`, `--min-instances=0`, `--concurrency=20`, `--cpu=1`, `--memory=256Mi`, `--timeout=30s`, `--cpu-throttling`, `--allow-unauthenticated` (240.000 vCPU-s/mese = ~66,67h CPU attiva gratuita).
- **Kill-switch asincrono di fatturazione:**
  Cloud Billing Budget (soglia minima €0,01 / €1,00) → topic Pub/Sub → Cloud Run Function autenticata (`--no-allow-unauthenticated`) che scollega il billing account dal progetto. Resta un paracadute di ultima istanza (latenza di contabilizzazione ~10 min); la protezione real-time resta in Node.js.
- **Anti-spoofing `X-Forwarded-For`:**
  Leggere `X-Forwarded-For` **da destra verso sinistra**, scartando IP loopback, privati e link-local (`169.254.0.0/16`, `10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`, `fe80::/10`, `fc00::/7`) fino al primo IP pubblico valido; ignorare `Forwarded`.
- **Limiti stream, RAM e Prompt Injection:**
  - `readJsonBody`: interrompere con `req.destroy()` e `413 Payload Too Large` oltre **16.384 byte (16 KB)**.
  - Query utente max **2.000 caratteri**; `max_tokens` limitato a **600** (JSON) / **900** (sintesi).
  - Rate limiter per IP in `Map` con capacità massima **5.000 chiavi** (eviction LRU/FIFO + cleanup periodico).
  - Canonicalizzazione chiave cache SHA-256 con `normalize('NFKC')` + collapse spazi.
  - Payload client ristretto a `{ serviceId, presetId, userQuery }`, `serviceId` validato su `Set` immutabile, system prompt e dati iniettati solo lato server, `userQuery` isolata in `<user_query>...</user_query>`.

### 2.3 Sanitizzazione DOM & Compatibilità `file://` (`web/`, `scripts/build-bundles.mjs`)
- **DOM XSS / mXSS zero-dependency:**
  Primario Markdown-to-DOM con `document.createElement()` e `textContent`. Per HTML formattato, usare `setHTML()` **solo** se `typeof container.setHTML === 'function' && typeof Document.parseHTML === 'function'` (mai `<base>` in allowlist, mai `setHTMLUnsafe`), ripiegando su `DOMParser` + albero allowlist + `replaceChildren()` per Safari stabile e browser non allineati.
- **Binario B (`bundles/noobucodonosor-portable.html`) su `file://`:**
  - Key Vault ibrido: prefisso `noobucodonosor:v1:byok:${provider}`, `sessionStorage` sempre in `try/catch` con fallback automatico su `Map` in RAM (`ramVault`), più toggle esplicito "Solo in RAM".
  - Chiamate BYOK con `credentials: 'omit'` esplicito.
  - Su `TypeError` da `window.location.protocol === 'file:'`, mostrare diagnostica CORS `Origin: null` con comando `python3 -m http.server` e attivare subito il Fallback Deterministico Locale.
  - Smoke test `OPTIONS` in CI sui 4 provider.

### 2.4 UX Zero-Click, Trasparenza & Telemetria Privacy-First (`web/`)
- **Onboarding zero-click:** i 4 preset in `web/data/preloaded-services.json` si aprono istantaneamente da snapshot pre-calcolati/cache senza chiamate live "on mount".
- **Badge persistente a 3 livelli:** `PROXY FREE-TIER`, `BYOK · Chiave Locale Sessione`, `MOTORE DETERMINISTICO · Fallback Locale`.
- **Telemetria senza PII:** contatori anonimi aggregati in RAM (per `serviceId`, cache-hit ratio, failover, latenza mediana, esiti `200/429/fallback`) emessi come JSON su `stdout` per Cloud Logging, senza mai loggare prompt né IP grezzi.
- **CTA contestuali sotto l'output:** download diretto del bundle offline (per dati reali B2B/PII) e contatto di consulenza pre-compilato.

### 2.5 Motore Agnostico vs Configurazione Attiva (`showcase.config.json`)
- **Principio:** separare il **motore** (`server/`, `web/`, `scripts/build-bundles.mjs`, `.github/scripts/update-profile.mjs`) dalla **configurazione dei progetti** (i 7 casi d'uso di Noobucodonosor).
- **Continuità garantita per Noobucodonosor:** la configurazione attiva di default nel repo resta quella dei 7 progetti (`Basilico`, `MedioMeteo`, `Genova`, `Leslie`, `kn5`, `resuscipack`, `ScooterLab`), quindi il profilo GitHub, il portale Cloud Run e il bundle portabile continuano a funzionare out-of-the-box senza alcuna perdita funzionale.
- **Riusabilità per chi clona:** spostare `serviceId`, `systemPrompt`, profilo payload (`long-rag` / `compact-json`), preset e fallback dichiarativi in configurazione permette a chiunque cloni il repository di sostituire i progetti in un unico punto senza modificare il codice del motore.

---

## 3. Matrice dei Rischi

| ID | Asse | Rischio | Impatto | Mitigazione ADR-0003 |
| :--- | :--- | :--- | :--- | :--- |
| **R1** | API AI | Esaurimento `gemini-3.8-flash` (~20 RPD) e saturazione 8.000 TPM Groq | **Alto** | Routing per profilo (`long-rag` vs `compact-json`) + circuit breaker `RPM/TPM` vs `RPD` |
| **R2** | API AI | Training sui prompt nei free tier (Mistral, upstream OpenRouter, Gemini extra-SEE) | **Medio** | Dataset zero-PII/copyright, avviso UI su query libere, flag server per escludere Mistral |
| **R3** | Cloud Run | Superamento fascia gratuita ~€0 per scale-out o traffico | **Critico** | `--max-instances=1`, `--concurrency=20`, `--cpu-throttling` + Budget Alert Pub/Sub kill-switch |
| **R4** | Proxy | Bypass rate limiter via spoofing leftmost `X-Forwarded-For` | **Alto** | `extractClientIp()` right-to-left scartando IP interni/link-local |
| **R5** | Proxy | Cache-busting, OOM (256 MiB) e prompt injection | **Medio** | SHA-256 NFKC, body limit 16 KB (`413`), `Map` cap 5.000 IP, `serviceId` allowlist, `<user_query>` |
| **R6** | Binario B | Blocco preflight CORS `Origin: null` o `SecurityError` `sessionStorage` | **Alto** | `credentials: 'omit'`, Key Vault RAM fallback, guida `http.server` + test CI `OPTIONS` |
| **R7** | DOM | XSS / mXSS su Safari stabile (senza `setHTML()`) | **Critico** | Markdown-to-DOM `textContent` + check congiunto `setHTML`/`Document.parseHTML` + fallback `DOMParser` |

---

## 4. Onestà Architetturale: Limiti della Vetrina e Soglie per un'App Dedicata

Questa architettura **non trasforma la vetrina in un SaaS multi-utente illimitato**: serve a rendere provabili i 7 progetti in modalità dimostrativa/esplorativa a costo ~€0.

### Cosa può fornire interamente la vetrina
- **Progetti client-side / statici (`Basilico`, `MedioMeteo`, `Genova Civica & Cultura`):** fruibili al 100% senza limiti di proxy.
- **Modalità demo dei 4 progetti AI (`Leslie`, `kn5`, `resuscipack`, `ScooterLab`):** provabili istantaneamente sui preset e su query brevi (≤ 2.000 caratteri, payload ≤ 16 KB), oltre all'uso illimitato lato utente tramite **BYOK** o **Binario Portabile `bundles/`**.

### Cosa NON può fornire la vetrina (~€0)
- **Persistenza utente / multi-tenancy:** nessuna autenticazione, nessun database condiviso, nessuno storico salvato tra sessioni.
- **Elaborazioni pesanti o lunghe:** niente upload di file reali (`.slab` completi, PDF voluminosi, corpus aziendali > 16 KB) né job > 30s (timeout Cloud Run).
- **Privacy garantita sui free tier proxy:** i provider gratuiti extra-SEE o Mistral Free possono usare i prompt per training; dati B2B reali non vanno inviati al proxy pubblico.
- **SLA / disponibilità garantita:** con `--max-instances=1` e quote gratuite giornaliere, i picchi degradano intenzionalmente al Fallback Deterministico Locale.

### Soglie quantitative oltre le quali serve un'App Dedicata
È necessario passare a un'applicazione/backend dedicato (per singolo prodotto come `Leslie`, `kn5`, `resuscipack` o `ScooterLab`) quando si verifica **almeno una** di queste condizioni:
1. **Esaurimento sistematico delle quote gratuite:** traffico organico ricorrente > **400–500 richieste live uniche/giorno** su contesti lunghi (`gemini-3.5-flash-lite`) o > **1.000 richieste/giorno** su JSON compatti (Groq), con cache-hit insufficiente ad assorbire le query libere.
2. **Saturazione Always Free Cloud Run:** consumo CPU attiva prossimo a **66 ore/mese** (240.000 vCPU-s) o traffico egress > **1 GiB/mese** o concorrenza stabile > **20 richieste simultanee** (dove `--max-instances=1` inizia a generare code/latenza).
3. **Requisiti di prodotto reali:** necessità di login/account, salvataggio su DB persistente, upload di file reali > 16 KB, elaborazioni in background > 30s, oppure accordi di riservatezza/zero-retention B2B (API a pagamento).

---

## 5. Task Operativi Collegati

- [x] **TASK-HARDENING-01**: **Router AI per Profilo & Circuit Breaker (`server/free-tier-router.mjs`)**
  - *File coinvolti*: `server/free-tier-router.mjs`, `tests/free-tier-router.test.mjs`
  - *Acceptance Criteria*: Profili `long-rag` (`gemini-3.5-flash-lite` primario) e `compact-json` (Groq primario), ID datati Mistral, circuit breaker separato RPM/TPM (60s) vs RPD (15–60m), canonicalizzazione SHA-256 NFKC, isolamento `<user_query>`.
  - *Verification Step*: `node --test tests/free-tier-router.test.mjs`
- [x] **TASK-HARDENING-02**: **Hardening Proxy HTTP, IP Right-to-Left & Telemetria (`server/index.mjs`)**
  - *File coinvolti*: `server/index.mjs`, `tests/server-and-bundles.test.mjs`
  - *Acceptance Criteria*: `extractClientIp()` right-to-left, body limit 16 KB (`413`), query max 2.000 char, `Map` rate-limit max 5.000 IP, log JSON su `stdout` senza PII/IP grezzi.
  - *Verification Step*: `node --test tests/server-and-bundles.test.mjs`
- [x] **TASK-HARDENING-03**: **Deploy Cloud Run `--max-instances=1` & Isolamento Billing API**
  - *File coinvolti*: `Dockerfile`, `.github/workflows/update-profile.yml`, Cloud Run `noobucodonosor-hub` (`us-central1`).
  - *Acceptance Criteria*: Parametri `--max-instances=1 --min-instances=0 --concurrency=20 --cpu=1 --memory=256Mi --timeout=30s --cpu-throttling --allow-unauthenticated` e API key Gemini associata a progetto GCP privo di billing (`kn6-free-20260918`). *(Nota: il kill-switch Pub/Sub di scollegamento billing va applicato solo su un progetto Cloud Run isolato per non impattare servizi fratelli come `basilico` e `mediometeo`).*
  - *Verification Step*: Verifica `GET /api/health` e `POST /api/ai/complete` su `https://noobucodonosor-hub-664856461640.us-central1.run.app`.
- [x] **TASK-HARDENING-04**: **Sanitizzatore DOM Zero-Dependency (`web/app.js`, `scripts/build-bundles.mjs`)**
  - *File coinvolti*: `web/app.js`, `scripts/build-bundles.mjs`
  - *Acceptance Criteria*: Feature detection congiunta `setHTML && Document.parseHTML`, fallback DOM sicuro con `textContent`/`replaceChildren()`, nessun `<base>` o `setHTMLUnsafe`.
  - *Verification Step*: Test DOM/XSS e `node scripts/build-bundles.mjs && node --test tests/*.test.mjs`.
- [x] **TASK-HARDENING-05**: **Key Vault Ibrido & Diagnostica CORS `file://` (`web/ai-client.js`, `bundles/`)**
  - *File coinvolti*: `web/ai-client.js`, `scripts/build-bundles.mjs`
  - *Acceptance Criteria*: `try/catch` su `sessionStorage` con fallback `ramVault`, `credentials: 'omit'`, messaggio diagnostico `http.server` su blocco `Origin: null`.
  - *Verification Step*: `node --test tests/*.test.mjs` + verifica bundle `bundles/noobucodonosor-portable.html`.
- [x] **TASK-HARDENING-06**: **UX Zero-Click Preset & Badge 3 Livelli (`web/app.js`, `web/index.html`)**
  - *File coinvolti*: `web/app.js`, `web/index.html`, `web/styles.css`
  - *Acceptance Criteria*: Preset serviti da snapshot senza chiamate live on-mount, badge persistente del motore attivo.
  - *Verification Step*: Verifica funzionale su Cloud Run e locale.
- [x] **TASK-HARDENING-07**: **Estrazione Configurazione Agnostica (`showcase.config.json`) & Deep-Link `?app=`**
  - *File coinvolti*: `showcase.config.json`, `server/free-tier-router.mjs`, `web/app.js`, `web/ai-client.js`, `.github/scripts/update-profile.mjs`
  - *Acceptance Criteria*: Il motore legge progetti, prompt, profili (`long-rag`/`compact-json`) e deep-link `?app=` dalla configurazione; i 7 progetti di Noobucodonosor restano la configurazione attiva di default e tutti i test passano senza regressioni.
  - *Verification Step*: `node scripts/build-bundles.mjs && node --test tests/*.test.mjs`
- [x] **TASK-HARDENING-08**: **Estrattore URL Leggero Anti-SSRF per `kn5` (`server/url-ingestor.mjs`)**
  - *File coinvolti*: `server/url-ingestor.mjs`, `server/index.mjs`, `web/ai-client.js`, `web/app.js`, `tests/url-ingestor.test.mjs`
  - *Acceptance Criteria*: Blocco SSRF su IP privati/loopback/metadata GCP e DNS rebinding, stream cappato a 512 KB, estrazione YouTube (oEmbed + sottotitoli XML + descrizione) e articoli web pubblici, cache LRU URL, rate-limit per IP su `POST /api/kn5/extract` e supporto `?app=kn5&url=...`.
  - *Verification Step*: `NODE_ENV=test node --test tests/*.test.mjs`
