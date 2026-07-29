'use client';

import React, { useState, useEffect } from 'react';
import { DataSourceStatus } from '../lib/types/tender';
import { ScraperConfigModal } from './ScraperConfigModal';
import { 
  Activity, 
  RefreshCw, 
  Clock,
  Plus,
  Sliders,
  AlertTriangle
} from 'lucide-react';

interface AdminPanelProps {
  sources: DataSourceStatus[];
  onTriggerSync: (sourceId: string) => void;
  onAddNewTenders: (newTenders: any[]) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  sources,
  onTriggerSync,
  onAddNewTenders
}) => {
  const [logs, setLogs] = useState<Array<{ id: string; time: string; source: string; status: string; msg: string }>>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState<boolean>(false);
  const [liveSources, setLiveSources] = useState<any[]>(sources || []);
  const [isScraperModalOpen, setIsScraperModalOpen] = useState<boolean>(false);
  const [selectedScraperConfig, setSelectedScraperConfig] = useState<any>(null);

  const [metrics, setMetrics] = useState<{ totalTendersCount: number; aiTokens24h: number; maxAiTokensQuota: number }>({
    totalTendersCount: 24900,
    aiTokens24h: 148250,
    maxAiTokensQuota: 500000
  });

  const loadSources = () => {
    fetch('/api/admin/sources')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.sources) && data.sources.length > 0) {
          setLiveSources(data.sources.map((s: any) => ({
            id: s.id,
            name: s.name,
            displayName: s.displayName,
            adapterType: s.adapterType,
            isActive: s.isActive,
            checkIntervalMins: s.checkIntervalMins,
            lastSyncAt: s.lastSyncAt ? new Date(s.lastSyncAt).toISOString() : undefined,
            healthStatus: s.healthStatus,
            successRate24h: s.successRate24h ?? 100.0,
            totalIngested: s.totalIngested ?? 0,
            scraperConfig: s.scraperConfig
          })));
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetch('/api/admin/metrics')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.metrics) {
          setIsFallback(Boolean(data.isFallback));
          setMetrics({
            totalTendersCount: data.metrics.totalTendersCount ?? 24900,
            aiTokens24h: data.metrics.aiTokens24h ?? 0,
            maxAiTokensQuota: data.metrics.aiTokensLimit24h ?? data.metrics.maxAiTokensQuota ?? 500000
          });
          if (data.metrics.logs) {
            setLogs(data.metrics.logs.map((l: any) => ({
              id: l.id,
              time: l.timestamp ? new Date(l.timestamp).toLocaleTimeString('ru-RU') : (l.time || new Date().toLocaleTimeString('ru-RU')),
              source: l.sourceName || l.source || 'Система',
              status: l.status || 'SUCCESS',
              msg: l.message || l.msg || ''
            })));
          }
        }
      })
      .catch(() => {});

    loadSources();
  }, []);

  const handleManualSync = async (source: any) => {
    setSyncingId(source.id);
    onTriggerSync(source.id);

    try {
      const response = await fetch('/api/ingestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: source.name }),
      });
      const data = await response.json();

      if (data.success && data.result) {
        onAddNewTenders(data.result.tenders || []);
        setLogs(prev => [
          { 
            id: `l-${Date.now()}`, 
            time: new Date().toLocaleTimeString('ru-RU'), 
            source: source.name, 
            status: data.result.status, 
            msg: data.result.message 
          },
          ...prev
        ]);
        loadSources();
      }
    } catch (err: any) {
      setLogs(prev => [
        { 
          id: `l-${Date.now()}`, 
          time: new Date().toLocaleTimeString('ru-RU'), 
          source: source.name, 
          status: 'ERROR', 
          msg: `Сбой выполнения: ${err?.message || 'Сетевая ошибка'}` 
        },
        ...prev
      ]);
    } finally {
      setSyncingId(null);
    }
  };

  const handleOpenAddScraperModal = () => {
    setSelectedScraperConfig(null);
    setIsScraperModalOpen(true);
  };

  const handleOpenEditScraperModal = (src: any) => {
    if (src.scraperConfig) {
      setSelectedScraperConfig({
        ...src.scraperConfig,
        dataSource: src
      });
      setIsScraperModalOpen(true);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Header Metrics Banner */}
      <div className="bg-paper border border-hairline rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-subtle">
        <div>
          <h2 className="text-lg font-bold text-ink flex items-center space-x-2 flex-wrap gap-2 tracking-tight">
            <Activity className="w-5 h-5 text-ink" />
            <span>Административная панель (Ingestion Monitoring)</span>
            {isFallback && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">
                Демо-данные
              </span>
            )}
          </h2>
          <p className="text-xs text-mid-gray mt-1">
            Мониторинг фоновых задач парсинга, веб-сервисов ЕГСЗ РК и расхода ИИ-токенов.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleOpenAddScraperModal}
            className="px-4 py-2 rounded-xl bg-ink hover:bg-ink-soft text-paper font-semibold text-xs flex items-center space-x-2 shadow-subtle transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>+ Scraper-источник</span>
          </button>

          <div className="p-3 rounded-xl bg-surface-alt border border-hairline text-right">
            <span className="text-[10px] text-mid-gray block uppercase tracking-wider font-semibold">ИИ-Токены (24ч)</span>
            <span className="text-sm font-bold text-ink font-mono">
              {(metrics.aiTokens24h ?? 0).toLocaleString('ru-RU')}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-surface-alt border border-hairline text-right">
            <span className="text-[10px] text-mid-gray block uppercase tracking-wider font-semibold">Всего в БД</span>
            <span className="text-sm font-bold text-ink font-mono">
              {(metrics.totalTendersCount ?? 0).toLocaleString('ru-RU')}
            </span>
          </div>
        </div>
      </div>

      {/* Sources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(liveSources.length > 0 ? liveSources : sources).map((src: any) => (
          <div key={src.id} className="bg-paper rounded-2xl p-5 border border-hairline space-y-4 relative shadow-subtle hover:border-mid-gray/40 transition-all">
            
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    src.healthStatus === 'HEALTHY' ? 'bg-emerald-500' :
                    src.healthStatus === 'DEGRADED' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  <h3 className="text-base font-bold text-ink tracking-tight">{src.displayName}</h3>
                </div>
                <p className="text-xs text-mid-gray mt-1">
                  Тип адаптера: <span className="font-semibold text-ink-soft">{src.adapterType === 'API' ? 'Официальный API' : 'Scraper Adapter'}</span> &bull; Интервал: {src.checkIntervalMins} мин
                </p>
              </div>

              <div className="flex items-center space-x-2">
                {src.adapterType === 'SCRAPER' && (
                  <button
                    onClick={() => handleOpenEditScraperModal(src)}
                    className="p-1.5 rounded-xl bg-surface-alt hover:bg-paper border border-hairline text-ink text-xs font-semibold transition-all shadow-subtle"
                    title="Настроить конфигурацию скрапера"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  onClick={() => handleManualSync(src)}
                  disabled={syncingId === src.id}
                  className="px-3 py-1.5 rounded-xl bg-surface-alt hover:bg-paper border border-hairline text-ink text-xs font-semibold flex items-center space-x-1.5 transition-all disabled:opacity-50 shadow-subtle"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingId === src.id ? 'animate-spin' : ''}`} />
                  <span>Синк</span>
                </button>
              </div>
            </div>

            {src.healthStatus === 'DEGRADED' && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-center space-x-2 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>Предупреждение: возможна деградация верстки сайта</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-surface-alt border border-hairline text-center text-xs">
              <div>
                <span className="text-mid-gray block text-[10px]">Аптайм 24ч</span>
                <span className="font-bold text-ink font-mono">{src.successRate24h}%</span>
              </div>
              <div>
                <span className="text-mid-gray block text-[10px]">Импортировано</span>
                <span className="font-bold text-ink font-mono">{src.totalIngested?.toLocaleString('ru-RU')}</span>
              </div>
              <div>
                <span className="text-mid-gray block text-[10px]">Статус</span>
                <span className="font-bold text-ink">{src.healthStatus}</span>
              </div>
            </div>

          </div>
        ))}
      </div>

      {/* System Logs Stream */}
      <div className="bg-paper rounded-2xl p-5 border border-hairline space-y-3 shadow-subtle">
        <h3 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center space-x-2">
          <Clock className="w-4 h-4 text-mid-gray" />
          <span>Лог событий и алертов коннекторов</span>
        </h3>

        <div className="space-y-2 font-mono text-xs max-h-48 overflow-y-auto p-3 rounded-xl bg-surface-alt border border-hairline">
          {logs.map((log) => (
            <div key={log.id} className="flex items-center space-x-3 text-ink-soft border-b border-hairline pb-1.5">
              <span className="text-mid-gray">[{log.time}]</span>
              <span className="text-ink font-bold">[{log.source}]</span>
              <span className={log.status === 'SUCCESS' ? 'text-emerald-700' : 'text-amber-700'}>[{log.status}]</span>
              <span className="text-ink">{log.msg}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Scraper Config Modal */}
      <ScraperConfigModal
        isOpen={isScraperModalOpen}
        onClose={() => setIsScraperModalOpen(false)}
        onSaved={loadSources}
        initialConfig={selectedScraperConfig}
      />

    </div>
  );
};

