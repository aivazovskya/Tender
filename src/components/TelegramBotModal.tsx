'use client';

import React, { useState, useEffect } from 'react';
import { TelegrafBotService } from '../lib/telegram/bot.service';
import { Send, Bot, X, ExternalLink, Copy, Bell, ShieldAlert, Save, Check } from 'lucide-react';
import { CompanyProfileData, Tender } from '../lib/types/tender';

interface TelegramBotModalProps {
  telegramChatId?: string;
  onClose: () => void;
  profile?: CompanyProfileData;
  tenders?: Tender[];
}

export const TelegramBotModal: React.FC<TelegramBotModalProps> = ({ telegramChatId, onClose, profile, tenders }) => {
  const [copied, setCopied] = useState(false);
  const isConnected = Boolean(telegramChatId && telegramChatId.trim().length > 0);
  const deepLink = TelegrafBotService.generateDeepLink('usr_kazit_service_101');

  // Notification settings state
  const [telegramNotify, setTelegramNotify] = useState<boolean>(true);
  const [emailNotify, setEmailNotify] = useState<boolean>(false);
  const [minRiskNotify, setMinRiskNotify] = useState<number>(50);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [settingsSaved, setSettingsSaved] = useState<boolean>(false);

  const [botChat, setBotChat] = useState<Array<{ sender: 'bot' | 'user'; text: string }>>([
    {
      sender: 'bot',
      text: '🤖 <b>TenderAI Bot v1.6 (Казахстан)</b>\nСистема подписки активирована. Мгновенные уведомления о новых тендерах goszakup.gov.kz и Самрук-Казына поступают в ваш мессенджер.'
    }
  ]);
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    fetch('/api/notifications')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.settings) {
          setTelegramNotify(data.settings.telegramNotify !== false);
          setEmailNotify(Boolean(data.settings.emailNotify));
          setMinRiskNotify(data.settings.minRiskNotify ?? 50);
        }
      })
      .catch(() => {});
  }, []);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(deepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveNotificationSettings = async () => {
    setSavingSettings(true);
    setSettingsSaved(false);
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'usr_kazit_service_101',
          telegramNotify,
          emailNotify,
          minRiskNotify
        })
      });
      const data = await res.json();
      if (data.success) {
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 2500);
      }
    } catch (err) {
      console.error('[TelegramBotModal] Ошибка сохранения настроек:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSendTestMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testMessage.trim()) return;

    const userText = testMessage.trim();
    setBotChat(prev => [...prev, { sender: 'user', text: userText }]);
    setTestMessage('');

    setTimeout(() => {
      const parts = userText.split(' ');
      const botReply = TelegrafBotService.handleBotCommand(parts[0], parts.slice(1), tenders, profile);
      setBotChat(prev => [...prev, { sender: 'bot', text: botReply }]);
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-paper border border-hairline rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-elevated overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-hairline flex items-center justify-between bg-surface-alt">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-paper border border-hairline flex items-center justify-center shadow-subtle">
              <Send className="w-4 h-4 text-ink" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink flex items-center space-x-2 tracking-tight">
                <span>Интеграция Telegram-Бота (@TenderAI_KZ_bot)</span>
                {isConnected ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                    Подключено
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                    Не привязан
                  </span>
                )}
              </h2>
              <p className="text-xs text-mid-gray">
                Канал мгновенных алертов, управление каналами доставки и RAG-консультант
              </p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-mid-gray hover:text-ink rounded-xl hover:bg-paper transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          
          {/* Deep Link Connection Card */}
          <div className="p-5 rounded-2xl bg-surface-alt border border-hairline flex flex-col sm:flex-row items-center justify-between gap-4 shadow-subtle">
            <div className="space-y-1">
              <span className="text-xs text-mid-gray font-medium block">Персональная ссылка привязки Telegram-аккаунта:</span>
              <p className="text-xs font-mono text-ink break-all font-semibold">{deepLink}</p>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={handleCopyLink}
                className="px-3.5 py-2 rounded-xl bg-paper hover:bg-surface-alt border border-hairline text-ink text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-subtle"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'Скопировано!' : 'Скопировать'}</span>
              </button>

              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl bg-ink hover:bg-ink-soft text-paper text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-subtle"
              >
                <span>Перейти в Telegram</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Notification Preferences Settings Box */}
          <div className="p-5 rounded-2xl bg-surface-alt border border-hairline space-y-4 shadow-subtle">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center space-x-2">
                <Bell className="w-4 h-4 text-mid-gray" />
                <span>Настройки каналов уведомлений и фильтров рисков</span>
              </h3>

              <button
                onClick={handleSaveNotificationSettings}
                disabled={savingSettings}
                className="px-3.5 py-1.5 rounded-xl bg-ink hover:bg-ink-soft text-paper font-semibold text-xs flex items-center space-x-1.5 transition-all disabled:opacity-50 shadow-subtle"
              >
                {settingsSaved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
                <span>{settingsSaved ? 'Сохранено!' : 'Сохранить фильтры'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="p-3 rounded-xl bg-paper border border-hairline flex items-center space-x-3 cursor-pointer shadow-subtle">
                <input
                  type="checkbox"
                  checked={telegramNotify}
                  onChange={(e) => setTelegramNotify(e.target.checked)}
                  className="w-4 h-4 rounded border-hairline text-ink focus:ring-0"
                />
                <div>
                  <span className="font-semibold text-ink block">Telegram Алерты</span>
                  <span className="text-[10px] text-mid-gray">Мгновенные сообщения</span>
                </div>
              </label>

              <label className="p-3 rounded-xl bg-paper border border-hairline flex items-center space-x-3 cursor-pointer shadow-subtle">
                <input
                  type="checkbox"
                  checked={emailNotify}
                  onChange={(e) => setEmailNotify(e.target.checked)}
                  className="w-4 h-4 rounded border-hairline text-ink focus:ring-0"
                />
                <div>
                  <span className="font-semibold text-ink block">Email Сводка</span>
                  <span className="text-[10px] text-mid-gray">Ежедневный дайджест</span>
                </div>
              </label>

              <div className="p-3 rounded-xl bg-paper border border-hairline space-y-1 shadow-subtle">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-ink font-semibold flex items-center space-x-1">
                    <ShieldAlert className="w-3.5 h-3.5 text-ember" />
                    <span>Порог риска:</span>
                  </span>
                  <span className="font-bold text-ink font-mono">до {minRiskNotify}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={minRiskNotify}
                  onChange={(e) => setMinRiskNotify(Number(e.target.value))}
                  className="w-full h-1.5 bg-surface-alt rounded-lg appearance-none cursor-pointer accent-ink"
                />
              </div>
            </div>
          </div>

          {/* Interactive Bot Chat Simulator */}
          <div className="flex flex-col h-[280px] bg-surface-alt rounded-2xl border border-hairline overflow-hidden shadow-subtle">
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {botChat.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex items-start space-x-2.5 ${
                    msg.sender === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.sender === 'bot' && (
                    <div className="w-6 h-6 rounded-lg bg-paper border border-hairline flex items-center justify-center shrink-0 shadow-subtle">
                      <Bot className="w-3.5 h-3.5 text-ink" />
                    </div>
                  )}

                  <div
                    className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[85%] whitespace-pre-wrap ${
                      msg.sender === 'user'
                        ? 'bg-ink text-paper rounded-tr-none'
                        : 'bg-paper border border-hairline text-ink rounded-tl-none shadow-subtle space-y-2'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendTestMessage} className="p-3 border-t border-hairline bg-paper flex items-center space-x-2">
              <input
                type="text"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Попробуйте команды: /search серверы Астана или /digest..."
                className="flex-1 bg-surface-alt border border-hairline rounded-xl px-4 py-2 text-xs text-ink placeholder-mid-gray focus:outline-none focus:border-ink font-mono"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-ink hover:bg-ink-soft text-paper text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-subtle"
              >
                <Send className="w-4 h-4" />
                <span>Отправить</span>
              </button>
            </form>
          </div>

        </div>

      </div>
    </div>
  );
};

