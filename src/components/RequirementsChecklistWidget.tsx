'use client';

import React, { useState, useEffect } from 'react';
import { CheckSquare, Square, Plus, Trash2, Sparkles, UserCheck, AlertCircle } from 'lucide-react';

interface RequirementItem {
  id: string;
  tenderId: string;
  label: string;
  isCompleted: boolean;
  completedBy?: string | null;
  completedAt?: string | null;
  notes?: string | null;
  sourceType: 'AI_EXTRACTED' | 'MANUAL';
  createdAt: string;
}

interface RequirementsChecklistWidgetProps {
  tenderId: string;
  onProgressChange?: (progressPct: number, completedCount: number, totalCount: number) => void;
}

export const RequirementsChecklistWidget: React.FC<RequirementsChecklistWidgetProps> = ({
  tenderId,
  onProgressChange
}) => {
  const [items, setItems] = useState<RequirementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRequirements = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/tenders/${tenderId}/requirements`);
      const data = await res.json();
      if (data.success) {
        setItems(data.requirements || []);
        if (onProgressChange && data.stats) {
          onProgressChange(data.stats.progressPct, data.stats.completedCount, data.stats.totalCount);
        }
      } else {
        setError(data.message || 'Ошибка загрузки чек-листа');
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenderId) {
      fetchRequirements();
    }
  }, [tenderId]);

  const toggleItem = async (item: RequirementItem) => {
    const nextCompleted = !item.isCompleted;
    // Optimistic UI update
    const updatedItems = items.map(i => i.id === item.id ? { ...i, isCompleted: nextCompleted } : i);
    setItems(updatedItems);
    
    const completedCount = updatedItems.filter(i => i.isCompleted).length;
    const progressPct = updatedItems.length > 0 ? Math.round((completedCount / updatedItems.length) * 100) : 0;
    if (onProgressChange) {
      onProgressChange(progressPct, completedCount, updatedItems.length);
    }

    try {
      const res = await fetch(`/api/tenders/${tenderId}/requirements/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: nextCompleted })
      });
      const data = await res.json();
      if (!data.success) {
        // Revert on failure
        fetchRequirements();
      }
    } catch {
      fetchRequirements();
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;

    try {
      setAdding(true);
      const res = await fetch(`/api/tenders/${tenderId}/requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim() })
      });
      const data = await res.json();
      if (data.success && data.item) {
        const updated = [...items, data.item];
        setItems(updated);
        setNewLabel('');
        const completedCount = updated.filter(i => i.isCompleted).length;
        const progressPct = Math.round((completedCount / updated.length) * 100);
        if (onProgressChange) onProgressChange(progressPct, completedCount, updated.length);
      } else {
        setError(data.message || 'Ошибка добавления');
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка сети');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/tenders/${tenderId}/requirements/${itemId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        const updated = items.filter(i => i.id !== itemId);
        setItems(updated);
        const completedCount = updated.filter(i => i.isCompleted).length;
        const progressPct = updated.length > 0 ? Math.round((completedCount / updated.length) * 100) : 0;
        if (onProgressChange) onProgressChange(progressPct, completedCount, updated.length);
      } else {
        alert(data.message || 'Не удалось удалить требование');
      }
    } catch (err: any) {
      alert('Ошибка при удалении');
    }
  };

  const completedCount = items.filter(i => i.isCompleted).length;
  const totalCount = items.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="bg-paper border border-hairline rounded-xl p-4 shadow-subtle space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <CheckSquare className="w-5 h-5 text-ink" />
          <h3 className="font-semibold text-sm text-ink">Чек-лист требований лота</h3>
        </div>
        <span className="text-xs font-bold px-2 py-1 bg-surface-alt rounded-lg text-mid-gray">
          {completedCount} / {totalCount} ({progressPct}%)
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-surface-alt rounded-full h-2 overflow-hidden border border-hairline">
        <div 
          className={`h-full transition-all duration-300 ${
            progressPct === 100 ? 'bg-emerald-500' : progressPct > 50 ? 'bg-amber-500' : 'bg-ember'
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {error && (
        <div className="flex items-center space-x-2 p-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Requirements List */}
      {loading ? (
        <div className="py-6 text-center text-xs text-mid-gray animate-pulse">
          Загрузка требований лота...
        </div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center text-xs text-mid-gray">
          Требования не найдены. Вы можете добавить их вручную ниже.
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {items.map(item => (
            <div
              key={item.id}
              className={`flex items-start justify-between p-2.5 rounded-lg border transition-colors ${
                item.isCompleted 
                  ? 'bg-emerald-50/40 border-emerald-200 text-slate-700' 
                  : 'bg-paper border-hairline hover:bg-surface-alt/60'
              }`}
            >
              <div 
                className="flex items-start space-x-2.5 cursor-pointer flex-1 mr-2"
                onClick={() => toggleItem(item)}
              >
                <div className="mt-0.5 flex-shrink-0">
                  {item.isCompleted ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Square className="w-4 h-4 text-mid-gray" />
                  )}
                </div>
                <div className="space-y-0.5">
                  <p className={`text-xs leading-snug ${item.isCompleted ? 'line-through text-mid-gray' : 'text-ink font-medium'}`}>
                    {item.label}
                  </p>
                  <div className="flex items-center space-x-2 text-[10px] text-mid-gray">
                    {item.sourceType === 'AI_EXTRACTED' ? (
                      <span className="flex items-center text-sky-600 font-medium">
                        <Sparkles className="w-3 h-3 mr-0.5" /> AI ТЗ
                      </span>
                    ) : (
                      <span className="text-slate-500 font-medium">Вручную</span>
                    )}
                    {item.completedAt && (
                      <span className="flex items-center text-emerald-700">
                        <UserCheck className="w-3 h-3 mr-0.5" /> Отмечено {new Date(item.completedAt).toLocaleDateString('ru-RU')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {item.sourceType === 'MANUAL' && (
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="text-mid-gray hover:text-red-600 p-1 rounded-md transition-colors"
                  title="Удалить ручной пункт"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Manual Item Form */}
      <form onSubmit={handleAddItem} className="flex items-center space-x-2 pt-2 border-t border-hairline">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Добавить своё требование..."
          className="flex-1 text-xs px-3 py-2 rounded-lg border border-hairline bg-surface-alt focus:outline-none focus:ring-1 focus:ring-ink"
        />
        <button
          type="submit"
          disabled={adding || !newLabel.trim()}
          className="flex items-center space-x-1 px-3 py-2 bg-ink text-paper rounded-lg text-xs font-medium hover:bg-ink-soft disabled:opacity-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Добавить</span>
        </button>
      </form>
    </div>
  );
};
