# ADR-0002: Hub Vetrina Web, Servizi Prescaricati con Pool API Free-Tier e Pacchetti Locali Separati

- **Stato:** Accettato
- **Priorità:** P1 — Alta
- **Data:** 2026-11-22
- **Autori:** Dany (`Noobucodonosor`)
- **Fonti:** `README.md`, `AGENTS.md`, `docs/adr/0001-profilo-vetrina-github.md`, repository fratelli (`basilico`, `mediometeo`, `genova-settimana`, `leslie-agency-os`, `kn5`, `resuscipack`, `scooterlab`)

---

## 1. Contesto e Problema

Il profilo GitHub `Noobucodonosor/Noobucodonosor` (ADR-0001) espone una vetrina statica in `README.md` con 7 progetti:
- 3 sono già fruibili online (`Basilico`, `MedioMeteo`, `Genova Civica & Cultura`).
- 4 (`Leslie — Agency OS`, `kn5 — Knowledge Ingestor`, `resuscipack`, `ScooterLab`) sono oggi solo schede o anteprime read-only su GitHub Pages perché i loro flussi AI richiedono chiavi API, backend dedicati o corpus locali non esponibili direttamente.

**Obiettivo:** rendere vera la visione di una **vetrina interattiva a costo infrastrutturale ~€0** che permetta a chiunque di provare subito i progetti tramite due binari **nettamente separati**:
1. **Binario Web Live (Ibrido):** portale web con **servizi prescaricati** (dataset/snapshot dimostrativi autentici, privi di PII o testi protetti da copyright) che interroga un **pool di modelli AI con soglie gratuite** (Gemini Free Tier, Groq Free, OpenRouter `:free`) tramite proxy rate-limited con cache aggressiva, scalando automaticamente su **BYOK nel browser** (chiave gratuita dell'utente in `sessionStorage`) e su **fallback deterministico locale** se nessuna quota è disponibile.
2. **Binario Pacchetti Scaricabili / Locali (Separato):** distribuzione autonoma (`bundles/noobucodonosor-portable.html` + kit server locale Docker/Node) che consente all'utente di scaricare un singolo file portabile prescaricato da aprire in locale (`file://`) con la propria chiave API gratuita, senza dipendere dal portale online.

---

## 2. Decisione Architetturale

1. **Separazione dei due binari nel repository:**
   - **Binario Web Live (`web/` + `server/`):**
     - `web/` contiene il portale vetrina SPA zero-dependency (HTML5 semantico, CSS moderno, Vanilla ESM JS), l'**Assistente AI "Noobucodonosor"** in home, la griglia filtrabile di tutti e 7 i progetti e i **4 Playground AI prescaricati** (`Leslie`, `kn5`, `resuscipack`, `ScooterLab`).
     - `web/data/preloaded-services.json` contiene i dataset prescaricati (lead B2B dimostrativi, trascrizioni demo, schede bibliografiche open-access e sessione telemetrica `.slab` di esempio).
     - `server/free-tier-router.mjs` implementa il router multi-provider con:
       - failover automatico su errore `429` / `5xx` / timeout tra `gemini` → `groq` → `openrouter` → `mistral`;
       - cache LRU in memoria con TTL (richieste ripetute sui preset costano **0 chiamate API**);
       - rate limiter per IP + tetto giornaliero globale (`DAILY_FREE_CAP`);
       - allowlist rigida dei `serviceId` (`assistant`, `leslie`, `kn5`, `resuscipack`, `scooterlab`) con system prompt server-side (impedisce l'abuso del proxy come relay LLM generico).
     - `server/index.mjs` + `Dockerfile` espongono il server Node.js 22 zero-dependency deployabile su **Google Cloud Run** (scale-to-zero) o eseguibile in locale (`node server/index.mjs`), servendo `web/`, `bundles/` e le API `/api/health` e `/api/ai/complete`.
   - **Binario Pacchetti Locali (`scripts/build-bundles.mjs` → `bundles/`):**
     - `scripts/build-bundles.mjs` genera `bundles/noobucodonosor-portable.html`, un singolo file HTML auto-contenuto che incorpora i dataset prescaricati, i 4 playground e il client BYOK/deterministico, utilizzabile offline o con API gratuita da `file://`.
     - Una sezione dedicata e separata nel portale ("Usa in Locale — Pacchetti Prescaricati") offre il download diretto del file portabile e le istruzioni 1-comando per il kit server locale.
2. **Sicurezza & Privacy:**
   - Le chiavi API del proxy risiedono esclusivamente in variabili d'ambiente / Cloud Run Secrets (`.env` in `.gitignore`, mai committate).
   - Le chiavi BYOK inserite dal visitatore restano esclusivamente in `sessionStorage` nel browser e chiamano direttamente l'endpoint del provider scelto, senza mai transitare dal server Noobucodonosor.
   - Il rendering dell'output AI nel DOM usa `Element.prototype.setHTML` (Sanitizer API nativa) con fallback DOM-safe senza `innerHTML` non sanitizzato.
3. **Integrazione con il Profilo GitHub (`README.md`):**
   - `README.md` conserva i marker automatici di ADR-0001 (`SHOWCASE`, `PULSE`) e aggiunge il collegamento diretto al Portale Vetrina & Playground Live e al Kit Locale.

---

## 3. Conseguenze

- **Positive:**
  - I visitatori provano con 1 click tutti i progetti AI senza registrarsi e senza costi fissi di hosting o API.
  - Il pool free-tier + cache + fallback BYOK + fallback deterministico rende la demo praticamente indistruttibile anche sotto picchi o esaurimento quote.
  - Il binario portabile (`bundles/noobucodonosor-portable.html`) permette distribuzione offline/locale completamente disaccoppiata dal backend.
  - Zero dipendenze npm runtime (solo Node.js 22 standard library).
- **Trade-off / Vincoli:**
  - Su GitHub Pages puro (senza backend), il portale funziona subito in modalità BYOK + Deterministico Locale; per attivare il proxy free-tier 1-click occorre deployare `Dockerfile` su Cloud Run (o configurare `window.NOOB_CONFIG.proxyBaseUrl`).
  - La cache e i contatori rate-limit sono in memoria di processo (sufficienti per singola istanza Cloud Run; estendibili a Redis/Firestore solo se il traffico cresce).

---

## 4. Task Operativi Collegati (con Definition of Done)

- [x] **TASK-HUB-01**: **Dataset Prescaricati (`web/data/preloaded-services.json`)**
  - *File coinvolti*: `web/data/preloaded-services.json`
  - *Acceptance Criteria*: Catalogo completo dei 7 progetti, contesto Assistente Noobucodonosor e dataset dimostrativi autentici (zero PII, zero copyright) per `leslie`, `kn5`, `resuscipack` e `scooterlab`.
  - *Verification Step*: Validazione JSON e verifica schema nei test automatici (`node --test`).
- [x] **TASK-HUB-02**: **Router API Free-Tier & Server Proxy Node 22 (`server/`)**
  - *File coinvolti*: `server/free-tier-router.mjs`, `server/index.mjs`, `.env.example`, `Dockerfile`
  - *Acceptance Criteria*: Failover automatico su `429`/errore, cache LRU con TTL, rate limiter per IP + cap giornaliero, allowlist `serviceId`, zero chiavi esposte in `/api/health`.
  - *Verification Step*: `node --test tests/free-tier-router.test.mjs`
- [x] **TASK-HUB-03**: **Portale Web Vetrina, Assistente AI & 4 Playground (`web/`)**
  - *File coinvolti*: `web/index.html`, `web/styles.css`, `web/ai-client.js`, `web/app.js`
  - *Acceptance Criteria*: Vetrina filtrabile dei 7 progetti, Assistente AI in home, 4 playground funzionanti (Proxy → BYOK → Deterministico), dialog BYOK nativo `<dialog closedby="any">` con fallback light-dismiss e rendering sicuro.
  - *Verification Step*: Verifica visiva/funzionale su server locale + `node --test tests/server-and-bundles.test.mjs`.
- [x] **TASK-HUB-04**: **Binario Separato Pacchetti Locali Portabili (`scripts/build-bundles.mjs` + `bundles/`)**
  - *File coinvolti*: `scripts/build-bundles.mjs`, `bundles/noobucodonosor-portable.html`
  - *Acceptance Criteria*: Generazione deterministica di un singolo file HTML auto-contenuto apribile via `file://` senza dipendenze esterne, con dataset prescaricati, 4 playground e BYOK free-tier.
  - *Verification Step*: `node scripts/build-bundles.mjs && node --test tests/server-and-bundles.test.mjs`
- [x] **TASK-HUB-05**: **Allineamento Documentazione, Profilo GitHub e Verifica Pre-Release**
  - *File coinvolti*: `README.md`, `AGENTS.md`, `docs/adr/README.md`, `.gitignore`
  - *Acceptance Criteria*: Marker `SHOWCASE`/`PULSE` intatti, documentazione aggiornata, `pre_release_check.py` superato senza errori.
  - *Verification Step*: `python3 ~/.gemini/config/skills/adr-github-methodology/scripts/pre_release_check.py`
