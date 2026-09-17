require('tsx/cjs');
const assert = require('assert');
const { resolveEffectiveUserPlan, validateExportAccess } = require('../../src/lib/security/subscription-guard');
const { prisma } = require('../../src/lib/prisma');

console.log('🧪 Starting Organization Billing & Subscription Test Suite...\n');

async function testResolveEffectiveUserPlan() {
  console.log('1️⃣ Testing resolveEffectiveUserPlan logic...');
  const origFindUnique = prisma.user.findUnique;
  const origBillingEnabled = process.env.BILLING_ENABLED;

  try {
    // -------------------------------------------------------------
    // Part A: BILLING_ENABLED !== 'true' (Default / Internal deployment)
    // -------------------------------------------------------------
    console.log('   Testing BILLING_ENABLED=false (Task 9 default)...');
    process.env.BILLING_ENABLED = 'false';

    // Empty or non-string user ID must return FREE
    const planEmpty = await resolveEffectiveUserPlan('');
    assert.strictEqual(planEmpty, 'FREE', 'Empty userId must return FREE');
    console.log('   ✅ Empty userId safely returns FREE');

    // Any authenticated user must immediately receive ENTERPRISE without querying DB
    let dbCalled = false;
    prisma.user.findUnique = async () => {
      dbCalled = true;
      return { id: 'any-user', role: 'USER', companyProfile: { subscriptionPlan: 'FREE' } };
    };

    const defaultPlan = await resolveEffectiveUserPlan('any-authenticated-user');
    assert.strictEqual(defaultPlan, 'ENTERPRISE', 'When BILLING_ENABLED=false, any authenticated user must receive ENTERPRISE');
    assert.strictEqual(dbCalled, false, 'When BILLING_ENABLED=false, DB must NOT be queried');
    console.log('   ✅ When BILLING_ENABLED=false, any user gets ENTERPRISE without DB queries');

    // -------------------------------------------------------------
    // Part B: BILLING_ENABLED === 'true' (Active Kaspi Pay Acquiring)
    // -------------------------------------------------------------
    console.log('   Testing BILLING_ENABLED=true (Tiered subscription ranking)...');
    process.env.BILLING_ENABLED = 'true';

    // 1.1 Non-existent user
    prisma.user.findUnique = async () => null;
    const planNull = await resolveEffectiveUserPlan('non-existent');
    assert.strictEqual(planNull, 'FREE', 'Non-existent user must default to FREE');
    console.log('   ✅ Non-existent user defaults to FREE');

    // 1.2 Admin role
    prisma.user.findUnique = async () => ({
      id: 'admin-1',
      role: 'ADMIN',
      companyProfile: { subscriptionPlan: 'FREE' },
      orgMemberships: []
    });
    const planAdmin = await resolveEffectiveUserPlan('admin-1');
    assert.strictEqual(planAdmin, 'ENTERPRISE', 'Admin must always resolve to ENTERPRISE');
    console.log('   ✅ ADMIN role resolves to ENTERPRISE');

    // 1.3 Personal PRO profile, no organization
    prisma.user.findUnique = async () => ({
      id: 'user-pro',
      role: 'USER',
      companyProfile: { subscriptionPlan: 'PRO' },
      orgMemberships: []
    });
    const planPro = await resolveEffectiveUserPlan('user-pro');
    assert.strictEqual(planPro, 'PRO', 'Personal PRO must resolve to PRO');
    console.log('   ✅ Personal profile plan correctly recognized');

    // 1.4 Personal FREE profile, but member of TEAM organization
    prisma.user.findUnique = async () => ({
      id: 'member-team',
      role: 'USER',
      companyProfile: { subscriptionPlan: 'FREE' },
      orgMemberships: [
        {
          role: 'MEMBER',
          organization: { id: 'org-1', name: 'Bastion Team', subscriptionPlan: 'TEAM' }
        }
      ]
    });
    const planTeam = await resolveEffectiveUserPlan('member-team');
    assert.strictEqual(planTeam, 'TEAM', 'User in TEAM organization must inherit TEAM plan');
    console.log('   ✅ Member of TEAM organization inherits TEAM plan');

    // 1.5 Personal PRO profile, but member of ENTERPRISE organization
    prisma.user.findUnique = async () => ({
      id: 'member-ent',
      role: 'USER',
      companyProfile: { subscriptionPlan: 'PRO' },
      orgMemberships: [
        {
          role: 'MEMBER',
          organization: { id: 'org-2', name: 'Enterprise Corp', subscriptionPlan: 'ENTERPRISE' }
        }
      ]
    });
    const planEnt = await resolveEffectiveUserPlan('member-ent');
    assert.strictEqual(planEnt, 'ENTERPRISE', 'Higher organization plan overrides personal plan');
    console.log('   ✅ Higher organization plan overrides lower personal plan');
  } finally {
    prisma.user.findUnique = origFindUnique;
    if (origBillingEnabled !== undefined) {
      process.env.BILLING_ENABLED = origBillingEnabled;
    } else {
      delete process.env.BILLING_ENABLED;
    }
  }
}

async function testExportAccessWithOrgPlan() {
  console.log('\n2️⃣ Testing validateExportAccess with organization TEAM plan in production...');
  const origFindUnique = prisma.user.findUnique;
  const origNodeEnv = process.env.NODE_ENV;
  const origAllowDemo = process.env.ALLOW_DEMO_AUTH;
  const origBillingEnabled = process.env.BILLING_ENABLED;

  try {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DEMO_AUTH;

    // Setup authenticated memory session
    process.env.AUTH_STORE_MODE = 'memory';
    const { createUser, createSession } = require('../../src/lib/security/auth-store');
    const userRecord = await createUser({
      email: 'user-org-export@test.kz',
      passwordHash: 'dummy-hash',
      role: 'USER',
      status: 'APPROVED'
    });
    const session = await createSession(userRecord.id);

    // Ensure prisma.user.findUnique responds for this userRecord.id
    prisma.user.findUnique = async () => ({
      id: userRecord.id,
      role: 'USER',
      companyProfile: { subscriptionPlan: 'FREE' },
      orgMemberships: [
        {
          role: 'MEMBER',
          organization: { id: 'org-export', subscriptionPlan: 'TEAM' }
        }
      ]
    });

    const req = {
      headers: {
        get: (key) => {
          if (key.toLowerCase() === 'x-session-id') return session.id;
          return null;
        }
      },
      cookies: {
        get: () => null
      }
    };

    // Mode A: BILLING_ENABLED=false -> automatically ENTERPRISE
    process.env.BILLING_ENABLED = 'false';
    const resDisabled = await validateExportAccess(req);
    assert.strictEqual(resDisabled.authorized, true, 'Export access must be authorized when billing is disabled');
    assert.strictEqual(resDisabled.plan, 'ENTERPRISE', 'Plan must be ENTERPRISE when BILLING_ENABLED=false');
    console.log('   ✅ When BILLING_ENABLED=false, export access is granted with ENTERPRISE plan');

    // Mode B: BILLING_ENABLED=true -> inherits TEAM from organization
    process.env.BILLING_ENABLED = 'true';
    const res = await validateExportAccess(req);
    assert.strictEqual(res.authorized, true, 'User with org TEAM plan must have export access');
    assert.strictEqual(res.plan, 'TEAM');
    console.log('   ✅ Member of TEAM organization is granted export access in production when BILLING_ENABLED=true');
  } finally {
    prisma.user.findUnique = origFindUnique;
    process.env.NODE_ENV = origNodeEnv;
    delete process.env.AUTH_STORE_MODE;
    if (origAllowDemo !== undefined) {
      process.env.ALLOW_DEMO_AUTH = origAllowDemo;
    } else {
      delete process.env.ALLOW_DEMO_AUTH;
    }
    if (origBillingEnabled !== undefined) {
      process.env.BILLING_ENABLED = origBillingEnabled;
    } else {
      delete process.env.BILLING_ENABLED;
    }
  }
}

async function testCreateOrderOrganizationLink() {
  console.log('\n3️⃣ Testing create-order organizationId persistence logic...');
  const fs = require('fs');
  const path = require('path');
  const createOrderCode = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/billing/kaspi/create-order/route.ts'),
    'utf8'
  );

  assert.ok(
    createOrderCode.includes('organizationId: bodyOrgId') || createOrderCode.includes('bodyOrgId'),
    'create-order route must extract organizationId from body'
  );
  assert.ok(
    createOrderCode.includes('organizationId: targetOrgId'),
    'create-order route must save organizationId in Payment.create'
  );
  console.log('   ✅ create-order route extracts and persists organizationId in Payment');
}

async function testWebhookOrganizationSync() {
  console.log('\n4️⃣ Testing webhook organization and companyProfile plan sync...');
  const fs = require('fs');
  const path = require('path');
  const webhookCode = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/billing/kaspi/webhook/route.ts'),
    'utf8'
  );

  assert.ok(
    webhookCode.includes('prisma.organization.updateMany') &&
    webhookCode.includes('associatedOrgId'),
    'webhook must update organization.subscriptionPlan for associatedOrgId'
  );
  assert.ok(
    webhookCode.includes('prisma.companyProfile.updateMany') &&
    webhookCode.includes('where: { organizationId: associatedOrgId }'),
    'webhook must sync companyProfile.subscriptionPlan for organizationId'
  );
  console.log('   ✅ webhook syncs plan across organization and associated company profiles');
}

async function testPublicApiGuardOrgPlan() {
  console.log('\n5️⃣ Testing public-api-guard org plan integration...');
  const { getUserSubscriptionPlan } = require('../../src/lib/security/public-api-guard');
  const origFindUnique = prisma.user.findUnique;
  const origBillingEnabled = process.env.BILLING_ENABLED;

  try {
    // Mode A: BILLING_ENABLED=false -> all users get ENTERPRISE for API keys
    process.env.BILLING_ENABLED = 'false';
    const planDisabled = await getUserSubscriptionPlan('user-free-api');
    assert.strictEqual(planDisabled, 'ENTERPRISE', 'getUserSubscriptionPlan must return ENTERPRISE when BILLING_ENABLED=false');
    console.log('   ✅ public-api-guard grants ENTERPRISE when BILLING_ENABLED=false');

    // Mode B: BILLING_ENABLED=true -> tiered check
    process.env.BILLING_ENABLED = 'true';

    // User has FREE personal profile, but ENTERPRISE organization membership
    prisma.user.findUnique = async () => ({
      id: 'user-org-api',
      role: 'USER',
      companyProfile: { subscriptionPlan: 'FREE' },
      orgMemberships: [
        {
          role: 'MEMBER',
          organization: { id: 'org-ent', subscriptionPlan: 'ENTERPRISE' }
        }
      ]
    });

    const plan = await getUserSubscriptionPlan('user-org-api');
    assert.strictEqual(plan, 'ENTERPRISE', 'getUserSubscriptionPlan must inherit organization ENTERPRISE plan');
    console.log('   ✅ public-api-guard correctly inherits organization ENTERPRISE plan');

    // User has FREE personal profile and no organization
    prisma.user.findUnique = async () => ({
      id: 'user-free-api',
      role: 'USER',
      companyProfile: { subscriptionPlan: 'FREE' },
      orgMemberships: []
    });

    const freePlan = await getUserSubscriptionPlan('user-free-api');
    assert.strictEqual(freePlan, 'FREE', 'getUserSubscriptionPlan must return FREE for free users (no enterprise fallback leak)');
    console.log('   ✅ public-api-guard returns FREE for free users without enterprise fallback leak');
  } finally {
    prisma.user.findUnique = origFindUnique;
    if (origBillingEnabled !== undefined) {
      process.env.BILLING_ENABLED = origBillingEnabled;
    } else {
      delete process.env.BILLING_ENABLED;
    }
  }
}

async function testCalculationLimitOrgPlan() {
  console.log('\n6️⃣ Testing calculation limit org plan integration (code inspection & unit)...');
  const fs = require('fs');
  const path = require('path');
  const calcRouteCode = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/tenders/[id]/calculation/route.ts'),
    'utf8'
  );

  assert.ok(
    calcRouteCode.includes("import { resolveEffectiveUserPlan } from '@/lib/security/subscription-guard'"),
    'calculation route must import resolveEffectiveUserPlan'
  );
  assert.ok(
    calcRouteCode.includes('checkCalculationLimit(companyProfile, auth.userId)'),
    'calculation route must pass auth.userId to checkCalculationLimit'
  );
  assert.ok(
    calcRouteCode.includes('await resolveEffectiveUserPlan(userId)'),
    'checkCalculationLimit must resolve effective plan including organization'
  );
  console.log('   ✅ calculation route correctly resolves effective plan from organization');
}

async function testCompanyProfileEffectivePlan() {
  console.log('\n7️⃣ Testing /api/company-profile returns effective ENTERPRISE plan when BILLING_ENABLED=false...');
  const { GET: companyProfileGET } = require('../../src/app/api/company-profile/route');
  const origFindFirst = prisma.companyProfile.findFirst;
  const origBillingEnabled = process.env.BILLING_ENABLED;

  try {
    process.env.BILLING_ENABLED = 'false';

    // Mock DB returning FREE plan for company profile
    prisma.companyProfile.findFirst = async () => ({
      id: 'prof-free-1',
      userId: 'user-free-1',
      companyName: 'Test FREE Co',
      bin: '123456789012',
      subscriptionPlan: 'FREE'
    });

    const req = {
      headers: {
        get: (key) => {
          if (key.toLowerCase() === 'x-user-id') return 'user-free-1';
          return null;
        }
      },
      cookies: {
        get: () => null
      }
    };

    const res = await companyProfileGET(req);
    const data = await res.json();

    assert.strictEqual(data.success, true);
    assert.strictEqual(data.profile.subscriptionPlan, 'ENTERPRISE', 'Profile subscriptionPlan must be upgraded to effective ENTERPRISE plan');
    console.log('   ✅ /api/company-profile correctly returns effective ENTERPRISE plan to client');
  } finally {
    prisma.companyProfile.findFirst = origFindFirst;
    if (origBillingEnabled !== undefined) {
      process.env.BILLING_ENABLED = origBillingEnabled;
    } else {
      delete process.env.BILLING_ENABLED;
    }
  }
}

async function runAll() {
  try {
    await testResolveEffectiveUserPlan();
    await testExportAccessWithOrgPlan();
    await testCreateOrderOrganizationLink();
    await testWebhookOrganizationSync();
    await testPublicApiGuardOrgPlan();
    await testCalculationLimitOrgPlan();
    await testCompanyProfileEffectivePlan();
    console.log('\n🎉 Organization Billing & Subscription Test Suite completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test Failure:', err);
    process.exit(1);
  }
}

runAll();

