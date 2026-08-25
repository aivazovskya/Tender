const http = require('http');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

function makeRequest(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqOptions = {
      method: options.method || 'GET',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: options.headers || {}
    };

    if (body) {
      if (typeof body === 'object') {
        reqOptions.headers['Content-Type'] = 'application/json';
        body = JSON.stringify(body);
      }
      reqOptions.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        
        // Extract Set-Cookie
        const setCookie = res.headers['set-cookie'];
        let sessionCookie = null;
        if (setCookie) {
          const match = Array.isArray(setCookie) 
            ? setCookie.join(';').match(/tender_session_id=([^;]+)/)
            : setCookie.match(/tender_session_id=([^;]+)/);
          if (match) {
            sessionCookie = match[1];
          }
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json || data,
          sessionCookie
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Запуск тестов: Закрытый доступ, премодерация пользователей и безопасность API...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Unauthenticated requests to protected API
    console.log('1. Проверка блокировки неавторизованного доступа к API:');
    const unauthTenders = await makeRequest('/api/tenders');
    assert(unauthTenders.status === 401, `GET /api/tenders без сессии возвращает 401 (получено: ${unauthTenders.status})`);

    const unauthTenderDetail = await makeRequest('/api/tenders/test-tender-1');
    assert(unauthTenderDetail.status === 401, `GET /api/tenders/:id без сессии возвращает 401 (получено: ${unauthTenderDetail.status})`);

    // 2. User Registration flow (PENDING status)
    console.log('\n2. Проверка регистрации пользователя (статус PENDING, без автологина):');
    const testEmail = `mod_test_${Date.now()}@corp.kz`;
    const regRes = await makeRequest('/api/auth/register', { method: 'POST' }, {
      email: testEmail,
      password: 'password12345',
      name: 'Тестовый Кандидат'
    });

    assert(regRes.status === 200, `POST /api/auth/register вернул 200 (получено: ${regRes.status})`);
    assert(regRes.data.pending === true, `Ответ содержит pending: true`);
    assert(regRes.data.message && regRes.data.message.includes('одобрения'), `Сообщение информирует об ожидании одобрения: "${regRes.data.message}"`);
    assert(!regRes.sessionCookie, `Сессионная cookie НЕ установлена при регистрации`);

    const candidateUserId = regRes.data.user?.id;
    assert(!!candidateUserId, `ID созданного пользователя получен: ${candidateUserId}`);

    // 3. Login attempt with PENDING status
    console.log('\n3. Проверка попытки входа со статусом PENDING:');
    const pendingLogin = await makeRequest('/api/auth/login', { method: 'POST' }, {
      email: testEmail,
      password: 'password12345'
    });

    assert(pendingLogin.status === 403, `POST /api/auth/login для PENDING пользователя возвращает 403 Forbidden (получено: ${pendingLogin.status})`);
    assert(pendingLogin.data.status === 'PENDING', `Ответ содержит статус PENDING`);
    assert(pendingLogin.data.message && pendingLogin.data.message.includes('одобрена'), `Сообщение сообщает о неодобренной заявке`);
    assert(!pendingLogin.sessionCookie, `Сессионная cookie НЕ выдана`);

    // 4. Admin login
    console.log('\n4. Авторизация администратора:');
    const adminLogin = await makeRequest('/api/auth/login', { method: 'POST' }, {
      email: 'admin@tender.ai',
      password: 'admin12345'
    });

    assert(adminLogin.status === 200, `Вход администратора успешен (статус: ${adminLogin.status})`);
    const adminCookie = adminLogin.sessionCookie;
    assert(!!adminCookie, `Администратор получил сессионную cookie`);

    // 5. Admin fetching pending users
    console.log('\n5. Просмотр списка заявок на модерацию администратором:');
    const pendingListRes = await makeRequest('/api/admin/users/pending', {
      headers: { 'Cookie': `tender_session_id=${adminCookie}` }
    });

    assert(pendingListRes.status === 200, `GET /api/admin/users/pending вернул 200 OK`);
    assert(Array.isArray(pendingListRes.data.users), `Список пользователей является массивом`);
    const hasCandidate = pendingListRes.data.users.some(u => u.email === testEmail);
    assert(hasCandidate, `Заявка пользователя ${testEmail} присутствует в списке ожидания`);

    // 6. Non-admin attempting to access admin API
    console.log('\n6. Проверка RBAC: запрет доступа к модерации для обычных пользователей:');
    const unauthAdminAccess = await makeRequest('/api/admin/users/pending');
    assert(unauthAdminAccess.status === 401, `Неавторизованный запрос к админке возвращает 401`);

    // 7. Admin approves candidate
    console.log('\n7. Одобрение заявки администратором:');
    const approveRes = await makeRequest(`/api/admin/users/${candidateUserId}/approve`, {
      method: 'POST',
      headers: { 'Cookie': `tender_session_id=${adminCookie}` }
    });

    assert(approveRes.status === 200, `POST /api/admin/users/:id/approve вернул 200 OK`);
    assert(approveRes.data.success === true, `Ответ содержит success: true`);
    assert(approveRes.data.user?.status === 'APPROVED', `Статус пользователя изменен на APPROVED`);

    // 8. User login after approval
    console.log('\n8. Вход пользователя после одобрения администратором:');
    const approvedLogin = await makeRequest('/api/auth/login', { method: 'POST' }, {
      email: testEmail,
      password: 'password12345'
    });

    assert(approvedLogin.status === 200, `Вход одобренного пользователя успешен (статус: ${approvedLogin.status})`);
    const userCookie = approvedLogin.sessionCookie;
    assert(!!userCookie, `Одобренный пользователь получил сессию`);

    // 9. Access to protected API with approved user session
    console.log('\n9. Запрос к каталогу тендеров с авторизованной сессией:');
    const authorizedTenders = await makeRequest('/api/tenders', {
      headers: { 'Cookie': `tender_session_id=${userCookie}` }
    });
    assert(authorizedTenders.status === 200, `GET /api/tenders с сессией вернул 200 OK (получено: ${authorizedTenders.status})`);
    assert(authorizedTenders.data.success === true, `Ответ содержит success: true и данные каталога`);

    // 10. User rejection flow
    console.log('\n10. Проверка отклонения заявки администратором:');
    const rejectEmail = `reject_test_${Date.now()}@corp.kz`;
    const rejectReg = await makeRequest('/api/auth/register', { method: 'POST' }, {
      email: rejectEmail,
      password: 'password12345',
      name: 'Отклоняемый Кандидат'
    });
    const rejectUserId = rejectReg.data.user?.id;

    const rejectRes = await makeRequest(`/api/admin/users/${rejectUserId}/reject`, {
      method: 'POST',
      headers: { 'Cookie': `tender_session_id=${adminCookie}` }
    });
    assert(rejectRes.status === 200, `POST /api/admin/users/:id/reject вернул 200 OK`);

    const rejectLogin = await makeRequest('/api/auth/login', { method: 'POST' }, {
      email: rejectEmail,
      password: 'password12345'
    });
    assert(rejectLogin.status === 403, `Вход отклоненного пользователя заблокирован (статус: 403)`);
    assert(rejectLogin.data.status === 'REJECTED', `Ответ содержит status: REJECTED`);

  } catch (err) {
    console.error('❌ Критическая ошибка во время тестов:', err);
    failed++;
  }

  console.log('\n========================================');
  console.log(`Итог тестов закрытого доступа: Пройдено: ${passed}, Ошибок: ${failed}`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
