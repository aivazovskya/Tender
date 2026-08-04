const http = require('http');

async function makeRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const headers = { 'Content-Type': 'application/json' };
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
  console.log('🧪 Запуск тестов безопасности биллинга...');

  // 1. First ensure user has a profile with FREE plan
  const createProfileRes = await makeRequest('/api/company-profile', 'POST', {
    companyName: 'Тест Биллинг ТОО',
    bin: '170440023910',
    activities: 'Тестирование',
    keywords: ['Тест'],
    regions: ['г. Астана'],
    subscriptionPlan: 'ENTERPRISE' // Attempt to bypass via profile payload
  });
  console.log('   Результат создания профиля:', createProfileRes.data);

  // Check profile subscriptionPlan in DB via GET
  const getRes1 = await makeRequest('/api/company-profile', 'GET');
  console.log('1️⃣ Проверка защиты POST /api/company-profile:');
  console.log('   Тариф в БД после попытки установить ENTERPRISE через профиль:', getRes1.data.profile?.subscriptionPlan);
  if (getRes1.data.profile?.subscriptionPlan !== 'ENTERPRISE') {
    console.log('   ✅ Успешно! subscriptionPlan через /api/company-profile проигнорирован.');
  } else {
    console.error('   ❌ Ошибка! subscriptionPlan был изменён через /api/company-profile!');
  }

  // 2. Attempt UPGRADE via /api/billing/change-plan (FREE -> PRO)
  const upgradeRes = await makeRequest('/api/billing/change-plan', 'POST', { planId: 'PRO' });
  console.log('\n2️⃣ Проверка блокировки безналичного апгрейда (FREE -> PRO):');
  console.log('   HTTP Status:', upgradeRes.status);
  console.log('   Ответ сервера:', upgradeRes.data);
  if (upgradeRes.status === 402 && upgradeRes.data.requiresPayment === true) {
    console.log('   ✅ Успешно! Сервер вернул 402 Payment Required и заблокировал бесплатный апгрейд.');
  } else {
    console.error('   ❌ Ошибка! Сервер разрешил апгрейд без оплаты!');
  }

  // 3. Attempt DOWNGRADE / FREE via /api/billing/change-plan (planId: 'FREE')
  const freeRes = await makeRequest('/api/billing/change-plan', 'POST', { planId: 'FREE' });
  console.log('\n3️⃣ Проверка разрешенного перехода на FREE (Downgrade):');
  console.log('   HTTP Status:', freeRes.status);
  console.log('   Ответ сервера:', freeRes.data);
  if (freeRes.status === 200 && freeRes.data.success === true) {
    console.log('   ✅ Успешно! Переход на FREE разрешен без оплаты.');
  } else {
    console.error('   ❌ Ошибка при переходе на FREE!');
  }

  console.log('\n🎉 Все проверки безопасности биллинга завершены!');
}

runTests().catch(console.error);
