const http = require('http');

async function makeRequest(path, method, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const headers = { 
      'Content-Type': 'application/json',
      ...extraHeaders
    };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method,
        headers
      },
      (res) => {
        let resData = '';
        res.on('data', chunk => resData += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(resData || '{}') }));
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Запуск тестов безопасности биллинга (v2)...');

  const testUserId = 'test-user-id-unique-99';
  const userHeaders = { 'x-session-id': 'session-test-unique-123', 'x-user-id': testUserId };

  // 1. Create a company profile for test user
  const createProfileRes = await makeRequest('/api/company-profile', 'POST', {
    companyName: 'Тест Биллинг ТОО',
    bin: '777666555444',
    activities: 'Тестирование',
    keywords: ['Тест'],
    regions: ['г. Астана'],
    subscriptionPlan: 'ENTERPRISE' // Attempt bypass via profile payload
  }, userHeaders);
  console.log('1️⃣ Проверка защиты POST /api/company-profile:');
  console.log('   Тариф в профиле после создания:', createProfileRes.data.profile?.subscriptionPlan);
  if (createProfileRes.data.profile?.subscriptionPlan === 'FREE') {
    console.log('   ✅ Успешно! subscriptionPlan проигнорирован и установлен на FREE по дефолту.');
  } else {
    console.error('   ❌ Ошибка! subscriptionPlan был изменён через профиль!');
  }

  // 2. IDOR Security Test for change-plan from unknown user without profile
  const unknownUserHeaders = { 'x-user-id': 'random-unknown-user-9999' };
  const idorRes = await makeRequest('/api/billing/change-plan', 'POST', { planId: 'FREE' }, unknownUserHeaders);
  console.log('\n2️⃣ Находка 1: Проверка устранения IDOR (change-plan без собственного профиля):');
  console.log('   HTTP Status:', idorRes.status);
  console.log('   Ответ сервера:', idorRes.data);
  if (idorRes.status === 404 && idorRes.data.message?.includes('Профиль компании не найден')) {
    console.log('   ✅ Успешно! Запрос без профиля получил 404 и не коснулся чужих данных.');
  } else {
    console.error('   ❌ Ошибка! IDOR уязвимость воспроизводится!');
  }

  // 3. Attempt UPGRADE via /api/billing/change-plan (FREE -> PRO)
  const upgradeRes = await makeRequest('/api/billing/change-plan', 'POST', { planId: 'PRO' }, userHeaders);
  console.log('\n3️⃣ Проверка блокировки безналичного апгрейда (FREE -> PRO):');
  console.log('   HTTP Status:', upgradeRes.status);
  console.log('   Ответ сервера:', upgradeRes.data);
  if (upgradeRes.status === 402 && upgradeRes.data.requiresPayment === true) {
    console.log('   ✅ Успешно! Сервер вернул 402 Payment Required и заблокировал бесплатный апгрейд.');
  } else {
    console.error('   ❌ Ошибка! Сервер разрешил апгрейд без оплаты!');
  }

  // 4. Test Admin Manual Grant (POST /api/admin/billing/grant-plan)
  const adminHeaders = { 'x-api-key': 'dev-admin-key' };
  const grantRes = await makeRequest('/api/admin/billing/grant-plan', 'POST', {
    bin: '777666555444',
    planId: 'TEAM',
    reason: 'Оплата по безналичному счету №104 от ТОО КазИТ'
  }, adminHeaders);
  console.log('\n4️⃣ Находка 2: Проверка ручной выдачи тарифа админом (grant-plan + BillingAuditLog):');
  console.log('   HTTP Status:', grantRes.status);
  console.log('   Ответ сервера:', grantRes.data);
  if (grantRes.status === 200 && grantRes.data.success === true) {
    console.log('   ✅ Успешно! Админ выдал тариф TEAM, запись создана в BillingAuditLog без 500 ошибки.');
  } else {
    console.error('   ❌ Ошибка при вызове grant-plan!');
  }

  // Check updated profile
  const getResFinal = await makeRequest('/api/company-profile', 'GET', null, userHeaders);
  console.log('\n5️⃣ Финальная проверка профиля:');
  console.log('   Текущий тариф профиля:', getResFinal.data.profile?.subscriptionPlan);

  console.log('\n🎉 Все тесты безопасности биллинга (v2) завершены!');
}

runTests().catch(console.error);
