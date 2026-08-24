require('tsx/cjs');
const assert = require('assert');
const { GoszakupApiAdapter } = require('../../src/lib/ingestion/goszakup.adapter');
const { ReputationService } = require('../../src/lib/services/reputation.service');

async function runTests() {
  console.log('🧪 [Test Suite] Verifying Goszakup API URLs & Endpoint Handling...\n');

  const origFetch = global.fetch;
  const interceptedUrls = [];
  const interceptedBodies = [];
  const interceptedHeaders = [];

  try {
    process.env.GOSZAKUP_API_TOKEN = 'test-token-valid-abc';

    global.fetch = async (url, opts) => {
      interceptedUrls.push(String(url));
      interceptedBodies.push(opts?.body);
      interceptedHeaders.push(opts?.headers);

      if (String(url).includes('/v3/graphql')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              TrdBuy: [
                {
                  id: 12345,
                  numberAnno: '12345-2026',
                  nameRu: 'Тестовый конкурс',
                  totalSum: 5000000,
                  customerBin: '123456789012',
                  customerNameRu: 'ТОО Заказчик',
                  regionRu: 'г. Алматы',
                  publishDate: '2026-08-01T00:00:00Z',
                  endDate: '2026-08-15T00:00:00Z',
                  Files: []
                }
              ]
            }
          })
        };
      }

      if (String(url).includes('/v3/rnu/')) {
        if (String(url).endsWith('404040404040')) {
          return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
            json: async () => ({ message: 'Запись не найдена' })
          };
        }
        if (String(url).endsWith('999999999999')) {
          return {
            ok: true,
            status: 200,
            json: async () => ([
              {
                id: 101,
                bin: '999999999999',
                reason: 'Решение суда',
                startDate: '2026-01-01',
                endDate: '2027-01-01'
              }
            ])
          };
        }
      }

      return {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      };
    };

    // 1. Test GoszakupApiAdapter.fetchRawData URL
    console.log('▶ 1. Testing GoszakupApiAdapter.fetchRawData endpoint URL...');
    interceptedUrls.length = 0;
    const adapter = new GoszakupApiAdapter();
    const rawData = await adapter.fetchRawData();
    assert.strictEqual(adapter.usedFallbackData, false, 'Should not use fallback data when token is valid');
    assert.strictEqual(rawData.length, 1);
    assert.strictEqual(interceptedUrls[0], 'https://ows.goszakup.gov.kz/v3/graphql');
    assert.strictEqual(interceptedUrls[0].includes('graphql.goszakup.gov.kz'), false, 'URL must not use graphql.goszakup.gov.kz domain');
    console.log('  ✅ GoszakupApiAdapter.fetchRawData uses https://ows.goszakup.gov.kz/v3/graphql');

    // 2. Test GoszakupApiAdapter.fetchBuyResult URL
    console.log('\n▶ 2. Testing GoszakupApiAdapter.fetchBuyResult endpoint URL...');
    interceptedUrls.length = 0;
    await adapter.fetchBuyResult('12345-2026');
    assert.strictEqual(interceptedUrls[0], 'https://ows.goszakup.gov.kz/v3/graphql');
    assert.strictEqual(interceptedUrls[0].includes('graphql.goszakup.gov.kz'), false, 'URL must not use graphql.goszakup.gov.kz domain');
    console.log('  ✅ GoszakupApiAdapter.fetchBuyResult uses https://ows.goszakup.gov.kz/v3/graphql');

    // 3. Test ReputationService.fetchGoszakupRnuApi URL (no /bin/ segment)
    console.log('\n▶ 3. Testing ReputationService RNU endpoint URL structure...');
    interceptedUrls.length = 0;
    const rnuClean = await ReputationService['fetchGoszakupRnuApi']('404040404040');
    assert.strictEqual(interceptedUrls[0], 'https://ows.goszakup.gov.kz/v3/rnu/404040404040');
    assert.strictEqual(interceptedUrls[0].includes('/rnu/bin/'), false, 'URL must not include /bin/ segment');
    assert.strictEqual(rnuClean.status, 'CLEAN');
    assert.strictEqual(rnuClean.isBlacklisted, false);
    console.log('  ✅ ReputationService queries https://ows.goszakup.gov.kz/v3/rnu/{bin} without /bin/ segment');

    // 4. Test RNU 404 response handling
    console.log('\n▶ 4. Testing RNU 404 Not Found response (supplier not in registry)...');
    const rnuCheckClean = await ReputationService.checkBin('404040404040', 'SUPPLIER');
    assert.strictEqual(rnuCheckClean.status, 'CLEAN', 'HTTP 404 must result in CLEAN status (not in RNU)');
    assert.strictEqual(rnuCheckClean.isBlacklisted, false);
    assert.strictEqual(rnuCheckClean.stale, false);
    assert.strictEqual(rnuCheckClean.isFallback, false);
    console.log('  ✅ RNU 404 correctly treated as CLEAN (not blacklisted) without triggering fallback/network error');

    // 5. Test RNU 200 response with blacklisted supplier
    console.log('\n▶ 5. Testing RNU 200 OK with active blacklist entry...');
    const rnuCheckBlacklisted = await ReputationService.checkBin('999999999999', 'SUPPLIER');
    assert.strictEqual(rnuCheckBlacklisted.status, 'BLACKLISTED');
    assert.strictEqual(rnuCheckBlacklisted.isBlacklisted, true);
    assert.strictEqual(rnuCheckBlacklisted.registryRecordId, '101');
    console.log('  ✅ RNU 200 with active blacklist entry correctly detected as BLACKLISTED');

  } finally {
    global.fetch = origFetch;
    delete process.env.GOSZAKUP_API_TOKEN;
  }

  console.log('\n🎉 Goszakup API URLs & Endpoint Handling tests passed successfully!');
}

runTests().catch(err => {
  console.error('💥 Test suite failed:', err);
  process.exit(1);
});
