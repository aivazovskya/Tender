'use client';

import React, { useState, useEffect } from 'react';
import { X, ShieldAlert, Plus, CheckCircle2, AlertTriangle, XCircle, Calendar, Building2, ExternalLink } from 'lucide-react';

interface SecurityInstrument {
  id: string;
  tenderId: string;
  type: 'BID_SECURITY_DEPOSIT' | 'BID_SECURITY_BANK_GUARANTEE' | 'PERFORMANCE_BOND_DEPOSIT' | 'PERFORMANCE_BOND_BANK_GUARANTEE';
  amount: number;
  issuedByBank?: string | null;
  issueDate: string;
  expiryDate: string;
  status: 'ACTIVE' | 'RELEASED' | 'FORFEITED' | 'EXPIRED';
  releasedAt?: string | null;
  tender: {
    id: string;
    title: string;
    externalId: string;
    customerName: string;
    amount: number;
  };
}

interface Summary {
  totalActiveAmount: number;
  activeCount: number;
  expiringCount14Days: number;
  totalForfeitedAmount: number;
  forfeitedCount: number;
}

interface SecurityRegistryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTenderId?: string;
}

export const SecurityRegistryModal: React.FC<SecurityRegistryModalProps> = ({
  isOpen,
  onClose,
  initialTenderId
}) => {
  const [instruments, setInstruments] = useState<SecurityInstrument[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'RELEASED' | 'FORFEITED'>('ALL');
  const [showAddForm, setShowAddForm] = useState(false);

  // Form State
  const [formTenderId, setFormTenderId] = useState(initialTenderId || '');
  const [formType, setFormType] = useState<SecurityInstrument['type']>('BID_SECURITY_BANK_GUARANTEE');
  const [formAmount, setFormAmount] = useState('');
  const [formBank, setFormBank] = useState('');
  const [formIssueDate, setFormIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [formExpiryDate, setFormExpiryDate] = useState('');

  const fetchInstruments = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = statusFilter !== 'ALL' ? `/api/security-instruments?status=${statusFilter}` : '/api/security-instruments';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setInstruments(data.instruments || []);
        setSummary(data.summary || null);
        setError(null);
      } else {
        setInstruments([]);
        setSummary(null);
        setError(data.message || 'Не удалось загрузить реестр обеспечений');
      }
    } catch (err: any) {
      console.error('Failed to load security instruments', err);
      setError(err?.message || 'Ошибка подключения к серверу');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchInstruments();
      if (initialTenderId) setFormTenderId(initialTenderId);
    }
  }, [isOpen, statusFilter, initialTenderId]);

  const handleUpdateStatus = async (id: string, newStatus: SecurityInstrument['status']) => {
    try {
      const res = await fetch(`/api/security-instruments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        fetchInstruments();
      }
    } catch (err) {
      console.error('Failed to update instrument status', err);
    }
  };

  const handleCreateInstrument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTenderId || !formAmount || !formExpiryDate) return;

    try {
      const res = await fetch('/api/security-instruments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderId: formTenderId,
          type: formType,
          amount: parseFloat(formAmount),
          issuedByBank: formBank,
          issueDate: formIssueDate,
          expiryDate: formExpiryDate
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowAddForm(false);
        setFormAmount('');
        setFormBank('');
        fetchInstruments();
      } else {
        alert(data.message || 'Ошибка создания записи');
      }
    } catch (err) {
      alert('Ошибка при сохранении');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-paper border border-hairline rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline bg-surface-alt/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">Реестр обеспечений тендеров</h2>
              <p className="text-xs text-mid-gray">Учёт банковских гарантий и депозитов по заявкам и исполнению контрактов</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-mid-gray hover:text-ink hover:bg-surface-alt transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Dashboard Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 bg-surface-alt/20 border-b border-hairline">
          <div className="p-4 bg-paper border border-hairline rounded-xl shadow-subtle">
            <span className="text-xs text-mid-gray block">Заморожено (ACTIVE)</span>
            <span className="text-lg font-bold text-ink mt-1 block">
              {(summary?.totalActiveAmount || 0).toLocaleString('ru-RU')} ₸
            </span>
            <span className="text-[11px] text-emerald-600 font-medium mt-1 block">
              {summary?.activeCount || 0} активных обеспечений
            </span>
          </div>

          <div className="p-4 bg-paper border border-amber-200 rounded-xl shadow-subtle bg-amber-50/30">
            <span className="text-xs text-amber-800 font-medium block flex items-center">
              <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Истекает в ближайшие 14 дней
            </span>
            <span className="text-lg font-bold text-amber-900 mt-1 block">
              {summary?.expiringCount14Days || 0} лотов
            </span>
            <span className="text-[11px] text-amber-700 mt-1 block">Требуют внимания / возврата</span>
          </div>

          <div className="p-4 bg-paper border border-red-200 rounded-xl shadow-subtle bg-red-50/30">
            <span className="text-xs text-red-800 font-medium block flex items-center">
              <XCircle className="w-3.5 h-3.5 mr-1" /> Удержано (FORFEITED)
            </span>
            <span className="text-lg font-bold text-red-900 mt-1 block">
              {(summary?.totalForfeitedAmount || 0).toLocaleString('ru-RU')} ₸
            </span>
            <span className="text-[11px] text-red-700 mt-1 block">Прямые потери ({summary?.forfeitedCount || 0} случ.)</span>
          </div>
        </div>

        {/* Filter and Actions Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 py-3 border-b border-hairline gap-3">
          <div className="flex items-center space-x-1.5 bg-surface-alt p-1 rounded-xl border border-hairline">
            {(['ALL', 'ACTIVE', 'RELEASED', 'FORFEITED'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === tab 
                    ? 'bg-paper text-ink shadow-subtle border border-hairline' 
                    : 'text-mid-gray hover:text-ink'
                }`}
              >
                {tab === 'ALL' && 'Все'}
                {tab === 'ACTIVE' && 'Заморожены'}
                {tab === 'RELEASED' && 'Возвращены'}
                {tab === 'FORFEITED' && 'Удержаны'}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-ink text-paper rounded-xl text-xs font-semibold hover:bg-ink-soft transition-colors shadow-subtle"
          >
            <Plus className="w-4 h-4" />
            <span>{showAddForm ? 'Отмена' : 'Добавить обеспечение'}</span>
          </button>
        </div>

        {/* Add Instrument Form Drawer */}
        {showAddForm && (
          <form onSubmit={handleCreateInstrument} className="p-6 bg-surface-alt/40 border-b border-hairline space-y-4">
            <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Новое обеспечение</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-medium text-mid-gray block mb-1">ID Тендера</label>
                <input
                  type="text"
                  required
                  placeholder="ID тендера из базы"
                  value={formTenderId}
                  onChange={(e) => setFormTenderId(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-hairline rounded-lg bg-paper focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-mid-gray block mb-1">Тип обеспечения</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as any)}
                  className="w-full text-xs px-3 py-2 border border-hairline rounded-lg bg-paper focus:outline-none"
                >
                  <option value="BID_SECURITY_BANK_GUARANTEE">БГ Обеспечения заявки</option>
                  <option value="BID_SECURITY_DEPOSIT">Депозит обеспечения заявки</option>
                  <option value="PERFORMANCE_BOND_BANK_GUARANTEE">БГ Исполнения контракта</option>
                  <option value="PERFORMANCE_BOND_DEPOSIT">Депозит исполнения контракта</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-mid-gray block mb-1">Сумма (KZT)</label>
                <input
                  type="number"
                  required
                  placeholder="500000"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-hairline rounded-lg bg-paper focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-mid-gray block mb-1">Банк-эмитент / Орган</label>
                <input
                  type="text"
                  placeholder="Halyk Bank / Forte"
                  value={formBank}
                  onChange={(e) => setFormBank(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-hairline rounded-lg bg-paper focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-mid-gray block mb-1">Дата выдачи</label>
                <input
                  type="date"
                  required
                  value={formIssueDate}
                  onChange={(e) => setFormIssueDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-hairline rounded-lg bg-paper focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-mid-gray block mb-1">Срок действия (До)</label>
                <input
                  type="date"
                  required
                  value={formExpiryDate}
                  onChange={(e) => setFormExpiryDate(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-hairline rounded-lg bg-paper focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="submit"
                className="px-4 py-2 bg-ink text-paper rounded-lg text-xs font-semibold hover:bg-ink-soft transition-colors"
              >
                Сохранить в реестре
              </button>
            </div>
          </form>
        )}

        {/* Instruments Table */}
        <div className="p-6 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-xs text-mid-gray animate-pulse">Загрузка обеспечений...</div>
          ) : instruments.length === 0 ? (
            <div className="py-12 text-center text-xs text-mid-gray">Записи обеспечений не найдены</div>
          ) : (
            <div className="space-y-3">
              {instruments.map(inst => (
                <div
                  key={inst.id}
                  className="p-4 bg-paper border border-hairline rounded-xl shadow-subtle space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-hairline pb-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-mid-gray block">
                        Лот №{inst.tender.externalId}
                      </span>
                      <h4 className="text-xs font-bold text-ink line-clamp-1 mt-0.5">{inst.tender.title}</h4>
                      <p className="text-[11px] text-mid-gray flex items-center mt-0.5">
                        <Building2 className="w-3 h-3 mr-1 text-slate-400" /> {inst.tender.customerName}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        inst.status === 'ACTIVE' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                        inst.status === 'RELEASED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                        'bg-red-100 text-red-800 border border-red-300'
                      }`}>
                        {inst.status === 'ACTIVE' && 'Заморожено'}
                        {inst.status === 'RELEASED' && 'Возвращено'}
                        {inst.status === 'FORFEITED' && 'Удержано'}
                        {inst.status === 'EXPIRED' && 'Истекло'}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-mid-gray block">Тип</span>
                      <span className="font-semibold text-slate-800 text-[11px]">
                        {inst.type.includes('BID_SECURITY') ? 'Обеспечение заявки' : 'Исполнение контракта'}
                        <br />
                        <span className="text-[10px] text-mid-gray font-normal">
                          ({inst.type.includes('BANK_GUARANTEE') ? 'Банк. гарантия' : 'Депозит'})
                        </span>
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-mid-gray block">Сумма обеспечения</span>
                      <span className="font-bold text-ink">
                        {inst.amount.toLocaleString('ru-RU')} ₸
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-mid-gray block">Банк / Эмитент</span>
                      <span className="font-medium text-slate-700">
                        {inst.issuedByBank || '—'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-mid-gray block flex items-center">
                        <Calendar className="w-3 h-3 mr-1 text-slate-400" /> Истекает
                      </span>
                      <span className="font-semibold text-slate-800">
                        {new Date(inst.expiryDate).toLocaleDateString('ru-RU')}
                      </span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  {inst.status === 'ACTIVE' && (
                    <div className="flex items-center justify-end space-x-2 pt-2 border-t border-hairline">
                      <button
                        onClick={() => handleUpdateStatus(inst.id, 'RELEASED')}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Отметить как Возвращено</span>
                      </button>

                      <button
                        onClick={() => handleUpdateStatus(inst.id, 'FORFEITED')}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Удержано заказчиком</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
