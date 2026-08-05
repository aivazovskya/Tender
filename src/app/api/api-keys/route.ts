import { NextRequest, NextResponse } from 'next/server';
import { validateApiAuth } from '@/lib/security/auth';
import { 
  createApiKeyForUser, 
  revokeApiKeyForUser, 
  listApiKeysForUser,
  getUserSubscriptionPlan
} from '@/lib/security/public-api-guard';

export async function GET(request: NextRequest) {
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) {
    return auth.response;
  }

  const userId = auth.userId || 'user-enterprise-default';
  const plan = await getUserSubscriptionPlan(userId);

  const keys = await listApiKeysForUser(userId);

  return NextResponse.json({
    success: true,
    userPlan: plan,
    keys
  });
}

export async function POST(request: NextRequest) {
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) {
    return auth.response;
  }

  const userId = auth.userId || 'user-enterprise-default';
  const plan = await getUserSubscriptionPlan(userId);

  if (plan !== 'ENTERPRISE' && userId !== 'admin-system-user') {
    return NextResponse.json({
      success: false,
      error: 'Выпуск API-ключей доступен только для пользователей на тарифе Enterprise'
    }, { status: 403 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const label = (body.label || 'Ключ интеграции 1С/CRM').trim();
  const result = await createApiKeyForUser(userId, label);

  return NextResponse.json({
    success: true,
    rawKey: result.rawKey,
    apiKey: result.record
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await validateApiAuth(request);
  if (!auth.authorized && auth.response) {
    return auth.response;
  }

  const userId = auth.userId || 'user-enterprise-default';
  const { searchParams } = new URL(request.url);
  const keyId = searchParams.get('id');

  if (!keyId) {
    return NextResponse.json({ success: false, error: 'Параметр id обязателен для отзыва ключа' }, { status: 400 });
  }

  const revoked = await revokeApiKeyForUser(keyId, userId);

  return NextResponse.json({
    success: revoked,
    message: revoked ? 'API-ключ успешно отозван' : 'Ключ не найден или уже был отозван'
  });
}
