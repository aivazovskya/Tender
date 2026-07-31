'use client';

import React, { useState } from 'react';
import { X, Cpu, CheckCircle2, AlertCircle } from 'lucide-react';

interface ApiSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  registeredApiSources: string[];
}

export const ApiSourceModal: React.FC<ApiSourceModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  registeredApiSources
}) => {
  const [selectedAdapter, setSelectedAdapter] = useState<string>(registeredApiSources[0] || 'GOSZAKUP');
  const [displayName, setDisplayName] = useState<string>('');
  const [checkIntervalMins, setCheckIntervalMins] = useState<number>(15);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const finalDisplayName = displayName.trim() || `${selectedAdapter} API`;

    try {
      const res = await fetch('/api/admin/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedAdapter,
          displayName: finalDisplayName,
          adapterType: 'API',
          checkIntervalMins: Number(checkIntervalMins) || 15
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Ошибка сохранения API-источника');
      }

      setSuccessMsg(`API-источник "${finalDisplayName}" успешно зарегистрирован!`);
      setTimeout(() => {
        onSaved();
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Сбой записи в БД');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-paper border border-hairline rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-elevated relative">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-4">
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-ink" />
            <h3 className="text-base font-bold text-ink tracking-tight">Подключение API-источника</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl hover:bg-surface-alt text-mid-gray hover:text-ink transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center space-x-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Registered API Adapter Selector */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Зарегистрированный API-адаптер в коде (listRegisteredApiSources):
            </label>
            <select
              value={selectedAdapter}
              onChange={(e) => {
                setSelectedAdapter(e.target.value);
                if (!displayName) {
                  setDisplayName(e.target.value === 'GOSZAKUP' ? 'goszakup.gov.kz (ЕГСЗ РК)' : e.target.value === 'SAMRUK_KAZYNA' ? 'portal.sk.kz (Самрук-Казына)' : `${e.target.value} API`);
                }
              }}
              className="w-full bg-surface-alt border border-hairline rounded-xl px-3 py-2 text-xs text-ink font-mono font-bold focus:outline-none focus:border-ink transition-all"
            >
              {registeredApiSources.map(adapterKey => (
                <option key={adapterKey} value={adapterKey}>{adapterKey}</option>
              ))}
            </select>
            <p className="text-[10px] text-mid-gray mt-1">
              * Выбор ограничен классами адаптеров, зарегистрированными в <code className="font-mono">adapter-registry.ts</code>.
            </p>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Отображаемое наименование источника:
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Например: goszakup.gov.kz (ЕГСЗ РК)"
              className="w-full bg-surface-alt border border-hairline rounded-xl px-3 py-2 text-xs text-ink placeholder-mid-gray focus:outline-none focus:border-ink transition-all"
            />
          </div>

          {/* Sync Interval */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Интервал синка (минуты):
            </label>
            <input
              type="number"
              min={1}
              max={1440}
              value={checkIntervalMins}
              onChange={(e) => setCheckIntervalMins(Number(e.target.value))}
              className="w-full bg-surface-alt border border-hairline rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-ink transition-all font-mono"
            />
          </div>

          {/* Footer actions */}
          <div className="pt-3 border-t border-hairline flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-surface-alt hover:bg-paper border border-hairline text-xs font-semibold text-ink transition-all"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-ink hover:bg-ink-soft text-paper text-xs font-semibold shadow-subtle transition-all disabled:opacity-50"
            >
              {saving ? 'Сохранение...' : 'Зарегистрировать API-источник'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
