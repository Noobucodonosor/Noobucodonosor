# Noobucodonosor — Officina Digitale, AI Agentica & Sistemi IoT

Progetto e sviluppo **prodotti web reali**, **flussi di AI agentica a costo controllato** e **sistemi IoT** (Genova & Rapallo).
Tutti i 7 prodotti qui sotto sono esplorabili subito online; i 4 playground AI girano sulla [plancia interattiva statica](https://noobucodonosor.github.io/Noobucodonosor/) con gateway Node.js 22 on-demand.

## 7 Prodotti Reali

<!-- SHOWCASE:START -->
| Progetto | Problema risolto | Stack | Live / Playground |
| :--- | :--- | :--- | :--- |
| [**Cosa faccio questa settimana a Genova**](https://github.com/Noobucodonosor/genova-settimana) | Cinema, mostre, musica, biblioteche, ~5.000 attività locali e storia delle vie su 67 comuni. | `Static Web · ETL · GitHub Pages` | [**Apri Live**](https://noobucodonosor.github.io/genova-settimana/) |
| [**resuscipack**](https://github.com/Noobucodonosor/resuscipack) | Due volumi in 20 capitoli e ricerca verificabile su 1.400+ testi tecnici con formule KaTeX. | `FTS5 · KaTeX · Playground AI` | [**Prova Live**](https://noobucodonosor.github.io/Noobucodonosor/?app=resuscipack) · [Vista Libro](https://noobucodonosor.github.io/resuscipack/) |
| [**MedioMeteo Genova**](https://github.com/Noobucodonosor/mediometeo) | Meteo terra e mare su 67 comuni della provincia di Genova basato su 199 sensori reali sul territorio. | `Python · Cloud Run · 199 sensori OMIRL` | [**Apri Live**](https://mediometeo-664856461640.europe-west1.run.app) |
| [**ScooterLab — Telemetria IoT (ESP32-S3)**](https://github.com/Noobucodonosor/scooterlab) | Kit hardware/software personale (non affiliato a UTSA ScooterLab) con ESP32-S3, IMU e GNSS per analisi di guida su scooter. | `ESP32-S3 · IMU/GNSS · File .slab` | [**Prova Live**](https://noobucodonosor.github.io/Noobucodonosor/?app=scooterlab) |
| [**kn5 — Knowledge Ingestor**](https://github.com/Noobucodonosor/kn5) | Trasforma video YouTube e articoli in schede Markdown Obsidian con controllo budget API. | `Python · Obsidian MD · Telegram` | [**Prova Live**](https://noobucodonosor.github.io/Noobucodonosor/?app=kn5) |
| [**Leslie — Agency OS**](https://github.com/Noobucodonosor/leslie-agency-os) | Scouting e qualificazione B2B con score 0–10 e bozze outreach per agenzie e team commerciali. | `AI Agentica · Scoring · Playground AI` | [**Prova Live**](https://noobucodonosor.github.io/Noobucodonosor/?app=leslie) |
| [**Basilico — Rapallo**](https://github.com/Noobucodonosor/basilico) | Confronto in tempo reale di offerte e volantini di 14 supermercati locali con pianificazione spesa offline. | `PWA Offline-First · Cloud Run` | [**Apri Offerte**](https://basilico-txfxsxuuma-ew.a.run.app/?room=room-1-negozi) |
<!-- SHOWCASE:END -->

## Plancia Interattiva, Motore AI & Consulenza

- **Plancia Playground AI (zero cold-start):** [noobucodonosor.github.io/Noobucodonosor](https://noobucodonosor.github.io/Noobucodonosor/) — 4 playground AI prescaricati + Assistente, collegati al gateway on-demand (`packages/ai-gateway/`, difesa 3 livelli: Spend Cap + rate limit + ALTCHA PoW).
- **Offline / Data-Sovereignty Kit:** file HTML autonomo scaricabile dalle [GitHub Releases](https://github.com/Noobucodonosor/Noobucodonosor/releases) o da [`bundles/noobucodonosor-portable.html`](./bundles/noobucodonosor-portable.html) (BYOK diretto su OpenRouter, Groq, Anthropic o Ollama locale).
- **Consulenza IT & AI Agentica:** automazione flussi documentali/B2B, gateway AI white-label a costo controllato (`packages/ai-gateway/`), prodotti web/PWA su misura. Scrivimi aprendo una discussione o issue su [github.com/Noobucodonosor](https://github.com/Noobucodonosor).

<details>
<summary><strong>Stato dei Progetti in Tempo Reale & Dettagli Architetturali (ADR-0001..0004)</strong></summary>

<!-- PULSE:START -->
> **7** progetti attivi in vetrina · **35** miglioramenti negli ultimi 7 giorni · **7** aggiornati oggi · *Ultimo controllo automatico: 23 nov 2026, 21:43*

| Progetto | Ambito | Stato | Ultimo aggiornamento | Attività (7 giorni) |
| :--- | :--- | :--- | :--- | :---: |
| [**Cosa faccio questa settimana a Genova**](https://noobucodonosor.github.io/genova-settimana/) | Agenda & Territorio | 🟢 Aggiornato oggi | 23 nov 2026 | 8 aggiornamenti |
| [**resuscipack**](https://noobucodonosor.github.io/Noobucodonosor/?app=resuscipack) | Ricerca & Editoria | 🟢 Aggiornato oggi | 23 nov 2026 | 6 aggiornamenti |
| [**MedioMeteo Genova**](https://mediometeo-664856461640.europe-west1.run.app) | Meteo & Sensori | 🟢 Aggiornato oggi | 23 nov 2026 | 4 aggiornamenti |
| [**ScooterLab — Telemetria IoT (ESP32-S3)**](https://noobucodonosor.github.io/Noobucodonosor/?app=scooterlab) | Telemetria & IoT | 🟢 Aggiornato oggi | 23 nov 2026 | 4 aggiornamenti |
| [**kn5 — Knowledge Ingestor**](https://noobucodonosor.github.io/Noobucodonosor/?app=kn5) | AI & Knowledge | 🟢 Aggiornato oggi | 23 nov 2026 | 4 aggiornamenti |
| [**Leslie — Agency OS**](https://noobucodonosor.github.io/Noobucodonosor/?app=leslie) | AI Commerciale B2B | 🟢 Aggiornato oggi | 23 nov 2026 | 4 aggiornamenti |
| [**Basilico — Rapallo**](https://basilico-txfxsxuuma-ew.a.run.app/?room=room-1-negozi) | Consumer & Spesa | 🟢 Aggiornato oggi | 23 nov 2026 | 5 aggiornamenti |
<!-- PULSE:END -->

- **Architettura ADR-Driven:** [`docs/adr/README.md`](./docs/adr/README.md) · [`docs/adr/0004-split-static-hub-and-ai-gateway.md`](./docs/adr/0004-split-static-hub-and-ai-gateway.md)

</details>
