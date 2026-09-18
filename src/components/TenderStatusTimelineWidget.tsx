'use client';

import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  ArrowRight, 
  ShieldCheck, 
  Radio, 
  FileCheck, 
  XCircle,
  HelpCircle
} from 'lucide-react';
import { TenderStatusEvent, STATUS_LABELS_RU } from '../lib/types/tender';

interface TenderStatusTimelineWidgetProps {
  tenderId: string;
  currentStatus?: string;
  source?: string;
  deadlineDate?: string;
  language?: 'RU' | 'KK';
}

const STATUS_COLOR_MAP: Record<string, { bg: string; text: string; border: string; icon: any }> = {
  PUBLISHED: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Radio },
  ACCEPTING_BIDS: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Radio },
  ACTIVE: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Radio },
  APPLICATIONS_REVIEW: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: Clock },
  PRICE_PROPOSALS_OPENED: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300', icon: FileCheck },
  AUCTION_IN_PROGRESS: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300', icon: Clock },
  SUMMARIZING: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', icon: Clock },
  FINISHED: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', icon: CheckCircle2 },
  CLOSED: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', icon: CheckCircle2 },
  CANCELLED: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', icon: XCircle },
  SUSPENDED: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', icon: AlertCircle },
  FAILED: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', icon: XCircle }
};

export const TenderStatusTimelineWidget: React.FC<TenderStatusTimelineWidgetProps> = ({
  tenderId,
  currentStatus = 'ACTIVE',
  source = 'GOSZAKUP',
  deadlineDate
}) => {
  const [events, setEvents] = useState<TenderStatusEvent[]>([]);
  const [status, setStatus] = useState<string>(currentStatus);
  const [lastPolledAt, setLastPolledAt] = useState<string | null>(null);
  const [pollingIntervalMs, setPollingIntervalMs] = useState<number>(2 * 60 * 60 * 1000);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatusHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/tenders/${tenderId}/status-events`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setEvents(data.events || []);
          if (data.currentStatus) setStatus(data.currentStatus);
          if (data.lastPolledAt) setLastPolledAt(data.lastPolledAt);
          if (data.pollingIntervalMs) setPollingIntervalMs(data.pollingIntervalMs);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка загрузки истории');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenderId) {
      fetchStatusHistory();
    }
  }, [tenderId]);

  const handleManualCheck = async () => {
    try {
      setRefreshing(true);
      await fetch(`/api/cron/poll-tender-statuses?cronSecret=dev-cron-secret-123&force=true&tenderId=${tenderId}`);
      await fetchStatusHistory();
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  };

  const getIntervalLabel = (ms: number) => {
    const mins = Math.round(ms / (60 * 1000));
    if (mins < 60) return `каждые ${mins} мин.`;
    const hours = Math.round(mins / 60);
    return `каждые ${hours} ч.`;
  };

  const currentConfig = STATUS_COLOR_MAP[status] || {
    bg: 'bg-surface-alt',
    text: 'text-ink',
    border: 'border-hairline',
    icon: HelpCircle
  };
  const CurrentIcon = currentConfig.icon;

  return (
    <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-4">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-hairline">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
              Мониторинг статуса лота
            </h3>
            <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Автомониторинг ({getIntervalLabel(pollingIntervalMs)})</span>
            </span>
          </div>
          <p className="text-[11px] text-mid-gray">
            Отслеживание перехода стадий, вскрытия заявок и изменения сроков на источнике {source}
          </p>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto">
          <div className={`px-3 py-1.5 rounded-xl border flex items-center space-x-2 ${currentConfig.bg} ${currentConfig.text} ${currentConfig.border}`}>
            <CurrentIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs font-bold">{STATUS_LABELS_RU[status] || status}</span>
          </div>

          <button
            onClick={handleManualCheck}
            disabled={refreshing}
            title="Проверить статус на источнике сейчас"
            className="p-1.5 rounded-lg border border-hairline bg-paper text-mid-gray hover:text-ink hover:border-ink transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-ink' : ''}`} />
          </button>
        </div>
      </div>

      {/* Meta Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-mid-gray">
        <div className="flex items-center space-x-1.5">
          <Clock className="w-3.5 h-3.5 text-mid-gray" />
          <span>Посл. опрос: </span>
          <span className="font-medium text-ink">
            {lastPolledAt ? new Date(lastPolledAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : 'Только что'}
          </span>
        </div>

        {deadlineDate && (
          <div className="flex items-center space-x-1.5">
            <Radio className="w-3.5 h-3.5 text-mid-gray" />
            <span>Дедлайн: </span>
            <span className="font-medium text-ink">
              {new Date(deadlineDate).toLocaleDateString('ru-RU')}
            </span>
          </div>
        )}

        <div className="flex items-center space-x-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-mid-gray" />
          <span>Фиксация событий: </span>
          <span className="font-medium text-ink">{events.length} записей</span>
        </div>
      </div>

      {/* Timeline Section */}
      <div className="pt-2">
        <h4 className="text-[11px] font-bold text-ink uppercase tracking-wider mb-3">
          Хронология изменений (Timeline)
        </h4>

        {loading ? (
          <div className="py-6 flex items-center justify-center text-mid-gray space-x-2 text-xs">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Загрузка истории статусов...</span>
          </div>
        ) : events.length === 0 ? (
          <div className="p-4 rounded-xl bg-paper border border-hairline text-center space-y-1">
            <p className="text-xs font-semibold text-ink">Начальный статус зафиксирован</p>
            <p className="text-[11px] text-mid-gray">
              Текущий статус — <span className="font-bold text-ink">{STATUS_LABELS_RU[status] || status}</span>. При любых изменениях на площадке событие мгновенно появится в этом таймлайне и отправится в Telegram.
            </p>
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-hairline">
            {events.map((evt, idx) => {
              const prevLabel = evt.previousStatus ? (STATUS_LABELS_RU[evt.previousStatus] || evt.previousStatus) : null;
              const nextLabel = STATUS_LABELS_RU[evt.newStatus] || evt.newStatus;
              const config = STATUS_COLOR_MAP[evt.newStatus] || {
                bg: 'bg-paper',
                text: 'text-ink',
                border: 'border-hairline',
                icon: HelpCircle
              };
              const EventIcon = config.icon;

              return (
                <div key={evt.id || idx} className="relative group">
                  {/* Dot */}
                  <div className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-paper flex items-center justify-center ${config.bg} ${config.text}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  </div>

                  {/* Card */}
                  <div className="p-3 rounded-xl bg-paper border border-hairline group-hover:border-mid-gray/50 transition-all shadow-subtle space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center space-x-1.5 text-xs font-bold">
                        {prevLabel ? (
                          <>
                            <span className="text-mid-gray line-through text-[11px] font-normal">{prevLabel}</span>
                            <ArrowRight className="w-3 h-3 text-mid-gray shrink-0" />
                            <span className={`px-2 py-0.5 rounded-md border text-[11px] ${config.bg} ${config.text} ${config.border}`}>
                              {nextLabel}
                            </span>
                          </>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-md border text-[11px] ${config.bg} ${config.text} ${config.border}`}>
                            {nextLabel}
                          </span>
                        )}
                      </div>

                      <span className="text-[10px] text-mid-gray">
                        {new Date(evt.changedAt || evt.detectedAt).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                    {evt.raw && typeof evt.raw === 'object' && evt.raw.winnerBin && (
                      <p className="text-[11px] text-ink-soft bg-surface-alt p-1.5 rounded-lg border border-hairline font-mono">
                        🏆 Победитель БИН: {evt.raw.winnerBin}
                        {evt.raw.finalAmount ? ` (${Number(evt.raw.finalAmount).toLocaleString('ru-RU')} ₸)` : ''}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
