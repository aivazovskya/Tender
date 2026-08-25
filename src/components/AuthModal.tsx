'use client';

import React, { useState } from 'react';
import { X, LogIn, UserPlus, Mail, Lock, User as UserIcon, AlertCircle, CheckCircle2, Loader2, Clock, ArrowRight } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user: { id: string; email: string; name?: string | null; role: string }) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [pendingSuccess, setPendingSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (mode === 'REGISTER') {
      if (password.length < 8) {
        setError('Пароль должен быть не менее 8 символов');
        return;
      }
      if (password !== confirmPassword) {
        setError('Пароли не совпадают');
        return;
      }
    }

    setLoading(true);

    try {
      const endpoint = mode === 'LOGIN' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'LOGIN' 
        ? { email, password } 
        : { email, password, name };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Произошла ошибка при аутентификации');
      }

      if (mode === 'REGISTER' && data.pending) {
        setPendingSuccess(true);
      } else if (mode === 'LOGIN') {
        setSuccessMsg('Успешный вход!');
        if (onSuccess && data.user) {
          onSuccess(data.user);
        }
        setTimeout(() => {
          onClose();
        }, 500);
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка сети или сервера');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-paper border border-hairline rounded-2xl shadow-elevated w-full max-w-md overflow-hidden relative">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline bg-surface-alt/50">
          <div className="flex items-center space-x-2">
            {mode === 'LOGIN' ? (
              <LogIn className="w-5 h-5 text-ember" />
            ) : (
              <UserPlus className="w-5 h-5 text-ember" />
            )}
            <h3 className="text-base font-bold text-ink">
              {mode === 'LOGIN' ? 'Вход в аккаунт TenderAI' : 'Регистрация аккаунта'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-mid-gray hover:text-ink hover:bg-surface-alt transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {pendingSuccess ? (
            <div className="text-center space-y-4 py-2">
              <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-subtle">
                <Clock className="w-6 h-6" />
              </div>

              <div className="space-y-1.5">
                <h4 className="text-base font-bold text-ink">Заявка отправлена</h4>
                <p className="text-xs text-ink-soft leading-relaxed">
                  Ваша учетная запись ожидает рассмотрения и подтверждения администратором платформы.
                </p>
                <p className="text-[11px] text-mid-gray pt-1 font-mono">
                  {email}
                </p>
              </div>

              <button
                onClick={() => {
                  setPendingSuccess(false);
                  setMode('LOGIN');
                  setPassword('');
                  setConfirmPassword('');
                }}
                className="w-full py-2.5 rounded-xl bg-ink hover:bg-ink-soft text-paper text-xs font-semibold flex items-center justify-center space-x-2 transition-all shadow-subtle"
              >
                <span>Перейти ко входу</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              {/* Mode Switcher */}
              <div className="flex border border-hairline rounded-xl p-1 bg-surface-alt mb-6">
                <button
                  type="button"
                  onClick={() => { setMode('LOGIN'); setError(null); setSuccessMsg(null); }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    mode === 'LOGIN' 
                      ? 'bg-paper text-ink shadow-subtle' 
                      : 'text-mid-gray hover:text-ink'
                  }`}
                >
                  Вход
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('REGISTER'); setError(null); setSuccessMsg(null); }}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    mode === 'REGISTER' 
                      ? 'bg-paper text-ink shadow-subtle' 
                      : 'text-mid-gray hover:text-ink'
                  }`}
                >
                  Регистрация
                </button>
              </div>

              {/* Alert Messages */}
              {error && (
                <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'REGISTER' && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-ink-soft">Имя или название компании</label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-mid-gray absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="ТОО Компания / Иван"
                        className="w-full pl-9 pr-3 py-2 bg-surface-alt border border-hairline rounded-xl text-xs text-ink placeholder-mid-gray focus:outline-none focus:border-ink"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-soft">Email</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-mid-gray absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full pl-9 pr-3 py-2 bg-surface-alt border border-hairline rounded-xl text-xs text-ink placeholder-mid-gray focus:outline-none focus:border-ink"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-ink-soft">Пароль</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-mid-gray absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3 py-2 bg-surface-alt border border-hairline rounded-xl text-xs text-ink placeholder-mid-gray focus:outline-none focus:border-ink"
                    />
                  </div>
                  {mode === 'REGISTER' && (
                    <span className="text-[10px] text-mid-gray">Не менее 8 символов</span>
                  )}
                </div>

                {mode === 'REGISTER' && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-ink-soft">Подтвердите пароль</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-mid-gray absolute left-3 top-2.5" />
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-9 pr-3 py-2 bg-surface-alt border border-hairline rounded-xl text-xs text-ink placeholder-mid-gray focus:outline-none focus:border-ink"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-ink hover:bg-ink-soft text-paper rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-colors shadow-subtle disabled:opacity-50 mt-4"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{mode === 'LOGIN' ? 'Вход...' : 'Отправка...'}</span>
                    </>
                  ) : (
                    <>
                      {mode === 'LOGIN' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                      <span>{mode === 'LOGIN' ? 'Войти' : 'Зарегистрироваться'}</span>
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

      </div>
    </div>
  );
};
