# AGENTS.md — Contesto & Linee Guida per Agenti AI e Sviluppatori

> **REGOLA AUREA (MANDATORY):**
> Prima di modificare l'architettura, toccare il modello dati, aggiungere endpoint o sviluppare nuove feature, **DEVI leggere [`VISION.md`](./VISION.md)**, **[`docs/adr/README.md`](./docs/adr/README.md)** e gli ADR specifici nella cartella [`docs/adr/`](./docs/adr/).

---

## 1. Panoramica del Progetto

- **Nome Progetto:** `Noobucodonosor — Profilo & Vetrina GitHub`
- **Repository:** `Noobucodonosor/Noobucodonosor`
- **Descrizione Sintetica:** Repository speciale del profilo GitHub (`https://github.com/Noobucodonosor`) che funge da vetrina interattiva dei progetti, con aggiornamento automatico orario di anteprime social, stato attività e metriche live.
- **Stack Tecnologico:**
  - **Runtime / Automation:** Node.js 22 (`ESM`, zero dipendenze esterne, `node:fs` / `node:path` / `fetch`)
  - **CI/CD:** GitHub Actions (`.github/workflows/update-profile.yml`, `.github/workflows/adr-pre-release.yml`)
  - **Output:** Markdown + HTML (`README.md`) con sezioni gestite da marker (`<!-- SHOWCASE:START -->` / `<!-- SHOWCASE:END -->`)
  - **Servizi Esterni / API:** GitHub REST API (`GITHUB_TOKEN`)

---

## 2. Mappa dei File Principali

| File / Cartella | Ruolo |
| :--- | :--- |
| [`VISION.md`](./VISION.md) | **Visione del progetto** (vetrina ~€0, servizi prescaricati, pool API free-tier, binari separati). |
| [`docs/adr/README.md`](./docs/adr/README.md) | **Indice degli ADR**, diagramma architetturale Mermaid e **Master Task Backlog**. |
| [`docs/adr/NNNN-*.md`](./docs/adr/) | Singoli Architecture Decision Records con contesto, decisioni e task collegati. |
| [`README.md`](./README.md) | Pagina vetrina pubblica del profilo GitHub, aggiornata automaticamente tra i marker HTML. |
| [`web/`](./web/) | **Binario A — Portale Web Vetrina**, Assistente AI e 4 Playground prescaricati (`index.html`, `styles.css`, `ai-client.js`, `app.js`, `data/preloaded-services.json`). |
| [`server/`](./server/) | **Proxy Free-Tier Node.js 22** (`free-tier-router.mjs`, `index.mjs`) con failover Gemini/Groq/OpenRouter `:free`, cache LRU e rate-limit per IP/giorno. |
| [`scripts/build-bundles.mjs`](./scripts/build-bundles.mjs) | Generatore del **Binario B separato** (`bundles/noobucodonosor-portable.html`, single-file HTML offline/BYOK). |
| [`scripts/roadmap-queue.mjs`](./scripts/roadmap-queue.mjs) | Motore coda **"Play" / Roadmap** su GitHub Project `#1` (`next`, `sync-open`, `schedule`). |
| [`tests/`](./tests/) | Suite di test automatici (`node --test tests/*.test.mjs`) per router free-tier, server HTTP e bundle portabile. |
| [`.github/scripts/update-profile.mjs`](./.github/scripts/update-profile.mjs) | Script Node.js che interroga le API GitHub per i progetti in vetrina e aggiorna `README.md`. |
| [`.github/workflows/update-profile.yml`](./.github/workflows/update-profile.yml) | Workflow GitHub Actions (cron orario + push su `main`) che esegue lo script e committa `README.md`. |
| `.github/ISSUE_TEMPLATE/` | Template standard per l'apertura di GitHub Issues (`adr_task.yml`, `bug_report.yml`). |
| `.github/PULL_REQUEST_TEMPLATE.md` | Checklist di PR allineata a ADR, Verification Step e modalità `Show` / `Ask`. |
| `.github/workflows/adr-pre-release.yml` | Gate CI automatico (file >50 MB, segreti, conformità `AGENTS.md` e `docs/adr/`). |

---

## 3. Metodologia di Lavoro (ADR + GitHub Issues)

1. **Ogni decisione architetturale o di sicurezza** è documentata in un file `docs/adr/NNNN-titolo.md`.
2. **Ogni task operativo** ha un codice univoco (`TASK-<MODULO>-XX`) censito sia nell'ADR di origine, sia in `docs/adr/README.md`, sia come **GitHub Issue**.
3. **Priorità Standard:**
   - `P0-critical`: Sicurezza, bug bloccanti di produzione, protezione token/dati.
   - `P1-high`: Feature core, moduli verticali prioritari, integrazioni essenziali.
   - `P2-medium`: Evoluzioni pianificate, ottimizzazioni, moduli secondari.
4. **Sviluppo & Flusso GitHub (Vibe Coding Sicuro):**
   - **Bivio `Issue` vs `Branch`:** per task esplorativi/architetturali salva prima il piano in una Issue (*Plan-to-Issue*); apri un branch (`feat/TASK-XXX-01` o `vibe/<slug>`, con `git worktree` se lavori in parallelo) solo su task perimetrati. Scoperte fuori scope → nuova Issue separata, mai *scope drift*.
   - **Draft PR & Rollback sicuro:** apri presto una Draft PR (`gh pr create --draft`); usa micro-PR e **Squash Merge** su `main`. **Mai `git rebase -i`** (usa `git reset --soft` per salvare parti valide; `--force-with-lease` solo prima di review umane, altrimenti `git revert`). Se la sessione degrada, genera `handoff.md` (con i tentativi falliti) e riparti pulito.
   - **Flusso graduato (`Show` vs `Ask`):** modifiche `P0-critical`, sicurezza o cambi a `docs/adr/`, `AGENTS.md` e `.github/**` richiedono sempre review umana (**Ask**). L'agente non approva né fa auto-merge del proprio codice.
   - **Verification Step reale:** esegui sempre il test previsto nella Issue verificando il comportamento sul diff, ispeziona `gh pr diff` e usa commit atomici:
     ```bash
     git commit -m "feat(TASK-XXX-01): descrizione sintetica della modifica (closes #N)"
     ```

---

## 4. Sicurezza & Regole Critiche

- **Mai committare segreti:** Il file `.env` e i database locali (`*.db`, `*.sqlite`) devono restare sempre in `.gitignore`. In CI usare esclusivamente `${{ secrets.GITHUB_TOKEN }}`.
- **Verifica Pre-Release:** Prima di fare push di milestone importanti, esegui:
  ```bash
  python3 ~/.gemini/config/skills/adr-github-methodology/scripts/pre_release_check.py
  ```

---

## 5. Comandi Rapidi di Sviluppo e Test

```bash
# Avvio locale Portale Vetrina + Proxy Free-Tier (http://localhost:8080)
node server/index.mjs

# Generazione bundle portabile single-file (Binario B separato)
node scripts/build-bundles.mjs

# Suite di test automatici (router free-tier, server HTTP, bundle portabile)
node --test tests/*.test.mjs

# Esecuzione locale dello script di aggiornamento vetrina (richiede Node 22+ e GITHUB_TOKEN opzionale)
node .github/scripts/update-profile.mjs

# Verifica controllo pre-release ADR e sicurezza
python3 ~/.gemini/config/skills/adr-github-methodology/scripts/pre_release_check.py

# Lista GitHub Issues attive per priorità
gh issue list --limit 30

# Coda "Play" dalla Roadmap d'ecosistema (Project #1)
node scripts/roadmap-queue.mjs next
node scripts/roadmap-queue.mjs sync-open
```
