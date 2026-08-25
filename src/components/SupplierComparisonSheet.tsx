'use client';

import React, { useState, useEffect } from 'react';
import { 
  Tender, 
  TenderSupplierComparisonData, 
  ComparisonSupplierData, 
  ComparisonLineItemData,
  ComparisonSupplierPriceData,
  ComparisonSupplierSummary 
} from '../lib/types/tender';
import { 
  Users, 
  Plus, 
  Trash2, 
  Download, 
  Save, 
  Check, 
  Loader2, 
  TrendingUp, 
  DollarSign, 
  Percent, 
  Building2, 
  Sparkles, 
  Star, 
  AlertCircle,
  CreditCard,
  RefreshCw,
  Info,
  Layers,
  Edit2
} from 'lucide-react';

interface SupplierComparisonSheetProps {
  tender: Tender;
  language?: 'RU' | 'KK';
}

export const SupplierComparisonSheet: React.FC<SupplierComparisonSheetProps> = ({
  tender,
  language = 'RU'
}) => {
  const isKk = language === 'KK';
  const [data, setData] = useState<TenderSupplierComparisonData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Active modal for supplier details editing
  const [editingSupplierIdx, setEditingSupplierIdx] = useState<number | null>(null);

  // Credit calculation interactive states
  const [creditRatePct, setCreditRatePct] = useState<number>(18); // Annual % rate (e.g. 18% p.a.)

  useEffect(() => {
    fetchComparisonData();
  }, [tender.id]);

  const fetchComparisonData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenders/${tender.id}/supplier-comparison`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setError(json.error || 'Не удалось загрузить данные конкурентного листа');
      }
    } catch (err: any) {
      setError('Ошибка сети при загрузке конкурентного листа');
    } finally {
      setLoading(false);
    }
  };

  // Recalculates local totals when user changes values in state
  const recalculateLocal = (currentData: TenderSupplierComparisonData): TenderSupplierComparisonData => {
    const exchangeRate = Number(currentData.exchangeRate) || 5.20;
    const creditCost = Number(currentData.creditCost) || 0;

    let totalBudgetKzt0 = 0;
    let totalBudgetKzt12 = 0;

    for (const item of currentData.lineItems) {
      const qty = Number(item.quantity) || 1;
      const b0 = Number(item.budgetPriceKzt0) || 0;
      const b12 = Number(item.budgetPriceKzt12) || (b0 * 1.12);
      totalBudgetKzt0 += qty * b0;
      totalBudgetKzt12 += qty * b12;
    }

    if (totalBudgetKzt12 === 0 && tender.amount > 0) {
      totalBudgetKzt12 = tender.amount;
      totalBudgetKzt0 = Math.round(tender.amount / 1.12);
    }

    const supplierSums: Record<string, { totalKzt0: number; totalKzt12: number; totalRub0: number }> = {};
    currentData.suppliers.forEach(s => {
      supplierSums[s.id || s.name] = { totalKzt0: 0, totalKzt12: 0, totalRub0: 0 };
    });

    for (const item of currentData.lineItems) {
      const qty = Number(item.quantity) || 1;
      for (const supplier of currentData.suppliers) {
        const suppKey = supplier.id || supplier.name;
        const priceObj = item.prices[suppKey] || item.prices[supplier.id || ''] || item.prices[supplier.name];

        let p0 = 0;
        let p12 = 0;
        let pRub = 0;

        if (priceObj) {
          pRub = Number(priceObj.priceRub0) || 0;
          if (priceObj.currency === 'RUB' && pRub > 0) {
            p0 = pRub * exchangeRate;
            p12 = p0 * 1.12;
          } else {
            p0 = Number(priceObj.priceKzt0) || 0;
            p12 = Number(priceObj.priceKzt12) || (p0 * 1.12);
            if (pRub === 0 && p0 > 0 && exchangeRate > 0) {
              pRub = Math.round((p0 / exchangeRate) * 100) / 100;
            }
          }
        }

        supplierSums[suppKey].totalKzt0 += qty * p0;
        supplierSums[suppKey].totalKzt12 += qty * p12;
        supplierSums[suppKey].totalRub0 += qty * pRub;
      }
    }

    let minTotalKzt12 = Infinity;
    const summaries: ComparisonSupplierSummary[] = [];

    currentData.suppliers.forEach(s => {
      const suppKey = s.id || s.name;
      const sums = supplierSums[suppKey] || { totalKzt0: 0, totalKzt12: 0, totalRub0: 0 };
      const discountPct = Number(s.discountPercent) || 0;
      const discountMultiplier = 1 - (discountPct / 100);

      const totalWithDiscountKzt0 = sums.totalKzt0 * discountMultiplier;
      const totalWithDiscountKzt12 = sums.totalKzt12 * discountMultiplier;

      if (totalWithDiscountKzt12 > 0 && totalWithDiscountKzt12 < minTotalKzt12) {
        minTotalKzt12 = totalWithDiscountKzt12;
      }

      const revenue = totalBudgetKzt12 > 0 ? totalBudgetKzt12 : (totalWithDiscountKzt12 * 1.15);
      const grossMarginKzt = revenue - totalWithDiscountKzt12;
      const grossMarginPct = revenue > 0 ? Math.round((grossMarginKzt / revenue) * 10000) / 100 : 0;

      const netMarginWithCreditKzt = grossMarginKzt - creditCost;
      const netMarginWithCreditPct = revenue > 0 ? Math.round((netMarginWithCreditKzt / revenue) * 10000) / 100 : 0;

      summaries.push({
        supplierId: suppKey,
        name: s.name,
        totalKzt0: Math.round(sums.totalKzt0 * 100) / 100,
        totalKzt12: Math.round(sums.totalKzt12 * 100) / 100,
        totalRub0: Math.round(sums.totalRub0 * 100) / 100,
        discountPercent: discountPct,
        totalWithDiscountKzt0: Math.round(totalWithDiscountKzt0 * 100) / 100,
        totalWithDiscountKzt12: Math.round(totalWithDiscountKzt12 * 100) / 100,
        revenueKzt: Math.round(revenue * 100) / 100,
        grossMarginKzt: Math.round(grossMarginKzt * 100) / 100,
        grossMarginPct,
        netMarginWithCreditKzt: Math.round(netMarginWithCreditKzt * 100) / 100,
        netMarginWithCreditPct,
        isSelected: !!s.isSelected || currentData.selectedSupplierId === suppKey,
        isBestPrice: false
      });
    });

    summaries.forEach(sum => {
      if (sum.totalWithDiscountKzt12 > 0 && sum.totalWithDiscountKzt12 === minTotalKzt12) {
        sum.isBestPrice = true;
      }
    });

    return {
      ...currentData,
      totalBudgetKzt0: Math.round(totalBudgetKzt0 * 100) / 100,
      totalBudgetKzt12: Math.round(totalBudgetKzt12 * 100) / 100,
      summaries
    };
  };

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/tenders/${tender.id}/supplier-comparison`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert(json.error || 'Ошибка при сохранении');
      }
    } catch (err) {
      alert('Сбой запроса при сохранении конкурентного листа');
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/tenders/${tender.id}/supplier-comparison/export-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!res.ok) {
        throw new Error('Ошибка экспорта');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Конкурентный_лист_${tender.externalId || 'Tender'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Не удалось скачать Excel-файл конкурентного листа');
    } finally {
      setExporting(false);
    }
  };

  // Add a new supplier column
  const handleAddSupplier = () => {
    if (!data) return;
    const newIdx = data.suppliers.length + 1;
    const newSupplierId = `supp-${Date.now()}`;
    const newSupplier: ComparisonSupplierData = {
      id: newSupplierId,
      name: `ТОО «Поставщик №${newIdx}»`,
      address: 'г. Алматы',
      email: `sales${newIdx}@supplier.kz`,
      phone: '+7 (701) 000-00-00',
      paymentTerms: '100% постоплата в течение 30 дней',
      paymentForm: 'Безналичный расчет (KZT)',
      bidSecurity: Math.round((data.totalBudgetKzt12 || tender.amount) * 0.01),
      discountPercent: 0,
      order: data.suppliers.length,
      isSelected: false
    };

    const updatedLineItems = data.lineItems.map(item => ({
      ...item,
      prices: {
        ...item.prices,
        [newSupplierId]: {
          lineItemId: item.id || '',
          supplierId: newSupplierId,
          proposedName: item.name,
          priceKzt0: item.budgetPriceKzt0 ? Math.round(item.budgetPriceKzt0 * 0.9) : 0,
          priceKzt12: item.budgetPriceKzt12 ? Math.round(item.budgetPriceKzt12 * 0.9) : 0,
          priceRub0: item.budgetPriceKzt0 ? Math.round((item.budgetPriceKzt0 * 0.9) / (data.exchangeRate || 5.2)) : 0,
          currency: 'KZT'
        }
      }
    }));

    const updated = recalculateLocal({
      ...data,
      suppliers: [...data.suppliers, newSupplier],
      lineItems: updatedLineItems
    });
    setData(updated);
  };

  // Delete a supplier column
  const handleDeleteSupplier = (supplierId: string) => {
    if (!data || data.suppliers.length <= 1) {
      alert('В сравнении должен оставаться как минимум один поставщик');
      return;
    }
    if (!confirm('Удалить этого поставщика из сравнительной таблицы?')) return;

    const updatedSuppliers = data.suppliers.filter(s => s.id !== supplierId && s.name !== supplierId);
    const updatedLineItems = data.lineItems.map(item => {
      const { [supplierId]: removed, ...restPrices } = item.prices;
      return { ...item, prices: restPrices };
    });

    const updated = recalculateLocal({
      ...data,
      selectedSupplierId: data.selectedSupplierId === supplierId ? updatedSuppliers[0]?.id || null : data.selectedSupplierId,
      suppliers: updatedSuppliers,
      lineItems: updatedLineItems
    });
    setData(updated);
  };

  // Add a new line item row
  const handleAddLineItem = () => {
    if (!data) return;
    const newItemId = `item-${Date.now()}`;
    const defaultQty = 1;
    const defaultPrice0 = 100000;
    const defaultPrice12 = 112000;

    const pricesMap: Record<string, ComparisonSupplierPriceData> = {};
    data.suppliers.forEach(s => {
      const sKey = s.id || s.name;
      pricesMap[sKey] = {
        lineItemId: newItemId,
        supplierId: sKey,
        proposedName: 'Новая позиция ТРУ',
        priceKzt0: defaultPrice0,
        priceKzt12: defaultPrice12,
        priceRub0: Math.round(defaultPrice0 / (data.exchangeRate || 5.2)),
        currency: 'KZT'
      };
    });

    const newLineItem: ComparisonLineItemData = {
      id: newItemId,
      order: data.lineItems.length + 1,
      mpzCode: `MPZ-${100 + data.lineItems.length + 1}`,
      name: 'Новая позиция ТРУ по спецификации',
      unit: 'шт',
      quantity: defaultQty,
      budgetPriceKzt0: defaultPrice0,
      budgetPriceKzt12: defaultPrice12,
      prices: pricesMap
    };

    const updated = recalculateLocal({
      ...data,
      lineItems: [...data.lineItems, newLineItem]
    });
    setData(updated);
  };

  // Delete line item row
  const handleDeleteLineItem = (itemIdx: number) => {
    if (!data || data.lineItems.length <= 1) {
      alert('В спецификации должна оставаться как минимум одна позиция');
      return;
    }
    if (!confirm('Удалить эту позицию из спецификации?')) return;

    const updatedLineItems = data.lineItems.filter((_, idx) => idx !== itemIdx);
    const updated = recalculateLocal({
      ...data,
      lineItems: updatedLineItems
    });
    setData(updated);
  };

  // Select supplier as winner
  const handleSelectWinner = (supplierId: string) => {
    if (!data) return;
    const updatedSuppliers = data.suppliers.map(s => ({
      ...s,
      isSelected: (s.id === supplierId || s.name === supplierId)
    }));
    const updated = recalculateLocal({
      ...data,
      selectedSupplierId: supplierId,
      suppliers: updatedSuppliers
    });
    setData(updated);
  };

  // Handle line item field changes
  const handleLineItemChange = (idx: number, field: keyof ComparisonLineItemData, value: any) => {
    if (!data) return;
    const updatedLineItems = [...data.lineItems];
    updatedLineItems[idx] = {
      ...updatedLineItems[idx],
      [field]: value
    };

    // If budget price 0 changed, auto-update 12% if not custom
    if (field === 'budgetPriceKzt0') {
      const num0 = parseFloat(value) || 0;
      updatedLineItems[idx].budgetPriceKzt12 = Math.round(num0 * 1.12 * 100) / 100;
    }

    const updated = recalculateLocal({
      ...data,
      lineItems: updatedLineItems
    });
    setData(updated);
  };

  // Handle price cell change
  const handlePriceChange = (
    itemIdx: number, 
    suppKey: string, 
    field: keyof ComparisonSupplierPriceData, 
    value: any
  ) => {
    if (!data) return;
    const updatedLineItems = [...data.lineItems];
    const currentItem = updatedLineItems[itemIdx];
    const currentPrices = { ...currentItem.prices };
    const currentPriceObj = currentPrices[suppKey] || {
      lineItemId: currentItem.id || '',
      supplierId: suppKey,
      currency: 'KZT'
    };

    let updatedPriceObj: ComparisonSupplierPriceData = {
      ...currentPriceObj,
      [field]: value
    };

    const exRate = Number(data.exchangeRate) || 5.20;

    // Automatic conversions
    if (field === 'priceKzt0') {
      const num0 = parseFloat(value) || 0;
      updatedPriceObj.priceKzt12 = Math.round(num0 * 1.12 * 100) / 100;
      if (exRate > 0) {
        updatedPriceObj.priceRub0 = Math.round((num0 / exRate) * 100) / 100;
      }
    } else if (field === 'priceRub0') {
      const numRub = parseFloat(value) || 0;
      updatedPriceObj.priceKzt0 = Math.round(numRub * exRate * 100) / 100;
      updatedPriceObj.priceKzt12 = Math.round(numRub * exRate * 1.12 * 100) / 100;
    }

    currentPrices[suppKey] = updatedPriceObj;
    updatedLineItems[itemIdx] = {
      ...currentItem,
      prices: currentPrices
    };

    const updated = recalculateLocal({
      ...data,
      lineItems: updatedLineItems
    });
    setData(updated);
  };

  // Update credit calculations
  const handleCreditChange = (amount?: number, days?: number, ratePct?: number) => {
    if (!data) return;
    const amt = amount !== undefined ? amount : (data.creditAmount || 0);
    const d = days !== undefined ? days : (data.creditDays || 0);
    const r = ratePct !== undefined ? ratePct : creditRatePct;

    const cost = Math.round(amt * (r / 100) * (d / 365));

    const updated = recalculateLocal({
      ...data,
      creditAmount: amt,
      creditDays: d,
      creditCost: cost
    });
    setData(updated);
  };

  if (loading) {
    return (
      <div className="p-12 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-ember animate-spin mx-auto" />
        <p className="text-xs text-mid-gray">
          {isKk ? 'Бәсекелестік парақша жүктелуде...' : 'Загрузка конкурентного листа по выбору поставщика...'}
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2">
        <div className="flex items-center space-x-2 font-bold">
          <AlertCircle className="w-4 h-4 text-rose-600" />
          <span>{isKk ? 'Қате пайда болды' : 'Ошибка загрузки'}</span>
        </div>
        <p>{error || 'Данные конкурентного листа недоступны'}</p>
        <button
          onClick={fetchComparisonData}
          className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold text-[11px] hover:bg-rose-700 transition-all"
        >
          {isKk ? 'Қайталау' : 'Повторить попытку'}
        </button>
      </div>
    );
  }

  const selectedWinner = data.summaries?.find(s => s.isSelected) || data.summaries?.find(s => s.isBestPrice) || data.summaries?.[0];

  return (
    <div className="space-y-6 animate-fadeIn">

      {/* 1. TOP HEADER CONTROLS & META BAR */}
      <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-md bg-paper border border-hairline text-[11px] font-mono font-bold text-ink">
                {data.tradingPlatform || 'goszakup.gov.kz'}
              </span>
              <span className="text-xs font-mono text-mid-gray">№ {data.tenderNumber || tender.externalId}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Корпоративный шаблон Excel
              </span>
            </div>
            <h3 className="text-base font-bold text-ink leading-snug">
              Конкурентный лист по выбору поставщика
            </h3>
            <p className="text-xs text-ink-soft">
              Заказчик: <span className="font-semibold text-ink">{data.customerName || tender.customerName}</span>
            </p>
          </div>

          <div className="flex items-center space-x-2 flex-wrap">
            <button
              onClick={handleAddSupplier}
              className="px-3 py-2 rounded-xl bg-paper hover:bg-surface-alt border border-hairline text-ink font-semibold text-xs flex items-center space-x-1.5 transition-all shadow-subtle"
              title="Добавить колонку нового поставщика"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              <span>+ Поставщик</span>
            </button>

            <button
              onClick={handleAddLineItem}
              className="px-3 py-2 rounded-xl bg-paper hover:bg-surface-alt border border-hairline text-ink font-semibold text-xs flex items-center space-x-1.5 transition-all shadow-subtle"
              title="Добавить строку позиции ТРУ"
            >
              <Plus className="w-3.5 h-3.5 text-sky-600" />
              <span>+ Позиция ТЗ</span>
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-subtle ${
                saveSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-paper border border-hairline text-ink hover:bg-surface-alt'
              }`}
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : saveSuccess ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Save className="w-3.5 h-3.5 text-ink" />
              )}
              <span>{saveSuccess ? 'Сохранено' : 'Сохранить'}</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="px-4 py-2 rounded-xl bg-ink hover:bg-ink-soft text-paper font-semibold text-xs flex items-center space-x-1.5 transition-all shadow-subtle"
              title="Скачать стилизованный Excel-файл (.xlsx) по корпоративному шаблону"
            >
              {exporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <Download className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>Скачать Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Currency Rate & Budget Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-hairline">
          <div className="p-3 rounded-xl bg-paper border border-hairline flex items-center justify-between">
            <span className="text-[11px] text-mid-gray">Курс НБ РК (RUB → KZT):</span>
            <div className="flex items-center space-x-1.5">
              <input
                type="number"
                step="0.01"
                value={data.exchangeRate || 5.20}
                onChange={e => {
                  const val = parseFloat(e.target.value) || 5.20;
                  setData(recalculateLocal({ ...data, exchangeRate: val }));
                }}
                className="w-20 px-2 py-1 text-xs font-mono font-bold text-right bg-surface-alt border border-hairline rounded-lg focus:outline-none focus:border-ink"
              />
              <span className="text-xs font-bold text-ink">₸</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-paper border border-hairline flex items-center justify-between">
            <span className="text-[11px] text-mid-gray">Бюджет без НДС (0%):</span>
            <span className="text-xs font-mono font-bold text-ink">
              {(data.totalBudgetKzt0 || 0).toLocaleString('ru-RU')} ₸
            </span>
          </div>

          <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 flex items-center justify-between">
            <span className="text-[11px] text-blue-900 font-semibold">Бюджет с НДС (12%):</span>
            <span className="text-xs font-mono font-bold text-blue-950">
              {(data.totalBudgetKzt12 || 0).toLocaleString('ru-RU')} ₸
            </span>
          </div>
        </div>
      </div>

      {/* 2. SUPPLIERS SUMMARY CARDS WITH WINNER SELECTION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.suppliers.map((s, idx) => {
          const sumObj = data.summaries?.find(sm => sm.supplierId === (s.id || s.name));
          const isWinner = !!s.isSelected || data.selectedSupplierId === s.id;
          const isBest = !!sumObj?.isBestPrice;

          return (
            <div
              key={s.id || idx}
              className={`p-4 rounded-2xl border transition-all relative flex flex-col justify-between ${
                isWinner
                  ? 'bg-emerald-50/70 border-emerald-400 shadow-md ring-1 ring-emerald-400'
                  : 'bg-surface-alt border-hairline'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center space-x-1.5 flex-1">
                    <Building2 className={`w-4 h-4 shrink-0 ${isWinner ? 'text-emerald-700' : 'text-mid-gray'}`} />
                    <input
                      type="text"
                      value={s.name}
                      onChange={e => {
                        const updatedSuppliers = [...data.suppliers];
                        updatedSuppliers[idx].name = e.target.value;
                        setData(recalculateLocal({ ...data, suppliers: updatedSuppliers }));
                      }}
                      className="font-bold text-xs text-ink bg-transparent border-b border-dashed border-hairline hover:border-ink focus:border-ink focus:outline-none w-full"
                    />
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setEditingSupplierIdx(idx)}
                      className="p-1 text-mid-gray hover:text-ink rounded-lg hover:bg-paper"
                      title="Редактировать реквизиты"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {data.suppliers.length > 1 && (
                      <button
                        onClick={() => handleDeleteSupplier(s.id || s.name)}
                        className="p-1 text-mid-gray hover:text-rose-600 rounded-lg hover:bg-rose-50"
                        title="Удалить поставщика"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Badges */}
                <div className="flex items-center space-x-1.5 mb-3 flex-wrap gap-1">
                  {isWinner && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white flex items-center space-x-1">
                      <Star className="w-3 h-3 fill-current" />
                      <span>Победитель</span>
                    </span>
                  )}
                  {isBest && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                      🔥 Лучшая цена
                    </span>
                  )}
                  <span className="text-[10px] text-mid-gray">
                    Скидка: {s.discountPercent || 0}%
                  </span>
                </div>

                {/* KPI Metrics */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between items-baseline">
                    <span className="text-mid-gray text-[11px]">Итого закуп (с НДС):</span>
                    <span className="font-mono font-bold text-ink">
                      {(sumObj?.totalWithDiscountKzt12 || 0).toLocaleString('ru-RU')} ₸
                    </span>
                  </div>

                  <div className="flex justify-between items-baseline">
                    <span className="text-mid-gray text-[11px]">В рублях (без НДС):</span>
                    <span className="font-mono text-ink-soft text-[11px]">
                      {(sumObj?.totalRub0 || 0).toLocaleString('ru-RU')} ₽
                    </span>
                  </div>

                  <div className="flex justify-between items-baseline pt-1 border-t border-hairline">
                    <span className="text-mid-gray text-[11px]">Валовый доход:</span>
                    <span className={`font-mono font-bold ${
                      (sumObj?.grossMarginKzt || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}>
                      {(sumObj?.grossMarginKzt || 0).toLocaleString('ru-RU')} ₸ ({sumObj?.grossMarginPct || 0}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Selection Button */}
              <div className="pt-3 mt-3 border-t border-hairline">
                <button
                  onClick={() => handleSelectWinner(s.id || s.name)}
                  className={`w-full py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all ${
                    isWinner
                      ? 'bg-emerald-600 text-white shadow-subtle'
                      : 'bg-paper hover:bg-surface-alt border border-hairline text-ink'
                  }`}
                >
                  <Star className={`w-3.5 h-3.5 ${isWinner ? 'fill-current' : ''}`} />
                  <span>{isWinner ? 'Выбранный контрагент' : 'Выбрать победителем'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. MAIN COMPARISON SPREADSHEET TABLE */}
      <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-3 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
              Матрица сравнения коммерческих предложений
            </h4>
          </div>
          <span className="text-[11px] text-mid-gray">
            Позиций в спецификации: {data.lineItems.length}
          </span>
        </div>

        <div className="overflow-x-auto border border-hairline rounded-xl bg-paper max-h-[500px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-surface-alt sticky top-0 z-20 border-b border-hairline text-[11px] text-ink">
              {/* Row 1 Headers */}
              <tr>
                <th rowSpan={2} className="p-2.5 border-r border-hairline text-center w-8">№</th>
                <th rowSpan={2} className="p-2.5 border-r border-hairline w-24">Код МПЗ</th>
                <th rowSpan={2} className="p-2.5 border-r border-hairline min-w-[200px]">Наименование ТРУ</th>
                <th rowSpan={2} className="p-2.5 border-r border-hairline text-center w-12">Ед.</th>
                <th rowSpan={2} className="p-2.5 border-r border-hairline text-right w-16">Кол-во</th>
                <th colSpan={2} className="p-2 border-r border-hairline text-center bg-blue-50 text-blue-900 font-bold">
                  Бюджет заказчика
                </th>
                {data.suppliers.map((s, sIdx) => (
                  <th
                    key={s.id || sIdx}
                    colSpan={3}
                    className={`p-2 border-r border-hairline text-center font-bold truncate max-w-[220px] ${
                      s.isSelected || data.selectedSupplierId === s.id ? 'bg-emerald-100/70 text-emerald-900' : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {s.name}
                  </th>
                ))}
                <th rowSpan={2} className="p-2.5 text-center w-10">Удалить</th>
              </tr>

              {/* Row 2 Sub-Headers */}
              <tr className="bg-surface-alt/90 text-[10px] text-mid-gray font-semibold">
                {/* Budget subheaders */}
                <th className="p-1.5 border-r border-hairline text-right bg-blue-50/50">Цена 0%</th>
                <th className="p-1.5 border-r border-hairline text-right bg-blue-50/50">Сумма 12%</th>

                {/* Supplier subheaders */}
                {data.suppliers.map((s, sIdx) => (
                  <React.Fragment key={s.id || sIdx}>
                    <th className="p-1.5 border-r border-hairline min-w-[140px]">Предложение / аналог</th>
                    <th className="p-1.5 border-r border-hairline text-right w-24">Цена 0%</th>
                    <th className="p-1.5 border-r border-hairline text-right w-24 font-bold text-ink">Сумма 12%</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-hairline">
              {data.lineItems.map((item, rIdx) => {
                const qty = Number(item.quantity) || 1;
                const bPrice0 = Number(item.budgetPriceKzt0) || 0;
                const bPrice12 = Number(item.budgetPriceKzt12) || (bPrice0 * 1.12);
                const bSum12 = qty * bPrice12;

                return (
                  <tr key={item.id || rIdx} className="hover:bg-surface-alt/40 transition-colors">
                    {/* № */}
                    <td className="p-2 text-center text-mid-gray border-r border-hairline font-mono">
                      {rIdx + 1}
                    </td>

                    {/* MPZ Code */}
                    <td className="p-1 border-r border-hairline">
                      <input
                        type="text"
                        value={item.mpzCode || ''}
                        onChange={e => handleLineItemChange(rIdx, 'mpzCode', e.target.value)}
                        placeholder="Код МПЗ"
                        className="w-full px-1.5 py-1 text-[11px] font-mono bg-transparent border border-transparent hover:border-hairline focus:border-ink focus:bg-paper rounded focus:outline-none"
                      />
                    </td>

                    {/* Name */}
                    <td className="p-1 border-r border-hairline">
                      <input
                        type="text"
                        value={item.name}
                        onChange={e => handleLineItemChange(rIdx, 'name', e.target.value)}
                        className="w-full px-1.5 py-1 text-xs font-semibold text-ink bg-transparent border border-transparent hover:border-hairline focus:border-ink focus:bg-paper rounded focus:outline-none"
                      />
                    </td>

                    {/* Unit */}
                    <td className="p-1 border-r border-hairline text-center">
                      <input
                        type="text"
                        value={item.unit || 'шт'}
                        onChange={e => handleLineItemChange(rIdx, 'unit', e.target.value)}
                        className="w-full text-center px-1 py-1 text-xs bg-transparent border border-transparent hover:border-hairline focus:border-ink focus:bg-paper rounded focus:outline-none"
                      />
                    </td>

                    {/* Quantity */}
                    <td className="p-1 border-r border-hairline">
                      <input
                        type="number"
                        step="any"
                        value={item.quantity}
                        onChange={e => handleLineItemChange(rIdx, 'quantity', parseFloat(e.target.value) || 1)}
                        className="w-full text-right font-mono font-bold text-xs px-1.5 py-1 bg-transparent border border-transparent hover:border-hairline focus:border-ink focus:bg-paper rounded focus:outline-none"
                      />
                    </td>

                    {/* Budget Price 0% */}
                    <td className="p-1 border-r border-hairline bg-blue-50/20">
                      <input
                        type="number"
                        step="any"
                        value={item.budgetPriceKzt0 || ''}
                        onChange={e => handleLineItemChange(rIdx, 'budgetPriceKzt0', parseFloat(e.target.value) || 0)}
                        className="w-full text-right font-mono text-[11px] px-1.5 py-1 bg-transparent border border-transparent hover:border-hairline focus:border-ink focus:bg-paper rounded focus:outline-none"
                      />
                    </td>

                    {/* Budget Sum 12% */}
                    <td className="p-2 border-r border-hairline text-right font-mono font-bold text-blue-900 bg-blue-50/20">
                      {Math.round(bSum12).toLocaleString('ru-RU')} ₸
                    </td>

                    {/* Supplier columns */}
                    {data.suppliers.map((s, sIdx) => {
                      const suppKey = s.id || s.name;
                      const pObj = item.prices[suppKey] || item.prices[s.id || ''] || item.prices[s.name] || {};
                      const p0 = Number(pObj.priceKzt0) || 0;
                      const p12 = Number(pObj.priceKzt12) || (p0 * 1.12);
                      const sSum12 = qty * p12;
                      const isWinner = !!s.isSelected || data.selectedSupplierId === s.id;

                      return (
                        <React.Fragment key={s.id || sIdx}>
                          {/* Proposed Name */}
                          <td className={`p-1 border-r border-hairline ${isWinner ? 'bg-emerald-50/30' : ''}`}>
                            <input
                              type="text"
                              value={pObj.proposedName || ''}
                              onChange={e => handlePriceChange(rIdx, suppKey, 'proposedName', e.target.value)}
                              placeholder={item.name}
                              className="w-full text-[11px] px-1.5 py-1 bg-transparent border border-transparent hover:border-hairline focus:border-ink focus:bg-paper rounded focus:outline-none"
                            />
                          </td>

                          {/* Price KZT 0% */}
                          <td className={`p-1 border-r border-hairline ${isWinner ? 'bg-emerald-50/30' : ''}`}>
                            <input
                              type="number"
                              step="any"
                              value={pObj.priceKzt0 != null ? pObj.priceKzt0 : ''}
                              onChange={e => handlePriceChange(rIdx, suppKey, 'priceKzt0', parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              className="w-full text-right font-mono text-[11px] px-1.5 py-1 bg-transparent border border-transparent hover:border-hairline focus:border-ink focus:bg-paper rounded focus:outline-none"
                            />
                          </td>

                          {/* Sum KZT 12% */}
                          <td className={`p-2 border-r border-hairline text-right font-mono font-bold ${
                            isWinner ? 'bg-emerald-50/60 text-emerald-950' : 'text-ink'
                          }`}>
                            {Math.round(sSum12).toLocaleString('ru-RU')} ₸
                          </td>
                        </React.Fragment>
                      );
                    })}

                    {/* Delete Action */}
                    <td className="p-1 text-center">
                      <button
                        onClick={() => handleDeleteLineItem(rIdx)}
                        className="p-1 text-mid-gray hover:text-rose-600 rounded hover:bg-rose-50"
                        title="Удалить строку"
                      >
                        <Trash2 className="w-3.5 h-3.5 mx-auto" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Table Footer Totals */}
            <tfoot className="bg-surface-alt font-bold text-xs border-t-2 border-hairline">
              <tr>
                <td colSpan={5} className="p-2.5 text-right uppercase tracking-wider text-mid-gray border-r border-hairline">
                  Итого сумма:
                </td>
                <td className="p-2 text-right font-mono border-r border-hairline text-blue-900 bg-blue-50/40">
                  {(data.totalBudgetKzt0 || 0).toLocaleString('ru-RU')} ₸
                </td>
                <td className="p-2 text-right font-mono border-r border-hairline text-blue-950 bg-blue-50/40">
                  {(data.totalBudgetKzt12 || 0).toLocaleString('ru-RU')} ₸
                </td>

                {data.suppliers.map((s, sIdx) => {
                  const sumObj = data.summaries?.find(sm => sm.supplierId === (s.id || s.name));
                  const isWinner = !!s.isSelected || data.selectedSupplierId === s.id;

                  return (
                    <React.Fragment key={s.id || sIdx}>
                      <td className={`p-2 text-[11px] text-mid-gray border-r border-hairline ${isWinner ? 'bg-emerald-50/50' : ''}`}>
                        Скидка: {s.discountPercent || 0}%
                      </td>
                      <td className={`p-2 text-right font-mono text-[11px] border-r border-hairline ${isWinner ? 'bg-emerald-50/50' : ''}`}>
                        {(sumObj?.totalWithDiscountKzt0 || 0).toLocaleString('ru-RU')} ₸
                      </td>
                      <td className={`p-2 text-right font-mono border-r border-hairline ${
                        isWinner ? 'bg-emerald-100 text-emerald-950 font-black' : 'text-ink'
                      }`}>
                        {(sumObj?.totalWithDiscountKzt12 || 0).toLocaleString('ru-RU')} ₸
                      </td>
                    </React.Fragment>
                  );
                })}
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 4. PROFITABILITY & CREDIT CALCULATION WIDGET */}
      <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
              Расчёт доходности, кредитования и рентабельности
            </h4>
          </div>
          <span className="text-[11px] text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-200">
            Контрагент: {selectedWinner?.name || 'Победитель'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Credit parameters form */}
          <div className="p-4 rounded-xl bg-paper border border-hairline space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-ink">
              <CreditCard className="w-4 h-4 text-sky-600" />
              <span>Параметры привлечения кредита</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <label className="block text-[11px] text-mid-gray mb-1">Сумма кредита (₸):</label>
                <input
                  type="number"
                  step="any"
                  value={data.creditAmount || 0}
                  onChange={e => handleCreditChange(parseFloat(e.target.value) || 0, undefined, undefined)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-alt border border-hairline font-mono font-bold text-xs focus:outline-none focus:border-ink"
                />
              </div>

              <div>
                <label className="block text-[11px] text-mid-gray mb-1">Срок (дней):</label>
                <input
                  type="number"
                  value={data.creditDays || 0}
                  onChange={e => handleCreditChange(undefined, parseInt(e.target.value) || 0, undefined)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-alt border border-hairline font-mono font-bold text-xs focus:outline-none focus:border-ink"
                />
              </div>

              <div>
                <label className="block text-[11px] text-mid-gray mb-1">Ставка (% год.):</label>
                <input
                  type="number"
                  step="0.5"
                  value={creditRatePct}
                  onChange={e => {
                    const r = parseFloat(e.target.value) || 0;
                    setCreditRatePct(r);
                    handleCreditChange(undefined, undefined, r);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface-alt border border-hairline font-mono font-bold text-xs focus:outline-none focus:border-ink"
                />
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-surface-alt/70 flex justify-between items-center text-xs">
              <span className="text-mid-gray text-[11px]">Расходы на кредит (проценты):</span>
              <span className="font-mono font-bold text-amber-700">
                {(data.creditCost || 0).toLocaleString('ru-RU')} ₸
              </span>
            </div>
          </div>

          {/* Deal Margin & Profitability KPI */}
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2 text-xs">
            <h5 className="font-bold text-emerald-950 text-xs">Итоговые финансовые показатели сделки</h5>

            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between items-center">
                <span className="text-mid-gray text-[11px]">Выручка (Договор с заказчиком):</span>
                <span className="font-mono font-bold text-ink">
                  {(selectedWinner?.revenueKzt || data.totalBudgetKzt12 || 0).toLocaleString('ru-RU')} ₸
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-mid-gray text-[11px]">Закупка у поставщика:</span>
                <span className="font-mono text-ink-soft">
                  {(selectedWinner?.totalWithDiscountKzt12 || 0).toLocaleString('ru-RU')} ₸
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-mid-gray text-[11px]">Валовый доход (без кредита):</span>
                <span className="font-mono font-bold text-emerald-800">
                  {(selectedWinner?.grossMarginKzt || 0).toLocaleString('ru-RU')} ₸ ({selectedWinner?.grossMarginPct || 0}%)
                </span>
              </div>

              <div className="flex justify-between items-center pt-1.5 border-t border-emerald-200">
                <span className="font-bold text-emerald-950 text-xs">Чистая прибыль (с вычетом кредита):</span>
                <span className="font-mono font-bold text-sm text-emerald-900">
                  {(selectedWinner?.netMarginWithCreditKzt || 0).toLocaleString('ru-RU')} ₸
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="font-bold text-emerald-950 text-xs">Итоговая чистая рентабельность:</span>
                <span className="font-mono font-extrabold text-sm text-emerald-900">
                  {selectedWinner?.netMarginWithCreditPct || 0}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. EDIT SUPPLIER DETAILS MODAL */}
      {editingSupplierIdx !== null && data.suppliers[editingSupplierIdx] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-paper border border-hairline rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-hairline pb-2.5">
              <h4 className="text-sm font-bold text-ink">
                Реквизиты поставщика: {data.suppliers[editingSupplierIdx].name}
              </h4>
              <button
                onClick={() => setEditingSupplierIdx(null)}
                className="p-1 rounded-lg text-mid-gray hover:text-ink hover:bg-surface-alt"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-mid-gray mb-1">Наименование компании:</label>
                <input
                  type="text"
                  value={data.suppliers[editingSupplierIdx].name}
                  onChange={e => {
                    const supps = [...data.suppliers];
                    supps[editingSupplierIdx].name = e.target.value;
                    setData(recalculateLocal({ ...data, suppliers: supps }));
                  }}
                  className="w-full p-2 rounded-xl border border-hairline bg-surface-alt text-ink font-semibold focus:outline-none focus:border-ink"
                />
              </div>

              <div>
                <label className="block text-mid-gray mb-1">Юридический/фактический адрес:</label>
                <input
                  type="text"
                  value={data.suppliers[editingSupplierIdx].address || ''}
                  onChange={e => {
                    const supps = [...data.suppliers];
                    supps[editingSupplierIdx].address = e.target.value;
                    setData(recalculateLocal({ ...data, suppliers: supps }));
                  }}
                  className="w-full p-2 rounded-xl border border-hairline bg-surface-alt text-ink focus:outline-none focus:border-ink"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-mid-gray mb-1">E-mail:</label>
                  <input
                    type="email"
                    value={data.suppliers[editingSupplierIdx].email || ''}
                    onChange={e => {
                      const supps = [...data.suppliers];
                      supps[editingSupplierIdx].email = e.target.value;
                      setData(recalculateLocal({ ...data, suppliers: supps }));
                    }}
                    className="w-full p-2 rounded-xl border border-hairline bg-surface-alt text-ink focus:outline-none focus:border-ink"
                  />
                </div>
                <div>
                  <label className="block text-mid-gray mb-1">Телефон:</label>
                  <input
                    type="text"
                    value={data.suppliers[editingSupplierIdx].phone || ''}
                    onChange={e => {
                      const supps = [...data.suppliers];
                      supps[editingSupplierIdx].phone = e.target.value;
                      setData(recalculateLocal({ ...data, suppliers: supps }));
                    }}
                    className="w-full p-2 rounded-xl border border-hairline bg-surface-alt text-ink focus:outline-none focus:border-ink"
                  />
                </div>
              </div>

              <div>
                <label className="block text-mid-gray mb-1">Условия оплаты:</label>
                <input
                  type="text"
                  value={data.suppliers[editingSupplierIdx].paymentTerms || ''}
                  onChange={e => {
                    const supps = [...data.suppliers];
                    supps[editingSupplierIdx].paymentTerms = e.target.value;
                    setData(recalculateLocal({ ...data, suppliers: supps }));
                  }}
                  placeholder="100% постоплата в течение 30 дней"
                  className="w-full p-2 rounded-xl border border-hairline bg-surface-alt text-ink focus:outline-none focus:border-ink"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-mid-gray mb-1">Скидка (%):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={data.suppliers[editingSupplierIdx].discountPercent || 0}
                    onChange={e => {
                      const supps = [...data.suppliers];
                      supps[editingSupplierIdx].discountPercent = parseFloat(e.target.value) || 0;
                      setData(recalculateLocal({ ...data, suppliers: supps }));
                    }}
                    className="w-full p-2 rounded-xl border border-hairline bg-surface-alt text-ink font-mono font-bold focus:outline-none focus:border-ink"
                  />
                </div>
                <div>
                  <label className="block text-mid-gray mb-1">Обеспечение заявки (₸):</label>
                  <input
                    type="number"
                    step="any"
                    value={data.suppliers[editingSupplierIdx].bidSecurity || 0}
                    onChange={e => {
                      const supps = [...data.suppliers];
                      supps[editingSupplierIdx].bidSecurity = parseFloat(e.target.value) || 0;
                      setData(recalculateLocal({ ...data, suppliers: supps }));
                    }}
                    className="w-full p-2 rounded-xl border border-hairline bg-surface-alt text-ink font-mono font-bold focus:outline-none focus:border-ink"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setEditingSupplierIdx(null)}
                className="px-4 py-2 rounded-xl bg-ink text-paper text-xs font-semibold hover:bg-ink-soft transition-colors"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
