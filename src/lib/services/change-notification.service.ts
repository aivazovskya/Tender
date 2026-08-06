import { prisma } from '../prisma';
import { TelegramBotService } from './telegram.service';
import { TenderFieldChange } from '../ingestion/diff';

const FIELD_LABELS: Record<string, string> = {
  deadlineDate: 'Срок подачи заявок',
  status: 'Статус закупки',
  amount: 'Сумма лота',
  applicationSecurityAmount: 'Размер обеспечения заявки',
  title: 'Наименование тендера',
  region: 'Регион поставки',
  customerName: 'Заказчик'
};

function formatFieldValue(field: string, val: string | null): string {
  if (val === null || val === undefined || val === '') {
    return '—';
  }

  if (field === 'deadlineDate') {
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('ru-RU');
      }
    } catch {
      // fallback
    }
  }

  if (field === 'amount' || field === 'applicationSecurityAmount') {
    const num = Number(val);
    if (!isNaN(num)) {
      return `${num.toLocaleString('ru-RU')} KZT`;
    }
  }

  return val;
}

export class ChangeNotificationService {
  /**
   * Notifies interested companies (with active KanbanCards not WON/LOST)
   * about published changes in tender fields.
   * Also automatically updates SUBMISSION_DEADLINE dueAt if deadlineDate changed.
   */
  static async notifyInterestedCompanies(
    tenderId: string,
    tender: any,
    changes: TenderFieldChange[]
  ): Promise<{ notificationsSent: number; deadlineUpdated: boolean }> {
    if (!changes || changes.length === 0) {
      return { notificationsSent: 0, deadlineUpdated: false };
    }

    let deadlineUpdated = false;

    // 1. If deadlineDate changed, update SUBMISSION_DEADLINE dueAt for this tender
    const deadlineChange = changes.find(c => c.field === 'deadlineDate');
    if (deadlineChange && deadlineChange.newValue) {
      const newDeadlineDate = new Date(deadlineChange.newValue);
      if (!isNaN(newDeadlineDate.getTime())) {
        try {
          await prisma.tenderDeadline.updateMany({
            where: {
              tenderId,
              type: 'SUBMISSION_DEADLINE',
              status: 'PENDING'
            },
            data: {
              dueAt: newDeadlineDate
            }
          });
          deadlineUpdated = true;
        } catch (err: any) {
          console.warn('[ChangeNotificationService] DB error updating TenderDeadline:', err?.message);
        }
      }
    }

    // 2. Find interested Kanban Cards (stage NOT IN ['WON', 'LOST'])
    let activeCards: any[] = [];
    try {
      activeCards = await prisma.kanbanCard.findMany({
        where: {
          tenderId,
          stage: {
            notIn: ['WON', 'LOST']
          }
        }
      });
    } catch (err: any) {
      console.warn('[ChangeNotificationService] DB error fetching active KanbanCards:', err?.message);
    }

    if (activeCards.length === 0) {
      return { notificationsSent: 0, deadlineUpdated };
    }

    // 3. Resolve target CompanyProfiles & check NotificationSetting
    const targetChatIds = new Set<string>();

    for (const card of activeCards) {
      try {
        let profile: any = null;

        if (card.userId) {
          profile = await prisma.companyProfile.findFirst({
            where: { userId: card.userId },
            include: {
              user: {
                include: {
                  notificationSetting: true
                }
              }
            }
          });
        }

        if (!profile && card.organizationId) {
          profile = await prisma.companyProfile.findFirst({
            where: { organizationId: card.organizationId },
            include: {
              user: {
                include: {
                  notificationSetting: true
                }
              }
            }
          });
        }

        if (!profile) continue;

        // Check if user disabled Telegram notifications
        let notificationSetting = profile.user?.notificationSetting;

        // If organization profile has no direct user link, resolve setting via organization OWNER/ADMIN
        if (!notificationSetting && card.organizationId) {
          const orgMember = await prisma.organizationMember.findFirst({
            where: {
              organizationId: card.organizationId,
              role: { in: ['OWNER', 'ADMIN'] }
            },
            include: {
              user: {
                include: {
                  notificationSetting: true
                }
              }
            }
          });
          if (orgMember?.user?.notificationSetting) {
            notificationSetting = orgMember.user.notificationSetting;
          }
        }

        if (notificationSetting && notificationSetting.telegramNotify === false) {
          continue;
        }

        const chatId = profile.telegramChatId || process.env.TELEGRAM_DEFAULT_CHAT_ID;
        if (chatId) {
          targetChatIds.add(chatId);
        }
      } catch (err: any) {
        console.warn('[ChangeNotificationService] Error resolving company profile for card:', err?.message);
      }
    }

    if (targetChatIds.size === 0) {
      return { notificationsSent: 0, deadlineUpdated };
    }

    // 4. Format Telegram notification message
    const formattedChanges = changes.map(c => {
      const label = FIELD_LABELS[c.field] || c.field;
      const oldFormatted = formatFieldValue(c.field, c.oldValue);
      const newFormatted = formatFieldValue(c.field, c.newValue);
      return `• <b>${label}</b>: ${oldFormatted} → <b>${newFormatted}</b>`;
    }).join('\n');

    const customMessage =
      `⚠️ <b>ИЗМЕНЕНИЕ В ЗАКУПКЕ</b>\n\n` +
      `📋 Тендер: <b>${tender.title || 'Без названия'}</b>\n` +
      `🏛️ Заказчик: <b>${tender.customerName || '—'}</b>\n\n` +
      `<b>Изменения:</b>\n` +
      `${formattedChanges}\n\n` +
      `🔗 <a href="${tender.sourceUrl || '#'}">Перейти к закупке</a>`;

    let notificationsSent = 0;

    // 5. Send Telegram notification to all target chat IDs
    for (const chatId of targetChatIds) {
      try {
        const res = await TelegramBotService.sendNotification(tender, chatId, customMessage);
        if (res.success || res.skipped) {
          notificationsSent++;
        }
      } catch (err: any) {
        console.error(`[ChangeNotificationService] Failed to send Telegram alert to chatId ${chatId}:`, err?.message);
      }
    }

    return { notificationsSent, deadlineUpdated };
  }
}
