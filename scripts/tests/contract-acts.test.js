require('tsx/cjs');
const assert = require('assert');
process.env.AUTH_STORE_MODE = 'memory';

const { GET: getExecutionGET, POST: postExecutionPOST, PATCH: patchExecutionPATCH } = require('../../src/app/api/tenders/[id]/contract-execution/route');
const { POST: postMilestonePOST } = require('../../src/app/api/tenders/[id]/contract-execution/milestones/route');
const { PATCH: patchMilestonePATCH } = require('../../src/app/api/tenders/[id]/contract-execution/milestones/[milestoneId]/route');
const { prisma } = require('../../src/lib/prisma');

console.log('🧪 Starting Contract Execution Acts Tracker & Tenant Isolation Test Suite...\n');

function createMockRequest(userId, method = 'GET', body = null) {
  const req = {
    method,
    headers: new Map([['x-user-id', userId]]),
    url: 'http://localhost/api/tenders/tender-act-1/contract-execution',
    json: async () => body
  };
  req.headers.get = (name) => name.toLowerCase() === 'x-user-id' ? userId : null;
  return req;
}

async function testTenantIsolationSecurity() {
  console.log('1️⃣ Testing Strict Tenant Isolation Fix (Security Audit)...');
  const userA = 'demo-user-id'; // profileId: demo-company-profile-id
  const userB = 'other-user-id'; // profileId: cp_other-user-id

  const tenderId = 'tender-act-sec-1';
  let memoryContract = null;
  let memoryMilestones = [];

  const origFindUniqueCE = prisma.contractExecution.findUnique;
  const origCreateCE = prisma.contractExecution.create;
  const origUpdateCE = prisma.contractExecution.update;
  const origFindUniqueCM = prisma.contractMilestone.findUnique;
  const origCreateCM = prisma.contractMilestone.create;
  const origUpdateCM = prisma.contractMilestone.update;

  try {
    prisma.contractExecution.findUnique = async ({ where }) => {
      if (memoryContract && memoryContract.tenderId === where.tenderId) {
        return {
          ...memoryContract,
          milestones: memoryMilestones,
          tender: { amount: 10000000, title: 'Тендер Безопасности', externalId: 'ext-sec-1', riskScore: 5 }
        };
      }
      return null;
    };

    prisma.contractExecution.create = async ({ data }) => {
      memoryContract = {
        id: 'ce-1',
        tenderId: data.tenderId,
        companyProfileId: data.companyProfileId,
        deliveryDeadline: data.deliveryDeadline,
        status: data.status,
        contractSignedAt: data.contractSignedAt
      };
      if (data.milestones?.create) {
        memoryMilestones = data.milestones.create.map((m, idx) => ({
          id: `cm-${idx + 1}`,
          contractId: 'ce-1',
          label: m.label,
          dueDate: m.dueDate,
          status: m.status,
          paymentAmount: m.paymentAmount,
          actStatus: m.actStatus,
          actSignedAt: m.actSignedAt,
          paidAt: m.paidAt
        }));
      }
      return memoryContract;
    };

    prisma.contractMilestone.findUnique = async ({ where }) => {
      const m = memoryMilestones.find(item => item.id === where.id);
      if (m) return { ...m, contract: memoryContract };
      return null;
    };

    prisma.contractMilestone.create = async ({ data }) => {
      const newM = {
        id: `cm-${memoryMilestones.length + 1}`,
        contractId: data.contractId,
        label: data.label,
        dueDate: data.dueDate,
        status: data.status,
        paymentAmount: data.paymentAmount,
        actStatus: data.actStatus,
        actSignedAt: data.actSignedAt,
        paidAt: data.paidAt,
        contract: memoryContract
      };
      memoryMilestones.push(newM);
      return newM;
    };

    prisma.contractMilestone.update = async ({ where, data }) => {
      const mIndex = memoryMilestones.findIndex(item => item.id === where.id);
      if (mIndex >= 0) {
        memoryMilestones[mIndex] = { ...memoryMilestones[mIndex], ...data };
        return memoryMilestones[mIndex];
      }
      return null;
    };

    // 1. User A creates contract execution
    const reqCreateA = createMockRequest(userA, 'POST', {
      deliveryDeadline: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      milestones: [{ label: 'Этап 1', dueDate: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(), paymentAmount: 5000000 }]
    });
    const resCreateA = await postExecutionPOST(reqCreateA, { params: { id: tenderId } });
    assert.strictEqual(resCreateA.status, 200);
    assert.strictEqual(memoryContract.companyProfileId, 'demo-company-profile-id', 'companyProfileId must be bound to User A profile');

    // 2. User B attempts GET User A contract execution -> HTTP 404
    const reqGetB = createMockRequest(userB, 'GET');
    const resGetB = await getExecutionGET(reqGetB, { params: { id: tenderId } });
    assert.strictEqual(resGetB.status, 404, 'User B must receive HTTP 404 on reading User A contract execution');
    console.log('   ✅ GET /contract-execution denies unauthorized access with HTTP 404');

    // 3. User B attempts PATCH User A contract execution -> HTTP 404
    const reqPatchB = createMockRequest(userB, 'PATCH', { status: 'TERMINATED' });
    const resPatchB = await patchExecutionPATCH(reqPatchB, { params: { id: tenderId } });
    assert.strictEqual(resPatchB.status, 404, 'User B must receive HTTP 404 on modifying User A contract execution');
    console.log('   ✅ PATCH /contract-execution denies unauthorized access with HTTP 404');

    // 4. User B attempts POST milestone on User A contract -> HTTP 404
    const reqPostMB = createMockRequest(userB, 'POST', { label: 'Чужой этап', dueDate: new Date().toISOString() });
    const resPostMB = await postMilestonePOST(reqPostMB, { params: { id: tenderId } });
    assert.strictEqual(resPostMB.status, 404, 'User B must receive HTTP 404 on adding milestone to User A contract');
    console.log('   ✅ POST /contract-execution/milestones denies unauthorized access with HTTP 404');

    // 5. User B attempts PATCH milestone on User A contract -> HTTP 404
    const reqPatchMB = createMockRequest(userB, 'PATCH', { actStatus: 'DISPUTED' });
    const resPatchMB = await patchMilestonePATCH(reqPatchMB, { params: { id: tenderId, milestoneId: 'cm-1' } });
    assert.strictEqual(resPatchMB.status, 404, 'User B must receive HTTP 404 on modifying User A milestone');
    console.log('   ✅ PATCH /contract-execution/milestones/[milestoneId] denies unauthorized access with HTTP 404');
  } finally {
    prisma.contractExecution.findUnique = origFindUniqueCE;
    prisma.contractExecution.create = origCreateCE;
    prisma.contractExecution.update = origUpdateCE;
    prisma.contractMilestone.findUnique = origFindUniqueCM;
    prisma.contractMilestone.create = origCreateCM;
    prisma.contractMilestone.update = origUpdateCM;
  }
}

async function testActsAndPaymentTracking() {
  console.log('\n2️⃣ Testing Milestone Act Status Transitions & Payment Metrics...');
  const userA = 'demo-user-id';
  const tenderId = 'tender-act-metrics-1';

  let memoryContract = {
    id: 'ce-2',
    tenderId,
    companyProfileId: 'demo-company-profile-id',
    deliveryDeadline: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    status: 'IN_PROGRESS'
  };

  let memoryMilestones = [
    {
      id: 'cm-10',
      contractId: 'ce-2',
      label: 'Поставка партии 1',
      dueDate: new Date(Date.now() + 5 * 24 * 3600 * 1000),
      status: 'PENDING',
      paymentAmount: 4000000,
      actStatus: 'NOT_SUBMITTED',
      actSignedAt: null,
      paidAt: null
    },
    {
      id: 'cm-20',
      contractId: 'ce-2',
      label: 'Поставка партии 2 (Оспаривается)',
      dueDate: new Date(Date.now() + 15 * 24 * 3600 * 1000),
      status: 'PENDING',
      paymentAmount: 6000000,
      actStatus: 'DISPUTED',
      actSignedAt: null,
      paidAt: null
    }
  ];

  const origFindUniqueCE = prisma.contractExecution.findUnique;
  const origFindUniqueCM = prisma.contractMilestone.findUnique;
  const origUpdateCM = prisma.contractMilestone.update;

  try {
    prisma.contractExecution.findUnique = async ({ where }) => {
      if (where.tenderId === tenderId) {
        return {
          ...memoryContract,
          milestones: memoryMilestones,
          tender: { amount: 10000000, title: 'Тендер с Актами', externalId: 'ext-acts-1', riskScore: 0 }
        };
      }
      return null;
    };

    prisma.contractMilestone.findUnique = async ({ where }) => {
      const m = memoryMilestones.find(item => item.id === where.id);
      if (m) return { ...m, contract: memoryContract };
      return null;
    };

    prisma.contractMilestone.update = async ({ where, data }) => {
      const mIndex = memoryMilestones.findIndex(item => item.id === where.id);
      if (mIndex >= 0) {
        memoryMilestones[mIndex] = { ...memoryMilestones[mIndex], ...data };
        return memoryMilestones[mIndex];
      }
      return null;
    };

    // 1. GET execution metrics initially (expectedPaymentSum = 10,000,000, received = 0, 1 disputed)
    const reqGet = createMockRequest(userA, 'GET');
    const resGet1 = await getExecutionGET(reqGet, { params: { id: tenderId } });
    const dataGet1 = await resGet1.json();

    assert.strictEqual(dataGet1.success, true);
    assert.strictEqual(dataGet1.metrics.totalContractAmount, 10000000);
    assert.strictEqual(dataGet1.metrics.expectedPaymentSum, 10000000);
    assert.strictEqual(dataGet1.metrics.receivedPaymentSum, 0);
    assert.strictEqual(dataGet1.metrics.disputedMilestonesCount, 1);
    assert.strictEqual(dataGet1.metrics.disputedMilestones[0].id, 'cm-20');
    console.log('   ✅ Initial metrics correctly sum expected payments (10M) and highlight DISPUTED milestone');

    // 2. User A updates cm-10 to SIGNED and PAID
    const reqPatchCM = createMockRequest(userA, 'PATCH', {
      actStatus: 'SIGNED',
      actSignedAt: new Date().toISOString(),
      paidAt: new Date().toISOString()
    });

    const resPatchCM = await patchMilestonePATCH(reqPatchCM, { params: { id: tenderId, milestoneId: 'cm-10' } });
    assert.strictEqual(resPatchCM.status, 200);

    // 3. GET execution metrics again -> expected = 6,000,000, received = 4,000,000
    const resGet2 = await getExecutionGET(reqGet, { params: { id: tenderId } });
    const dataGet2 = await resGet2.json();

    assert.strictEqual(dataGet2.metrics.receivedPaymentSum, 4000000, 'Received payment sum must update to 4,000,000');
    assert.strictEqual(dataGet2.metrics.expectedPaymentSum, 6000000, 'Expected payment sum must decrease to 6,000,000');
    console.log('   ✅ Updating milestone paidAt correctly updates received and expected payment sums');
  } finally {
    prisma.contractExecution.findUnique = origFindUniqueCE;
    prisma.contractMilestone.findUnique = origFindUniqueCM;
    prisma.contractMilestone.update = origUpdateCM;
  }
}

async function runAll() {
  try {
    await testTenantIsolationSecurity();
    await testActsAndPaymentTracking();
    console.log('\n🎉 Contract Execution Acts Tracker & Tenant Isolation Test Suite completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test Failure:', err);
    process.exit(1);
  }
}

runAll();
