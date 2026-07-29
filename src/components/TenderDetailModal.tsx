'use client';

import React, { useState } from 'react';
import { Tender } from '../lib/types/tender';
import { AIService } from '../lib/services/ai.service';
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

interface TenderDetailModalProps {
  tender: Tender | null;
  onClose: () => void;
  onAddToKanban: (tender: Tender) => void;
  isInKanban: boolean;
}

export const TenderDetailModal: React.FC<TenderDetailModalProps> = ({
  tender,
  onClose,
  onAddToKanban,
  isInKanban
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'ai' | 'rag' | 'audit'>('overview');
  
  const [ragMessages, setRagMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string }>>([
    {
      sender: 'ai',
      text: 'Здравствуйте! Я ИИ-ассистент TenderAI по данному лоту. Отвечаю исключительно по фактам из приложенной технической спецификации и параметров Заказчика.'
    }
  ]);
  const [inputQuestion, setInputQuestion] = useState('');

  if (!tender) return null;

  const handleSendQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuestion.trim()) return;

    const userText = inputQuestion.trim();
    setRagMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setInputQuestion('');

    setTimeout(() => {
      const aiReply = AIService.answerRAGQuestion(tender, userText);
      setRagMessages(prev => [...prev, { sender: 'ai', text: aiReply }]);
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-fadeIn">
      
      <div className="bg-paper border border-hairline rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-elevated overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-hairline flex items-start justify-between gap-4 bg-surface-alt">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <span className="px-2.5 py-0.5 text-xs font-mono font-medium rounded-md bg-paper text-ink border border-hairline">
                {tender.source === 'GOSZAKUP' ? 'goszakup.gov.kz' : 'portal.sk.kz'}
              </span>
              <span className="text-xs text-mid-gray font-mono">№ {tender.externalId}</span>
              <span className="px-2 py-0.5 text-xs rounded bg-surface-alt border border-hairline text-ink-soft">
                {tender.procurementMethod === 'OPEN_TENDER' ? 'Открытый конкурс' : 'Запрос ценовых предложений'}
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
            <span>Условия лота</span>
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
            <span>ИИ-Анализ & Риски</span>
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
            <span>RAG-Чат по документации</span>
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
            <span>История изменений ({tender.history.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-surface-alt border border-hairline">
                  <p className="text-xs text-mid-gray mb-1">Сумма лота (KZT)</p>
                  <p className="text-xl font-bold text-ink font-mono tracking-tight">
                    {tender.amount.toLocaleString('ru-RU')} ₸
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-surface-alt border border-hairline">
                  <p className="text-xs text-mid-gray mb-1">Обеспечение заявки</p>
                  <p className="text-base font-bold text-ink-soft font-mono">
                    {tender.applicationSecurityAmount?.toLocaleString('ru-RU')} ₸ ({tender.applicationSecurityPercent || 1}%)
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-surface-alt border border-hairline">
                  <p className="text-xs text-mid-gray mb-1">Дедлайн подачи</p>
                  <p className="text-sm font-bold text-ember">
                    {new Date(tender.deadlineDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-3">
                <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                  Информация о заказчике
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-ink-soft">
                  <div>
                    <span className="text-mid-gray block text-[11px]">Наименование:</span>
                    <span className="font-semibold text-ink">{tender.customerName}</span>
                  </div>
                  <div>
                    <span className="text-mid-gray block text-[11px]">БИН Заказчика:</span>
                    <span className="font-mono text-ink">{tender.customerBin}</span>
                  </div>
                  <div>
                    <span className="text-mid-gray block text-[11px]">Регион поставки:</span>
                    <span>{tender.region}</span>
                  </div>
                  <div>
                    <span className="text-mid-gray block text-[11px]">Категория / Отрасль:</span>
                    <span>{tender.category}</span>
                  </div>
                </div>
              </div>

              {tender.description && (
                <div className="p-5 rounded-2xl bg-surface-alt border border-hairline">
                  <h3 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">
                    Описание предмета закупки
                  </h3>
                  <p className="text-xs text-ink-soft leading-relaxed">{tender.description}</p>
                </div>
              )}

              <div className="p-5 rounded-2xl bg-surface-alt border border-hairline">
                <h3 className="text-xs font-bold text-ink uppercase tracking-wider mb-3">
                  Вложенная конкурсная документация ({tender.documents.length})
                </h3>
                <div className="space-y-2">
                  {tender.documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl bg-paper border border-hairline hover:border-mid-gray/40 transition-all shadow-subtle">
                      <div className="flex items-center space-x-3">
                        <FileText className="w-4 h-4 text-ink" />
                        <div>
                          <p className="text-xs font-semibold text-ink">{doc.fileName}</p>
                          <p className="text-[11px] text-mid-gray">{doc.fileSize || 'Файл документации'}</p>
                        </div>
                      </div>
                      <a
                        href={tender.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-surface-alt border border-hairline text-xs font-semibold text-ink hover:bg-paper flex items-center space-x-1.5 transition-all shadow-subtle"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Скачать</span>
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
                  <span>Автоматическое ИИ-резюме ТЗ</span>
                </div>
                <p className="text-xs text-ink-soft leading-relaxed">
                  {tender.aiSummary}
                </p>

                {tender.aiKeyRequirements && (
                  <div className="pt-3 border-t border-hairline">
                    <span className="text-[10px] font-bold text-ink uppercase tracking-wider block mb-2">
                      Главные критерии допуска:
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
                    Предварительная оценка рисков участия
                  </h3>
                  <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-paper border border-hairline text-ink shadow-subtle">
                    Индекс риска: {tender.riskScore}/100
                  </span>
                </div>

                {tender.riskFlags.length === 0 ? (
                  <p className="text-xs text-emerald-700 font-medium flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Критичеcких системных рисков по данному лоту не обнаружено.</span>
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
                  * Оценка рисков является справочным сигналом ИИ-алгоритма TenderAI.
                </p>
              </div>

            </div>
          )}

          {/* TAB 3: RAG CHAT */}
          {activeTab === 'rag' && (
            <div className="flex flex-col h-[400px] bg-surface-alt rounded-2xl border border-hairline overflow-hidden">
              
              <div className="px-4 py-2 bg-paper border-b border-hairline text-[11px] text-mid-gray flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-ink shrink-0" />
                <span>Ответы формируются исключительно по фактам из технической спецификации.</span>
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
                  placeholder="Задайте вопрос по ТЗ, обеспечению или дедлайну..."
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
                История изменений параметров лота (Audit Trail)
              </h3>

              {tender.history.length === 0 ? (
                <p className="text-xs text-mid-gray">Изменений условий или сроков по данному лоту не зафиксировано.</p>
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
            <span>Перейти к первоисточнику ({tender.source})</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-paper border border-hairline text-ink hover:bg-surface-alt transition-colors shadow-subtle"
            >
              Закрыть
            </button>

            <button
              onClick={() => {
                onAddToKanban(tender);
                onClose();
              }}
              disabled={isInKanban}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-ink hover:bg-ink-soft text-paper transition-all disabled:opacity-50 shadow-subtle"
            >
              {isInKanban ? 'Уже в вашей воронке' : 'Взять лот в работу'}
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};

