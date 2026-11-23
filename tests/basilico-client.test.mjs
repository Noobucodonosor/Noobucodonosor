import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchBasilicoContext, buildBasilicoListFromOffers, parseBudgetEuro } from '../server/basilico-client.mjs';

test('parseBudgetEuro extracts euro budget from user query', () => {
  assert.equal(parseBudgetEuro('100 euro 1 persona casa vuota'), 100);
  assert.equal(parseBudgetEuro('spesa max 45,50€'), 45.5);
  assert.equal(parseBudgetEuro('spesa settimanale'), null);
});

test('fetchBasilicoContext filters food offers and buildBasilicoListFromOffers respects budget', async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        offers: [
          {
            title: 'Barbie Equitazione',
            storeName: 'Carrefour',
            promoPrice: 24.95,
            discountPercentage: 50,
            category: 'Giocattoli, Natale e Tempo Libero',
            domain: 'bazar_seasonal',
          },
          {
            title: 'Pasta Barilla 500g',
            storeName: 'Coop Rapallo',
            promoPrice: 0.99,
            discountPercentage: 40,
            category: 'Pasta e Riso',
          },
          {
            title: 'Olio EVO 1L',
            storeName: 'Conad',
            promoPrice: 6.9,
            discountPercentage: 30,
            category: 'Condimenti',
          },
        ],
      };
    },
  });

  const ctx = await fetchBasilicoContext('100 euro 1 persona casa vuota', { fetchImpl: fakeFetch });
  assert.equal(ctx.ok, true);
  assert.equal(ctx.budgetEuro, 100);
  assert.equal(ctx.offers.length, 2);
  assert.ok(!ctx.contextText.includes('Barbie'));
  assert.ok(ctx.contextText.includes('Pasta Barilla 500g'));

  const list = buildBasilicoListFromOffers('100 euro 1 persona casa vuota', ctx.offers, ctx.budgetEuro);
  assert.ok(list.includes('Coop Rapallo'));
  assert.ok(list.includes('€0.99'));
  assert.ok(list.includes('Totale stimato offerte Basilico: €7.89'));
});
