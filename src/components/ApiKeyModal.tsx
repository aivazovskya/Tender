import React, { useState, useEffect } from 'react';
import { 
  Key, 
  X, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  Clock, 
  ExternalLink,
  Code2
} from 'lucide-react';

interface StoredApiKeyData {
  id: string;
  keyPrefix: string;
  label: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface ApiKeyModalProps {
  onClose: () => void;
  userPlan?: string;
  language?: 'RU' | 'KK';
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  onClose,
  language = 'RU'
}) => {
  const [keys, setKeys] = useState<StoredApiKeyData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [newLabel, setNewLabel] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch user keys
  const fetchKeys = () => {
    setLoading(true);
    fetch('/api/api-keys')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.keys)) {
          setKeys(data.keys);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreateKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;

    setErrorMsg(null);
    fetch('/api/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel.trim() })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.rawKey) {
          setCreatedRawKey(data.rawKey);
          setNewLabel('');
          setIsCreating(false);
          fetchKeys();
        } else {
          setErrorMsg(data.error || 'Ошибка при создании ключа');
        }
      })
      .catch(() => setErrorMsg('Ошибка сети при создании ключа'));
  };

  const handleRevokeKey = (keyId: string) => {
    if (!confirm('Вы уверены, что хотите отозвать этот API-ключ? Все внешние системы (1С/CRM), использующие его, мгновенно потеряют доступ.')) {
      return;
    }

    fetch(`/api/api-keys?id=${encodeURIComponent(keyId)}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          fetchKeys();
        }
      })
      .catch(() => {});
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-paper border border-hairline rounded-3xl max-w-2xl w-full overflow-hidden shadow-elevated flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-hairline bg-surface-alt flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-ink tracking-tight flex items-center space-x-2">
                <span>Управление API-ключами REST API</span>
              </h2>
              <p className="text-xs text-mid-gray mt-0.5">
                Ключи доступа для внешней интеграции с 1С, CRM и корпоративными ERP системами
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-mid-gray hover:text-ink hover:bg-paper transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">

          {/* Newly Created Secret Key Alert */}
          {createdRawKey && (
            <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
              <div className="flex items-center justify-between text-emerald-900 text-xs font-bold">
                <div className="flex items-center space-x-2">
                  <Key className="w-4 h-4 text-emerald-600" />
                  <span>API-ключ успешно создан!</span>
                </div>
                <span className="text-[10px] text-emerald-700 uppercase font-mono">Сохраните сейчас</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-paper border border-emerald-500/20 font-mono text-xs text-ink select-all">
                <span className="break-all font-semibold text-emerald-800">{createdRawKey}</span>
                <button
                  onClick={() => copyToClipboard(createdRawKey)}
                  className="ml-3 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-sans text-xs font-semibold flex items-center space-x-1 shrink-0 transition-colors shadow-subtle"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Скопировано!' : 'Скопировать'}</span>
                </button>
              </div>

              <p className="text-[11px] text-emerald-800 leading-relaxed">
                ⚠️ <strong>Внимание:</strong> Из соображений безопасности полный секретный ключ показывается <strong>только один раз</strong>. Скопируйте и сохраните его в надежном месте.
              </p>

              <button
                onClick={() => setCreatedRawKey(null)}
                className="text-xs font-bold text-emerald-700 hover:underline"
              >
                Понятно, я сохранил ключ &rarr;
              </button>
            </div>
          )}

          {/* Create Key Button / Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-mid-gray">Ваши API-ключи</h3>
            {!isCreating && (
              <button
                onClick={() => setIsCreating(true)}
                className="px-3.5 py-2 rounded-xl bg-ink hover:bg-ink-soft text-paper font-semibold text-xs flex items-center space-x-1.5 transition-all shadow-subtle"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Создать новый API-ключ</span>
              </button>
            )}
          </div>

          {/* Inline Create Form */}
          {isCreating && (
            <form onSubmit={handleCreateKey} className="p-4 rounded-2xl bg-surface-alt border border-hairline space-y-3">
              <label className="block text-xs font-bold text-ink">Название / Назначение ключа</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Например: Интеграция с 1С:Управление торговлей или CRM Битрикс24"
                className="w-full px-3 py-2 bg-paper border border-hairline rounded-xl text-xs text-ink focus:outline-none focus:border-ink transition-all shadow-subtle"
                required
              />
              {errorMsg && <p className="text-xs font-bold text-red-600">{errorMsg}</p>}
              <div className="flex items-center space-x-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-mid-gray hover:bg-paper"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-ink text-paper text-xs font-semibold hover:bg-ink-soft shadow-subtle"
                >
                  Сгенерировать ключ
                </button>
              </div>
            </form>
          )}

          {/* Keys List */}
          {loading ? (
            <div className="p-8 text-center text-xs font-mono text-mid-gray animate-pulse">
              Загрузка ключей API...
            </div>
          ) : keys.length === 0 ? (
            <div className="p-8 text-center space-y-2 bg-surface-alt rounded-2xl border border-hairline">
              <Code2 className="w-8 h-8 text-mid-gray mx-auto" />
              <p className="text-xs font-semibold text-ink">API-ключи еще не созданы</p>
              <p className="text-[11px] text-mid-gray">Создайте ваш первый ключ для подключения 1С или CRM через REST API v1</p>
            </div>
          ) : (
            <div className="space-y-3">
              {keys.map((k) => (
                <div key={k.id} className="p-4 rounded-2xl bg-paper border border-hairline flex items-center justify-between shadow-subtle">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-ink">{k.label}</span>
                      {k.revokedAt ? (
                        <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-bold">Отозван</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">Активен</span>
                      )}
                    </div>

                    <div className="flex items-center space-x-3 text-[11px] text-mid-gray font-mono">
                      <span className="bg-surface-alt px-2 py-0.5 rounded border border-hairline text-ink">{k.keyPrefix}</span>
                      <span>Создан: {new Date(k.createdAt).toLocaleDateString('ru-RU')}</span>
                      <span>&bull;</span>
                      <span>Использован: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('ru-RU') : 'никогда'}</span>
                    </div>
                  </div>

                  {!k.revokedAt && (
                    <button
                      onClick={() => handleRevokeKey(k.id)}
                      className="p-2 rounded-xl text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all text-xs font-semibold flex items-center space-x-1"
                      title="Отозвать API-ключ"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Отозвать</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Documentation Link Box */}
          <div className="p-4 rounded-2xl bg-surface-alt border border-hairline text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink flex items-center space-x-1.5">
                <Code2 className="w-4 h-4 text-ember" />
                <span>Документация Публичного REST API v1</span>
              </span>
              <a 
                href="https://github.com/aivazovskya/Tender#readme" 
                target="_blank" 
                rel="noreferrer" 
                className="text-mid-gray hover:text-ember flex items-center space-x-1 text-[11px]"
              >
                <span>README API Doc</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-mid-gray text-[11px] leading-relaxed">
              Эндпоинты API: <code className="bg-paper px-1.5 py-0.5 rounded border text-ink font-mono">GET /api/public/v1/tenders</code>, <code className="bg-paper px-1.5 py-0.5 rounded border text-ink font-mono">GET /api/public/v1/kanban</code>, <code className="bg-paper px-1.5 py-0.5 rounded border text-ink font-mono">POST /api/public/v1/kanban</code>. Передавайте ключ в заголовке <code className="bg-paper px-1.5 py-0.5 rounded border text-ink font-mono">x-api-key: tnd_ai_...</code>
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-hairline bg-surface-alt flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-paper border border-hairline text-ink hover:bg-surface-alt transition-colors shadow-subtle"
          >
            Закрыть
          </button>
        </div>

      </div>
    </div>
  );
};
