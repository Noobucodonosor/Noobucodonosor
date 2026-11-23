# Runbook GCP Hardening & Cost-Control (ADR-0004)

Comandi operativi per completare il Livello 1 (Hard Spend Cap) e l'autenticazione keyless WIF su Google Cloud Platform.

## 1. Workload Identity Federation (Keyless OIDC per GitHub Actions)

Sostituisce completamente le chiavi JSON statiche dei Service Account, vincolando il rilascio dei token esclusivamente al repository `Noobucodonosor/Noobucodonosor` sul branch `main`.

```bash
export PROJECT_ID="<TUO_GCP_PROJECT_ID>"
export PROJECT_NUMBER="<TUO_GCP_PROJECT_NUMBER>"
export POOL_ID="github-actions-pool"
export PROVIDER_ID="github-oidc-provider"
export SA_NAME="github-deployer"
export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create "${SA_NAME}" --project="${PROJECT_ID}"

gcloud iam workload-identity-pools create "${POOL_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --display-name="GitHub Actions Pool"

gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="${POOL_ID}" \
  --display-name="GitHub OIDC" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == 'Noobucodonosor/Noobucodonosor' && assertion.ref == 'refs/heads/main'"

gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/Noobucodonosor/Noobucodonosor"
```

Configura poi come **Repository Variables** su GitHub (`Settings → Secrets and variables → Actions → Variables`):
- `GCP_PROJECT_ID`: `<TUO_GCP_PROJECT_ID>`
- `GCP_WIF_PROVIDER`: `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github-actions-pool/providers/github-oidc-provider`
- `GCP_SERVICE_ACCOUNT`: `github-deployer@<TUO_GCP_PROJECT_ID>.iam.gserviceaccount.com`

## 2. Hard Spend Cap (Livello 1 — Cloud Billing Budget API)

Imposta un tetto mensile rigido (es. $2/mese, tarato all'80–90% del limite massimo tollerato) con `creditTypesTreatment: EXCLUDE_ALL_CREDITS` sul solo servizio Cloud Run, più un alert Pub/Sub dedicato al network egress (non coperto dallo Spend Cap nativo).

```bash
export BILLING_ACCOUNT_ID="<TUO_BILLING_ACCOUNT_ID>"

gcloud billing budgets create \
  --billing-account="${BILLING_ACCOUNT_ID}" \
  --display-name="Noobucodonosor Cloud Run Spend Cap" \
  --budget-amount=2USD \
  --calendar-period=month \
  --credit-types-treatment=exclude-all-credits \
  --filter-projects="projects/${PROJECT_ID}" \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.8 \
  --threshold-rule=percent=1.0
```

> **Nota:** verifica in Cloud Console → Billing → Budgets & alerts che il Spend Cap sia collegato al servizio Cloud Run (regione Tier 1 `us-central1`) e che un topic Pub/Sub notifichi eventuali anomalie di network egress.
