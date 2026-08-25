const http = require('http');
const assert = require('assert');

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
  console.log('🧪 Тестирование: Криптографическая стойкость Session ID, Middleware и REST API без гейтов...\n');

  let passed = 0;
  let failed = 0;

  function testAssert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Check Session ID Format and Cryptographic Entropy on Login
    console.log('1. Проверка генерации криптографически стойкого Session ID:');
    const adminLogin = await makeRequest('/api/auth/login', { method: 'POST' }, {
      email: 'admin@tender.ai',
      password: 'admin12345'
    });

    testAssert(adminLogin.status === 200, `Вход администратора успешен (статус: ${adminLogin.status})`);
    const sessionId = adminLogin.sessionCookie;
    testAssert(!!sessionId, `Сессионный ID выдан: ${sessionId}`);
    testAssert(sessionId.startsWith('sess_'), `Сессия начинается с префикса "sess_"`);
    testAssert(/^sess_[a-f0-9]{64}$/.test(sessionId), `Сессия содержит ровно 64 hex-символа случайности (256 бит энтропии): ${sessionId}`);

    // 2. Middleware protection against malformed cookies
    console.log('\n2. Проверка middleware при обращении с некорректным форматом cookie:');
    const malformedCookieRes = await makeRequest('/', {
      headers: { 'Cookie': 'tender_session_id=invalid_garbage_token' }
    });
    // Next.js returns 307 redirect to /login
    testAssert(
      malformedCookieRes.status === 307 || malformedCookieRes.status === 302 || (malformedCookieRes.headers.location && malformedCookieRes.headers.location.includes('/login')),
      `Запрос с мусорным cookie перенаправлен на /login (HTTP ${malformedCookieRes.status}, Location: ${malformedCookieRes.headers.location})`
    );

    // 3. API protection against fake formatted session ID
    console.log('\n3. Проверка защиты API при поддельном 64-hex cookie:');
    const fakeSessionId = 'sess_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const fakeSessionApiRes = await makeRequest('/api/auth/me', {
      headers: { 'Cookie': `tender_session_id=${fakeSessionId}` }
    });
    testAssert(fakeSessionApiRes.status === 401, `API /api/auth/me возвращает 401 Unauthorized для несуществующей сессии в БД (получено: ${fakeSessionApiRes.status})`);

    // 4. REST API Key Management and Public API Access without Enterprise gate
    console.log('\n4. Проверка создания API-ключа и снятия гейта Enterprise:');
    const createKeyRes = await makeRequest('/api/api-keys', {
      method: 'POST',
      headers: { 'Cookie': `tender_session_id=${sessionId}` }
    }, {
      label: 'Тестовый ключ 1С'
    });

    testAssert(createKeyRes.status === 200, `POST /api/api-keys вернул 200 OK (получено: ${createKeyRes.status})`);
    testAssert(createKeyRes.data.success === true, `Ответ содержит success: true`);
    const rawApiKey = createKeyRes.data.rawKey;
    const keyId = createKeyRes.data.key?.id;
    testAssert(!!rawApiKey && rawApiKey.startsWith('tnd_ai_'), `Сгенерирован API-ключ: ${rawApiKey}`);

    // 5. Test Public REST API v1 endpoint with generated key
    console.log('\n5. Запрос к Публичному REST API v1 (/api/public/v1/tenders) с созданным ключом:');
    const publicTendersRes = await makeRequest('/api/public/v1/tenders', {
      headers: { 'x-api-key': rawApiKey }
    });

    testAssert(publicTendersRes.status === 200, `GET /api/public/v1/tenders с API-ключом вернул 200 OK (получено: ${publicTendersRes.status})`);
    testAssert(publicTendersRes.data.success === true, `Публичный API вернул данные тендеров без блокировки Enterprise`);
    testAssert(Array.isArray(publicTendersRes.data.tenders), `Список тендеров получен успешно`);

    // 6. Test Public REST API v1 Kanban endpoint with generated key
    console.log('\n6. Запрос к Публичному REST API v1 (/api/public/v1/kanban):');
    const publicKanbanRes = await makeRequest('/api/public/v1/kanban', {
      headers: { 'x-api-key': rawApiKey }
    });
    testAssert(publicKanbanRes.status === 200, `GET /api/public/v1/kanban вернул 200 OK`);
    testAssert(publicKanbanRes.data.success === true, `Канбан-карточки получены через Public API`);

    // 7. Revoke API key and verify immediate 401 blocking
    console.log('\n7. Отзыв API-ключа и проверка мгновенной блокировки:');
    const revokeRes = await makeRequest(`/api/api-keys?id=${encodeURIComponent(keyId)}`, {
      method: 'DELETE',
      headers: { 'Cookie': `tender_session_id=${sessionId}` }
    });
    testAssert(revokeRes.status === 200, `DELETE /api/api-keys вернул 200 OK`);

    const revokedPublicApiRes = await makeRequest('/api/public/v1/tenders', {
      headers: { 'x-api-key': rawApiKey }
    });
    testAssert(revokedPublicApiRes.status === 401, `Отозванный API-ключ сразу заблокирован с 401 Unauthorized (получено: ${revokedPublicApiRes.status})`);

  } catch (err) {
    console.error('❌ Критическая ошибка:', err);
    failed++;
  }

  console.log('\n========================================');
  console.log(`Итог тестов: Пройдено: ${passed}, Ошибок: ${failed}`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
