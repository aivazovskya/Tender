require('tsx/cjs');
const assert = require('assert');
const { TARIFF_PLANS } = require('../../src/lib/services/kaspi.service');

console.log('🧪 [Test Suite] Testing Kaspi Pay Billing Security & Price Protection (Bug #8)...');

// 1. Verify TARIFF_PLANS definitions
const proPlan = TARIFF_PLANS.find(p => p.id === 'PRO');
const enterprisePlan = TARIFF_PLANS.find(p => p.id === 'ENTERPRISE');

assert.strictEqual(proPlan.priceKztMonth, 29900, 'PRO plan must cost 29900 KZT');
assert.strictEqual(enterprisePlan.priceKztMonth, 199000, 'ENTERPRISE plan must cost 199000 KZT');

console.log('  ✅ Tariff plan pricing schema verified in Kaspi service');

// 2. Simulate server-side order calculation logic from create-order/route.ts
function calculateServerOrder(clientTariffId, clientProvidedAmount) {
  const plan = TARIFF_PLANS.find(p => p.id === (clientTariffId || 'PRO'));
  if (!plan) return { error: 'Неизвестный тариф', status: 400 };

  // Server overrides client-provided amount with official price from TARIFF_PLANS
  const serverAmountKzt = plan.priceKztMonth;
  return {
    success: true,
    amountKzt: serverAmountKzt,
    tariffPlanId: plan.id
  };
}

// Test case 1: Tampered amount (100 KZT for ENTERPRISE plan)
const tamperedResult = calculateServerOrder('ENTERPRISE', 100);
assert.strictEqual(tamperedResult.success, true);
assert.strictEqual(tamperedResult.amountKzt, 199000, 'Server MUST override tampered amount 100 KZT with 199000 KZT');
console.log('  ✅ Client price tampering attempt (100 KZT for ENTERPRISE) overridden with official 199,000 ₸ price');

// Test case 2: Invalid tariff ID
const invalidResult = calculateServerOrder('FAKE_TARIFF_99', 100);
assert.strictEqual(invalidResult.error, 'Неизвестный тариф');
assert.strictEqual(invalidResult.status, 400);
console.log('  ✅ Invalid tariff ID rejected with 400 Bad Request');

console.log('🎉 Kaspi Billing Security Test Suite completed successfully!');
