'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  FileText,
  Link as LinkIcon,
  Upload,
  RefreshCw,
  Zap,
  Crown,
  History,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  FileSpreadsheet
} from 'lucide-react';

export interface ComplianceItem {
  id?: string;
  requirementText: string;
  productValue: string | null;
  status: 'MATCH' | 'MISMATCH' | 'MISSING' | 'UNCLEAR';
  isCritical: boolean;
  comment?: string | null;
}

export interface ComplianceCheckData {
  id: string;
  companyProfileId: string;
  tenderId?: string | null;
  productName?: string | null;
  sourceType: 'MANUAL_TEXT' | 'URL' | 'FILE';
  sourceRaw?: string | null;
  sourceFileUrl?: string | null;
  tzText: string;
  llmTier: 'FREE' | 'PAID';
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  verdict?: 'COMPLIANT' | 'PARTIAL' | 'NOT_COMPLIANT' | null;
  compliancePercent?: number | null;
  errorMessage?: string | null;
  createdAt: string;
  items?: ComplianceItem[];
  criticalMismatches?: ComplianceItem[];
  tender?: {
    id: string;
    externalId: string;
    title: string;
    customerName: string;
    amount: number;
  } | null;
}

export interface ComplianceCheckerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTenderId?: string;
  initialTzText?: string;
  tenderTitle?: string;
  language?: 'RU' | 'KK';
}

export const ComplianceCheckerModal: React.FC<ComplianceCheckerModalProps> = ({
  isOpen,
  onClose,
  initialTenderId,
  initialTzText,
  tenderTitle,
  language = 'RU'
}) => {
  const [viewMode, setViewMode] = useState<'FORM' | 'RESULT' | 'HISTORY'>('FORM');
  const [sourceType, setSourceType] = useState<'MANUAL_TEXT' | 'URL' | 'FILE'>('MANUAL_TEXT');
  const [tzText, setTzText] = useState(initialTzText || '');
  const [manualText, setManualText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [llmTier, setLlmTier] = useState<'FREE' | 'PAID'>('FREE');
  const [showPaidConfirm, setShowPaidConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [currentCheck, setCurrentCheck] = useState<ComplianceCheckData | null>(null);
  const [statusText, setStatusText] = useState<string>('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // History state
  const [historyList, setHistoryList] = useState<ComplianceCheckData[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Table filter
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'MATCH' | 'MISMATCH' | 'MISSING' | 'UNCLEAR'>('ALL');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (initialTzText) {
      setTzText(initialTzText);
    }
  }, [initialTzText]);

  // Clean polling on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Fetch History
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/compliance-check?limit=30');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setHistoryList(data.data);
      }
    } catch (err) {
      console.warn('Failed to load compliance check history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleStartCheck = async (confirmedTier?: 'FREE' | 'PAID') => {
    const tierToUse = confirmedTier || llmTier;
    if (tierToUse === 'PAID' && !confirmedTier) {
      setShowPaidConfirm(true);
      return;
    }

    if (!tzText.trim()) {
      setErrorBanner('Пожалуйста, введите текст технической спецификации (ТЗ)');
      return;
    }

    if (sourceType === 'MANUAL_TEXT' && !manualText.trim()) {
      setErrorBanner('Пожалуйста, введите характеристики товара');
      return;
    }

    if (sourceType === 'URL' && !urlInput.trim()) {
      setErrorBanner('Пожалуйста, укажите ссылку на страницу товара');
      return;
    }

    if (sourceType === 'FILE' && !selectedFile) {
      setErrorBanner('Пожалуйста, выберите файл (PDF или изображение)');
      return;
    }

    setErrorBanner(null);
    setLoading(true);
    setStatusText('Отправка данных на анализ...');

    try {
      let res: Response;

      if (sourceType === 'FILE' && selectedFile) {
        const formData = new FormData();
        formData.append('tzText', tzText.trim());
        if (initialTenderId) formData.append('tenderId', initialTenderId);
        formData.append('sourceType', 'FILE');
        formData.append('llmTier', tierToUse);
        formData.append('file', selectedFile);

        res = await fetch('/api/compliance-check', {
          method: 'POST',
          body: formData
        });
      } else {
        const bodyPayload = {
          tzText: tzText.trim(),
          tenderId: initialTenderId || undefined,
          sourceType,
          sourceRaw: sourceType === 'URL' ? urlInput.trim() : manualText.trim(),
          llmTier: tierToUse
        };

        res = await fetch('/api/compliance-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });
      }

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Не удалось запустить проверку соответствия');
      }

      const checkId = result.checkId;
      startPollingCheck(checkId);
    } catch (err: any) {
      setLoading(false);
      setErrorBanner(err.message || 'Ошибка связи с сервером');
    }
  };

  const startPollingCheck = (checkId: string) => {
    setStatusText('Анализ текста ТЗ и извлечение требований...');
    setViewMode('RESULT');

    let attempts = 0;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    pollTimerRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/compliance-check/${checkId}`);
        const data = await res.json();

        if (data.success && data.check) {
          const check: ComplianceCheckData = data.check;
          setCurrentCheck(check);

          if (check.status === 'PROCESSING') {
            setStatusText('Сопоставление характеристик товара с требованиями ТЗ через LLM...');
          } else if (check.status === 'DONE') {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setLoading(false);
            setStatusText('');
          } else if (check.status === 'FAILED') {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            setLoading(false);
            setErrorBanner(check.errorMessage || 'Проверка завершилась с ошибкой');
          }
        }
      } catch (err) {
        console.warn('Polling error:', err);
      }

      if (attempts > 90) {
        // 90 * 1.5s = 135s timeout
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        setLoading(false);
        setErrorBanner('Превышено время ожидания ответа. Проверьте историю проверок позже.');
      }
    }, 1500);
  };

  const handleSelectHistoryItem = async (checkId: string) => {
    setLoading(true);
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/compliance-check/${checkId}`);
      const data = await res.json();
      if (data.success && data.check) {
        setCurrentCheck(data.check);
        setViewMode('RESULT');
      } else {
        setErrorBanner(data.message || 'Не удалось загрузить результаты');
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const items = currentCheck?.items || [];
  const filteredItems = items.filter(item => {
    if (statusFilter === 'ALL') return true;
    return item.status === statusFilter;
  });

  const matchCount = items.filter(i => i.status === 'MATCH').length;
  const mismatchCount = items.filter(i => i.status === 'MISMATCH').length;
  const missingCount = items.filter(i => i.status === 'MISSING').length;
  const unclearCount = items.filter(i => i.status === 'UNCLEAR').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/70 backdrop-blur-md animate-fadeIn">
      <div className="bg-paper border border-hairline rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-elevated overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-hairline bg-surface-alt flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-ink text-paper flex items-center justify-center shadow-subtle relative">
              <Sparkles className="w-5 h-5 text-ember" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-ink tracking-tight">
                  Проверка соответствия товара ТЗ
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Compliance Checker
                </span>
              </div>
              <p className="text-xs text-mid-gray">
                {tenderTitle ? `Лот: ${tenderTitle}` : 'Автоматическое сопоставление ТЗ и характеристик товара через LLM'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {viewMode !== 'HISTORY' && (
              <button
                onClick={() => {
                  setViewMode('HISTORY');
                  fetchHistory();
                }}
                className="px-3 py-1.5 rounded-xl bg-paper hover:bg-surface-alt border border-hairline text-xs font-semibold text-ink flex items-center space-x-1.5 shadow-subtle transition-colors"
              >
                <History className="w-3.5 h-3.5 text-mid-gray" />
                <span>История</span>
              </button>
            )}

            {viewMode !== 'FORM' && (
              <button
                onClick={() => {
                  setViewMode('FORM');
                  setCurrentCheck(null);
                  setErrorBanner(null);
                }}
                className="px-3 py-1.5 rounded-xl bg-paper hover:bg-surface-alt border border-hairline text-xs font-semibold text-ink flex items-center space-x-1.5 shadow-subtle transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 text-mid-gray" />
                <span>Новая проверка</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-mid-gray hover:text-ink hover:bg-paper transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {errorBanner && (
          <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="flex-1">{errorBanner}</span>
            <button onClick={() => setErrorBanner(null)} className="text-red-500 hover:text-red-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* ================= VIEW 1: CREATION FORM ================= */}
          {viewMode === 'FORM' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              
              {/* Step 1: Technical Specification (TZ) */}
              <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-ink uppercase tracking-wider flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-ember" />
                    <span>1. Текст технической спецификации (ТЗ) тендера</span>
                  </label>
                  <span className="text-[11px] text-mid-gray">Обязательное поле</span>
                </div>
                <textarea
                  value={tzText}
                  onChange={(e) => setTzText(e.target.value)}
                  placeholder="Вставьте требования заказчика из технической спецификации (параметры, мощности, размеры, стандарты ГОСТ, требования к гарантии и т.д.)..."
                  rows={6}
                  className="w-full bg-paper border border-hairline rounded-xl p-3.5 text-xs text-ink placeholder-mid-gray focus:outline-none focus:border-ink transition-all shadow-subtle leading-relaxed"
                />
              </div>

              {/* Step 2: Product Specifications Source */}
              <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-ink uppercase tracking-wider flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-sky-600" />
                    <span>2. Характеристики поставляемого товара</span>
                  </label>
                  <span className="text-[11px] text-mid-gray">Выберите удобный источник</span>
                </div>

                {/* Source Tabs */}
                <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-paper border border-hairline">
                  <button
                    type="button"
                    onClick={() => setSourceType('MANUAL_TEXT')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all ${
                      sourceType === 'MANUAL_TEXT'
                        ? 'bg-ink text-paper shadow-subtle'
                        : 'text-mid-gray hover:text-ink'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Текст вручную</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSourceType('URL')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all ${
                      sourceType === 'URL'
                        ? 'bg-ink text-paper shadow-subtle'
                        : 'text-mid-gray hover:text-ink'
                    }`}
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    <span>Ссылка на товар (URL)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSourceType('FILE')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all ${
                      sourceType === 'FILE'
                        ? 'bg-ink text-paper shadow-subtle'
                        : 'text-mid-gray hover:text-ink'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Файл (PDF / Скрин)</span>
                  </button>
                </div>

                {/* Tab 1: Manual Text */}
                {sourceType === 'MANUAL_TEXT' && (
                  <div className="space-y-2 animate-fadeIn">
                    <textarea
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder="Вставьте характеристики вашего товара (паспорт изделия, спецификацию от производителя, модель, описание с сайта поставщика)..."
                      rows={6}
                      className="w-full bg-paper border border-hairline rounded-xl p-3.5 text-xs text-ink placeholder-mid-gray focus:outline-none focus:border-ink transition-all shadow-subtle leading-relaxed"
                    />
                  </div>
                )}

                {/* Tab 2: URL */}
                {sourceType === 'URL' && (
                  <div className="space-y-2 animate-fadeIn">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <LinkIcon className="w-4 h-4 text-mid-gray" />
                      </div>
                      <input
                        type="url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://kaspi.kz/shop/p/... или ссылка на интернет-магазин поставщика"
                        className="w-full pl-10 pr-4 py-3 bg-paper border border-hairline rounded-xl text-xs text-ink placeholder-mid-gray focus:outline-none focus:border-ink shadow-subtle"
                      />
                    </div>
                    <p className="text-[11px] text-mid-gray leading-relaxed">
                      💡 Система автоматически сделает безопасный fetch страницы, уберет лишние элементы (шапки, меню) и передаст характеристики в модель.
                    </p>
                  </div>
                )}

                {/* Tab 3: File Upload */}
                {sourceType === 'FILE' && (
                  <div className="space-y-3 animate-fadeIn">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setSelectedFile(file);
                      }}
                      className="hidden"
                    />

                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-hairline hover:border-ink rounded-2xl p-6 text-center cursor-pointer bg-paper hover:bg-surface-alt transition-all shadow-subtle space-y-2"
                    >
                      <Upload className="w-8 h-8 text-mid-gray mx-auto" />
                      {selectedFile ? (
                        <div>
                          <p className="text-xs font-bold text-ink">{selectedFile.name}</p>
                          <p className="text-[11px] text-mid-gray">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} МБ • Нажмите, чтобы выбрать другой
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs font-semibold text-ink">
                            Нажмите или перетащите файл сюда
                          </p>
                          <p className="text-[11px] text-mid-gray">
                            Поддерживаются PDF (в т.ч. сканы), JPG, PNG, WEBP до 15 МБ
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 3: LLM Model Tier Selection */}
              <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-ink uppercase tracking-wider flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span>3. Модель искусственного интеллекта</span>
                  </label>
                  <span className="text-[11px] text-mid-gray">Выбор тарифа точности</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => setLlmTier('FREE')}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      llmTier === 'FREE'
                        ? 'bg-paper border-ink ring-2 ring-ink/10 shadow-subtle'
                        : 'bg-paper/60 border-hairline hover:bg-paper'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-ink flex items-center space-x-1.5">
                        <Zap className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Бесплатная (Gemini Flash)</span>
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800">
                        FREE TIER
                      </span>
                    </div>
                    <p className="text-[11px] text-mid-gray leading-relaxed">
                      Базовая модель для типовых и несложных спецификаций. Включена во все тарифы.
                    </p>
                  </div>

                  <div
                    onClick={() => {
                      setLlmTier('PAID');
                      setShowPaidConfirm(true);
                    }}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      llmTier === 'PAID'
                        ? 'bg-paper border-ink ring-2 ring-ink/10 shadow-subtle'
                        : 'bg-paper/60 border-hairline hover:bg-paper'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-ink flex items-center space-x-1.5">
                        <Crown className="w-3.5 h-3.5 text-amber-600" />
                        <span>Платная (Gemini Pro)</span>
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-800">
                        PRO TIER
                      </span>
                    </div>
                    <p className="text-[11px] text-mid-gray leading-relaxed">
                      Максимальная точность для многостраничных, запутанных и критичных ТЗ.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleStartCheck()}
                  className="w-full py-4 px-6 rounded-2xl bg-ink hover:bg-ink/90 text-paper font-bold text-sm transition-all shadow-elevated flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-ember animate-pulse" />
                  <span>{loading ? 'Запуск проверки...' : 'Проверить соответствие товара'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          )}

          {/* ================= VIEW 2: RESULTS VIEW ================= */}
          {viewMode === 'RESULT' && (
            <div className="space-y-6">
              
              {/* Loading / Processing State */}
              {loading && (
                <div className="p-12 text-center bg-surface-alt border border-hairline rounded-3xl space-y-4 shadow-subtle animate-pulse">
                  <div className="w-12 h-12 rounded-2xl bg-ink text-paper flex items-center justify-center mx-auto shadow-subtle">
                    <RefreshCw className="w-6 h-6 animate-spin text-ember" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-ink">Идёт проверка соответствия...</h3>
                    <p className="text-xs text-mid-gray mt-1">{statusText}</p>
                  </div>
                </div>
              )}

              {/* Result Render */}
              {!loading && currentCheck && (
                <div className="space-y-6 animate-fadeIn">
                  
                  {/* Big Verdict Banner */}
                  <div className={`p-6 rounded-3xl border shadow-subtle flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                    currentCheck.verdict === 'COMPLIANT'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950'
                      : currentCheck.verdict === 'PARTIAL'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-950'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-950'
                  }`}>
                    <div className="flex items-center space-x-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-subtle ${
                        currentCheck.verdict === 'COMPLIANT'
                          ? 'bg-emerald-600 text-white'
                          : currentCheck.verdict === 'PARTIAL'
                          ? 'bg-amber-600 text-white'
                          : 'bg-rose-600 text-white'
                      }`}>
                        {currentCheck.verdict === 'COMPLIANT' && <CheckCircle2 className="w-8 h-8" />}
                        {currentCheck.verdict === 'PARTIAL' && <AlertTriangle className="w-8 h-8" />}
                        {currentCheck.verdict === 'NOT_COMPLIANT' && <XCircle className="w-8 h-8" />}
                      </div>

                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xl font-extrabold tracking-tight">
                            {currentCheck.verdict === 'COMPLIANT' && 'ПОДХОДИТ'}
                            {currentCheck.verdict === 'PARTIAL' && 'ЧАСТИЧНО ПОДХОДИТ'}
                            {currentCheck.verdict === 'NOT_COMPLIANT' && 'НЕ ПОДХОДИТ'}
                          </span>
                          <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-paper border border-hairline">
                            {currentCheck.compliancePercent || 0}% соответствия
                          </span>
                        </div>
                        <p className="text-xs text-mid-gray mt-1">
                          {currentCheck.productName ? `Товар: ${currentCheck.productName}` : 'Сопоставление завершено'} • Тариф LLM: {currentCheck.llmTier}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="px-3.5 py-2 rounded-xl bg-paper border border-hairline text-xs font-mono text-center shadow-subtle">
                        <span className="text-[10px] text-mid-gray block uppercase font-bold">Пунктов ТЗ</span>
                        <span className="font-bold text-ink">{items.length}</span>
                      </div>
                      <div className="px-3.5 py-2 rounded-xl bg-paper border border-hairline text-xs font-mono text-center shadow-subtle">
                        <span className="text-[10px] text-emerald-600 block uppercase font-bold">Совпало</span>
                        <span className="font-bold text-emerald-700">{matchCount}</span>
                      </div>
                      <div className="px-3.5 py-2 rounded-xl bg-paper border border-hairline text-xs font-mono text-center shadow-subtle">
                        <span className="text-[10px] text-rose-600 block uppercase font-bold">Не совпало</span>
                        <span className="font-bold text-rose-700">{mismatchCount}</span>
                      </div>
                    </div>
                  </div>

                  {/* Top Block: Critical Issues */}
                  {currentCheck.criticalMismatches && currentCheck.criticalMismatches.length > 0 && (
                    <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-3 shadow-subtle">
                      <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-rose-800">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span>Критичные расхождения (Вето на соответствие)</span>
                      </div>
                      <p className="text-xs text-rose-700">
                        Обнаружены критичные несоответствия обязательным требованиям ТЗ. Подача заявки с такими характеристиками несёт высокий риск отклонения:
                      </p>
                      <div className="space-y-2">
                        {currentCheck.criticalMismatches.map((crit, idx) => (
                          <div key={idx} className="p-3 rounded-xl bg-white border border-rose-200 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-rose-900">{crit.requirementText}</span>
                              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-100 text-rose-800">
                                {crit.status}
                              </span>
                            </div>
                            {crit.productValue && (
                              <p className="text-ink-soft text-[11px]">
                                Значение у товара: <span className="font-medium">{crit.productValue}</span>
                              </p>
                            )}
                            {crit.comment && (
                              <p className="text-mid-gray text-[11px] italic">
                                {crit.comment}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Filter Tabs */}
                  <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
                    <div className="flex items-center space-x-1.5 bg-surface-alt p-1 rounded-xl border border-hairline text-xs font-semibold">
                      <button
                        onClick={() => setStatusFilter('ALL')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                          statusFilter === 'ALL' ? 'bg-paper text-ink shadow-subtle' : 'text-mid-gray hover:text-ink'
                        }`}
                      >
                        Все ({items.length})
                      </button>
                      <button
                        onClick={() => setStatusFilter('MATCH')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                          statusFilter === 'MATCH' ? 'bg-paper text-emerald-700 shadow-subtle' : 'text-mid-gray hover:text-ink'
                        }`}
                      >
                        Соответствует ({matchCount})
                      </button>
                      <button
                        onClick={() => setStatusFilter('MISMATCH')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                          statusFilter === 'MISMATCH' ? 'bg-paper text-rose-700 shadow-subtle' : 'text-mid-gray hover:text-ink'
                        }`}
                      >
                        Не соответствует ({mismatchCount})
                      </button>
                      <button
                        onClick={() => setStatusFilter('MISSING')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                          statusFilter === 'MISSING' ? 'bg-paper text-amber-700 shadow-subtle' : 'text-mid-gray hover:text-ink'
                        }`}
                      >
                        Отсутствует ({missingCount})
                      </button>
                      <button
                        onClick={() => setStatusFilter('UNCLEAR')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                          statusFilter === 'UNCLEAR' ? 'bg-paper text-sky-700 shadow-subtle' : 'text-mid-gray hover:text-ink'
                        }`}
                      >
                        Неясно ({unclearCount})
                      </button>
                    </div>
                  </div>

                  {/* Comparison Table */}
                  <div className="border border-hairline rounded-2xl overflow-hidden shadow-subtle bg-paper">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-alt border-b border-hairline text-[11px] text-mid-gray uppercase font-semibold">
                        <tr>
                          <th className="py-3 px-4 w-12 text-center">№</th>
                          <th className="py-3 px-4">Требование ТЗ</th>
                          <th className="py-3 px-4">Характеристика товара</th>
                          <th className="py-3 px-4 w-36">Статус</th>
                          <th className="py-3 px-4">Комментарий ИИ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {filteredItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-surface-alt/50 transition-colors">
                            <td className="py-3 px-4 text-center font-mono text-mid-gray">{idx + 1}</td>
                            
                            <td className="py-3 px-4">
                              <div className="space-y-1">
                                <span className="font-medium text-ink block">{item.requirementText}</span>
                                {item.isCritical && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                    ★ Обязательное
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-ink-soft font-mono">
                              {item.productValue || <span className="text-mid-gray italic">Не указано</span>}
                            </td>

                            <td className="py-3 px-4">
                              {item.status === 'MATCH' && (
                                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Соответствует</span>
                                </span>
                              )}
                              {item.status === 'MISMATCH' && (
                                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Не соотв.</span>
                                </span>
                              )}
                              {item.status === 'MISSING' && (
                                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span>Отсутствует</span>
                                </span>
                              )}
                              {item.status === 'UNCLEAR' && (
                                <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                                  <HelpCircle className="w-3.5 h-3.5" />
                                  <span>Неясно</span>
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-mid-gray text-[11px]">
                              {item.comment || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}

            </div>
          )}

          {/* ================= VIEW 3: HISTORY LIST ================= */}
          {viewMode === 'HISTORY' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                  История проверок вашей компании
                </h3>
                <button
                  onClick={fetchHistory}
                  className="p-1.5 rounded-lg text-mid-gray hover:text-ink hover:bg-surface-alt transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {loadingHistory ? (
                <div className="p-8 text-center text-xs text-mid-gray font-mono">
                  Загрузка истории...
                </div>
              ) : historyList.length === 0 ? (
                <div className="p-12 text-center bg-surface-alt rounded-2xl space-y-2">
                  <FileText className="w-8 h-8 text-mid-gray mx-auto" />
                  <p className="text-xs font-semibold text-ink">История проверок пуста</p>
                  <p className="text-[11px] text-mid-gray">Запустите первую проверку соответствия товара</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyList.map((hist) => (
                    <div
                      key={hist.id}
                      onClick={() => handleSelectHistoryItem(hist.id)}
                      className="p-4 rounded-2xl bg-surface-alt hover:bg-paper border border-hairline cursor-pointer transition-all shadow-subtle flex items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-ink">
                            {hist.productName || hist.sourceRaw?.substring(0, 50) || 'Проверка товара'}
                          </span>
                          {hist.tender && (
                            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-paper border border-hairline text-ink">
                              № {hist.tender.externalId}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-mid-gray">
                          {new Date(hist.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} • Источник: {hist.sourceType}
                        </p>
                      </div>

                      <div className="flex items-center space-x-3 shrink-0">
                        {hist.verdict === 'COMPLIANT' && (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800">
                            ПОДХОДИТ ({hist.compliancePercent}%)
                          </span>
                        )}
                        {hist.verdict === 'PARTIAL' && (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800">
                            ЧАСТИЧНО ({hist.compliancePercent}%)
                          </span>
                        )}
                        {hist.verdict === 'NOT_COMPLIANT' && (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-100 text-rose-800">
                            НЕ ПОДХОДИТ ({hist.compliancePercent}%)
                          </span>
                        )}
                        {hist.status === 'PROCESSING' && (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-800 animate-pulse">
                            В обработке
                          </span>
                        )}
                        {hist.status === 'FAILED' && (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-700">
                            Ошибка
                          </span>
                        )}
                        <ArrowRight className="w-4 h-4 text-mid-gray" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-hairline bg-surface-alt flex items-center justify-between">
          <div className="text-xs text-mid-gray">
            {currentCheck?.llmTier ? `Модель: ${currentCheck.llmTier}` : 'TenderAI Compliance Checker'}
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-paper hover:bg-surface-alt border border-hairline text-xs font-semibold text-ink transition-colors shadow-subtle"
            >
              Закрыть
            </button>
          </div>
        </div>

      </div>

      {/* Confirmation Modal for Paid Tier */}
      {showPaidConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-ink/80 animate-fadeIn">
          <div className="bg-paper border border-hairline rounded-3xl p-6 max-w-md w-full shadow-elevated space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink">Подтверждение платного запроса</h3>
                <p className="text-xs text-mid-gray">Использование модели Gemini Pro</p>
              </div>
            </div>

            <p className="text-xs text-ink-soft leading-relaxed">
              Вы выбрали режим высокой точности <b>Gemini Pro</b>. Запрос будет тарифицирован по модели Pro. Вы уверены, что хотите продолжить?
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => {
                  setShowPaidConfirm(false);
                  setLlmTier('FREE');
                }}
                className="px-4 py-2 rounded-xl bg-surface-alt hover:bg-paper border border-hairline text-xs font-semibold text-ink"
              >
                Отмена (Flash)
              </button>
              <button
                onClick={() => {
                  setShowPaidConfirm(false);
                  setLlmTier('PAID');
                  if (viewMode === 'FORM') {
                    handleStartCheck('PAID');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-subtle"
              >
                Да, использовать Pro
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
