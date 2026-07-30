'use client';

import React from 'react';
import { KanbanItem, KanbanStage } from '../lib/types/tender';
import { getShortSourceBadge, DataSourceMeta } from '../lib/utils/sourceLabel';
import { 
  Trash2, 
  CheckCircle, 
  Clock, 
  Send, 
  Trophy, 
  XCircle,
  UserCheck
} from 'lucide-react';

interface KanbanBoardProps {
  items: KanbanItem[];
  onUpdateStage: (itemId: string, newStage: KanbanStage) => void;
  onRemoveItem: (itemId: string) => void;
  onOpenTenderDetails: (tender: any) => void;
  dataSources?: DataSourceMeta[];
}

const STAGES: Array<{ id: KanbanStage; title: string; color: string; icon: any }> = [
  { id: 'UNDER_REVIEW', title: 'На рассмотрении', color: 'bg-paper text-ink border-hairline', icon: Clock },
  { id: 'PREPARING_BID', title: 'Готовим заявку', color: 'bg-paper text-ink border-hairline', icon: Send },
  { id: 'SUBMITTED', title: 'Подано в портал', color: 'bg-paper text-ink border-hairline', icon: CheckCircle },
  { id: 'WON', title: 'Выиграли 🏆', color: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: Trophy },
  { id: 'LOST', title: 'Проиграли', color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
];

const TEAM_MEMBERS = [
  'Не назначен',
  'Серик А. (Главный тендерщик)',
  'Гульнара К. (Юрист)',
  'Дмитрий В. (Снабжение)',
  'Айдар Т. (Аналитик)'
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  items,
  onUpdateStage,
  onRemoveItem,
  onOpenTenderDetails,
  dataSources
}) => {
  const totalPipelineAmount = items.reduce((acc, item) => acc + item.tender.amount, 0);
  const wonAmount = items.filter(i => i.stage === 'WON').reduce((acc, item) => acc + item.tender.amount, 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Header Pipeline Summary Banner */}
      <div className="bg-paper border border-hairline rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-subtle">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center space-x-2 tracking-tight">
            <span>Командная воронка тендеров</span>
          </h2>
          <p className="text-xs text-mid-gray mt-1">
            Отслеживание этапов подготовки заявок, назначения ответственных и учет результатов в KZT.
          </p>
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-right">
            <span className="text-xs text-mid-gray block">Вся воронка ({items.length} лотов):</span>
            <span className="text-base font-bold text-ink font-mono tracking-tight">
              {totalPipelineAmount.toLocaleString('ru-RU')} ₸
            </span>
          </div>

          <div className="text-right border-l border-hairline pl-6">
            <span className="text-xs text-mid-gray block">Выиграно в портфеле:</span>
            <span className="text-base font-bold text-emerald-700 font-mono tracking-tight">
              {wonAmount.toLocaleString('ru-RU')} ₸
            </span>
          </div>
        </div>
      </div>

      {/* Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {STAGES.map((stage) => {
          const stageItems = items.filter(item => item.stage === stage.id);
          const StageIcon = stage.icon;
          const stageTotal = stageItems.reduce((acc, i) => acc + i.tender.amount, 0);

          return (
            <div key={stage.id} className="flex flex-col rounded-2xl bg-surface-alt border border-hairline p-3 min-h-[500px]">
              
              {/* Column Header */}
              <div className={`p-2.5 rounded-xl border mb-2.5 flex items-center justify-between shadow-subtle ${stage.color}`}>
                <div className="flex items-center space-x-1.5">
                  <StageIcon className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">{stage.title}</span>
                </div>
                <span className="px-2 py-0.2 text-[10px] font-bold rounded-full bg-surface-alt border border-hairline text-ink">
                  {stageItems.length}
                </span>
              </div>

              <p className="text-[11px] font-mono text-mid-gray mb-3 px-1">
                {stageTotal > 0 ? `${stageTotal.toLocaleString('ru-RU')} ₸` : '0 ₸'}
              </p>

              {/* Items List */}
              <div className="space-y-3 flex-1 overflow-y-auto">
                {stageItems.map((item) => (
                  <div 
                    key={item.id}
                    className="p-3.5 rounded-xl bg-paper border border-hairline hover:border-mid-gray/40 shadow-subtle transition-all space-y-2.5 relative group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] text-mid-gray font-mono">
                        {getShortSourceBadge(item.tender.source, dataSources)} #{item.tender.externalId}
                      </span>
                      <button
                        onClick={() => onRemoveItem(item.id)}
                        className="text-mid-gray hover:text-ember transition-colors p-1"
                        title="Удалить из воронки"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <h4 
                      onClick={() => onOpenTenderDetails(item.tender)}
                      className="text-xs font-semibold text-ink hover:text-ember cursor-pointer transition-colors line-clamp-2 leading-snug"
                    >
                      {item.tender.title}
                    </h4>

                    <div className="text-xs font-bold text-ink font-mono">
                      {item.tender.amount.toLocaleString('ru-RU')} ₸
                    </div>

                    {/* Interactive Team Member Assignee Selector */}
                    <div className="pt-2 border-t border-hairline space-y-1.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-mid-gray flex items-center space-x-1">
                          <UserCheck className="w-3 h-3 text-ink" />
                          <span>Ответственный:</span>
                        </span>

                        <select
                          value={item.assignee || 'Не назначен'}
                          onChange={(e) => {
                            item.assignee = e.target.value;
                          }}
                          className="bg-surface-alt text-ink border border-hairline rounded px-1.5 py-0.5 text-[10px] focus:outline-none max-w-[120px] truncate"
                        >
                          {TEAM_MEMBERS.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>

                      {/* Stage Switcher */}
                      <div className="flex items-center justify-between text-[10px] pt-1">
                        <span className="text-mid-gray">Этап:</span>
                        <select
                          value={item.stage}
                          onChange={(e) => onUpdateStage(item.id, e.target.value as KanbanStage)}
                          className="bg-surface-alt text-ink border border-hairline rounded px-1.5 py-0.5 text-[10px] focus:outline-none"
                        >
                          {STAGES.map(s => (
                            <option key={s.id} value={s.id}>{s.title}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                  </div>
                ))}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};

