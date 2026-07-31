'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Tender, KanbanItem, CompanyProfileData, DataSourceStatus } from '../lib/types/tender';
import { INITIAL_DATA_SOURCES, KZ_REGIONS, CATEGORIES } from '../lib/mockData';
import { AIClientService } from '../lib/services/ai.client';
import { Navigation } from '../components/Navigation';
import { TenderCard } from '../components/TenderCard';
import { TenderDetailModal } from '../components/TenderDetailModal';
import { KanbanBoard } from '../components/KanbanBoard';
import { CompanyProfileModal } from '../components/CompanyProfileModal';
import { AdminPanel } from '../components/AdminPanel';
import { BillingModal } from '../components/BillingModal';
import { TelegramBotModal } from '../components/TelegramBotModal';

import { 
  Search, 
  Sparkles, 
  RefreshCw, 
  CheckCircle2,
  Download,
  FileSpreadsheet
} from 'lucide-react';

import { ApiKeyModal } from '../components/ApiKeyModal';
import { useTranslation } from '../lib/i18n/useTranslation';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'kanban' | 'matching' | 'admin' | 'billing' | 'telegram'>('catalog');
  const [language, setLanguageState] = useState<'RU' | 'KK'>('RU');

  // Load persisted language choice on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLang = localStorage.getItem('tender_ui_language');
      if (savedLang === 'RU' || savedLang === 'KK') {
        setLanguageState(savedLang);
      }
    }
  }, []);

  const setLanguage = (lang: 'RU' | 'KK') => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('tender_ui_language', lang);
      } catch {}
    }
  };

  const t = useTranslation(language);

  // Main State
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSources, setDataSources] = useState<DataSourceStatus[]>(INITIAL_DATA_SOURCES);
  const [kanbanItems, setKanbanItems] = useState<KanbanItem[]>([]);
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('Все регионы');
  const [selectedCategory, setSelectedCategory] = useState('Все категории');
  const [selectedSource, setSelectedSource] = useState<'ALL' | 'GOSZAKUP' | 'SAMRUK_KAZYNA'>('ALL');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date' | 'amount_desc' | 'risk_asc' | 'match_desc'>('date');

  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const isDemoPath = window.location.pathname.startsWith('/demo');
      if (isDemoPath || urlParams.get('demo') === 'true') {
        setIsDemoMode(true);
      }
    }
  }, []);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const [userTariff, setUserTariff] = useState<string>('TEAM');
  const [isProfileFallback, setIsProfileFallback] = useState<boolean>(false);

  // Company Profile for Matching
  const [companyProfile, setCompanyProfileState] = useState<CompanyProfileData>({
    companyName: '',
    bin: '',
    activities: '',
    keywords: [],
    regions: ['Все регионы'],
    minAmount: 0,
    maxAmount: 0,
    contactEmail: '',
    telegramChatId: ''
  });

  const setCompanyProfile = (newProfile: CompanyProfileData) => {
    setCompanyProfileState(newProfile);
    if (newProfile.subscriptionPlan) {
      setUserTariff(newProfile.subscriptionPlan);
    }
    if (isDemoMode) {
      showToast(t.toast.profileSaved, 'success');
      return;
    }
    if (isProfileFallback) {
      showToast(t.toast.profileLoadError, 'error');
      return;
    }
    fetch('/api/company-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newProfile)
    }).catch(() => {});
  };

  // Fetch initial profile & kanban items from REST API
  useEffect(() => {
    if (isDemoMode) {
      // In Demo Mode, supply realistic Demo Profile for demonstration
      setCompanyProfileState({
        companyName: 'ТОО "КазИТ Сервис"',
        bin: '180940004512',
        activities: 'Поставка компьютерной техники, серверного оборудования, сетевых устройств, разработка ПО и системная интеграция.',
        keywords: ['Серверы', 'Сетевое оборудование', 'ИТ-услуги', 'ПО'],
        regions: ['г. Астана', 'г. Алматы', 'Карагандинская область'],
        minAmount: 5000000,
        maxAmount: 200000000,
        contactEmail: 'tender@kazit-service.kz',
        telegramChatId: '@kazit_tender_team'
      });

      fetch('/api/demo/kanban')
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.cards)) {
            setKanbanItems(data.cards);
          }
        })
        .catch(() => {});
      return;
    }

    fetch('/api/company-profile')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (data.isFallback) {
            setIsProfileFallback(true);
          } else if (data.profile) {
            setCompanyProfileState(data.profile);
            setIsProfileFallback(false);
          }
        }
      })
      .catch(() => {
        setIsProfileFallback(true);
      });

    fetch('/api/kanban')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.cards)) {
          setKanbanItems(data.cards);
        }
      })
      .catch(() => {});
  }, [isDemoMode]);

  // Fetch tenders via REST API (/api/tenders or /api/demo/tenders)
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (selectedRegion !== 'Все регионы') params.set('region', selectedRegion);
    if (selectedCategory !== 'Все категории') params.set('category', selectedCategory);
    if (selectedSource !== 'ALL') params.set('source', selectedSource);

    const apiEndpoint = isDemoMode ? `/api/demo/tenders?${params.toString()}` : `/api/tenders?${params.toString()}`;

    fetch(apiEndpoint)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.tenders) {
          setTenders(data.tenders);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [searchQuery, selectedRegion, selectedCategory, selectedSource, isDemoMode]);

  // Kanban Handlers with API Sync & State Rollback Protection (Bug #10)
  const handleAddToKanban = (tender: Tender) => {
    if (kanbanItems.some(item => item.tenderId === tender.id)) return;
    const tempId = `temp-${Date.now()}`;
    const newItem: KanbanItem = {
      id: tempId,
      tenderId: tender.id,
      stage: 'UNDER_REVIEW',
      priority: 'MEDIUM',
      tender,
      stageEnteredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setKanbanItems(prev => [...prev, newItem]);

    if (isDemoMode) {
      showToast(t.toast.lotAddedDemo.replace('{id}', String(tender.externalId)), 'success');
      return;
    }

    fetch('/api/kanban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenderId: tender.id, stage: 'UNDER_REVIEW', priority: 'MEDIUM' })
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Ошибка сервера при сохранении');
        }
        if (data.card?.id) {
          setKanbanItems(prev => prev.map(k => k.id === tempId ? { ...k, id: data.card.id } : k));
        }
        showToast(t.toast.lotAddedSuccess.replace('{id}', String(tender.externalId)), 'success');
      })
      .catch((err) => {
        setKanbanItems(prev => prev.filter(item => item.id !== tempId));
        showToast(t.toast.lotAddedError.replace('{id}', String(tender.externalId)).replace('{err}', err.message || 'Сбой записи в БД'), 'error');
      });
  };

  const handleUpdateKanbanCard = (itemId: string, changes: Partial<KanbanItem>) => {
    const previousItems = kanbanItems;
    const targetItem = kanbanItems.find(k => k.id === itemId);
    if (!targetItem) return;

    const isStageOnly = Object.keys(changes).length === 1 && changes.stage !== undefined;

    setKanbanItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const stageChanged = changes.stage && changes.stage !== item.stage;
      return {
        ...item,
        ...changes,
        ...(stageChanged ? { stageEnteredAt: new Date().toISOString() } : {})
      };
    }));

    if (isDemoMode) {
      showToast(isStageOnly ? t.toast.stageUpdatedDemo : t.toast.cardUpdatedDemo, 'success');
      return;
    }

    fetch('/api/kanban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: itemId, tenderId: targetItem.tenderId, ...changes })
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Ошибка сервера при обновлении');
        }
        showToast(isStageOnly ? t.toast.stageUpdatedSuccess : t.toast.cardUpdatedSuccess, 'success');
      })
      .catch((err) => {
        setKanbanItems(previousItems);
        showToast((isStageOnly ? t.toast.stageUpdatedError : t.toast.cardUpdatedError).replace('{err}', err.message || 'Изменения отменены'), 'error');
      });
  };

  const handleUpdateKanbanStage = (itemId: string, newStage: any) => {
    handleUpdateKanbanCard(itemId, { stage: newStage });
  };

  const handleRemoveKanbanItem = (itemId: string) => {
    const previousItems = kanbanItems;

    setKanbanItems(prev => prev.filter(item => item.id !== itemId));

    if (isDemoMode) {
      showToast(t.toast.lotRemovedDemo, 'success');
      return;
    }

    fetch(`/api/kanban?id=${encodeURIComponent(itemId)}`, { method: 'DELETE' })
      .then(async res => {
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Ошибка сервера при удалении');
        }
        showToast(t.toast.lotRemovedSuccess, 'success');
      })
      .catch((err) => {
        setKanbanItems(previousItems);
        showToast(t.toast.lotRemovedError.replace('{err}', err.message || 'Восстановлен'), 'error');
      });
  };

  const handleSendToTelegram = async (tender: Tender) => {
    try {
      const res = await fetch('/api/telegram/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenderId: tender.id })
      });
      const result = await res.json();

      if (result.success) {
        showToast(t.toast.telegramSent.replace('{id}', String(tender.externalId)));
      } else if (result.skipped) {
        showToast(t.toast.telegramNotConfigured, 'error');
      } else {
        showToast(t.toast.telegramError.replace('{err}', result.message || 'ошибка сервера'), 'error');
      }
    } catch {
      showToast(t.toast.telegramError.replace('{err}', 'ошибка сети'), 'error');
    }
  };

  // Export Tenders Catalog to Excel
  const handleExportTendersExcel = async () => {
    if (!['TEAM', 'ENTERPRISE'].includes(userTariff.toUpperCase())) {
      showToast('Экспорт каталога тендеров в Excel доступен с тарифа Team', 'error');
      setActiveTab('billing');
      return;
    }

    try {
      const res = await fetch('/api/export/tenders', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Plan': userTariff
        },
        body: JSON.stringify({
          region: selectedRegion,
          category: selectedCategory,
          source: selectedSource,
          searchQuery,
          minAmount,
          maxAmount
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403) {
          showToast('Экспорт в Excel доступен только на тарифах Team и Enterprise', 'error');
          setActiveTab('billing');
          return;
        }
        throw new Error(errData.message || 'Ошибка выгрузки Excel');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tenders_catalog_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Файл Excel с каталогом тендеров успешно скачан!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Сбой выгрузки Excel', 'error');
    }
  };

  // Export Kanban Funnel Cards to Excel
  const handleExportKanbanExcel = async () => {
    if (!['TEAM', 'ENTERPRISE'].includes(userTariff.toUpperCase())) {
      showToast('Экспорт воронки Kanban в Excel доступен с тарифа Team', 'error');
      setActiveTab('billing');
      return;
    }

    try {
      const res = await fetch('/api/export/kanban', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Plan': userTariff
        }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403) {
          showToast('Экспорт Kanban доступен только на тарифах Team и Enterprise', 'error');
          setActiveTab('billing');
          return;
        }
        throw new Error(errData.message || 'Ошибка выгрузки Kanban');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kanban_funnel_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('Файл Excel воронки Kanban успешно скачан!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Сбой выгрузки Kanban', 'error');
    }
  };

  // Export Single Tender Card to PDF
  const handleExportTenderPDF = async (tenderId: string, externalId: string) => {
    if (!['TEAM', 'ENTERPRISE'].includes(userTariff.toUpperCase())) {
      showToast('Скачивание PDF-отчета по лоту доступно с тарифа Team', 'error');
      setActiveTab('billing');
      return;
    }

    try {
      const res = await fetch(`/api/export/tenders/${encodeURIComponent(tenderId)}/pdf`, {
        headers: {
          'X-User-Plan': userTariff
        }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403) {
          showToast('PDF-отчет доступен только на тарифах Team и Enterprise', 'error');
          setActiveTab('billing');
          return;
        }
        throw new Error(errData.message || 'Ошибка генерации PDF');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tender_report_${externalId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('PDF-отчет лота успешно скачан!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Сбой скачивания PDF', 'error');
    }
  };

  const matchedTenders = useMemo(() => {
    return AIClientService.matchCompanyProfile(companyProfile, tenders);
  }, [companyProfile, tenders]);

  const filteredTenders = useMemo(() => {
    let list = tenders;

    if (minAmount) {
      list = list.filter(t => t.amount >= parseFloat(minAmount));
    }
    if (maxAmount) {
      list = list.filter(t => t.amount <= parseFloat(maxAmount));
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'amount_desc') return b.amount - a.amount;
      if (sortBy === 'risk_asc') return a.riskScore - b.riskScore;
      if (sortBy === 'match_desc') return (b.matchPercentage || 0) - (a.matchPercentage || 0);
      return new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime();
    });
  }, [tenders, minAmount, maxAmount, sortBy]);

  const totalVolumeKzt = useMemo(() => tenders.reduce((acc, t) => acc + t.amount, 0), [tenders]);

  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(false);

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink font-geist">
      {isDemoMode && (
        <div className="bg-amber-500 text-white text-xs font-bold py-2.5 px-4 text-center flex items-center justify-center space-x-3 shadow-sm z-50 sticky top-0">
          <span>💡 Это демонстрационная версия TenderAI. Данные не сохраняются в БД.</span>
          <button 
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/';
              }
            }} 
            className="px-2.5 py-1 bg-white text-amber-900 rounded-md font-extrabold hover:bg-amber-50 transition-colors shadow-subtle text-[11px]"
          >
            Зарегистрироваться / Войти
          </button>
        </div>
      )}
      <Navigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        language={language}
        setLanguage={setLanguage}
        kanbanCount={kanbanItems.length}
        onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
      />

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl font-medium text-xs shadow-elevated border flex items-center space-x-2 animate-bounce ${
          toast.type === 'error'
            ? 'bg-red-900 text-red-100 border-red-700'
            : 'bg-ink text-paper border-hairline'
        }`}>
          {toast.type === 'error' ? (
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0 animate-ping" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {activeTab === 'catalog' && (
          <div className="space-y-8 animate-fadeIn">
            <div className="bg-paper border border-hairline rounded-3xl p-6 md:p-8 space-y-6 relative overflow-hidden shadow-subtle">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight">
                    {t.hero.title}
                  </h1>
                  <p className="text-xs md:text-sm text-mid-gray mt-1 max-w-2xl leading-relaxed">
                    {t.hero.subtitle}
                  </p>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <div className="p-3 rounded-2xl bg-surface-alt border border-hairline text-right">
                    <span className="text-[10px] text-mid-gray block uppercase font-bold tracking-wider">{t.hero.activeLots}</span>
                    <span className="text-base font-bold text-ink font-mono">{tenders.length}</span>
                  </div>

                  <div className="p-3 rounded-2xl bg-surface-alt border border-hairline text-right">
                    <span className="text-[10px] text-mid-gray block uppercase font-bold tracking-wider">{t.hero.totalVolume}</span>
                    <span className="text-base font-bold text-ink font-mono">
                      {(totalVolumeKzt / 1000000).toFixed(1)} {t.hero.million} ₸
                    </span>
                  </div>
                </div>
              </div>

              {/* Natural Language AI Search Box */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Sparkles className="w-4 h-4 text-ember animate-pulse" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.hero.searchPlaceholder}
                  className="w-full pl-11 pr-28 py-3.5 bg-surface-alt border border-hairline rounded-2xl text-xs sm:text-sm text-ink placeholder-mid-gray focus:outline-none focus:border-ink shadow-subtle transition-all"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-ink text-paper text-xs font-semibold flex items-center space-x-1 shadow-subtle">
                  <span>{t.hero.searchButton}</span>
                </div>
              </div>

              {/* Filter Controls Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-2">
                <div>
                  <label className="text-[10px] text-mid-gray uppercase font-semibold tracking-wider block mb-1">{t.hero.regionLabel}</label>
                  <select
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value)}
                    className="w-full bg-surface-alt border border-hairline rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-ink transition-all shadow-subtle"
                  >
                    {KZ_REGIONS.map(reg => (
                      <option key={reg} value={reg}>{reg}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-mid-gray uppercase font-semibold tracking-wider block mb-1">{t.hero.categoryLabel}</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full bg-surface-alt border border-hairline rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-ink transition-all shadow-subtle"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-mid-gray uppercase font-semibold tracking-wider block mb-1">{t.hero.sourceLabel}</label>
                  <select
                    value={selectedSource}
                    onChange={(e) => setSelectedSource(e.target.value as any)}
                    className="w-full bg-surface-alt border border-hairline rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-ink transition-all shadow-subtle"
                  >
                    <option value="ALL">{t.hero.allSources}</option>
                    <option value="GOSZAKUP">goszakup.gov.kz</option>
                    <option value="SAMRUK_KAZYNA">portal.sk.kz (Самрук)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-mid-gray uppercase font-semibold tracking-wider block mb-1">{t.hero.sortLabel}</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full bg-surface-alt border border-hairline rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-ink transition-all shadow-subtle"
                  >
                    <option value="date">{t.hero.sortByDate}</option>
                    <option value="amount_desc">{t.hero.sortByAmountDesc}</option>
                    <option value="risk_asc">{t.hero.sortByRiskAsc}</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedRegion('Все регионы');
                      setSelectedCategory('Все категории');
                      setSelectedSource('ALL');
                      setMinAmount('');
                      setMaxAmount('');
                      setSortBy('date');
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-surface-alt hover:bg-paper border border-hairline text-xs font-semibold text-ink-soft transition-colors shadow-subtle flex items-center justify-center space-x-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-mid-gray" />
                    <span>{t.hero.resetFilters}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Results Grid */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-ink tracking-tight flex items-center space-x-3">
                  <span>{t.hero.foundTenders} <span className="text-ember">{filteredTenders.length}</span></span>
                </h2>
                
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleExportTendersExcel}
                    className="px-3.5 py-1.5 rounded-xl bg-paper hover:bg-surface-alt border border-hairline text-ink font-semibold text-xs flex items-center space-x-1.5 transition-all shadow-subtle"
                    title="Скачать отфильтрованный реестр тендеров в формате Excel"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Скачать Excel</span>
                    {!['TEAM', 'ENTERPRISE'].includes(userTariff.toUpperCase()) && (
                      <span className="ml-1 px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">
                        Team
                      </span>
                    )}
                  </button>

                  <span className="text-xs text-mid-gray hidden sm:inline">
                    {t.hero.updatedByApi}
                  </span>
                </div>
              </div>

              {loading ? (
                <div className="bg-paper border border-hairline rounded-3xl p-12 text-center text-xs font-mono text-mid-gray animate-pulse shadow-subtle">
                  {t.hero.loadingTenders}
                </div>
              ) : filteredTenders.length === 0 ? (
                <div className="bg-paper border border-hairline rounded-3xl p-12 text-center space-y-3 shadow-subtle">
                  <Search className="w-10 h-10 text-mid-gray mx-auto" />
                  <h3 className="text-base font-semibold text-ink">{t.hero.noTendersFound}</h3>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredTenders.map((tender) => (
                    <TenderCard
                      key={tender.id}
                      tender={tender}
                      onOpenDetails={(t) => setSelectedTender(t)}
                      onAddToKanban={handleAddToKanban}
                      onSendToTelegram={handleSendToTelegram}
                      isInKanban={kanbanItems.some(k => k.tenderId === tender.id)}
                      language={language}
                      dataSources={dataSources}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'matching' && (
          <div className="space-y-8 animate-fadeIn">
            <CompanyProfileModal
              profile={companyProfile}
              onSaveProfile={setCompanyProfile}
              onRunMatching={() => showToast(t.toast.matchingRecalculated)}
              language={language}
            />

            <div className="space-y-4">
              <h2 className="text-base font-bold text-ink flex items-center space-x-2 tracking-tight">
                <Sparkles className="w-4 h-4 text-ember" />
                <span>{t.hero.matchedTitle} "{companyProfile.companyName}"</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {matchedTenders.map((tender) => (
                  <TenderCard
                    key={tender.id}
                    tender={tender}
                    onOpenDetails={(t) => setSelectedTender(t)}
                    onAddToKanban={handleAddToKanban}
                    onSendToTelegram={handleSendToTelegram}
                    isInKanban={kanbanItems.some(k => k.tenderId === tender.id)}
                    language={language}
                    dataSources={dataSources}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'kanban' && (
          <KanbanBoard
            items={kanbanItems}
            onUpdateStage={handleUpdateKanbanStage}
            onUpdateCard={handleUpdateKanbanCard}
            onRemoveItem={handleRemoveKanbanItem}
            onOpenTenderDetails={(t) => setSelectedTender(t)}
            onExportExcel={handleExportKanbanExcel}
            userPlan={userTariff}
            dataSources={dataSources}
            language={language}
          />
        )}

        {activeTab === 'admin' && (
          <AdminPanel
            sources={dataSources}
            onTriggerSync={(srcId) => showToast(`Запущен синк источника...`)}
            onAddNewTenders={(newItems) => {
              setTenders(prev => [...newItems, ...prev]);
              showToast(t.toast.newLotsImported.replace('{count}', String(newItems.length)));
            }}
          />
        )}
      </main>

      {selectedTender && (
        <TenderDetailModal
          tender={selectedTender}
          onClose={() => setSelectedTender(null)}
          onAddToKanban={handleAddToKanban}
          isInKanban={kanbanItems.some(k => k.tenderId === selectedTender.id)}
          onExportPDF={handleExportTenderPDF}
          userPlan={userTariff}
          dataSources={dataSources}
          language={language}
        />
      )}

      {activeTab === 'billing' && (
        <BillingModal onClose={() => setActiveTab('catalog')} />
      )}

      {activeTab === 'telegram' && (
        <TelegramBotModal
          telegramChatId={companyProfile.telegramChatId}
          onClose={() => setActiveTab('catalog')}
          profile={companyProfile}
          tenders={tenders}
        />
      )}

      {isApiKeyModalOpen && (
        <ApiKeyModal
          onClose={() => setIsApiKeyModalOpen(false)}
          userPlan={userTariff}
          language={language}
        />
      )}

      <footer className="mt-auto border-t border-hairline bg-paper py-6 text-center text-xs text-mid-gray">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            {t.footer.rights}
          </div>
          <div className="flex items-center space-x-4">
            <span>goszakup.gov.kz API</span>
            <span>&bull;</span>
            <span>portal.sk.kz API</span>
            <span>&bull;</span>
            <span>Kaspi Pay Integration</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

