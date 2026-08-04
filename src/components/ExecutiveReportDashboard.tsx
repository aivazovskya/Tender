'use client';

import React, { useState, useEffect } from 'react';
import { Award, PieChart, TrendingDown, DollarSign, CheckCircle, BarChart3, ShieldAlert, Calendar } from 'lucide-react';
import { ManagementReport } from '../lib/types/tender';

export const ExecutiveReportDashboard: React.FC = () => {
  const [report, setReport] = useState<ManagementReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/reports/management');
      const data = await res.json();
      if (data.success && data.report) {
        setReport(data.report);
      } else {
        setError(data.message || 'Ошибка загрузки управленческого отчёта');
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  if (loading) {
    return (
      <div className="py-12 text-center text-xs text-mid-gray animate-pulse">
        Формирование сводного отчёта для руководства...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center text-xs text-red-800 space-y-2">
        <ShieldAlert className="w-8 h-8 text-red-600 mx-auto" />
        <p className="font-bold">{error}</p>
        <p className="text-red-600">Для просмотра отчёта требуются права администратора или руководителя организации (OWNER/ADMIN).</p>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-6">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-hairline pb-4 gap-2">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-6 h-6 text-ink" />
            <h2 className="text-lg font-bold text-ink">Сводка тендерных KPI (Отчёт для руководства)</h2>
          </div>
          <p className="text-xs text-mid-gray mt-0.5">
            Период: {new Date(report.periodStart).toLocaleDateString('ru-RU')} — {new Date(report.periodEnd).toLocaleDateString('ru-RU')}
          </p>
        </div>
        <button
          onClick={fetchReport}
          className="px-3.5 py-1.5 bg-surface-alt hover:bg-paper border border-hairline rounded-xl text-xs font-semibold text-ink transition-colors shadow-subtle"
        >
          Обновить данные
        </button>
      </div>

      {/* Primary KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Win Rate */}
        <div className="p-5 bg-paper border border-hairline rounded-2xl shadow-subtle space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-mid-gray font-medium">Win Rate (Конверсия)</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black text-ink">{report.winRatePct}%</span>
            <span className="text-xs text-mid-gray">выиграно</span>
          </div>
          <p className="text-[11px] text-mid-gray">
            {report.totalWon} из {report.totalSubmitted} поданных заявок
          </p>
        </div>

        {/* Won Contract Value */}
        <div className="p-5 bg-paper border border-hairline rounded-2xl shadow-subtle space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-mid-gray font-medium">Объём контрактов</span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-xl font-black text-ink">
              {(report.totalContractValueWon / 1000000).toFixed(1)} млн
            </span>
            <span className="text-xs text-mid-gray">₸</span>
          </div>
          <p className="text-[11px] text-mid-gray">Сумма побед за период</p>
        </div>

        {/* Average Auction Discount */}
        <div className="p-5 bg-paper border border-hairline rounded-2xl shadow-subtle space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-mid-gray font-medium">Ср. падение цены</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-2xl font-black text-ink">{report.avgDiscountFromStartPricePct}%</span>
          </div>
          <p className="text-[11px] text-mid-gray">От начальной суммы лота</p>
        </div>

        {/* Submitted Count */}
        <div className="p-5 bg-paper border border-hairline rounded-2xl shadow-subtle space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-mid-gray font-medium">Подано заявок</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-2xl font-black text-ink">{report.totalSubmitted}</span>
            <span className="text-xs text-mid-gray">лотов</span>
          </div>
          <p className="text-[11px] text-mid-gray">Всего проведённых аукционов</p>
        </div>

      </div>

      {/* Category Breakdown Table */}
      <div className="p-6 bg-paper border border-hairline rounded-2xl shadow-subtle space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink uppercase tracking-wider">Эффективность по категориям</h3>
          <span className="text-xs text-mid-gray">Сортировка по сумме побед</span>
        </div>

        {report.byCategory.length === 0 ? (
          <p className="py-6 text-center text-xs text-mid-gray">Данные за указанный период отсутствуют</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-alt/60 text-mid-gray uppercase tracking-wider border-b border-hairline text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Категория лота</th>
                  <th className="py-2.5 px-3 text-center">Подано</th>
                  <th className="py-2.5 px-3 text-center">Выиграно</th>
                  <th className="py-2.5 px-3 text-center">Win Rate</th>
                  <th className="py-2.5 px-3 text-right">Сумма контрактов</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {report.byCategory.map((cat, idx) => (
                  <tr key={idx} className="hover:bg-surface-alt/30 transition-colors">
                    <td className="py-3 px-3 font-semibold text-ink">{cat.category}</td>
                    <td className="py-3 px-3 text-center text-slate-700">{cat.submitted}</td>
                    <td className="py-3 px-3 text-center font-bold text-emerald-600">{cat.won}</td>
                    <td className="py-3 px-3 text-center font-bold text-ink">{cat.winRatePct}%</td>
                    <td className="py-3 px-3 text-right font-bold text-ink">
                      {cat.totalWonValue.toLocaleString('ru-RU')} ₸
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
