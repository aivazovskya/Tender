'use client';

import React, { useState } from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Search, 
  RefreshCw, 
  Building2, 
  CheckCircle2, 
  Lock,
  Sparkles,
  Info
} from 'lucide-react';
import { ReputationCheckResult } from '../lib/types/tender';

interface ReputationCheckWidgetProps {
  userPlan?: string;
  onUpgradeTariff?: () => void;
}

export const ReputationCheckWidget: React.FC<ReputationCheckWidgetProps> = ({
  userPlan = 'FREE',
  onUpgradeTariff
}) => {
  const [bin, setBin] = useState('');
  const [entityType, setEntityType] = useState<'SUPPLIER' | 'CUSTOMER'>('SUPPLIER');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReputationCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const isProOrAbove = ['PRO', 'TEAM', 'ENTERPRISE'].includes(userPlan.toUpperCase());

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBin = bin.trim();
    if (!cleanBin) return;

    if (!/^\d{12}$/.test(cleanBin)) {
      setError('БИН должен состоять ровно из 12 цифр');
      setResult(null);
      return;
    }

    setError(null);
    setForbidden(false);
    setLoading(true);

    try {
      const res = await fetch(`/api/reputation/check?bin=${cleanBin}&type=${entityType}`);
      const data = await res.json();

      if (res.status === 403 && data.error === 'FORBIDDEN_PLAN') {
        setForbidden(true);
        setResult(null);
      } else if (data.success && data.data) {
        setResult(data.data);
      } else {
        setError(data.message || 'Ошибка проверки БИН');
        setResult(null);
      }
    } catch (err) {
      setError('Сбой подключения к серверу проверки');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-5 h-5 text-ink" />
          <h3 className="text-sm font-bold text-ink tracking-tight">
            Проверка контрагента по РНУ ГЗ (Phase 1)
          </h3>
        </div>
        <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-paper border border-hairline text-ink-soft">
          РНУ Госзакупок РК
        </span>
      </div>

      <p className="text-xs text-ink-soft leading-relaxed">
        Введите БИН/ИИН компании для мгновенной сверки с Реестром недобросовестных участников Госзакупок. 
        <span className="text-mid-gray block mt-0.5 text-[11px]">
          * Проверка банкротства и налоговой задолженности запланирована на Phase 2 (Backlog).
        </span>
      </p>

      <form onSubmit={handleCheck} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              maxLength={12}
              value={bin}
              onChange={(e) => setBin(e.target.value.replace(/\D/g, ''))}
              placeholder="Введите 12-значный БИН / ИИН"
              className="w-full bg-paper border border-hairline rounded-xl px-4 py-2 text-xs font-mono text-ink placeholder-mid-gray focus:outline-none focus:border-ink"
            />
          </div>

          <div className="flex items-center bg-paper rounded-xl border border-hairline p-1">
            <button
              type="button"
              onClick={() => setEntityType('SUPPLIER')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                entityType === 'SUPPLIER'
                  ? 'bg-ink text-paper'
                  : 'text-mid-gray hover:text-ink'
              }`}
            >
              Поставщик
            </button>
            <button
              type="button"
              onClick={() => setEntityType('CUSTOMER')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                entityType === 'CUSTOMER'
                  ? 'bg-ink text-paper'
                  : 'text-mid-gray hover:text-ink'
              }`}
            >
              Заказчик
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || bin.length !== 12}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-ink text-paper hover:bg-ink-soft disabled:opacity-50 transition-all shadow-subtle flex items-center justify-center space-x-1.5 shrink-0"
          >
            {loading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            <span>Проверить</span>
          </button>
        </div>
      </form>

      {error && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {forbidden && (
        <div className="p-4 rounded-xl bg-paper border border-hairline text-xs space-y-2 shadow-subtle">
          <div className="flex items-center space-x-2 text-amber-900 font-semibold">
            <Lock className="w-4 h-4 text-amber-600" />
            <span>Функция доступна на тарифах Pro, Team и Enterprise</span>
          </div>
          <p className="text-mid-gray">
            На бесплатном тарифе доступен только базовый поиск лотов. Обновите тариф для доступа к проверке РНУ.
          </p>
          {onUpgradeTariff && (
            <button
              onClick={onUpgradeTariff}
              className="mt-1 px-4 py-1.5 rounded-lg bg-ink text-paper text-xs font-semibold hover:bg-ink-soft transition-all inline-flex items-center space-x-1"
            >
              <Sparkles className="w-3.5 h-3.5 text-ember" />
              <span>Перейти на Pro / Team</span>
            </button>
          )}
        </div>
      )}

      {result && (
        <div className={`p-4 rounded-xl border text-xs space-y-2 shadow-subtle ${
          result.isFallback || result.source === 'DEMO_FALLBACK'
            ? 'bg-amber-50 border-amber-200 text-amber-900'
            : result.isBlacklisted
            ? 'bg-rose-50 border-rose-200 text-rose-900'
            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 font-bold">
              {result.isFallback || result.source === 'DEMO_FALLBACK' ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Проверка не выполнена (Демо-режим)</span>
                </>
              ) : result.isBlacklisted ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Внесен в Реестр недобросовестных участников!</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Не найден в РНУ (Чистый контрагент)</span>
                </>
              )}
            </div>

            {result.isFallback || result.source === 'DEMO_FALLBACK' ? (
              <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-[10px] text-amber-900 font-mono font-semibold">
                Демо-данные
              </span>
            ) : result.stale ? (
              <span className="px-2 py-0.5 rounded bg-paper border border-hairline text-[10px] text-mid-gray font-mono">
                Stale cache
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
            <div>
              <span className="text-mid-gray block">БИН:</span>
              <span className="font-mono font-semibold">{result.bin}</span>
            </div>
            <div>
              <span className="text-mid-gray block">Источник:</span>
              <span>{result.isFallback || result.source === 'DEMO_FALLBACK' ? 'Демо-режим (Токен не настроен)' : result.source}</span>
            </div>

            {result.banEndDate && (
              <div className="col-span-2">
                <span className="text-mid-gray block">Срок дисквалификации:</span>
                <span className="font-semibold text-rose-700">
                  до {new Date(result.banEndDate).toLocaleDateString('ru-RU')}
                </span>
              </div>
            )}

            {result.reason && (
              <div className="col-span-2 pt-1 border-t border-hairline/40">
                <span className="text-mid-gray block">Причина / Примечание:</span>
                <span>{result.reason}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
