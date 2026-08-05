'use client';

import React, { useState } from 'react';
import { X, LogIn, UserPlus, Mail, Lock, User as UserIcon, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

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

      setSuccessMsg(mode === 'LOGIN' ? 'Успешный вход!' : 'Успешная регистрация!');
      
      if (onSuccess && data.user) {
        onSuccess(data.user);
      }

      setTimeout(() => {
        onClose();
      }, 500);
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

        {/* Tab Switcher */}
        <div className="flex border-b border-hairline bg-surface-alt/30 p-1">
          <button
            onClick={() => { setMode('LOGIN'); setError(null); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              mode === 'LOGIN'
                ? 'bg-paper text-ink shadow-subtle border border-hairline'
                : 'text-mid-gray hover:text-ink'
            }`}
          >
            Вход
          </button>
          <button
            onClick={() => { setMode('REGISTER'); setError(null); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              mode === 'REGISTER'
                ? 'bg-paper text-ink shadow-subtle border border-hairline'
                : 'text-mid-gray hover:text-ink'
            }`}
          >
            Регистрация
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {error && (
            <div className="flex items-center space-x-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center space-x-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {mode === 'REGISTER' && (
            <div>
              <label className="block text-xs font-medium text-mid-gray mb-1">
                ФИО или Название организации
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-mid-gray absolute left-3 top-3" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Иван Иванов"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-surface-alt border border-hairline focus:outline-none focus:border-ember transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-mid-gray mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-mid-gray absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@company.kz"
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-surface-alt border border-hairline focus:outline-none focus:border-ember transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-mid-gray mb-1">
              Пароль <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-mid-gray absolute left-3 top-3" />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-surface-alt border border-hairline focus:outline-none focus:border-ember transition-colors"
              />
            </div>
          </div>

          {mode === 'REGISTER' && (
            <div>
              <label className="block text-xs font-medium text-mid-gray mb-1">
                Подтверждение пароля <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-mid-gray absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-surface-alt border border-hairline focus:outline-none focus:border-ember transition-colors"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-ink text-paper font-semibold text-xs hover:bg-ink-soft transition-all shadow-subtle flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'LOGIN' ? (
              <>
                <LogIn className="w-4 h-4" />
                <span>Войти в аккаунт</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Зарегистрироваться</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
