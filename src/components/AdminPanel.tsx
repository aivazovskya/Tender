'use client';

import React, { useState, useEffect } from 'react';
import { DataSourceStatus } from '../lib/types/tender';
import { ScraperConfigModal } from './ScraperConfigModal';
import { ApiSourceModal } from './ApiSourceModal';
import { 
  Activity, 
  RefreshCw, 
  Clock,
  Plus,
  Sliders,
  AlertTriangle,
  Cpu,
  Users,
  UserCheck,
  UserX,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Loader2
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
  const [adminTab, setAdminTab] = useState<'sources' | 'users'>('sources');
  const [logs, setLogs] = useState<Array<{ id: string; time: string; source: string; status: string; msg: string }>>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState<boolean>(false);
  const [liveSources, setLiveSources] = useState<any[]>(sources || []);
  const [isScraperModalOpen, setIsScraperModalOpen] = useState<boolean>(false);
  const [isApiModalOpen, setIsApiModalOpen] = useState<boolean>(false);
  const [selectedScraperConfig, setSelectedScraperConfig] = useState<any>(null);
  const [registeredApiSources, setRegisteredApiSources] = useState<string[]>(['GOSZAKUP', 'SAMRUK_KAZYNA']);

  // Pending Users State
  const [pendingUsers, setPendingUsers] = useState<Array<{ id: string; email: string; name?: string; createdAt: string }>>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [metrics, setMetrics] = useState<{ totalTendersCount: number; aiTokens24h: number; maxAiTokensQuota: number }>({
    totalTendersCount: 24900,
    aiTokens24h: 148250,
    maxAiTokensQuota: 500000
  });

  const [healthMetrics, setHealthMetrics] = useState<any[]>([]);

  const loadSources = () => {
    fetch('/api/admin/sources')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (Array.isArray(data.healthMetrics)) {
            setHealthMetrics(data.healthMetrics);
          }
          if (Array.isArray(data.registeredApiSources) && data.registeredApiSources.length > 0) {
            setRegisteredApiSources(data.registeredApiSources);
          }
          if (Array.isArray(data.sources) && data.sources.length > 0) {
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
        }
      })
      .catch(() => {});
  };

  const loadPendingUsers = () => {
    setLoadingUsers(true);
    fetch('/api/admin/users/pending')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.users)) {
          setPendingUsers(data.users);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
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
    loadPendingUsers();
  }, []);

  const handleApproveUser = async (userId: string, email: string) => {
    setProcessingUserId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/approve`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setPendingUsers(prev => prev.filter(u => u.id !== userId));
        setActionFeedback({ msg: `Пользователь ${email} успешно одобрен!`, type: 'success' });
      } else {
        setActionFeedback({ msg: data.message || 'Ошибка одобрения пользователя', type: 'error' });
      }
    } catch (err: any) {
      setActionFeedback({ msg: 'Сетевая ошибка при одобрении', type: 'error' });
    } finally {
      setProcessingUserId(null);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

  const handleRejectUser = async (userId: string, email: string) => {
    if (!confirm(`Отклонить заявку пользователя ${email}?`)) return;
    setProcessingUserId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reject`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setPendingUsers(prev => prev.filter(u => u.id !== userId));
        setActionFeedback({ msg: `Заявка ${email} отклонена`, type: 'success' });
      } else {
        setActionFeedback({ msg: data.message || 'Ошибка отклонения заявки', type: 'error' });
      }
    } catch (err: any) {
      setActionFeedback({ msg: 'Сетевая ошибка при отклонении', type: 'error' });
    } finally {
      setProcessingUserId(null);
      setTimeout(() => setActionFeedback(null), 4000);
    }
  };

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
            <span>Панель управления администратора</span>
            {isFallback && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-semibold">
                Демо-данные
              </span>
            )}
          </h2>
          <p className="text-xs text-mid-gray mt-1">
            Управление пользователями, премодерация регистрации, мониторинг скраперов и расхода токенов.
          </p>
        </div>

        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          {adminTab === 'sources' && (
            <>
              <button
                onClick={() => setIsApiModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-surface-alt hover:bg-paper border border-hairline text-ink font-semibold text-xs flex items-center space-x-1.5 shadow-subtle transition-all"
              >
                <Cpu className="w-4 h-4 text-ink" />
                <span>+ API-источник</span>
              </button>

              <button
                onClick={handleOpenAddScraperModal}
                className="px-3.5 py-2 rounded-xl bg-ink hover:bg-ink-soft text-paper font-semibold text-xs flex items-center space-x-1.5 shadow-subtle transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>+ Scraper-источник</span>
              </button>
            </>
          )}

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

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div className={`p-4 rounded-xl border text-xs font-semibold flex items-center space-x-2 animate-fadeIn ${
          actionFeedback.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {actionFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{actionFeedback.msg}</span>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center space-x-2 border-b border-hairline pb-2">
        <button
          onClick={() => setAdminTab('sources')}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 ${
            adminTab === 'sources'
              ? 'bg-ink text-paper shadow-subtle'
              : 'bg-surface-alt hover:bg-paper text-ink border border-hairline'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Источники данных & Скраперы</span>
        </button>

        <button
          onClick={() => { setAdminTab('users'); loadPendingUsers(); }}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 ${
            adminTab === 'users'
              ? 'bg-ink text-paper shadow-subtle'
              : 'bg-surface-alt hover:bg-paper text-ink border border-hairline'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Заявки на регистрацию</span>
          {pendingUsers.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              adminTab === 'users' ? 'bg-amber-400 text-ink' : 'bg-amber-500 text-paper'
            }`}>
              {pendingUsers.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: USERS MODERATION */}
      {adminTab === 'users' && (
        <div className="bg-paper border border-hairline rounded-2xl p-6 space-y-4 shadow-subtle">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink flex items-center space-x-2">
                <Users className="w-4 h-4 text-ink" />
                <span>Заявки пользователей на доступ (Премодерация)</span>
              </h3>
              <p className="text-xs text-mid-gray mt-0.5">
                Новые пользователи не имеют доступа к системе, пока администратор не одобрит их заявку.
              </p>
            </div>

            <button
              onClick={loadPendingUsers}
              disabled={loadingUsers}
              className="p-2 rounded-xl bg-surface-alt hover:bg-paper border border-hairline text-ink transition-colors shadow-subtle"
              title="Обновить список заявок"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingUsers ? (
            <div className="p-8 text-center text-xs text-mid-gray space-y-2 font-mono">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-ink" />
              <p>Загрузка списка заявок...</p>
            </div>
          ) : pendingUsers.length === 0 ? (
            <div className="p-8 text-center space-y-2 bg-surface-alt border border-hairline rounded-xl">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <p className="text-xs font-semibold text-ink">Нет ожидающих заявок</p>
              <p className="text-[11px] text-mid-gray">Все зарегистрированные пользователи уже обработаны.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-hairline bg-surface-alt text-mid-gray font-semibold">
                    <th className="py-2.5 px-4">Email пользователя</th>
                    <th className="py-2.5 px-4">Имя / Организация</th>
                    <th className="py-2.5 px-4">Дата регистрации</th>
                    <th className="py-2.5 px-4">Статус</th>
                    <th className="py-2.5 px-4 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {pendingUsers.map(u => (
                    <tr key={u.id} className="hover:bg-surface-alt/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-ink">{u.email}</td>
                      <td className="py-3 px-4 text-ink-soft">{u.name || '—'}</td>
                      <td className="py-3 px-4 text-mid-gray">
                        {new Date(u.createdAt).toLocaleString('ru-RU')}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          PENDING
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleApproveUser(u.id, u.email)}
                          disabled={processingUserId === u.id}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] inline-flex items-center space-x-1 transition-all shadow-subtle disabled:opacity-50"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Одобрить</span>
                        </button>
                        <button
                          onClick={() => handleRejectUser(u.id, u.email)}
                          disabled={processingUserId === u.id}
                          className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-[11px] inline-flex items-center space-x-1 transition-all shadow-subtle disabled:opacity-50"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>Отклонить</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DATA SOURCES & INGESTION (Original Tab Content) */}
      {adminTab === 'sources' && (
        <>
          {/* Health & Heartbeat Status Banner */}
          {healthMetrics.length > 0 && (
            <div className="bg-paper border border-hairline rounded-2xl p-5 space-y-3 shadow-subtle">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-ink flex items-center space-x-2 tracking-tight">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  <span>Здоровье коннекторов и Heartbeat скраперов</span>
                </h3>
                <span className="text-[11px] text-mid-gray">Мониторинг тишины (&gt;6ч) и ошибок воркера</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {healthMetrics.map((hm: any) => {
                  const statusColor = hm.status === 'HEALTHY' 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                    : hm.status === 'WARNING' 
                      ? 'bg-amber-50 border-amber-200 text-amber-900' 
                      : 'bg-rose-50 border-rose-200 text-rose-900';
                  const dotColor = hm.status === 'HEALTHY' ? 'bg-emerald-500' : hm.status === 'WARNING' ? 'bg-amber-500' : 'bg-rose-500';

                  return (
                    <div key={hm.sourceName || hm.id} className={`p-3.5 rounded-xl border ${statusColor} space-y-1.5`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs flex items-center space-x-1.5">
                          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                          <span>{hm.sourceName}</span>
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-paper/60 border border-hairline uppercase">
                          {hm.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-ink-soft space-y-0.5">
                        <div className="flex justify-between">
                          <span className="text-mid-gray">Успешно:</span>
                          <span className="font-mono">{new Date(hm.lastSuccessAt).toLocaleTimeString('ru-RU')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-mid-gray">Внесено (24ч):</span>
                          <span className="font-mono">{hm.ingestedCount24h} лотов</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sources List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveSources.map((source) => (
              <div 
                key={source.id}
                className="bg-paper border border-hairline rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-mid-gray/40 transition-all shadow-subtle"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="px-2.5 py-0.5 text-xs font-mono font-medium rounded-md bg-surface-alt text-ink border border-hairline">
                      {source.adapterType || 'REST_API'}
                    </span>
                    <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border ${
                      source.isActive 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : 'bg-surface-alt text-mid-gray border-hairline'
                    }`}>
                      {source.isActive ? 'АКТИВЕН' : 'ОТКЛЮЧЕН'}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-ink leading-snug tracking-tight">
                    {source.displayName || source.name}
                  </h3>
                </div>

                <div className="pt-3 border-t border-hairline flex items-center justify-between">
                  <span className="text-[11px] text-mid-gray">
                    Интервал: {source.checkIntervalMins || 15} мин
                  </span>

                  <div className="flex items-center space-x-2">
                    {source.scraperConfig && (
                      <button
                        onClick={() => handleOpenEditScraperModal(source)}
                        className="p-1.5 rounded-lg bg-surface-alt hover:bg-paper border border-hairline text-ink transition-colors shadow-subtle"
                        title="Настройки скрапера"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleManualSync(source)}
                      disabled={syncingId === source.id}
                      className="px-3 py-1.5 rounded-lg bg-ink hover:bg-ink-soft text-paper text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-subtle disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncingId === source.id ? 'animate-spin' : ''}`} />
                      <span>{syncingId === source.id ? 'Синк...' : 'Синхронизировать'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* System Logs Banner */}
          <div className="bg-paper border border-hairline rounded-2xl p-5 space-y-3 shadow-subtle">
            <h3 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center space-x-2">
              <Clock className="w-4 h-4 text-ink" />
              <span>Системный журнал задач парсинга</span>
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
        </>
      )}

      {/* Scraper Config Modal */}
      <ScraperConfigModal
        isOpen={isScraperModalOpen}
        onClose={() => setIsScraperModalOpen(false)}
        onSaved={loadSources}
        initialConfig={selectedScraperConfig}
      />

      {/* API Source Modal */}
      <ApiSourceModal
        isOpen={isApiModalOpen}
        onClose={() => setIsApiModalOpen(false)}
        onSaved={loadSources}
        registeredApiSources={registeredApiSources}
      />

    </div>
  );
};
