import React, { useState, useEffect } from 'react';
import { Server, Lock, User as UserIcon, ArrowRight, ShieldCheck, Eye, EyeOff, Sparkles, KeyRound } from 'lucide-react';
import { Language, User } from '../types';
import { translations } from '../locales/translations';

interface LoginModalProps {
  lang: Language;
  onLoginSuccess: (token: string, user: User) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ lang, onLoginSuccess }) => {
  const t = translations[lang];
  const isFa = lang === 'fa';

  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(true);

  // Form states
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch initial setup status on mount
  useEffect(() => {
    let isMounted = true;
    fetch('/api/auth/status')
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data && typeof data.isFirstRun === 'boolean') {
          setIsFirstRun(data.isFirstRun);
          if (data.username) {
            setUsername(data.username);
          }
        } else {
          setIsFirstRun(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsFirstRun(false);
      })
      .finally(() => {
        if (isMounted) setCheckingStatus(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle Standard Login
  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });

      const data = await res.json();
      if (res.ok && data.token && data.user) {
        onLoginSuccess(data.token, data.user);
      } else if (data.isFirstRun) {
        setIsFirstRun(true);
        setError(data.error || (isFa ? 'لطفاً ابتدا رمز عبور اولیه را تعیین کنید' : 'Please configure master password first'));
      } else {
        setError(data.error || t.loginError);
      }
    } catch {
      setError(isFa ? 'خطا در ارتباط با سرور. لطفا مجدداً تلاش نمایید.' : 'Server connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Initial Mandatory Password Setup
  const handleInitialSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUsername = username.trim() || 'admin';
    if (password.length < 6) {
      setError(t.passMinLength);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.passMismatch);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/initial-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmedUsername, password })
      });

      const data = await res.json();
      if (res.ok && data.token && data.user) {
        onLoginSuccess(data.token, data.user);
      } else {
        setError(data.error || (isFa ? 'خطا در راه‌اندازی اولیه و ثبت رمز عبور' : 'Error establishing administrator credentials'));
      }
    } catch {
      setError(isFa ? 'خطا در برقراری ارتباط با سرور' : 'Connection error with the server');
    } finally {
      setLoading(false);
    }
  };

  // Loading state indicator while determining first-run status
  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#121214] rounded-3xl border border-neutral-200 dark:border-white/10 p-8 shadow-2xl flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
            {isFa ? 'در حال بررسی وضعیت امنیت پنل...' : 'Checking security setup status...'}
          </span>
        </div>
      </div>
    );
  }

  // FIRST-TIME INITIAL SETUP SCREEN (No default admin/admin123 credentials needed!)
  if (isFirstRun) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir={isFa ? 'rtl' : 'ltr'}>
        <div className="bg-white dark:bg-[#121214] rounded-3xl border border-neutral-200 dark:border-white/10 w-full max-w-md p-6 sm:p-8 shadow-2xl space-y-6">
          {/* Header */}
          <div className="text-center space-y-2.5">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 text-white flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/25">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold mb-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{isFa ? 'اولین راه‌اندازی سرور' : 'Initial Server Setup'}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white">
                {t.initialSetupTitle}
              </h2>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-sm mx-auto">
              {t.initialSetupSub}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium text-center">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleInitialSetup} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1.5">
                {t.username}
              </label>
              <div className="relative">
                <UserIcon className="h-4 w-4 text-neutral-400 absolute left-3.5 top-3 rtl:left-auto rtl:right-3.5" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                  className="w-full pl-10 pr-4 rtl:pl-4 rtl:pr-10 py-2.5 rounded-2xl border border-neutral-300 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-sm text-neutral-900 dark:text-white font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1.5">
                {isFa ? 'تعیین رمز عبور جدید مدیر' : 'Master Admin Password'}
              </label>
              <div className="relative">
                <Lock className="h-4 w-4 text-neutral-400 absolute left-3.5 top-3 rtl:left-auto rtl:right-3.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isFa ? 'حداقل ۶ کاراکتر...' : 'Minimum 6 characters...'}
                  required
                  minLength={6}
                  autoFocus
                  className="w-full pl-10 pr-10 rtl:pl-10 rtl:pr-10 py-2.5 rounded-2xl border border-neutral-300 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-sm text-neutral-900 dark:text-white font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 rtl:right-auto rtl:left-3 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer p-0.5"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1.5">
                {t.confirmPassword}
              </label>
              <div className="relative">
                <KeyRound className="h-4 w-4 text-neutral-400 absolute left-3.5 top-3 rtl:left-auto rtl:right-3.5" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={isFa ? 'تکرار مجدد رمز عبور...' : 'Re-enter password...'}
                  required
                  minLength={6}
                  className="w-full pl-10 pr-10 rtl:pl-10 rtl:pr-10 py-2.5 rounded-2xl border border-neutral-300 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-sm text-neutral-900 dark:text-white font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-2.5 rtl:right-auto rtl:left-3 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer p-0.5"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-xl shadow-emerald-600/25 transition cursor-pointer flex items-center justify-center gap-2 mt-2"
            >
              <span>{loading ? (isFa ? 'در حال راه‌اندازی و ورود...' : 'Setting up...') : t.initialSetupSubmit}</span>
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // STANDARD LOGIN SCREEN (For already configured servers)
  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir={isFa ? 'rtl' : 'ltr'}>
      <div className="bg-white dark:bg-[#121214] rounded-3xl border border-neutral-200 dark:border-white/10 w-full max-w-md p-6 sm:p-8 shadow-2xl space-y-6">
        {/* App Logo & Header */}
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center mx-auto shadow-xl shadow-blue-500/20">
            <Server className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">{t.appTitle}</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.login}</p>
        </div>

        {/* Error Feedback */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium text-center">
            {error}
          </div>
        )}

        {/* Standard Login Form */}
        <form onSubmit={handleStandardLogin} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1.5">
              {t.username}
            </label>
            <div className="relative">
              <UserIcon className="h-4 w-4 text-neutral-400 absolute left-3.5 top-3 rtl:left-auto rtl:right-3.5" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                className="w-full pl-10 pr-4 rtl:pl-4 rtl:pr-10 py-2.5 rounded-2xl border border-neutral-300 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-sm text-neutral-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block mb-1.5">
              {t.password}
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 text-neutral-400 absolute left-3.5 top-3 rtl:left-auto rtl:right-3.5" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full pl-10 pr-10 rtl:pl-10 rtl:pr-10 py-2.5 rounded-2xl border border-neutral-300 dark:border-white/10 bg-neutral-50 dark:bg-white/5 text-sm text-neutral-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-none transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 rtl:right-auto rtl:left-3 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer p-0.5"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-xl shadow-blue-500/25 transition cursor-pointer flex items-center justify-center gap-2 mt-2"
          >
            <span>{loading ? (isFa ? 'در حال بررسی اطلاعات...' : 'Authenticating...') : t.loginSubmit}</span>
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </button>
        </form>
      </div>
    </div>
  );
};
