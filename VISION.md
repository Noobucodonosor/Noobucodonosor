# VISION.md — Noobucodonosor Hub & Vetrina Progetti

> **Visione in una frase:**
> Rendere ogni progetto dell'ecosistema **Noobucodonosor** immediatamente provabile da chiunque a costo infrastrutturale **~€0**, usando una vetrina interattiva con **servizi prescaricati** che interagiscono via API con un **pool di modelli AI a soglie gratuite** (più fallback BYOK e deterministico), mantenendo nettamente separati il portale Web Live e i pacchetti locali portabili.

---

## 1. Il Problema da Risolvere

- Quattro progetti sono già fruibili direttamente online (`Basilico (C.I.B.O.)`, `MedioMeteo Genova`, `Genova Civica & Cultura`, `v.i.n.o.`).
- Altri quattro (`Leslie — Agency OS`, `kn5 — Knowledge Ingestor`, `resuscipack`, `ScooterLab`) richiedono chiavi API AI, backend dedicati o corpus locali non esponibili direttamente su GitHub Pages statico.
- Senza un punto d'accesso unificato e zero-attrito, chi visita il profilo vede solo schede statiche o anteprime read-only invece di poter **provare subito** i flussi AI reali.

---

## 2. I Pilastri della Visione

1. **Vetrina Unificata + Assistente AI:**
   - Una plancia statica zero cold-start su GitHub Pages (`web/`) con la griglia filtrabile di tutti gli 8 progetti e un Assistente AI in home (`Noobucodonosor`) che orienta il visitatore.
2. **Il "Sutterfugio" dei Servizi Prescaricati + Pool Free-Tier:**
   - Dataset dimostrativi autentici già prescaricati (`web/data/preloaded-services.json`, privi di PII e copyright) per provare subito `Leslie`, `kn5`, `resuscipack` e `ScooterLab`.
   - Gateway AI isolato e zero-brand (`packages/ai-gateway/`) con rate limit, cache LRU, ALTCHA PoW e rotazione automatica su **modelli con soglie gratuite** (`Gemini Free` → `Groq Free` → `OpenRouter :free` → `Mistral`).
   - Degradazione elegante: **Gateway Free-Tier → BYOK nel browser (`sessionStorage`) → Fallback deterministico locale** (la demo non si rompe mai).
3. **Due Binari Nettamente Separati:**
   - **Binario Web Live (`web/` su GitHub Pages + `packages/ai-gateway/` su Cloud Run):** portale statico + gateway on-demand a costo ~€0.
   - **Binario Offline / Data-Sovereignty Kit (`bundles/`):** singolo file HTML portabile IIFE (`noobucodonosor-portable.html`) apribile anche da `file://` con la propria chiave gratuita, senza dipendere dal portale online.

---

## 3. Riferimenti Architetturali

- [ADR-0001: Profilo Vetrina GitHub](./docs/adr/0001-profilo-vetrina-github.md)
- [ADR-0002: Hub Vetrina Web, Servizi Prescaricati con Pool API Free-Tier e Pacchetti Locali Separati](./docs/adr/0002-hub-vetrina-servizi-prescaricati-free-tier.md)
- [ADR-0003: Hardening, Sicurezza, Cost-Control e Limiti di Scalabilità (~€0)](./docs/adr/0003-hardening-sicurezza-cost-control.md)
- [ADR-0004: Split Statico/Dinamico (GitHub Pages + Cloud Run), Isolamento AI Gateway e Posizionamento Profilo](./docs/adr/0004-split-static-hub-and-ai-gateway.md)
- [Indice ADR & Backlog](./docs/adr/README.md)
