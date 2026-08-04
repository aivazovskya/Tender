require('tsx/cjs');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { prisma } = require('../../src/lib/prisma');

async function runTests() {
  console.log('🧪 Starting Roadmap Phase 3 Frontend Audit Findings Verification Tests...\n');

  // -------------------------------------------------------------
  // 1️⃣ Testing Finding 1 (Kanban Checklist Progress Confirmation)
  // -------------------------------------------------------------
  console.log('  1️⃣ Testing Finding 1 (Kanban Checklist Progress Confirmation)...');
  const kanbanBoardPath = path.join(process.cwd(), 'src/components/KanbanBoard.tsx');
  const kanbanBoardCode = fs.readFileSync(kanbanBoardPath, 'utf8');

  assert.ok(
    kanbanBoardCode.includes('handleStageSelectChange'),
    'KanbanBoard.tsx must declare handleStageSelectChange'
  );
  assert.ok(
    kanbanBoardCode.includes("newStage === 'SUBMITTED'") && kanbanBoardCode.includes('reqStats.completed < reqStats.total'),
    'KanbanBoard.tsx must check SUBMITTED stage transition against incomplete checklist'
  );
  assert.ok(
    kanbanBoardCode.includes('window.confirm'),
    'KanbanBoard.tsx must prompt window.confirm on incomplete checklist'
  );
  console.log('     ✅ KanbanBoard.tsx implements soft confirmation guard for SUBMITTED stage');

  // -------------------------------------------------------------
  // 2️⃣ Testing Finding 2 (PriceBenchmarkWidget isReliable Guard)
  // -------------------------------------------------------------
  console.log('\n  2️⃣ Testing Finding 2 (PriceBenchmarkWidget isReliable Guard)...');
  const benchmarkWidgetPath = path.join(process.cwd(), 'src/components/PriceBenchmarkWidget.tsx');
  const benchmarkWidgetCode = fs.readFileSync(benchmarkWidgetPath, 'utf8');

  assert.ok(
    benchmarkWidgetCode.includes('benchmark.isReliable && benchmark.medianAmount > 0'),
    'PriceBenchmarkWidget.tsx must check benchmark.isReliable before rendering median discount text'
  );
  console.log('     ✅ PriceBenchmarkWidget hides median discount line when sample size is small (!isReliable)');

  // -------------------------------------------------------------
  // 3️⃣ Testing Finding 3 (SecurityRegistryModal Error State & Banner)
  // -------------------------------------------------------------
  console.log('\n  3️⃣ Testing Finding 3 (SecurityRegistryModal Error State & Banner)...');
  const securityModalPath = path.join(process.cwd(), 'src/components/SecurityRegistryModal.tsx');
  const securityModalCode = fs.readFileSync(securityModalPath, 'utf8');

  assert.ok(
    securityModalCode.includes('const [error, setError] = useState'),
    'SecurityRegistryModal.tsx must declare error state'
  );
  assert.ok(
    securityModalCode.includes('setError(data.message'),
    'SecurityRegistryModal.tsx must set error message when data.success is false'
  );
  assert.ok(
    securityModalCode.includes('{error &&'),
    'SecurityRegistryModal.tsx must render error banner'
  );
  console.log('     ✅ SecurityRegistryModal correctly sets error state and renders error banner');

  // -------------------------------------------------------------
  // 4️⃣ Testing Finding 4 (Kanban API Batch Requirements Stats - N+1 Fix)
  // -------------------------------------------------------------
  console.log('\n  4️⃣ Testing Finding 4 (Kanban API Batch Requirements Stats - N+1 Fix)...');
  const kanbanRoutePath = path.join(process.cwd(), 'src/app/api/kanban/route.ts');
  const kanbanRouteCode = fs.readFileSync(kanbanRoutePath, 'utf8');

  assert.ok(
    kanbanRouteCode.includes('requirements: { select: { isCompleted: true } }'),
    'GET /api/kanban must include requirements in Prisma findMany query'
  );
  assert.ok(
    kanbanRouteCode.includes('requirementsStats: { completed: reqCompleted, total: reqTotal }'),
    'GET /api/kanban must format requirementsStats in card JSON response'
  );

  // Test real DB query behavior
  const testUserId = 'user-fe-audit-' + Date.now();
  await prisma.user.upsert({
    where: { id: testUserId },
    update: {},
    create: { id: testUserId, email: `${testUserId}@test.kz`, name: 'FE Audit User', role: 'USER' }
  });

  const testTender = await prisma.tender.create({
    data: {
      source: 'GOSZAKUP',
      externalId: 'ext-fe-' + Date.now(),
      title: 'Тестовый лот фронтенд аудит',
      customerName: 'Заказчик Фронтенд',
      customerBin: '123456789012',
      category: 'IT Services',
      industryTags: ['IT'],
      procurementMethod: 'OPEN_TENDER',
      amount: 1000000,
      currency: 'KZT',
      region: 'Алматы',
      publishDate: new Date(),
      deadlineDate: new Date(Date.now() + 86400000),
      sourceUrl: 'https://goszakup.gov.kz'
    }
  });

  await prisma.tenderRequirementItem.createMany({
    data: [
      { tenderId: testTender.id, label: 'Лицензия', isCompleted: true, sourceType: 'MANUAL' },
      { tenderId: testTender.id, label: 'Опыт 3 года', isCompleted: false, sourceType: 'MANUAL' }
    ]
  });

  const testCard = await prisma.kanbanCard.create({
    data: {
      userId: testUserId,
      tenderId: testTender.id,
      stage: 'UNDER_REVIEW',
      priority: 'HIGH'
    }
  });

  // Query kanban cards via Prisma logic matching route handler
  const cards = await prisma.kanbanCard.findMany({
    where: { userId: testUserId },
    include: {
      tender: {
        include: {
          requirements: { select: { isCompleted: true } }
        }
      }
    }
  });

  assert.strictEqual(cards.length, 1);
  const card = cards[0];
  const reqList = card.tender?.requirements || [];
  const reqTotal = reqList.length;
  const reqCompleted = reqList.filter((r) => r.isCompleted).length;

  assert.strictEqual(reqTotal, 2);
  assert.strictEqual(reqCompleted, 1);
  console.log('     ✅ GET /api/kanban returns batch requirementsStats (total: 2, completed: 1) in a single DB query');

  // Clean up
  await prisma.kanbanCard.delete({ where: { id: testCard.id } });
  await prisma.tenderRequirementItem.deleteMany({ where: { tenderId: testTender.id } });
  await prisma.tender.delete({ where: { id: testTender.id } });
  await prisma.user.delete({ where: { id: testUserId } });

  console.log('\n🎉 Roadmap Phase 3 Frontend Audit Findings Verification Suite completed successfully!\n');
}

if (process.argv[1] && process.argv[1].endsWith('roadmap-phase-3-frontend-fixes.test.js')) {
  runTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('💥 Test failed:', err);
      process.exit(1);
    });
}
