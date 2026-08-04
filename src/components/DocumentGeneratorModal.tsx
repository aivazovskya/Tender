'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, Download, Sparkles, Check, RefreshCw, FileCode } from 'lucide-react';

interface DocumentTemplate {
  id: string;
  name: string;
  category: string;
  bodyTemplate: string;
  outputFormat: 'DOCX' | 'PDF';
}

interface GeneratedDocument {
  id: string;
  tenderId: string;
  templateId: string;
  fileUrl: string;
  generatedAt: string;
  template: DocumentTemplate;
}

interface DocumentGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenderId: string;
  tenderTitle: string;
  tenderCategory?: string;
}

export const DocumentGeneratorModal: React.FC<DocumentGeneratorModalProps> = ({
  isOpen,
  onClose,
  tenderId,
  tenderTitle,
  tenderCategory
}) => {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDocument[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [previewText, setPreviewText] = useState<string>('');

  const loadData = async () => {
    try {
      setLoading(true);
      const [tplRes, docsRes] = await Promise.all([
        fetch('/api/documents/templates'),
        fetch(`/api/tenders/${tenderId}/documents`)
      ]);

      const tplData = await tplRes.json();
      const docsData = await docsRes.json();

      if (tplData.success) {
        setTemplates(tplData.templates || []);
        if (tplData.templates?.length > 0) {
          setSelectedTemplateId(tplData.templates[0].id);
        }
      }

      if (docsData.success) {
        setGeneratedDocs(docsData.documents || []);
      }
    } catch (err) {
      console.error('Failed to load document templates', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && tenderId) {
      loadData();
    }
  }, [isOpen, tenderId]);

  const handleGenerate = async () => {
    if (!selectedTemplateId) return;

    try {
      setGenerating(true);
      const res = await fetch(`/api/tenders/${tenderId}/documents/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId })
      });

      const data = await res.json();
      if (data.success) {
        if (data.resolvedText) {
          setPreviewText(data.resolvedText);
        }
        await loadData();
      } else {
        alert(data.message || 'Ошибка генерации документа');
      }
    } catch (err) {
      alert('Ошибка при генерации документа');
    } finally {
      setGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-paper border border-hairline rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline bg-surface-alt/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-ink text-paper flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">Генератор пакета документов</h2>
              <p className="text-xs text-mid-gray line-clamp-1">{tenderTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-mid-gray hover:text-ink hover:bg-surface-alt transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          
          {/* Template Selection */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-ink uppercase tracking-wider block">
              Выберите шаблон документа
            </label>

            {loading ? (
              <div className="py-6 text-center text-xs text-mid-gray animate-pulse">Загрузка шаблонов...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {templates.map(tpl => (
                  <div
                    key={tpl.id}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={`p-4 border rounded-xl cursor-pointer transition-all ${
                      selectedTemplateId === tpl.id 
                        ? 'bg-paper border-ink ring-2 ring-ink/10 shadow-subtle' 
                        : 'bg-surface-alt/30 border-hairline hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-ink">{tpl.name}</h4>
                      <span className="px-2 py-0.5 text-[10px] font-semibold bg-surface-alt text-mid-gray rounded border border-hairline">
                        {tpl.outputFormat}
                      </span>
                    </div>
                    <p className="text-[11px] text-mid-gray mt-1 line-clamp-2">{tpl.bodyTemplate}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Button */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleGenerate}
              disabled={generating || !selectedTemplateId}
              className="flex items-center space-x-2 px-5 py-2.5 bg-ink text-paper rounded-xl text-xs font-semibold hover:bg-ink-soft disabled:opacity-50 transition-colors shadow-subtle"
            >
              {generating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-amber-400" />
              )}
              <span>{generating ? 'Формирование DOCX...' : 'Сгенерировать документ DOCX'}</span>
            </button>
          </div>

          {/* Live Preview Text if available */}
          {previewText && (
            <div className="space-y-2 pt-2 border-t border-hairline">
              <span className="text-[11px] font-bold text-mid-gray uppercase tracking-wider block">
                Предпросмотр подставленных реквизитов:
              </span>
              <div className="p-4 bg-surface-alt/40 border border-hairline rounded-xl text-xs font-mono whitespace-pre-wrap text-slate-800 max-h-48 overflow-y-auto">
                {previewText}
              </div>
            </div>
          )}

          {/* Generated Documents Archive */}
          <div className="space-y-3 pt-4 border-t border-hairline">
            <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
              Ранее сгенерированные документы по лоту ({generatedDocs.length})
            </h3>

            {generatedDocs.length === 0 ? (
              <p className="text-xs text-mid-gray italic">Документы для этого лота пока не генерировались.</p>
            ) : (
              <div className="space-y-2">
                {generatedDocs.map(doc => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 bg-paper border border-hairline rounded-xl shadow-subtle hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <FileCode className="w-5 h-5 text-blue-600" />
                      <div>
                        <h4 className="text-xs font-bold text-ink">{doc.template.name}</h4>
                        <span className="text-[10px] text-mid-gray">
                          Сгенерировано: {new Date(doc.generatedAt).toLocaleString('ru-RU')}
                        </span>
                      </div>
                    </div>

                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-surface-alt hover:bg-paper border border-hairline rounded-lg text-xs font-medium text-ink transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      <span>Скачать DOCX</span>
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
