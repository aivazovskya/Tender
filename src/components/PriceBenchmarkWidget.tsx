'use client';

import React, { useState, useEffect } from 'react';
import { TrendingDown, AlertTriangle, CheckCircle2, BarChart2 } from 'lucide-react';
import { PriceBenchmarkResult } from '../lib/types/tender';

interface PriceBenchmarkWidgetProps {
  tenderId: string;
  startPrice: number;
}

export const PriceBenchmarkWidget: React.FC<PriceBenchmarkWidgetProps> = ({
  tenderId,
  startPrice
}) => {
  const [benchmark, setBenchmark] = useState<PriceBenchmarkResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenderId) {
      fetch(`/api/tenders/${tenderId}/price-benchmark`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.benchmark) {
            setBenchmark(data.benchmark);
          }
        })
        .catch(err => console.error('Error fetching price benchmark', err))
        .finally(() => setLoading(false));
    }
  }, [tenderId]);

  if (loading) {
    return (
      <div className="p-3 bg-surface-alt/40 border border-hairline rounded-xl text-xs text-mid-gray animate-pulse">
        Загрузка бенчмарка цен по категории...
      </div>
    );
  }

  if (!benchmark) return null;

  return (
    <div className="p-4 bg-paper border border-hairline rounded-xl shadow-subtle space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <BarChart2 className="w-4 h-4 text-sky-600" />
          <h4 className="text-xs font-bold text-ink">Ценовой бенчмарк по категории</h4>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 bg-surface-alt text-mid-gray rounded border border-hairline">
          За 6 месяцев ({benchmark.sampleSize} лотов)
        </span>
      </div>

      {!benchmark.isReliable ? (
        <div className="flex items-start space-x-2 p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[11px]">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Недостаточно данных для надёжного ориентира</span>
            <span>Найдено всего {benchmark.sampleSize} завершённых лотов в категории "{benchmark.category}". Показываемые цифры ориентировочны.</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 py-1 text-center">
          <div className="p-2 bg-surface-alt/30 rounded-lg border border-hairline">
            <span className="text-[10px] text-mid-gray block">Средняя цена (Avg)</span>
            <span className="text-xs font-bold text-ink mt-0.5 block">
              {benchmark.avgAmount.toLocaleString('ru-RU')} ₸
            </span>
          </div>

          <div className="p-2 bg-emerald-50/50 rounded-lg border border-emerald-200">
            <span className="text-[10px] text-emerald-800 font-medium block">Медиана (Median)</span>
            <span className="text-xs font-bold text-emerald-900 mt-0.5 block">
              {benchmark.medianAmount.toLocaleString('ru-RU')} ₸
            </span>
          </div>

          <div className="p-2 bg-surface-alt/30 rounded-lg border border-hairline">
            <span className="text-[10px] text-mid-gray block">Диапазон</span>
            <span className="text-[11px] font-semibold text-slate-700 mt-0.5 block">
              {(benchmark.minAmount / 1000).toFixed(0)}k - {(benchmark.maxAmount / 1000).toFixed(0)}k ₸
            </span>
          </div>
        </div>
      )}

      {benchmark.medianAmount > 0 && startPrice > 0 && (
        <div className="text-[11px] text-slate-600 flex items-center justify-between border-t border-hairline pt-2">
          <span>Ориентир закрытия лотов в категории:</span>
          <span className="font-semibold text-ink">
            ~{Math.round(((startPrice - benchmark.medianAmount) / startPrice) * 100)}% ниже начальной цены
          </span>
        </div>
      )}
    </div>
  );
};
