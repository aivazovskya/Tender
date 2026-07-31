'use client';

import React, { useState } from 'react';
import { Tender } from '../lib/types/tender';
import { getSourceLabel, DataSourceMeta } from '../lib/utils/sourceLabel';
import { 
  X, 
  FileText, 
  ExternalLink,
  Bot,
  Send,
  History,
  CheckCircle2,
  AlertTriangle,
  Download,
  ShieldCheck,
  Sparkles
} from 'lucide-react';

import { useTranslation } from '../lib/i18n/useTranslation';

interface TenderDetailModalProps {
  tender: Tender | null;
  onClose: () => void;
  onAddToKanban: (tender: Tender) => void;
  isInKanban: boolean;
  onExportPDF?: (tenderId: string, externalId: string) => void;
  userPlan?: string;
  dataSources?: DataSourceMeta[];
  language?: 'RU' | 'KK';
}

export const TenderDetailModal: React.FC<TenderDetailModalProps> = ({
  tender,
  onClose,
  onAddToKanban,
  isInKanban,
  onExportPDF,
  userPlan,
  dataSources,
  language = 'RU'
}) => {
  const t = useTranslation(language);
  const [activeTab, setActiveTab] = useState<'overview' | 'ai' | 'rag' | 'audit'>('overview');
  
  const [ragMessages, setRagMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string }>>([
    {
      sender: 'ai',
      text: t.tenderDetail.ragWelcome
    }
  ]);
  const [inputQuestion, setInputQuestion] = useState('');

  if (!tender) return null;

  const handleSendQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuestion.trim()) return;

    const userText = inputQuestion.trim();
    setRagMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setInputQuestion('');

    try {
      const res = await fetch('/api/tenders/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderId: tender.id,
          externalId: tender.externalId,
          title: tender.title,
          customerName: tender.customerName,
          amount: tender.amount,
          region: tender.region,
          deadlineDate: tender.deadlineDate,
          source: tender.source,
          question: userText
        })
      });
      const data = await res.json();
      if (data.success && data.answer) {
        setRagMessages(prev => [...prev, { sender: 'ai', text: data.answer }]);
      } else {
        setRagMessages(prev => [...prev, { sender: 'ai', text: data.error || t.tenderDetail.ragError }]);
      }
    } catch (err) {
      setRagMessages(prev => [...prev, { sender: 'ai', text: t.tenderDetail.ragConnError }]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-fadeIn">
      
      <div className="bg-paper border border-hairline rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-elevated overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-hairline flex items-start justify-between gap-4 bg-surface-alt">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <span className="px-2.5 py-0.5 text-xs font-mono font-medium rounded-md bg-paper text-ink border border-hairline">
                {getSourceLabel(tender.source, dataSources)}
              </span>
              <span className="text-xs text-mid-gray font-mono">№ {tender.externalId}</span>
              <span className="px-2 py-0.5 text-xs rounded bg-surface-alt border border-hairline text-ink-soft">
                {tender.procurementMethod === 'OPEN_TENDER' ? t.tenderDetail.openTender : t.tenderDetail.priceQuote}
              </span>
            </div>
            <h2 className="text-xl font-bold text-ink leading-snug tracking-tight">
              {tender.title}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-mid-gray hover:text-ink hover:bg-paper transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center border-b border-hairline px-6 bg-surface-alt">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-3 text-xs font-medium border-b-2 transition-all flex items-center space-x-2 ${
              activeTab === 'overview'
                ? 'border-ink text-ink font-semibold'
                : 'border-transparent text-mid-gray hover:text-ink'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>{t.tenderDetail.tabOverview}</span>
          </button>

          <button
            onClick={() => setActiveTab('ai')}
            className={`px-4 py-3 text-xs font-medium border-b-2 transition-all flex items-center space-x-2 ${
              activeTab === 'ai'
                ? 'border-ink text-ink font-semibold'
                : 'border-transparent text-mid-gray hover:text-ink'
            }`}
          >
            <Sparkles className="w-4 h-4 text-ember" />
            <span>{t.tenderDetail.tabAi}</span>
          </button>

          <button
            onClick={() => setActiveTab('rag')}
            className={`px-4 py-3 text-xs font-medium border-b-2 transition-all flex items-center space-x-2 ${
              activeTab === 'rag'
                ? 'border-ink text-ink font-semibold'
                : 'border-transparent text-mid-gray hover:text-ink'
            }`}
          >
            <Bot className="w-4 h-4 text-sky-600" />
            <span>{t.tenderDetail.tabRag}</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-3 text-xs font-medium border-b-2 transition-all flex items-center space-x-2 ${
              activeTab === 'audit'
                ? 'border-ink text-ink font-semibold'
                : 'border-transparent text-mid-gray hover:text-ink'
            }`}
          >
            <History className="w-4 h-4 text-emerald-600" />
            <span>{t.tenderDetail.tabAudit.replace('{count}', String(tender.history.length))}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-surface-alt border border-hairline">
                  <p className="text-xs text-mid-gray mb-1">{t.tenderDetail.lotAmount}</p>
                  <p className="text-xl font-bold text-ink font-mono tracking-tight">
                    {tender.amount.toLocaleString('ru-RU')} ₸
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-surface-alt border border-hairline">
                  <p className="text-xs text-mid-gray mb-1">{t.tenderDetail.applicationSecurity}</p>
                  <p className="text-base font-bold text-ink-soft font-mono">
                    {tender.applicationSecurityAmount?.toLocaleString('ru-RU')} ₸ ({tender.applicationSecurityPercent || 1}%)
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-surface-alt border border-hairline">
                  <p className="text-xs text-mid-gray mb-1">{t.tenderDetail.deadline}</p>
                  <p className="text-sm font-bold text-ember">
                    {new Date(tender.deadlineDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-3">
                <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                  {t.tenderDetail.customerInfo}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-ink-soft">
                  <div>
                    <span className="text-mid-gray block text-[11px]">{t.tenderDetail.customerName}</span>
                    <span className="font-semibold text-ink">{tender.customerName}</span>
                  </div>
                  <div>
                    <span className="text-mid-gray block text-[11px]">{t.tenderDetail.customerBin}</span>
                    <span className="font-mono text-ink">{tender.customerBin}</span>
                  </div>
                  <div>
                    <span className="text-mid-gray block text-[11px]">{t.tenderDetail.deliveryRegion}</span>
                    <span>{tender.region}</span>
                  </div>
                  <div>
                    <span className="text-mid-gray block text-[11px]">{t.tenderDetail.category}</span>
                    <span>{tender.category}</span>
                  </div>
                </div>
              </div>

              {tender.description && (
                <div className="p-5 rounded-2xl bg-surface-alt border border-hairline">
                  <h3 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">
                    {t.tenderDetail.purchaseDescription}
                  </h3>
                  <p className="text-xs text-ink-soft leading-relaxed">{tender.description}</p>
                </div>
              )}

              <div className="p-5 rounded-2xl bg-surface-alt border border-hairline">
                <h3 className="text-xs font-bold text-ink uppercase tracking-wider mb-3">
                  {t.tenderDetail.documents.replace('{count}', String(tender.documents.length))}
                </h3>
                <div className="space-y-2">
                  {tender.documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-paper border border-hairline hover:border-mid-gray/40 transition-all shadow-subtle">
                      <div className="flex items-center space-x-3">
                        <FileText className="w-4 h-4 text-ink" />
                        <div>
                          <p className="text-xs font-semibold text-ink">{doc.fileName}</p>
                          <p className="text-[11px] text-mid-gray">{doc.fileSize || t.tenderDetail.docFile}</p>
                        </div>
                      </div>
                      <a
                        href={tender.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-surface-alt border border-hairline text-xs font-semibold text-ink hover:bg-paper flex items-center space-x-1.5 transition-all shadow-subtle"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{t.tenderDetail.download}</span>
                      </a>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: AI & RISKS */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              
              <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-3">
                <div className="flex items-center space-x-2 text-ink font-semibold text-xs">
                  <Sparkles className="w-4 h-4 text-ember" />
                  <span>{t.tenderDetail.aiSummaryTitle}</span>
                </div>
                <p className="text-xs text-ink-soft leading-relaxed">
                  {tender.aiSummary}
                </p>

                {tender.aiKeyRequirements && (
                  <div className="pt-3 border-t border-hairline">
                    <span className="text-[10px] font-bold text-ink uppercase tracking-wider block mb-2">
                      {t.tenderDetail.mainCriteria}
                    </span>
                    <ul className="space-y-1.5 text-xs text-ink-soft">
                      {tender.aiKeyRequirements.map((req, idx) => (
                        <li key={idx} className="flex items-start space-x-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                          <span>{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                    {t.tenderDetail.riskAssessment}
                  </h3>
                  <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-paper border border-hairline text-ink shadow-subtle">
                    {t.tenderDetail.riskIndex} {tender.riskScore}/100
                  </span>
                </div>

                {tender.riskFlags.length === 0 ? (
                  <p className="text-xs text-emerald-700 font-medium flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t.tenderDetail.noRisks}</span>
                  </p>
                ) : (
                  <div className="space-y-3">
                    {tender.riskFlags.map((flag) => (
                      <div key={flag.id} className="p-4 rounded-xl bg-paper border border-amber-200 flex items-start space-x-3 shadow-subtle">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-xs font-semibold text-amber-900">{flag.title}</h4>
                          <p className="text-xs text-ink-soft mt-1">{flag.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[10px] text-mid-gray italic pt-2">
                  {t.tenderDetail.riskNote}
                </p>
              </div>

            </div>
          )}

          {/* TAB 3: RAG CHAT */}
          {activeTab === 'rag' && (
            <div className="flex flex-col h-[400px] bg-surface-alt rounded-2xl border border-hairline overflow-hidden">
              
              <div className="px-4 py-2 bg-paper border-b border-hairline text-[11px] text-mid-gray flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-ink shrink-0" />
                <span>{t.tenderDetail.ragNotice}</span>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-3">
                {ragMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start space-x-2.5 ${
                      msg.sender === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {msg.sender === 'ai' && (
                      <div className="w-6 h-6 rounded-lg bg-paper border border-hairline flex items-center justify-center shrink-0 shadow-subtle">
                        <Bot className="w-3.5 h-3.5 text-ink" />
                      </div>
                    )}

                    <div className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[80%] ${
                      msg.sender === 'user'
                        ? 'bg-ink text-paper rounded-tr-none'
                        : 'bg-paper border border-hairline text-ink rounded-tl-none shadow-subtle space-y-1.5'
                    }`}>
                      <p>{msg.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSendQuestion} className="p-3 border-t border-hairline bg-paper flex items-center space-x-2">
                <input
                  type="text"
                  value={inputQuestion}
                  onChange={(e) => setInputQuestion(e.target.value)}
                  placeholder={t.tenderDetail.ragPlaceholder}
                  className="flex-1 bg-surface-alt border border-hairline rounded-xl px-4 py-2 text-xs text-ink placeholder-mid-gray focus:outline-none focus:border-ink"
                />
                <button
                  type="submit"
                  className="p-2 rounded-xl bg-ink hover:bg-ink-soft text-paper transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

            </div>
          )}

          {/* TAB 4: AUDIT TRAIL */}
          {activeTab === 'audit' && (
            <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-4">
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">
                {t.tenderDetail.auditTitle}
              </h3>

              {tender.history.length === 0 ? (
                <p className="text-xs text-mid-gray">{t.tenderDetail.noAudit}</p>
              ) : (
                <div className="space-y-3">
                  {tender.history.map((item) => (
                    <div key={item.id} className="p-3 rounded-xl bg-paper border border-hairline text-xs flex items-center justify-between shadow-subtle">
                      <div>
                        <span className="font-semibold text-ink">{item.field}:</span>{' '}
                        <span className="line-through text-mid-gray">{item.oldValue || '—'}</span> &rarr;{' '}
                        <span className="text-emerald-700 font-bold">{item.newValue}</span>
                      </div>
                      <div className="text-right text-[11px] text-mid-gray">
                        <span>{item.changedBy}</span> &bull; {new Date(item.timestamp).toLocaleString('ru-RU')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-hairline bg-surface-alt flex items-center justify-between">
          <a
            href={tender.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-ink hover:text-ember flex items-center space-x-1.5 transition-colors"
          >
            <span>{t.tenderDetail.goToSource.replace('{source}', tender.source)}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <div className="flex items-center space-x-3">
            {onExportPDF && (
              <button
                onClick={() => onExportPDF(tender.id, tender.externalId)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-paper border border-hairline text-ink hover:bg-surface-alt transition-colors shadow-subtle flex items-center space-x-1.5"
                title="Скачать отчёт по лоту в формате PDF"
              >
                <Download className="w-3.5 h-3.5 text-ink" />
                <span>Скачать PDF</span>
                {(!userPlan || !['TEAM', 'ENTERPRISE'].includes(userPlan.toUpperCase())) && (
                  <span className="ml-1 px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">
                    Team
                  </span>
                )}
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-paper border border-hairline text-ink hover:bg-surface-alt transition-colors shadow-subtle"
            >
              {t.tenderDetail.close}
            </button>

            <button
              onClick={() => {
                onAddToKanban(tender);
                onClose();
              }}
              disabled={isInKanban}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-ink hover:bg-ink-soft text-paper transition-all disabled:opacity-50 shadow-subtle"
            >
              {isInKanban ? t.tenderDetail.alreadyInKanban : t.tenderDetail.takeToWork}
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};

