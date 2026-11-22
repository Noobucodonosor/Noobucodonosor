# ADR-0001: Architettura Core — Profilo & Vetrina GitHub Automatica

- **Stato:** Accettato (Baseline)
- **Data:** 2026-11-22
- **Autori:** Dany (Noobucodonosor)
- **Fonti:** `README.md`, `.github/scripts/update-profile.mjs`, `.github/workflows/update-profile.yml`

---

## 1. Contesto e Problema

Il repository `Noobucodonosor/Noobucodonosor` rappresenta la vetrina pubblica del profilo GitHub (`https://github.com/Noobucodonosor`).
Mantenere manualmente aggiornate le card dei progetti, gli stati di attività ("Aggiornato oggi"), i link alle demo live e le immagini `social-preview.png` porta rapidamente a disallineamenti rispetto ai repository reali dell'organizzazione/account.

---

## 2. Decisione Architetturale

1. **Separazione tra testo editoriale e blocchi dinamici in `README.md`:**
   - Le sezioni statiche (presentazione, servizi, contatti) restano editabili manualmente in `README.md`.
   - La griglia vetrina e gli indicatori live sono delimitati da marker HTML (`<!-- SHOWCASE:START -->` ... `<!-- SHOWCASE:END -->`) gestiti automaticamente.
2. **Automazione zero-dependency in Node.js 22:**
   - Lo script `.github/scripts/update-profile.mjs` legge la lista `PROJECTS`, interroga le API GitHub usando `GITHUB_TOKEN` (opzionale in locale, fornito da Actions in CI) e rigenera i blocchi HTML/Markdown in `README.md`.
3. **Esecuzione schedulata via GitHub Actions:**
   - `.github/workflows/update-profile.yml` gira ogni ora (`0 * * * *`), su push ai file dello script/workflow o manualmente via `workflow_dispatch`, committando `README.md` solo se presenti differenze.
4. **Governo tramite Metodologia ADR + GitHub Issues:**
   - Ogni evoluzione della vetrina (nuovi progetti, metriche, validazioni, SEO/OpenGraph) viene tracciata tramite `TASK-SHOWCASE-XX` collegati a GitHub Issues.

---

## 3. Conseguenze

- **Pro:** Vetrina sempre aggiornata senza intervento manuale; zero dipendenze npm da mantenere; esecuzione rapida e deterministica.
- **Trade-off / Vincoli:** I repository elencati in `PROJECTS` devono esporre `docs/preview/social-preview.png` sul branch `main` (o gestire un fallback grafico). Ogni modifica a `.github/**` segue la regola `Ask` (review umana).

---

## 4. Task Operativi Collegati

- [ ] **TASK-SHOWCASE-01**: Aggiungere validazione e fallback per `social-preview.png` e stato API nei progetti in `.github/scripts/update-profile.mjs`
- [ ] **TASK-SHOWCASE-02**: Estendere i test/verifica dry-run locale per `.github/scripts/update-profile.mjs` senza sovrascrivere `README.md`
