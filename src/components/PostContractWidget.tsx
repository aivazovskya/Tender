'use client';

import React, { useState, useEffect } from 'react';
import { Truck, CheckCircle2, Clock, AlertTriangle, Calendar, Plus, ShieldCheck, DollarSign } from 'lucide-react';

interface Milestone {
  id: string;
  label: string;
  dueDate: string;
  completedAt?: string | null;
  status: 'PENDING' | 'DONE' | 'OVERDUE';
}

interface ContractExecutionData {
  id: string;
  tenderId: string;
  contractSignedAt?: string | null;
  deliveryDeadline: string;
  actualDeliveryDate?: string | null;
  status: 'IN_PROGRESS' | 'DELIVERED_ON_TIME' | 'DELIVERED_LATE' | 'PENALIZED' | 'TERMINATED';
  milestones: Milestone[];
  tender: {
    amount: number;
    title: string;
    externalId: string;
    riskScore: number;
  };
}

interface PostContractWidgetProps {
  tenderId: string;
  tenderAmount: number;
}

export const PostContractWidget: React.FC<PostContractWidgetProps> = ({
  tenderId,
  tenderAmount
}) => {
  const [execution, setExecution] = useState<ContractExecutionData | null>(null);
  const [metrics, setMetrics] = useState<{ delayDays: number; actualPenaltyAmount: number; isOverdue: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Form fields
  const [deliveryDeadline, setDeliveryDeadline] = useState('');
  const [contractSignedAt, setContractSignedAt] = useState(new Date().toISOString().split('T')[0]);
  const [actualDeliveryDate, setActualDeliveryDate] = useState('');
  const [newMilestoneLabel, setNewMilestoneLabel] = useState('');
  const [newMilestoneDate, setNewMilestoneDate] = useState('');

  const fetchExecution = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tenders/${tenderId}/contract-execution`);
      const data = await res.json();
      if (data.success && data.execution) {
        setExecution(data.execution);
        setMetrics(data.metrics || null);
        if (data.execution.deliveryDeadline) {
          setDeliveryDeadline(new Date(data.execution.deliveryDeadline).toISOString().split('T')[0]);
        }
        if (data.execution.actualDeliveryDate) {
          setActualDeliveryDate(new Date(data.execution.actualDeliveryDate).toISOString().split('T')[0]);
        }
      } else {
        setExecution(null);
      }
    } catch (err) {
      console.error('Failed to load contract execution data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenderId) {
      fetchExecution();
    }
  }, [tenderId]);

  const handleCreateExecution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryDeadline) return;

    try {
      const res = await fetch(`/api/tenders/${tenderId}/contract-execution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractSignedAt,
          deliveryDeadline
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateForm(false);
        fetchExecution();
      } else {
        alert(data.message || 'Ошибка создания карточки исполнения');
      }
    } catch (err) {
      alert('Ошибка сети');
    }
  };

  const handleUpdateDelivery = async () => {
    if (!execution) return;

    try {
      const res = await fetch(`/api/tenders/${tenderId}/contract-execution`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualDeliveryDate: actualDeliveryDate || null,
          deliveryDeadline
        })
      });
      const data = await res.json();
      if (data.success) {
        fetchExecution();
      }
    } catch (err) {
      alert('Ошибка обновления');
    }
  };

  const handleToggleMilestone = async (milestone: Milestone) => {
    const isCompleted = milestone.status !== 'DONE';
    try {
      const res = await fetch(`/api/tenders/${tenderId}/contract-execution/milestones/${milestone.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted })
      });
      const data = await res.json();
      if (data.success) {
        fetchExecution();
      }
    } catch (err) {
      console.error('Failed to toggle milestone', err);
    }
  };

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMilestoneLabel || !newMilestoneDate) return;

    try {
      const res = await fetch(`/api/tenders/${tenderId}/contract-execution/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newMilestoneLabel,
          dueDate: newMilestoneDate
        })
      });
      const data = await res.json();
      if (data.success) {
        setNewMilestoneLabel('');
        setNewMilestoneDate('');
        fetchExecution();
      }
    } catch (err) {
      alert('Ошибка добавления этапа');
    }
  };

  if (loading) {
    return <div className="py-6 text-center text-xs text-mid-gray animate-pulse">Загрузка данных по контракту...</div>;
  }

  if (!execution) {
    return (
      <div className="p-4 bg-paper border border-hairline rounded-xl shadow-subtle space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Truck className="w-5 h-5 text-ink" />
            <h3 className="font-semibold text-sm text-ink">Пост-контрактное сопровождение</h3>
          </div>
        </div>

        {!showCreateForm ? (
          <div className="py-4 text-center space-y-3">
            <p className="text-xs text-mid-gray">Контракт по выигранному лоту ещё не взят на отслеживание.</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-ink text-paper rounded-xl text-xs font-semibold hover:bg-ink-soft transition-colors"
            >
              Начать сопровождение контракта
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreateExecution} className="space-y-3 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-mid-gray block mb-1">Дата подписания контракта</label>
                <input
                  type="date"
                  value={contractSignedAt}
                  onChange={(e) => setContractSignedAt(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-hairline rounded-lg bg-surface-alt focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-mid-gray block mb-1">Крайний срок поставки (по ТЗ)</label>
                <input
                  type="date"
                  required
                  value={deliveryDeadline}
                  onChange={(e) => setDeliveryDeadline(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-hairline rounded-lg bg-surface-alt focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-3 py-1.5 text-xs text-mid-gray hover:text-ink"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-ink text-paper rounded-lg text-xs font-semibold hover:bg-ink-soft transition-colors"
              >
                Создать график
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 bg-paper border border-hairline rounded-xl shadow-subtle space-y-4">
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <div className="flex items-center space-x-2">
          <Truck className="w-5 h-5 text-ink" />
          <div>
            <h3 className="font-semibold text-sm text-ink">Исполнение контракта</h3>
            <span className="text-[11px] text-mid-gray">
              Срок поставки: {new Date(execution.deliveryDeadline).toLocaleDateString('ru-RU')}
            </span>
          </div>
        </div>

        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
          execution.status === 'DELIVERED_ON_TIME' ? 'bg-emerald-100 text-emerald-800' :
          execution.status === 'DELIVERED_LATE' ? 'bg-amber-100 text-amber-800' :
          execution.status === 'PENALIZED' ? 'bg-red-100 text-red-800' : 'bg-sky-100 text-sky-800'
        }`}>
          {execution.status === 'IN_PROGRESS' && 'В процессе поставки'}
          {execution.status === 'DELIVERED_ON_TIME' && 'Сдано вовремя'}
          {execution.status === 'DELIVERED_LATE' && 'Сдано с просрочкой'}
          {execution.status === 'PENALIZED' && 'Применён штраф'}
        </span>
      </div>

      {/* Delay and Penalty Comparison Widget */}
      {metrics && metrics.delayDays > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-amber-900 text-xs">
          <div className="flex items-center justify-between font-bold">
            <span className="flex items-center">
              <AlertTriangle className="w-4 h-4 text-amber-600 mr-1.5" /> Просрочка поставки: {metrics.delayDays} дн.
            </span>
            <span>Штраф: {metrics.actualPenaltyAmount.toLocaleString('ru-RU')} ₸</span>
          </div>
          <p className="text-[11px] text-amber-800">
            Расчёт по формуле пеня 0.1%/день от суммы контракта ({(tenderAmount || 0).toLocaleString('ru-RU')} ₸).
          </p>
        </div>
      )}

      {/* Update Actual Delivery Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-surface-alt/30 border border-hairline rounded-xl">
        <div>
          <label className="text-[10px] font-bold text-mid-gray uppercase block mb-1">Фактическая дата поставки / акта</label>
          <div className="flex items-center space-x-2">
            <input
              type="date"
              value={actualDeliveryDate}
              onChange={(e) => setActualDeliveryDate(e.target.value)}
              className="text-xs px-2.5 py-1.5 border border-hairline rounded-lg bg-paper focus:outline-none flex-1"
            />
            <button
              onClick={handleUpdateDelivery}
              className="px-3 py-1.5 bg-ink text-paper text-xs font-medium rounded-lg hover:bg-ink-soft"
            >
              Сохранить
            </button>
          </div>
        </div>

        <div className="flex flex-col justify-center text-xs">
          <span className="text-[10px] text-mid-gray block">Прогнозный риск-скоринг AI:</span>
          <span className="font-bold text-ink">Score {execution.tender.riskScore}/100</span>
        </div>
      </div>

      {/* Milestones List */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-ink uppercase tracking-wider">Ключевые этапы (Milestones)</h4>

        {execution.milestones.length === 0 ? (
          <p className="text-xs text-mid-gray italic">Этапы поставки не заданы.</p>
        ) : (
          <div className="space-y-1.5">
            {execution.milestones.map(m => (
              <div
                key={m.id}
                onClick={() => handleToggleMilestone(m)}
                className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  m.status === 'DONE' ? 'bg-emerald-50/40 border-emerald-200' :
                  m.status === 'OVERDUE' ? 'bg-red-50/40 border-red-200' : 'bg-paper border-hairline'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className={`w-4 h-4 ${m.status === 'DONE' ? 'text-emerald-600' : 'text-mid-gray'}`} />
                  <span className={`text-xs ${m.status === 'DONE' ? 'line-through text-mid-gray' : 'text-ink font-medium'}`}>
                    {m.label}
                  </span>
                </div>

                <div className="flex items-center space-x-2 text-[10px]">
                  <span className={`font-semibold ${m.status === 'OVERDUE' ? 'text-red-700' : 'text-mid-gray'}`}>
                    Срок: {new Date(m.dueDate).toLocaleDateString('ru-RU')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Milestone Form */}
        <form onSubmit={handleAddMilestone} className="flex items-center space-x-2 pt-2">
          <input
            type="text"
            placeholder="Новый этап (напр. Поставка 1-й партии)"
            value={newMilestoneLabel}
            onChange={(e) => setNewMilestoneLabel(e.target.value)}
            className="flex-1 text-xs px-2.5 py-1.5 border border-hairline rounded-lg bg-surface-alt focus:outline-none"
          />
          <input
            type="date"
            value={newMilestoneDate}
            onChange={(e) => setNewMilestoneDate(e.target.value)}
            className="text-xs px-2 py-1.5 border border-hairline rounded-lg bg-surface-alt focus:outline-none"
          />
          <button
            type="submit"
            disabled={!newMilestoneLabel || !newMilestoneDate}
            className="px-3 py-1.5 bg-ink text-paper rounded-lg text-xs font-semibold hover:bg-ink-soft disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
