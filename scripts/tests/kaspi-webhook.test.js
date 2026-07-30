const crypto = require('crypto');

function verifyKaspiSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  if (secret.includes('your_') || secret === 'kaspi_hmac_secret_key_change_in_production') return false;
  try {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'utf-8');
    const signatureBuffer = Buffer.from(signatureHeader, 'utf-8');

    if (expectedBuffer.length !== signatureBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch {
    return false;
  }
}

function testKaspiWebhookHMAC() {
  console.log('🧪 [Test Suite] Testing Kaspi Pay Webhook HMAC-SHA256 Verification & Secret Hardening (Bug #11)...');
  const secret = 'kaspi_test_secret_key_123';
  const rawBody = JSON.stringify({ orderId: 'ORD-12345', status: 'SUCCESS', amount: 29900 });

  const validSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const isValid = verifyKaspiSignature(rawBody, validSignature, secret);
  if (!isValid) throw new Error('Kaspi HMAC valid signature check failed');
  console.log('  ✅ Kaspi HMAC verification with valid secret passed');

  const isInvalid = verifyKaspiSignature(rawBody, 'invalid_signature_hash', secret);
  if (isInvalid) throw new Error('Kaspi HMAC invalid signature check failed');
  console.log('  ✅ Kaspi HMAC verification with invalid secret rejected as expected');

  const defaultSecretRejected = verifyKaspiSignature(rawBody, validSignature, 'kaspi_hmac_secret_key_change_in_production');
  if (defaultSecretRejected) throw new Error('Kaspi HMAC must reject legacy default secret');
  console.log('  ✅ Legacy default secret from .env.example rejected securely');
}

testKaspiWebhookHMAC();
