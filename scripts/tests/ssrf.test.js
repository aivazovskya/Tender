require('tsx/cjs');
const { validateUrlForSSRF } = require('../../src/lib/security/ssrf');

function testSSRFProtection() {
  console.log('🧪 [Test Suite] Testing SSRF Protection Filter...');

  const validUrl = validateUrlForSSRF('https://goszakup.gov.kz/ru/announce/index/123');
  if (!validUrl.allowed) throw new Error('Valid URL was blocked by SSRF filter');
  console.log('  ✅ Public HTTPS URL allowed');

  const metadataUrl = validateUrlForSSRF('http://169.254.169.254/latest/meta-data/');
  if (metadataUrl.allowed) throw new Error('Cloud metadata IP 169.254.169.254 was NOT blocked');
  console.log('  ✅ Cloud Metadata IP 169.254.169.254 blocked');

  const localhostUrl = validateUrlForSSRF('http://localhost:6379');
  if (localhostUrl.allowed) throw new Error('Localhost URL was NOT blocked');
  console.log('  ✅ Localhost URL blocked');

  const dockerHost = validateUrlForSSRF('http://db:5432');
  if (dockerHost.allowed) throw new Error('Docker host db:5432 was NOT blocked');
  console.log('  ✅ Docker container host db:5432 blocked');
}

testSSRFProtection();
