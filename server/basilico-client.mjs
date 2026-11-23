const DEFAULT_BASILICO_URL = 'https://basilico-txfxsxuuma-ew.a.run.app';

const NON_FOOD_DOMAINS = new Set(['bazar_seasonal']);
const NON_FOOD_CATEGORY_RE = /giocattoli|natale|tempo libero|bazar|elettrodomestici|abbigliamento/i;

export function parseBudgetEuro(text) {
  const match = String(text || '').match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro|eur)(?=\s|$|[.,;!?])/i);
  if (!match) return null;
  const val = Number(match[1].replace(',', '.'));
  return Number.isFinite(val) && val > 0 ? val : null;
}

function isFoodOrEssential(offer) {
  if (!offer || !offer.title) return false;
  if (offer.domain && NON_FOOD_DOMAINS.has(offer.domain)) return false;
  if (offer.category && NON_FOOD_CATEGORY_RE.test(offer.category)) return false;
  const price = Number(offer.promoPrice ?? offer.price);
  return Number.isFinite(price) && price > 0;
}

export async function fetchBasilicoContext(userQuery, options = {}) {
  const baseUrl = String(options.baseUrl ?? process.env.BASILICO_BASE_URL ?? DEFAULT_BASILICO_URL).replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = Number(options.timeoutMs ?? 5000);
  const budgetEuro = parseBudgetEuro(userQuery);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(
      `${baseUrl}/api/offers?limit=80&sortBy=discount_desc&onlyActive=true`,
      { signal: controller.signal, headers: { Accept: 'application/json' } },
    );
    if (!res.ok) {
      return { ok: false, offers: [], budgetEuro, contextText: '', baseUrl };
    }
    const data = await res.json();
    const rawOffers = Array.isArray(data?.offers) ? data.offers : [];
    const foodOffers = rawOffers.filter(isFoodOrEssential).slice(0, 35);

    const lines = foodOffers.map((o) => {
      const price = Number(o.promoPrice ?? o.price).toFixed(2);
      const disc = o.discountPercentage ? ` (-${o.discountPercentage}%)` : '';
      return `- ${o.title} | ${o.storeName || o.chainId || 'Supermercato'} | €${price}${disc} | ${o.category || 'Alimentari'}`;
    });

    const contextText = [
      `Offerte reali attive da Basilico (${baseUrl}):`,
      budgetEuro ? `Budget richiesto dall'utente: €${budgetEuro.toFixed(2)}` : '',
      ...lines,
    ]
      .filter(Boolean)
      .join('\n');

    return { ok: true, offers: foodOffers, budgetEuro, contextText, baseUrl };
  } catch {
    return { ok: false, offers: [], budgetEuro, contextText: '', baseUrl };
  } finally {
    clearTimeout(timer);
  }
}

export function buildBasilicoListFromOffers(userQuery, offers, budgetEuro = null, baseUrl = DEFAULT_BASILICO_URL) {
  if (!Array.isArray(offers) || offers.length === 0) return null;

  const targetBudget = budgetEuro ?? 100;
  const selected = [];
  let total = 0;
  const seenTitles = new Set();

  for (const o of offers) {
    const price = Number(o.promoPrice ?? o.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const key = String(o.title).toLowerCase().slice(0, 28);
    if (seenTitles.has(key)) continue;
    if (total + price > targetBudget) continue;
    seenTitles.add(key);
    selected.push({ ...o, unitPriceNum: price });
    total += price;
    if (selected.length >= 16) break;
  }

  if (selected.length === 0) return null;

  const byCategory = new Map();
  for (const item of selected) {
    const cat = item.category || 'Alimentari & Dispensa';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(item);
  }

  const lines = [
    `# Lista della Spesa — Basilico Live (Rapallo)`,
    `Richiesta: ${String(userQuery || '').trim()}`,
    `Offerte reali dai supermercati di Rapallo (${selected.length} articoli selezionati):`,
    '',
  ];

  for (const [cat, items] of byCategory.entries()) {
    lines.push(`## ${cat}`);
    for (const it of items) {
      const disc = it.discountPercentage ? ` (-${it.discountPercentage}%)` : '';
      lines.push(
        `- [ ] ${it.title} — €${it.unitPriceNum.toFixed(2)}${disc} @ ${it.storeName || it.chainId || 'Rapallo'}`,
      );
    }
    lines.push('');
  }

  lines.push(`Totale stimato offerte Basilico: €${total.toFixed(2)}${budgetEuro ? ` su budget €${budgetEuro.toFixed(2)}` : ''}`);
  lines.push(`Fonte live: ${baseUrl}`);
  return lines.join('\n');
}
