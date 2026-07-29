'use client';

import React, { useState } from 'react';
import { Tender } from '../lib/types/tender';
import { getSourceLabel, DataSourceMeta } from '../lib/utils/sourceLabel';
import { 
  Building2, 
  MapPin, 
  Calendar, 
  ShieldAlert, 
  Sparkles, 
  ChevronDown,
  ChevronUp,
  PlusCircle,
  Check,
  Send
} from 'lucide-react';

interface TenderCardProps {
  tender: Tender;
  onOpenDetails: (tender: Tender) => void;
  onAddToKanban: (tender: Tender) => void;
  onSendToTelegram: (tender: Tender) => void;
  isInKanban: boolean;
  language: 'RU' | 'KK';
  dataSources?: DataSourceMeta[];
}

export const TenderCard: React.FC<TenderCardProps> = ({
  tender,
  onOpenDetails,
  onAddToKanban,
  onSendToTelegram,
  isInKanban,
  language,
  dataSources
}) => {
  const [showSummary, setShowSummary] = useState(false);

  // Format currency
  const formattedAmount = tender.amount.toLocaleString('ru-RU');
  
  // Calculate remaining days
  const daysLeft = Math.ceil(
    (new Date(tender.deadlineDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24)
  );

  // Risk Badge Color
  const getRiskBadge = (score: number) => {
    if (score >= 60) return { bg: 'bg-red-50 text-red-700 border-red-200', label: 'Высокий риск' };
    if (score >= 30) return { bg: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Средний риск' };
    return { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Низкий риск' };
  };

  const risk = getRiskBadge(tender.riskScore);

  return (
    <div className="bg-paper border border-hairline rounded-2xl p-5 flex flex-col justify-between relative group hover:border-mid-gray/40 hover:shadow-elevated transition-all">
      
      {/* Top Source Badge & Match percentage */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 text-[11px] font-mono font-medium rounded-md bg-surface-alt text-ink border border-hairline">
              {getSourceLabel(tender.source, dataSources)}
            </span>
            
            <span className="text-xs text-mid-gray font-mono">
              № {tender.externalId}
            </span>
          </div>

          {/* Match Badge if available */}
          {tender.matchPercentage !== undefined && (
            <div className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-surface-alt border border-hairline text-ink text-xs font-semibold shadow-subtle">
              <Sparkles className="w-3 h-3 text-ember" />
              <span>{tender.matchPercentage}%</span>
            </div>
          )}
        </div>

        {/* Title */}
        <h3 
          onClick={() => onOpenDetails(tender)}
          className="text-base font-semibold text-ink hover:text-ember cursor-pointer transition-colors line-clamp-2 mb-3 leading-snug tracking-tight"
        >
          {tender.title}
        </h3>

        {/* Customer & Region info */}
        <div className="space-y-1.5 text-xs text-mid-gray mb-4">
          <div className="flex items-start space-x-2">
            <Building2 className="w-3.5 h-3.5 text-mid-gray mt-0.5 shrink-0" />
            <span className="line-clamp-1 font-normal text-ink-soft">{tender.customerName}</span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1">
              <MapPin className="w-3.5 h-3.5 text-mid-gray" />
              <span>{tender.region}</span>
            </div>
            <div className="flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-mid-gray" />
              <span className={daysLeft <= 3 ? 'text-ember font-semibold' : ''}>
                {daysLeft > 0 ? `Осталось ${daysLeft} дн.` : 'Завершен'}
              </span>
            </div>
          </div>
        </div>

        {/* Budget & Security */}
        <div className="p-3 rounded-xl bg-surface-alt border border-hairline flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-mid-gray font-medium">Сумма договора</p>
            <p className="text-base font-bold text-ink font-mono tracking-tight">
              {formattedAmount} ₸
            </p>
          </div>
          {tender.applicationSecurityAmount && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-mid-gray font-medium">Обеспечение (3%)</p>
              <p className="text-xs font-semibold text-ink-soft font-mono">
                {tender.applicationSecurityAmount.toLocaleString('ru-RU')} ₸
              </p>
            </div>
          )}
        </div>

        {/* AI Summary Drawer Toggle */}
        {tender.aiSummary && (
          <div className="mb-4">
            <button
              onClick={() => setShowSummary(!showSummary)}
              className="flex items-center justify-between w-full text-xs font-medium text-ink bg-surface-alt hover:bg-paper p-2 rounded-lg border border-hairline transition-all shadow-subtle"
            >
              <div className="flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-ember" />
                <span>ИИ-Суммаризация ТЗ</span>
              </div>
              {showSummary ? <ChevronUp className="w-3.5 h-3.5 text-mid-gray" /> : <ChevronDown className="w-3.5 h-3.5 text-mid-gray" />}
            </button>

            {showSummary && (
              <div className="mt-2 p-3 rounded-xl bg-paper border border-hairline text-xs text-ink-soft space-y-2 leading-relaxed shadow-subtle animate-fadeIn">
                <p>{tender.aiSummary}</p>
                {tender.aiKeyRequirements && tender.aiKeyRequirements.length > 0 && (
                  <div className="pt-2 border-t border-hairline">
                    <span className="font-semibold text-ink block mb-1">Ключевые требования:</span>
                    <ul className="list-disc list-inside space-y-0.5 text-mid-gray">
                      {tender.aiKeyRequirements.map((req, idx) => (
                        <li key={idx}>{req}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer & Risk Indicator & Action Buttons */}
      <div className="pt-3 border-t border-hairline flex items-center justify-between gap-2">
        
        {/* Risk Badge */}
        <div className={`px-2.5 py-0.5 rounded-lg border text-xs font-medium flex items-center space-x-1 ${risk.bg}`}>
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>{risk.label} ({tender.riskScore}%)</span>
        </div>

        {/* Buttons */}
        <div className="flex items-center space-x-1.5">
          
          <button
            onClick={() => onSendToTelegram(tender)}
            title="Отправить в Telegram"
            className="p-1.5 rounded-lg bg-surface-alt hover:bg-paper border border-hairline text-ink transition-all shadow-subtle"
          >
            <Send className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => onAddToKanban(tender)}
            disabled={isInKanban}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-subtle ${
              isInKanban 
                ? 'bg-surface-alt border border-hairline text-mid-gray cursor-default'
                : 'bg-ink hover:bg-ink-soft text-paper'
            }`}
          >
            {isInKanban ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>В воронке</span>
              </>
            ) : (
              <>
                <PlusCircle className="w-3.5 h-3.5" />
                <span>В работу</span>
              </>
            )}
          </button>

        </div>
      </div>

    </div>
  );
};

