export interface KaspiTariffPlan {
  id: 'FREE' | 'PRO' | 'TEAM' | 'ENTERPRISE';
  name: string;
  priceKztMonth: number;
  features: string[];
  recommended?: boolean;
}

export interface KaspiQrPaymentResponse {
  paymentId: string;
  qrPayload: string;
  amountKzt: number;
  tariffPlanId: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';
  expiresAt: string;
}

export const TARIFF_PLANS: KaspiTariffPlan[] = [
  {
    id: 'FREE',
    name: 'Бесплатный (Free)',
    priceKztMonth: 0,
    features: [
      'Базовый поиск по госзакупкам',
      'Задержка синхронизации T+24ч',
      'До 5 сохранений в воронку',
      '1 профиль компании'
    ]
  },
  {
    id: 'PRO',
    name: 'Профессиональный (PRO)',
    priceKztMonth: 29900,
    recommended: true,
    features: [
      'Мониторинг goszakup.gov.kz + Самрук в режиме T+0',
      'Семантический ИИ-поиск и матчинг',
      'Уведомления в Telegram-бот мгновенно',
      'Оценка рисков и RAG-анализ ТЗ',
      'До 100 сохранений в воронку'
    ]
  },
  {
    id: 'TEAM',
    name: 'Командный (Team)',
    priceKztMonth: 69900,
    features: [
      'Все функции тарифа PRO',
      'До 5 сотрудников в аккаунте',
      'Назначение ответственных в Kanban',
      'Экспорт отчетов в Excel / PDF',
      'Приоритетная поддержка 24/7'
    ]
  },
  {
    id: 'ENTERPRISE',
    name: 'Корпоративный (Enterprise)',
    priceKztMonth: 199000,
    features: [
      'Безлимитные сотрудники и ИИ-аналитика',
      'Доступ к REST API для интеграции с 1С/CRM',
      'Персональный тендерный юрист',
      'Выделенный сервер и гарантия SLA 99.9%'
    ]
  }
];

export class KaspiPayService {
  /**
   * Generates Kaspi Pay QR payment order metadata and payload URL.
   * NOTE: Formats standard Kaspi Pay acquiring link format (kaspi.kz/pay) for merchant service.
   * Incoming payment verification and subscription activation are handled via secure HMAC-SHA256
   * webhook endpoint at POST /api/billing/kaspi/webhook using KASPI_WEBHOOK_SECRET.
   */
  static generateQrCode(tariffId: string, amountKzt: number): KaspiQrPaymentResponse {
    const orderId = `ORD-KZ-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins expiry

    const qrPayload = `https://kaspi.kz/pay/TenderAI?service_id=88491&order_id=${orderId}&amount=${amountKzt}`;

    return {
      paymentId: orderId,
      qrPayload,
      amountKzt,
      tariffPlanId: tariffId,
      status: 'PENDING',
      expiresAt
    };
  }

  /**
   * Registers a new Payment order on backend server and Kaspi Business API
   */
  static async createOrder(tariffId: string, amountKzt: number): Promise<KaspiQrPaymentResponse> {
    try {
      const res = await fetch('/api/billing/kaspi/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tariffId, amountKzt })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.payment) {
          return data.payment;
        }
      }
    } catch (err) {
      console.warn('[KaspiPayService] Ошибка вызова API создания заказа:', err);
    }

    return this.generateQrCode(tariffId, amountKzt);
  }

  /**
   * Real Status Check against server database
   * Never defaults to true. Returns UNKNOWN / PENDING on network errors.
   */
  static async checkPaymentStatus(orderId: string): Promise<'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'UNKNOWN'> {
    try {
      const response = await fetch(`/api/billing/kaspi/status?orderId=${encodeURIComponent(orderId)}`, {
        cache: 'no-store'
      });
      if (!response.ok) return 'UNKNOWN';
      const data = await response.json();
      return data.status || 'UNKNOWN';
    } catch (error) {
      console.error('[KaspiPayService] Network error checking status:', error);
      return 'UNKNOWN';
    }
  }
}
