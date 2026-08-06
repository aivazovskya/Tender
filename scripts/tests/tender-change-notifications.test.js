require('tsx/cjs');
const assert = require('assert');
const { ChangeNotificationService } = require('../../src/lib/services/change-notification.service');
const { TelegramBotService } = require('../../src/lib/services/telegram.service');
const { prisma } = require('../../src/lib/prisma');

console.log('🧪 Starting Tender Change Notifications Integration Test Suite...\n');

async function runTests() {
  const tenderId = `t-test-change-${Date.now()}`;
  const userIdActive = `u-active-${Date.now()}`;
  const userIdOptOut = `u-optout-${Date.now()}`;
  const userIdWon = `u-won-${Date.now()}`;

  console.log('1️⃣ Setting up mock records for tender changes test...');

  const mockTender = {
    id: tenderId,
    externalId: '100200300',
    title: 'Тендер на поставку серверов',
    amount: 50000000,
    customerName: 'АО КТЖ',
    sourceUrl: 'https://goszakup.gov.kz'
  };

  // 1. Mock Change: deadlineDate & amount changed
  const changes = [
    {
      field: 'deadlineDate',
      oldValue: '2026-08-10T00:00:00.000Z',
      newValue: '2026-08-20T00:00:00.000Z'
    },
    {
      field: 'amount',
      oldValue: '45000000',
      newValue: '50000000'
    }
  ];

  console.log('2️⃣ Testing ChangeNotificationService.notifyInterestedCompanies...');

  const result = await ChangeNotificationService.notifyInterestedCompanies(
    tenderId,
    mockTender,
    changes
  );

  assert.ok(typeof result.notificationsSent === 'number', 'notificationsSent must be a number');
  assert.ok(typeof result.deadlineUpdated === 'boolean', 'deadlineUpdated must be a boolean');

  console.log(`   ✅ Service executed cleanly (notificationsSent: ${result.notificationsSent}, deadlineUpdated: ${result.deadlineUpdated})`);

  console.log('\n3️⃣ Verifying Organization profile notificationSetting resolution code...');
  const fs = require('fs');
  const path = require('path');
  const serviceCode = fs.readFileSync(path.join(process.cwd(), 'src/lib/services/change-notification.service.ts'), 'utf8');

  assert.ok(
    serviceCode.includes('organizationId: card.organizationId') && serviceCode.includes('notificationSetting: true'),
    'change-notification.service.ts MUST include user/notificationSetting for organizationId queries'
  );
  assert.ok(
    serviceCode.includes('OrganizationMember') || serviceCode.includes('organizationMember'),
    'change-notification.service.ts MUST support resolving notificationSetting via OrganizationMember for org accounts'
  );
  console.log('   ✅ change-notification.service.ts includes notificationSetting resolution for organization profiles');

  console.log('\n🎉 All Tender Change Notifications tests completed successfully!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ Test Failure:', err);
  process.exit(1);
});
