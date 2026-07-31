'use client';

import React, { useState, useEffect } from 'react';
import { KanbanItem, KanbanStage } from '../lib/types/tender';
import { getShortSourceBadge, DataSourceMeta } from '../lib/utils/sourceLabel';
import { 
  Trash2, 
  CheckCircle, 
  Clock, 
  Send, 
  Trophy, 
  XCircle,
  UserCheck,
  Flag,
  FileText,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

import { useTranslation } from '../lib/i18n/useTranslation';

export type PriorityType = 'LOW' | 'MEDIUM' | 'HIGH';

interface KanbanBoardProps {
  items: KanbanItem[];
  onUpdateStage?: (itemId: string, newStage: KanbanStage) => void;
  onUpdateCard?: (itemId: string, changes: Partial<{ priority: PriorityType; notes: string; assignee: string; stage: KanbanStage }>) => void;
  onRemoveItem: (itemId: string) => void;
  onOpenTenderDetails: (tender: any) => void;
  dataSources?: DataSourceMeta[];
  language?: 'RU' | 'KK';
}

const STAGES: Array<{ id: KanbanStage; color: string; icon: any }> = [
  { id: 'UNDER_REVIEW', color: 'bg-paper text-ink border-hairline', icon: Clock },
  { id: 'PREPARING_BID', color: 'bg-paper text-ink border-hairline', icon: Send },
  { id: 'SUBMITTED', color: 'bg-paper text-ink border-hairline', icon: CheckCircle },
  { id: 'WON', color: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: Trophy },
  { id: 'LOST', color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
];

const DEFAULT_STAGE_SLA_HOURS: Record<KanbanStage, number> = {
  UNDER_REVIEW: 24,
  PREPARING_BID: 72,
  SUBMITTED: 0,
  WON: 0,
  LOST: 0
};

const TEAM_MEMBERS = [
  'Не назначен',
  'Серик А. (Главный тендерщик)',
  'Гульнара К. (Юрист)',
  'Дмитрий В. (Снабжение)',
  'Айдар Т. (Аналитик)'
];

const PRIORITY_STYLES: Record<PriorityType, { bg: string; text: string; border: string }> = {
  HIGH: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' },
  MEDIUM: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' },
  LOW: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
};

const PRIORITY_ORDER: Record<PriorityType, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

interface KanbanCardItemProps {
  item: KanbanItem;
  dataSources?: DataSourceMeta[];
  language: 'RU' | 'KK';
  onUpdateCard: (itemId: string, changes: Partial<{ priority: PriorityType; notes: string; assignee: string; stage: KanbanStage }>) => void;
  onRemoveItem: (itemId: string) => void;
  onOpenTenderDetails: (tender: any) => void;
}

const KanbanCardItem: React.FC<KanbanCardItemProps> = ({
  item,
  dataSources,
  language,
  onUpdateCard,
  onRemoveItem,
  onOpenTenderDetails
}) => {
  const t = useTranslation(language);
  const [isNotesExpanded, setIsNotesExpanded] = useState(Boolean(item.notes && item.notes.trim().length > 0));
  const [localNotes, setLocalNotes] = useState(item.notes || '');

  useEffect(() => {
    setLocalNotes(item.notes || '');
  }, [item.notes]);

  const slaLimitHours = item.stageSlaHours ?? DEFAULT_STAGE_SLA_HOURS[item.stage] ?? 0;
  const enteredAtMs = item.stageEnteredAt ? new Date(item.stageEnteredAt).getTime() : new Date(item.updatedAt).getTime();
  const hoursOnStage = Math.floor((Date.now() - enteredAtMs) / (1000 * 60 * 60));
  const isSlaOverdue = slaLimitHours > 0 && hoursOnStage > slaLimitHours;
  const overdueHours = hoursOnStage - slaLimitHours;

  const deadlineMs = new Date(item.tender.deadlineDate).getTime();
  const hoursToDeadline = (deadlineMs - Date.now()) / (1000 * 60 * 60);
  const isUrgentDeadline = hoursToDeadline > 0 && hoursToDeadline < 24 && !['SUBMITTED', 'WON', 'LOST'].includes(item.stage);

  const currentPriority: PriorityType = (item.priority as PriorityType) || 'MEDIUM';
  const priorityStyle = PRIORITY_STYLES[currentPriority];

  const handleNotesBlur = () => {
    if (localNotes !== (item.notes || '')) {
      onUpdateCard(item.id, { notes: localNotes });
    }
  };

  return (
    <div 
      className={`p-3.5 rounded-xl bg-paper border ${isSlaOverdue ? 'border-red-400 bg-red-50/20' : isUrgentDeadline ? 'border-amber-400 bg-amber-50/20' : 'border-hairline'} hover:border-mid-gray/40 shadow-subtle transition-all space-y-2.5 relative group`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
          <span className="text-[10px] text-mid-gray font-mono">
            {getShortSourceBadge(item.tender.source, dataSources)} #{item.tender.externalId}
          </span>
          <span className={`px-1.5 py-0.2 text-[9px] font-bold rounded border ${priorityStyle.bg} ${priorityStyle.text} ${priorityStyle.border}`}>
            {t.kanban.priority[currentPriority]}
          </span>
        </div>
        <button
          onClick={() => onRemoveItem(item.id)}
          className="text-mid-gray hover:text-ember transition-colors p-1 shrink-0"
          title={t.kanban.deleteTitle}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* SLA / Deadline Badges */}
      {(isSlaOverdue || isUrgentDeadline) && (
        <div className="flex flex-wrap gap-1">
          {isSlaOverdue && (
            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-[9px] font-bold flex items-center space-x-1">
              <span>{t.kanban.slaOverdue.replace('{hours}', String(overdueHours))}</span>
            </span>
          )}
          {isUrgentDeadline && (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[9px] font-bold flex items-center space-x-1 animate-pulse">
              <span>{t.kanban.urgentDeadline.replace('{hours}', String(Math.ceil(hoursToDeadline)))}</span>
            </span>
          )}
        </div>
      )}

      <h4 
        onClick={() => onOpenTenderDetails(item.tender)}
        className="text-xs font-semibold text-ink hover:text-ember cursor-pointer transition-colors line-clamp-2 leading-snug"
      >
        {item.tender.title}
      </h4>

      <div className="text-xs font-bold text-ink font-mono">
        {item.tender.amount.toLocaleString('ru-RU')} ₸
      </div>

      {/* Interactive Controls Area */}
      <div className="pt-2 border-t border-hairline space-y-2">
        {/* Priority Selector */}
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-mid-gray flex items-center space-x-1">
            <Flag className="w-3 h-3 text-ink" />
            <span>{t.kanban.priorityLabel}</span>
          </span>

          <select
            value={currentPriority}
            onChange={(e) => onUpdateCard(item.id, { priority: e.target.value as PriorityType })}
            className={`border rounded px-1.5 py-0.5 text-[10px] font-bold focus:outline-none ${priorityStyle.bg} ${priorityStyle.text} ${priorityStyle.border}`}
          >
            <option value="HIGH">{t.kanban.priority.HIGH}</option>
            <option value="MEDIUM">{t.kanban.priority.MEDIUM}</option>
            <option value="LOW">{t.kanban.priority.LOW}</option>
          </select>
        </div>

        {/* Team Member Assignee Selector */}
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-mid-gray flex items-center space-x-1">
            <UserCheck className="w-3 h-3 text-ink" />
            <span>{t.kanban.assigneeLabel}</span>
          </span>

          <select
            value={item.assignee || t.kanban.unassigned}
            onChange={(e) => onUpdateCard(item.id, { assignee: e.target.value })}
            className="bg-surface-alt text-ink border border-hairline rounded px-1.5 py-0.5 text-[10px] focus:outline-none max-w-[120px] truncate"
          >
            {TEAM_MEMBERS.map(m => (
              <option key={m} value={m}>{m === 'Не назначен' ? t.kanban.unassigned : m}</option>
            ))}
          </select>
        </div>

        {/* Stage Switcher */}
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-mid-gray">{t.kanban.stageLabel}</span>
          <select
            value={item.stage}
            onChange={(e) => onUpdateCard(item.id, { stage: e.target.value as KanbanStage })}
            className="bg-surface-alt text-ink border border-hairline rounded px-1.5 py-0.5 text-[10px] focus:outline-none"
          >
            {STAGES.map(s => (
              <option key={s.id} value={s.id}>{t.kanban.stages[s.id] || s.id}</option>
            ))}
          </select>
        </div>

        {/* Collapsible Notes Section */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setIsNotesExpanded(!isNotesExpanded)}
            className="flex items-center justify-between w-full text-[10px] text-mid-gray hover:text-ink transition-colors py-0.5 font-medium"
          >
            <span className="flex items-center space-x-1">
              <FileText className="w-3 h-3 text-mid-gray" />
              <span>{t.kanban.notesLabel}</span>
              {item.notes && item.notes.trim().length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-ember inline-block" title="Есть заметка" />
              )}
            </span>
            {isNotesExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {isNotesExpanded && (
            <div className="mt-1.5">
              <textarea
                value={localNotes}
                onChange={(e) => setLocalNotes(e.target.value)}
                onBlur={handleNotesBlur}
                placeholder={t.kanban.notesPlaceholder}
                rows={2}
                className="w-full text-[10px] p-2 bg-surface-alt border border-hairline rounded-lg text-ink placeholder-mid-gray focus:outline-none focus:border-ink resize-y transition-all"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  items,
  onUpdateStage,
  onUpdateCard,
  onRemoveItem,
  onOpenTenderDetails,
  dataSources,
  language = 'RU'
}) => {
  const t = useTranslation(language);
  const totalPipelineAmount = items.reduce((acc, item) => acc + item.tender.amount, 0);
  const wonAmount = items.filter(i => i.stage === 'WON').reduce((acc, item) => acc + item.tender.amount, 0);

  const handleUpdate = (itemId: string, changes: Partial<{ priority: PriorityType; notes: string; assignee: string; stage: KanbanStage }>) => {
    if (onUpdateCard) {
      onUpdateCard(itemId, changes);
    } else if (changes.stage && onUpdateStage) {
      onUpdateStage(itemId, changes.stage);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Header Pipeline Summary Banner */}
      <div className="bg-paper border border-hairline rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-subtle">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center space-x-2 tracking-tight">
            <span>{t.kanban.title}</span>
          </h2>
          <p className="text-xs text-mid-gray mt-1">
            {t.kanban.subtitle}
          </p>
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-right">
            <span className="text-xs text-mid-gray block">{t.kanban.totalPipeline.replace('{count}', String(items.length))}</span>
            <span className="text-base font-bold text-ink font-mono tracking-tight">
              {totalPipelineAmount.toLocaleString('ru-RU')} ₸
            </span>
          </div>

          <div className="text-right border-l border-hairline pl-6">
            <span className="text-xs text-mid-gray block">{t.kanban.wonPortfolio}</span>
            <span className="text-base font-bold text-emerald-700 font-mono tracking-tight">
              {wonAmount.toLocaleString('ru-RU')} ₸
            </span>
          </div>
        </div>
      </div>

      {/* Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {STAGES.map((stage) => {
          const stageItems = items
            .filter(item => item.stage === stage.id)
            .sort((a, b) => {
              const pA = PRIORITY_ORDER[(a.priority as PriorityType) || 'MEDIUM'];
              const pB = PRIORITY_ORDER[(b.priority as PriorityType) || 'MEDIUM'];
              if (pB !== pA) return pB - pA;
              return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            });

          const StageIcon = stage.icon;
          const stageTotal = stageItems.reduce((acc, i) => acc + i.tender.amount, 0);
          const stageTitle = t.kanban.stages[stage.id] || stage.id;

          return (
            <div key={stage.id} className="flex flex-col rounded-2xl bg-surface-alt border border-hairline p-3 min-h-[500px]">
              
              {/* Column Header */}
              <div className={`p-2.5 rounded-xl border mb-2.5 flex items-center justify-between shadow-subtle ${stage.color}`}>
                <div className="flex items-center space-x-1.5">
                  <StageIcon className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">{stageTitle}</span>
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
                  <KanbanCardItem
                    key={item.id}
                    item={item}
                    dataSources={dataSources}
                    language={language}
                    onUpdateCard={handleUpdate}
                    onRemoveItem={onRemoveItem}
                    onOpenTenderDetails={onOpenTenderDetails}
                  />
                ))}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};
