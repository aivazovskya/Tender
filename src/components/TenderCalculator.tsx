'use client';

import React, { useState, useEffect } from 'react';
import { Tender, TenderCalculation, TenderCostItem, TenderCostCategory, TenderCostValueType } from '../lib/types/tender';
import { 
  Calculator, 
  Plus, 
  Trash2, 
  Edit3, 
  AlertTriangle, 
  Info, 
  TrendingUp, 
  ShieldAlert, 
  Check, 
  X, 
  DollarSign, 
  Percent, 
  Loader2,
  PieChart
} from 'lucide-react';

import { PriceBenchmarkWidget } from './PriceBenchmarkWidget';

interface TenderCalculatorProps {
  tender: Tender;
  language?: 'RU' | 'KK';
}

const CATEGORY_LABELS: Record<TenderCostCategory, { ru: string; kk: string; color: string }> = {
  PURCHASE: { ru: 'Закупка товаров/материалов', kk: 'Тауарларды/материалдарды сатып алу', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  LOGISTICS: { ru: 'Логистика и доставка', kk: 'Логистика және жеткізу', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  INSTALLATION: { ru: 'Монтаж/пусконаладка', kk: 'Монтаждау/іске қосу', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  WARRANTY_SERVICE: { ru: 'Гарантийное обслуживание', kk: 'Кепілдікті қызмет көрсету', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  LABOR: { ru: 'Затраты на персонал', kk: 'Персонал шығындары', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  BID_SECURITY: { ru: 'Обеспечение заявки', kk: 'Өтінімді қамтамасыз ету', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  PERFORMANCE_BOND: { ru: 'Обеспечение исполнения', kk: 'Орындалуын қамтамасыз ету', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  PLATFORM_FEES: { ru: 'Комиссия площадки / ЭЦП', kk: 'Алаң комиссиясы / ЭЦҚ', color: 'bg-teal-100 text-teal-800 border-teal-200' },
  OVERHEAD: { ru: 'Накладные расходы', kk: 'Үстідегі шығыстар', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  TAXES: { ru: 'Налоги (НДС/КПН)', kk: 'Салықтар (ҚҚС/КТС)', color: 'bg-rose-100 text-rose-800 border-rose-200' },
  FX_RISK: { ru: 'Курсовой риск', kk: 'Валюталық тәуекел', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  OTHER: { ru: 'Прочее', kk: 'Басқа', color: 'bg-slate-100 text-slate-800 border-slate-200' }
};

export const TenderCalculator: React.FC<TenderCalculatorProps> = ({ tender, language = 'RU' }) => {
  const isKk = language === 'KK';
  const [calculation, setCalculation] = useState<TenderCalculation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [limitExceededData, setLimitExceededData] = useState<{ limit: number; used: number; currentPlan: string; message: string } | null>(null);

  // Form states for margin percentage editing
  const [targetMargin, setTargetMargin] = useState<number>(15);
  const [minMargin, setMinMargin] = useState<number>(5);
  const [isUpdatingMargin, setIsUpdatingMargin] = useState<boolean>(false);

  // Modal / Form state for Cost Items
  const [isItemModalOpen, setIsItemModalOpen] = useState<boolean>(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemCategory, setItemCategory] = useState<TenderCostCategory>('PURCHASE');
  const [itemLabel, setItemLabel] = useState<string>('');
  const [itemValueType, setItemValueType] = useState<TenderCostValueType>('FIXED');
  const [itemAmount, setItemAmount] = useState<string>('0');
  const [itemBaseAmount, setItemBaseAmount] = useState<string>('');
  const [isSavingItem, setIsSavingItem] = useState<boolean>(false);

  // Fetch Calculation data on mount
  useEffect(() => {
    fetchCalculation();
  }, [tender.id]);

  const fetchCalculation = async () => {
      setLoading(true);
      setError(null);
      setLimitExceededData(null);
      try {
        const res = await fetch(`/api/tenders/${tender.id}/calculation`);
        const data = await res.json();
        if (data.success && data.data) {
          setCalculation(data.data);
          setTargetMargin(data.data.targetMarginPct);
          setMinMargin(data.data.minMarginPct);
        } else if (data.error === 'LIMIT_EXCEEDED') {
          setLimitExceededData({
            limit: data.limit,
            used: data.used,
            currentPlan: data.currentPlan,
            message: data.message
          });
        } else {
          setError(data.error || 'Не удалось загрузить расчёт тендера');
        }
      } catch (err: any) {
      setError('Ошибка сети при загрузке расчёта тендера');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMargins = async (newTargetMargin?: number, newMinMargin?: number) => {
    const targetVal = newTargetMargin !== undefined ? newTargetMargin : targetMargin;
    const minVal = newMinMargin !== undefined ? newMinMargin : minMargin;

    setIsUpdatingMargin(true);
    try {
      const res = await fetch(`/api/tenders/${tender.id}/calculation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetMarginPct: targetVal,
          minMarginPct: minVal
        })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setCalculation(data.data);
      }
    } catch (err) {
      console.error('Failed to update margins:', err);
    } finally {
      setIsUpdatingMargin(false);
    }
  };

  const openAddItemModal = (presetCategory?: TenderCostCategory) => {
    setEditingItemId(null);
    const cat = presetCategory || 'PURCHASE';
    setItemCategory(cat);
    setItemLabel(CATEGORY_LABELS[cat][isKk ? 'kk' : 'ru']);
    setItemValueType('FIXED');
    setItemAmount('0');
    setItemBaseAmount('');
    setIsItemModalOpen(true);
  };

  const openEditItemModal = (item: TenderCostItem) => {
    setEditingItemId(item.id);
    setItemCategory(item.category);
    setItemLabel(item.label);
    setItemValueType(item.valueType);
    setItemAmount(String(item.amount));
    setItemBaseAmount(item.baseAmount != null ? String(item.baseAmount) : '');
    setIsItemModalOpen(true);
  };

  const handleSaveCostItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemLabel.trim() || isNaN(parseFloat(itemAmount))) return;

    setIsSavingItem(true);
    try {
      const payload = {
        category: itemCategory,
        label: itemLabel.trim(),
        valueType: itemValueType,
        amount: parseFloat(itemAmount),
        baseAmount: itemBaseAmount.trim() !== '' ? parseFloat(itemBaseAmount) : null
      };

      const url = editingItemId
        ? `/api/tenders/${tender.id}/calculation/cost-items/${editingItemId}`
        : `/api/tenders/${tender.id}/calculation/cost-items`;
      const method = editingItemId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success && data.data) {
        setCalculation(data.data);
        setIsItemModalOpen(false);
      } else {
        alert(data.error || 'Ошибка при сохранении статьи затрат');
      }
    } catch (err) {
      alert('Сбой запроса при сохранении статьи затрат');
    } finally {
      setIsSavingItem(false);
    }
  };

  const handleDeleteCostItem = async (costItemId: string) => {
    if (!confirm(isKk ? 'Шығыс бабын жоюды растайсыз ба?' : 'Удалить эту статью затрат?')) return;

    try {
      const res = await fetch(`/api/tenders/${tender.id}/calculation/cost-items/${costItemId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success && data.data) {
        setCalculation(data.data);
      }
    } catch (err) {
      console.error('Failed to delete cost item:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-ember animate-spin mx-auto" />
        <p className="text-xs text-mid-gray">{isKk ? 'Тендер есебі жүктелуде...' : 'Загрузка расчёта себестоимости и маржи...'}</p>
      </div>
    );
  }

  if (limitExceededData) {
    return (
      <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 space-y-4 shadow-subtle">
        <div className="flex items-start space-x-3">
          <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-amber-950 uppercase tracking-wider">
              {isKk ? 'ТАРИФ ЛИМИТІ АСЫП КЕТТІ' : 'ПРЕВЫШЕН ЛИМИТ ТАРИФНОГО ПЛАНА'}
            </h4>
            <p className="text-xs text-amber-900 leading-relaxed">
              {limitExceededData.message || (isKk
                ? `Сіз ${limitExceededData.currentPlan} тарифіндегі есептер лимитін сарқыдыңыз (${limitExceededData.used}/${limitExceededData.limit}).`
                : `Вы израсходовали лимит расчётов тендеров (${limitExceededData.used}/${limitExceededData.limit}) на тарифе ${limitExceededData.currentPlan}.`)}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-paper border border-amber-200 space-y-2 text-xs">
          <p className="font-semibold text-ink">
            {isKk ? 'Pro / Enterprise тарифіне өту арқылы мүмкіндіктерді ашыңыз:' : 'Перейдите на тариф Pro или Enterprise:'}
          </p>
          <ul className="space-y-1 text-ink-soft list-disc list-inside text-[11px]">
            <li>{isKk ? 'Шексіз тендерлік есептер жасау' : 'Неограниченное количество расчётов тендеров'}</li>
            <li>{isKk ? 'ИИ-тәуекелдерді терең талдау' : 'Расширенный ИИ-анализ рисков'}</li>
            <li>{isKk ? 'РНУ ГЗ бойынша контрагенттерді тексеру' : 'Проверка контрагентов по РНУ ГЗ'}</li>
          </ul>
        </div>

        <div className="pt-2 flex items-center space-x-3">
          <a
            href="/#pricing"
            className="px-4 py-2 rounded-xl bg-ember hover:bg-ember/90 text-white font-semibold text-xs transition-all shadow-subtle flex items-center space-x-1.5"
          >
            <span>{isKk ? 'Тарифті жаңарту (Pro 29 900 ₸)' : 'Обновить тариф (Pro 29 900 ₸)'}</span>
          </a>
        </div>
      </div>
    );
  }

  if (error || !calculation) {
    return (
      <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2">
        <div className="flex items-center space-x-2 font-bold">
          <AlertTriangle className="w-4 h-4 text-rose-600" />
          <span>{isKk ? 'Есепті жүктеу қатесі' : 'Ошибка загрузки расчёта'}</span>
        </div>
        <p>{error || 'Данные расчёта недоступны'}</p>
        <button
          onClick={fetchCalculation}
          className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold text-[11px] hover:bg-rose-700 transition-all"
        >
          {isKk ? 'Қайталау' : 'Повторить попытку'}
        </button>
      </div>
    );
  }

  const isLossMaking = (calculation.biddingRoomAmount || 0) < 0;
  const isTargetUnattainable = calculation.recommendedPrice > calculation.startPrice;

  return (
    <div className="space-y-6">

      {/* 1. WARNING BANNERS */}
      {isLossMaking ? (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-900 flex items-start space-x-3 shadow-subtle">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wider">
              {isKk ? 'БҰҒАТТАУШЫ ЕСКЕРТУ: ТӨМЕНДЕТУ ТОРГЫ ДА ЗАЛАЛДЫ!' : 'БЛОКИРУЮЩЕЕ ПРЕДУПРЕЖДЕНИЕ: УЧАСТИЕ УБЫТОЧНО!'}
            </h4>
            <p className="text-xs text-rose-800 leading-relaxed">
              {isKk
                ? `Минималды маржаны (${calculation.minMarginPct}%) ескергендегі өзіндік құн (${calculation.minAcceptablePrice.toLocaleString('ru-RU')} ₸) лоттың бастапқы бағасынан (${calculation.startPrice.toLocaleString('ru-RU')} ₸) асып түседі. Ағымдағы баптар бойынша қатысу шығынды.`
                : `Себестоимость с учетом минимальной маржи (${calculation.minMarginPct}%) составляет ${calculation.minAcceptablePrice.toLocaleString('ru-RU')} ₸, что превышает стартовую цену лота (${calculation.startPrice.toLocaleString('ru-RU')} ₸). Участие в текущих условиях приведет к убыткам.`}
            </p>
          </div>
        </div>
      ) : isTargetUnattainable ? (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 flex items-start space-x-3 shadow-subtle">
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
              {isKk ? 'АҚПАРАТТЫҚ ЕСКЕРТУ: НЫСАНДЫ МАРЖАҒА ЖЕТУ МҮМКІН ЕМЕС' : 'ИНФОРМАЦИОННОЕ ПРЕДУПРЕЖДЕНИЕ: ЦЕЛЕВАЯ МАРЖА НЕДОСТИЖИМА'}
            </h4>
            <p className="text-xs text-amber-800 leading-relaxed">
              {isKk
                ? `Целевая маржа бойынша ұсынылатын баға (${calculation.recommendedPrice.toLocaleString('ru-RU')} ₸) бастапқы бағадан жоғары. Маржа немесе шығын баптарын түзетіңіз.`
                : `Рекомендуемая цена подачи по целевой марже (${calculation.recommendedPrice.toLocaleString('ru-RU')} ₸) превышает стартовую цену лота (${calculation.startPrice.toLocaleString('ru-RU')} ₸). Скоректируйте маржу или статьи затрат.`}
            </p>
          </div>
        </div>
      ) : null}

      {/* 2. TOP KPI CARDS SUMMARY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Start Price */}
        <div className="p-4 rounded-2xl bg-surface-alt border border-hairline relative overflow-hidden">
          <div className="flex items-center justify-between text-mid-gray text-xs mb-1">
            <span>{isKk ? 'Бастапқы баға (лот)' : 'Стартовая цена лота'}</span>
            <DollarSign className="w-4 h-4 text-mid-gray opacity-60" />
          </div>
          <p className="text-lg font-bold text-ink font-mono tracking-tight">
            {calculation.startPrice.toLocaleString('ru-RU')} ₸
          </p>
          <span className="text-[10px] text-mid-gray">{isKk ? 'Конкурс шартынан' : 'Из условий тендера'}</span>
        </div>

        {/* Total Cost */}
        <div className="p-4 rounded-2xl bg-surface-alt border border-hairline relative overflow-hidden">
          <div className="flex items-center justify-between text-mid-gray text-xs mb-1">
            <span>{isKk ? 'Толық өзіндік құны' : 'Полная себестоимость'}</span>
            <PieChart className="w-4 h-4 text-sky-600 opacity-80" />
          </div>
          <p className="text-lg font-bold text-sky-700 font-mono tracking-tight">
            {calculation.totalCost.toLocaleString('ru-RU')} ₸
          </p>
          <span className="text-[10px] text-mid-gray">
            {isKk ? `Баптар саны: ${calculation.costItems.length}` : `Статей затрат: ${calculation.costItems.length}`}
          </span>
        </div>

        {/* Recommended Bid Price */}
        <div className={`p-4 rounded-2xl border relative overflow-hidden transition-all ${
          isTargetUnattainable ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50/70 border-emerald-200'
        }`}>
          <div className="flex items-center justify-between text-xs mb-1 font-semibold text-emerald-900">
            <span>{isKk ? 'Ұсынылатын баға' : 'Рекомендуемая цена'}</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-lg font-bold text-emerald-950 font-mono tracking-tight">
            {calculation.recommendedPrice.toLocaleString('ru-RU')} ₸
          </p>
          <span className="text-[10px] font-medium text-emerald-800">
            +{calculation.targetMarginPct}% {isKk ? 'нысаналы маржа' : 'целевая маржа'}
          </span>
        </div>

        {/* Min Acceptable Price */}
        <div className={`p-4 rounded-2xl border relative overflow-hidden transition-all ${
          isLossMaking ? 'bg-rose-50 border-rose-300' : 'bg-surface-alt border-hairline'
        }`}>
          <div className="flex items-center justify-between text-mid-gray text-xs mb-1">
            <span>{isKk ? 'Минималды шекті баға' : 'Мин. допустимая цена'}</span>
            <ShieldAlert className="w-4 h-4 text-rose-500 opacity-80" />
          </div>
          <p className={`text-lg font-bold font-mono tracking-tight ${isLossMaking ? 'text-rose-700' : 'text-ink'}`}>
            {calculation.minAcceptablePrice.toLocaleString('ru-RU')} ₸
          </p>
          <span className="text-[10px] text-mid-gray">
            +{calculation.minMarginPct}% {isKk ? 'мин. маржа' : 'мин. маржа'}
          </span>
        </div>
      </div>

      {/* 3. BIDDING ROOM VISUAL BAR (ЗАПАС НА ТОРГИ) */}
      <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Calculator className="w-4 h-4 text-ember" />
            <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
              {isKk ? 'ТОРГТАРҒА АРНАЛҒАН ҚОР (АУКЦИОН НА ПОНИЖЕНИЕ)' : 'ЗАПАС НА ТОРГИ (АУКЦИОН НА ПОНИЖЕНИЕ)'}
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`text-xs font-bold font-mono px-2.5 py-0.5 rounded-full border ${
              isLossMaking ? 'bg-rose-100 text-rose-800 border-rose-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
            }`}>
              {(calculation.biddingRoomAmount || 0).toLocaleString('ru-RU')} ₸ ({calculation.biddingRoomPct || 0}%)
            </span>
          </div>
        </div>

        {/* Progress Visual Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="w-full h-3 rounded-full bg-paper border border-hairline overflow-hidden flex relative">
            {!isLossMaking && calculation.startPrice > 0 ? (
              <>
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, ((calculation.biddingRoomAmount || 0) / calculation.startPrice) * 100))}%`
                  }}
                  title="Запас на торги"
                />
                <div
                  className="h-full bg-amber-400/80 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, ((calculation.minAcceptablePrice - calculation.totalCost) / calculation.startPrice) * 100))}%`
                  }}
                  title="Минимальная маржа"
                />
                <div
                  className="h-full bg-sky-400 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, (calculation.totalCost / calculation.startPrice) * 100))}%`
                  }}
                  title="Себестоимость"
                />
              </>
            ) : (
              <div className="w-full h-full bg-rose-500/80" title="Убыточное состояние" />
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-mid-gray font-mono pt-1">
            <span>{isKk ? 'Мин. шекті:' : 'Мин. цена:'} {calculation.minAcceptablePrice.toLocaleString('ru-RU')} ₸</span>
            <span>{isKk ? 'Бастапқы:' : 'Стартовая:'} {calculation.startPrice.toLocaleString('ru-RU')} ₸</span>
          </div>
        </div>
      </div>

      {/* PRICE BENCHMARK BY CATEGORY */}
      <PriceBenchmarkWidget tenderId={tender.id} startPrice={calculation.startPrice} />

      {/* 4. MARGIN CONFIGURATION & RISK-ADJUSTED MARGIN CARD */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Margin Controls */}
        <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-4">
          <h3 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center space-x-2">
            <Percent className="w-4 h-4 text-emerald-600" />
            <span>{isKk ? 'Маржа баптаулары (%)' : 'Настройка маржинальности (%)'}</span>
          </h3>

          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs text-ink-soft mb-1">
                <span>{isKk ? 'Нысаналы маржа (%):' : 'Целевая маржа (%):'}</span>
                <span className="font-bold text-ink font-mono">{targetMargin}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                step="0.5"
                value={targetMargin}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setTargetMargin(val);
                  handleUpdateMargins(val, minMargin);
                }}
                className="w-full accent-emerald-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-ink-soft mb-1">
                <span>{isKk ? 'Минималды маржа (%):' : 'Минимальная маржа (%):'}</span>
                <span className="font-bold text-ink font-mono">{minMargin}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                step="0.5"
                value={minMargin}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setMinMargin(val);
                  handleUpdateMargins(targetMargin, val);
                }}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* AI Risk-Adjusted Margin Card */}
        <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-purple-600" />
              <span>{isKk ? 'Тәуекел түзетілген маржа (AI Risk Adjusted)' : 'Маржа с поправкой на риск (AI Risk)'}</span>
            </h3>
            {calculation.riskAdjustedMarginPct != null && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                ИИ-Скоринг ({tender.riskScore}/100)
              </span>
            )}
          </div>

          <div className="p-4 rounded-xl bg-paper border border-hairline space-y-2 shadow-subtle">
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold font-mono text-ink">
                {calculation.riskAdjustedMarginPct != null
                  ? `${calculation.riskAdjustedMarginPct}%`
                  : (isKk ? 'Есептелмеген' : 'Не рассчитано')}
              </span>
              {calculation.riskAdjustedMarginPct != null && (
                <span className="text-xs text-mid-gray">
                  (целевая {calculation.targetMarginPct}%)
                </span>
              )}
            </div>

            <p className="text-[11px] text-ink-soft leading-relaxed">
              {calculation.riskAdjustedMarginPct != null
                ? (isKk
                    ? 'Таймау/айыппұл ықтималдығы және кепілдікті жоғалту ИИ бағалауы негізінде есептелген.'
                    : 'Рассчитана с учетом вероятности просрочки, пени и риска потери обеспечения по модели TenderAI.')
                : (isKk
                    ? 'Бұл лот бойынша ИИ скорингі әлі орындалмаған.'
                    : 'Для данного лота скоринг рисков ещё не рассчитан моделью.')}
            </p>
          </div>
        </div>
      </div>

      {/* 5. COST ITEMS BREAKDOWN TABLE */}
      <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
              {isKk ? 'ШЫҒЫН БАПТАРЫ КЕСТЕСІ' : 'СТАТЬИ ЗАТРАТ ТЕНДЕРА'}
            </h3>
            <p className="text-[11px] text-mid-gray">
              {isKk ? 'Қатысу және келісімшартты орындау шығындары' : 'Расходы на участие и исполнение контракта'}
            </p>
          </div>

          <button
            onClick={() => openAddItemModal('PURCHASE')}
            className="px-3.5 py-2 rounded-xl bg-ember hover:bg-ember/90 text-white font-semibold text-xs flex items-center space-x-1.5 transition-all shadow-subtle"
          >
            <Plus className="w-4 h-4" />
            <span>{isKk ? 'Бап қосу' : 'Добавить статью'}</span>
          </button>
        </div>

        {/* Quick Presets Bar */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 pt-1">
          <span className="text-[11px] text-mid-gray shrink-0 font-medium">{isKk ? 'Жылдам шаблон:' : 'Быстрые шаблоны:'}</span>
          <button
            onClick={() => openAddItemModal('LOGISTICS')}
            className="px-2.5 py-1 rounded-lg bg-paper border border-hairline text-[11px] font-medium text-ink hover:bg-surface-alt shrink-0"
          >
            + {CATEGORY_LABELS.LOGISTICS[isKk ? 'kk' : 'ru']}
          </button>
          <button
            onClick={() => openAddItemModal('PERFORMANCE_BOND')}
            className="px-2.5 py-1 rounded-lg bg-paper border border-hairline text-[11px] font-medium text-ink hover:bg-surface-alt shrink-0"
          >
            + {CATEGORY_LABELS.PERFORMANCE_BOND[isKk ? 'kk' : 'ru']} (3%)
          </button>
          <button
            onClick={() => openAddItemModal('BID_SECURITY')}
            className="px-2.5 py-1 rounded-lg bg-paper border border-hairline text-[11px] font-medium text-ink hover:bg-surface-alt shrink-0"
          >
            + {CATEGORY_LABELS.BID_SECURITY[isKk ? 'kk' : 'ru']} (1%)
          </button>
          <button
            onClick={() => openAddItemModal('TAXES')}
            className="px-2.5 py-1 rounded-lg bg-paper border border-hairline text-[11px] font-medium text-ink hover:bg-surface-alt shrink-0"
          >
            + {CATEGORY_LABELS.TAXES[isKk ? 'kk' : 'ru']}
          </button>
        </div>

        {/* Cost Items Table */}
        <div className="overflow-x-auto border border-hairline rounded-xl bg-paper">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-alt border-b border-hairline text-[11px] font-bold text-mid-gray uppercase tracking-wider">
              <tr>
                <th className="p-3">{isKk ? 'Санат' : 'Категория'}</th>
                <th className="p-3">{isKk ? 'Атауы' : 'Наименование статьи'}</th>
                <th className="p-3">{isKk ? 'Түрі' : 'Тип'}</th>
                <th className="p-3">{isKk ? 'Мөлшері' : 'Значение'}</th>
                <th className="p-3">{isKk ? 'Есептелген сома' : 'Итоговая сумма'}</th>
                <th className="p-3 text-right">{isKk ? 'Әрекет' : 'Действия'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {calculation.costItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-mid-gray text-xs">
                    {isKk ? 'Шығыс баптары жоқ. Жоғарыдағы батырмамен қосыңыз.' : 'Статьи затрат отсутствуют. Добавьте первую статью.'}
                  </td>
                </tr>
              ) : (
                calculation.costItems.map((item) => {
                  const catConfig = CATEGORY_LABELS[item.category] || CATEGORY_LABELS.OTHER;
                  return (
                    <tr key={item.id} className="hover:bg-surface-alt/50 transition-colors">
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${catConfig.color}`}>
                          {catConfig[isKk ? 'kk' : 'ru']}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-ink">
                        {item.label}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-ink-soft">
                        {item.valueType === 'PERCENTAGE' ? '%' : '₸ (Фикс)'}
                      </td>
                      <td className="p-3 font-mono font-medium text-ink">
                        {item.valueType === 'PERCENTAGE'
                          ? `${item.amount}% (${(item.baseAmount || calculation.startPrice).toLocaleString('ru-RU')} ₸ негіз)`
                          : `${item.amount.toLocaleString('ru-RU')} ₸`}
                      </td>
                      <td className="p-3 font-mono font-bold text-sky-700">
                        {item.computedAmount.toLocaleString('ru-RU')} ₸
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => openEditItemModal(item)}
                            className="p-1.5 rounded-lg hover:bg-paper border border-transparent hover:border-hairline text-mid-gray hover:text-ink transition-colors"
                            title={isKk ? 'Өңдеу' : 'Редактировать'}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCostItem(item.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 border border-transparent hover:border-rose-200 text-mid-gray hover:text-rose-600 transition-colors"
                            title={isKk ? 'Жою' : 'Удалить'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {calculation.costItems.length > 0 && (
              <tfoot className="bg-surface-alt/70 border-t border-hairline font-bold">
                <tr>
                  <td colSpan={4} className="p-3 text-right uppercase tracking-wider text-mid-gray text-[11px]">
                    {isKk ? 'Барлығы себестоимость:' : 'Итого себестоимость:'}
                  </td>
                  <td className="p-3 font-mono text-sm text-sky-800 font-bold">
                    {calculation.totalCost.toLocaleString('ru-RU')} ₸
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 6. MODAL FORM: ADD / EDIT COST ITEM */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-paper border border-hairline rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <h3 className="text-sm font-bold text-ink">
                {editingItemId
                  ? (isKk ? 'Шығыс бабын өңдеу' : 'Редактировать статью затрат')
                  : (isKk ? 'Жаңа шығыс бабын қосу' : 'Добавить статью затрат')}
              </h3>
              <button
                onClick={() => setIsItemModalOpen(false)}
                className="p-1 rounded-lg text-mid-gray hover:text-ink hover:bg-surface-alt transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCostItem} className="space-y-4 text-xs">
              {/* Category */}
              <div>
                <label className="block text-mid-gray mb-1 font-semibold">
                  {isKk ? 'Категория:' : 'Категория затрат:'}
                </label>
                <select
                  value={itemCategory}
                  onChange={e => {
                    const cat = e.target.value as TenderCostCategory;
                    setItemCategory(cat);
                    if (!editingItemId) setItemLabel(CATEGORY_LABELS[cat][isKk ? 'kk' : 'ru']);
                  }}
                  className="w-full p-2.5 rounded-xl border border-hairline bg-surface-alt text-ink font-semibold focus:outline-none focus:border-ink"
                >
                  {Object.entries(CATEGORY_LABELS).map(([catKey, labelObj]) => (
                    <option key={catKey} value={catKey}>
                      {labelObj[isKk ? 'kk' : 'ru']}
                    </option>
                  ))}
                </select>
              </div>

              {/* Label */}
              <div>
                <label className="block text-mid-gray mb-1 font-semibold">
                  {isKk ? 'Баптың атауы:' : 'Название статьи:'}
                </label>
                <input
                  type="text"
                  required
                  value={itemLabel}
                  onChange={e => setItemLabel(e.target.value)}
                  placeholder={isKk ? 'Мәселен: Тауарды тасымалдау...' : 'Например: Доставка товара до склада заказчика...'}
                  className="w-full p-2.5 rounded-xl border border-hairline bg-surface-alt text-ink font-semibold focus:outline-none focus:border-ink"
                />
              </div>

              {/* Value Type: FIXED vs PERCENTAGE */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-mid-gray mb-1 font-semibold">
                    {isKk ? 'Есептеу түрі:' : 'Тип расчёта:'}
                  </label>
                  <select
                    value={itemValueType}
                    onChange={e => setItemValueType(e.target.value as TenderCostValueType)}
                    className="w-full p-2.5 rounded-xl border border-hairline bg-surface-alt text-ink font-semibold focus:outline-none focus:border-ink"
                  >
                    <option value="FIXED">{isKk ? 'Фиксированная сумма (₸)' : 'Фиксированная сумма (₸)'}</option>
                    <option value="PERCENTAGE">{isKk ? 'Процент от базы (%)' : 'Процент от базы (%)'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-mid-gray mb-1 font-semibold">
                    {itemValueType === 'PERCENTAGE' ? (isKk ? 'Процент (%):' : 'Процент (%):') : (isKk ? 'Сұраныс сомасы (₸):' : 'Сумма (₸):')}
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={itemAmount}
                    onChange={e => setItemAmount(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-hairline bg-surface-alt text-ink font-bold font-mono focus:outline-none focus:border-ink"
                  />
                </div>
              </div>

              {/* Base Amount (if PERCENTAGE) */}
              {itemValueType === 'PERCENTAGE' && (
                <div>
                  <label className="block text-mid-gray mb-1 font-semibold">
                    {isKk ? 'Есептік база (₸) [бос қалдырсаңыз = лот бағасы]:' : 'База для расчёта (₸) [по умолчанию = стартовая цена лота]:'}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={itemBaseAmount}
                    onChange={e => setItemBaseAmount(e.target.value)}
                    placeholder={String(calculation.startPrice)}
                    className="w-full p-2.5 rounded-xl border border-hairline bg-surface-alt text-ink font-mono focus:outline-none focus:border-ink"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-surface-alt hover:bg-paper border border-hairline text-ink font-medium transition-all"
                >
                  {isKk ? 'Бас тарту' : 'Отмена'}
                </button>

                <button
                  type="submit"
                  disabled={isSavingItem}
                  className="px-4 py-2 rounded-xl bg-ember hover:bg-ember/90 text-white font-semibold flex items-center space-x-1.5 transition-all shadow-subtle disabled:opacity-50"
                >
                  {isSavingItem ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>{isKk ? 'Сақтау' : 'Сохранить статью'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
