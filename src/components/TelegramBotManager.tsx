import React, { useState, useEffect } from 'react';
import { Bot, Save, Power, RefreshCw, Send, AlertCircle, CheckCircle2, ShieldAlert, Copy, Check, X, Server, Activity } from 'lucide-react';
import { Language } from '../types';
import { useAppActiveState } from '../hooks/useAppActiveState';

interface LocalBotApiStatus {
  baseUrl: string;
  localMode: boolean;
  maxUploadMb: number;
  hasApiCredentials: boolean;
  binaryInstalled: boolean;
  binaryPath: string | null;
  binaryVersion: string | null;
  processRunning: boolean;
  pid: number | null;
  httpReachable: boolean;
  httpStatus: number | null;
  latencyMs: number | null;
  httpError: string | null;
  serverSignature: string | null;
  logFilePath: string;
  logs: string[];
}

interface LocalBotApiTestResult {
  success: boolean;
  test: {
    ok: boolean;
    serverAlive: boolean;
    mode: 'getMe' | 'ping' | 'connect';
    latencyMs: number | null;
    botId?: number;
    botUsername?: string;
    botName?: string;
    errorCode?: number;
    error?: string;
    description?: string;
  };
}

interface TelegramBotManagerProps {
  token: string | null;
  lang: Language;
}

export const TelegramBotManager: React.FC<TelegramBotManagerProps> = ({ token, lang }) => {
  const isFa = lang === 'fa';
  const { isSleeping } = useAppActiveState();

  const [botConfig, setBotConfig] = useState({
    bot_token: '',
    admin_user_id: '',
    web_url: '',
  });

  const [status, setStatus] = useState({
    isRunning: false,
    pid: null as number | null,
    startedAt: null as string | null,
    logs: [] as string[],
    configValid: false
  });

  const [copiedLogs, setCopiedLogs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [testAlertLoading, setTestAlertLoading] = useState(false);
  const [localApiStatus, setLocalApiStatus] = useState<LocalBotApiStatus | null>(null);
  const [localApiLoading, setLocalApiLoading] = useState(false);
  const [localApiTesting, setLocalApiTesting] = useState(false);
  const [localApiActionLoading, setLocalApiActionLoading] = useState(false);
  const [localApiTestResult, setLocalApiTestResult] = useState<LocalBotApiTestResult | null>(null);
  const [apiIdInput, setApiIdInput] = useState('');
  const [apiHashInput, setApiHashInput] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Fetch bot config and status on mount, pause polling when isSleeping
  useEffect(() => {
    if (!token || isSleeping) return;
    fetchConfig();
    fetchStatus();
    fetchLocalApiStatus();

    // Poll status every 8 seconds for live logs when active
    const interval = setInterval(fetchStatus, 8000);
    return () => clearInterval(interval);
  }, [token, isSleeping]);

  const fetchLocalApiStatus = async () => {
    if (!token) return;
    setLocalApiLoading(true);
    try {
      const resp = await fetch('/api/telegram-bot/local-api/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (resp.ok && resp.headers.get('content-type')?.includes('application/json')) {
        const data = await resp.json();
        setLocalApiStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch local Bot API status:', err);
    } finally {
      setLocalApiLoading(false);
    }
  };

  const handleTestLocalBotApi = async () => {
    if (!token) return;
    setLocalApiTesting(true);
    setLocalApiTestResult(null);
    try {
      const resp = await fetch('/api/telegram-bot/local-api/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          bot_token: botConfig.bot_token || ''
        })
      });
      if (resp.ok && resp.headers.get('content-type')?.includes('application/json')) {
        const data = await resp.json();
        if (data.status) setLocalApiStatus(data.status);
        setLocalApiTestResult(data);
      }
    } catch (err: any) {
      setLocalApiTestResult({
        success: false,
        test: {
          ok: false,
          serverAlive: false,
          mode: 'connect',
          latencyMs: null,
          error: err?.message || (isFa ? 'خطا در ارتباط با سرور' : 'Connection error')
        }
      });
    } finally {
      setLocalApiTesting(false);
    }
  };

  const handleStartLocalBotApi = async () => {
    if (!token) return;
    setLocalApiActionLoading(true);
    setMessage(null);
    try {
      const resp = await fetch('/api/telegram-bot/local-api/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          api_id: apiIdInput.trim(),
          api_hash: apiHashInput.trim()
        })
      });
      const data = await resp.json();
      if (data.status) setLocalApiStatus(data.status);
      if (resp.ok && data.success) {
        setMessage({
          text: isFa ? 'سرور محلی Bot API با موفقیت راه‌اندازی شد.' : 'Local Bot API server started successfully.',
          type: 'success'
        });
      } else {
        setMessage({
          text: data.error || (isFa ? 'خطا در راه‌اندازی سرور Bot API' : 'Failed to start local Bot API server'),
          type: 'error'
        });
      }
    } catch (err: any) {
      setMessage({
        text: err?.message || (isFa ? 'خطا در ارتباط با سرور' : 'Network error'),
        type: 'error'
      });
    } finally {
      setLocalApiActionLoading(false);
    }
  };

  const handleStopLocalBotApi = async () => {
    if (!token) return;
    setLocalApiActionLoading(true);
    setMessage(null);
    try {
      const resp = await fetch('/api/telegram-bot/local-api/stop', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await resp.json();
      if (data.status) setLocalApiStatus(data.status);
      if (resp.ok && data.success) {
        setMessage({
          text: isFa ? 'سرور محلی Bot API متوقف شد.' : 'Local Bot API server stopped.',
          type: 'success'
        });
      }
    } catch (err: any) {
      setMessage({
        text: err?.message || (isFa ? 'خطا در ارتباط با سرور' : 'Network error'),
        type: 'error'
      });
    } finally {
      setLocalApiActionLoading(false);
    }
  };

  const fetchConfig = async () => {
    if (!token) return;
    setConfigLoading(true);
    try {
      const resp = await fetch('/api/telegram-bot/config', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (resp.ok && resp.headers.get('content-type')?.includes('application/json')) {
        const data = await resp.json();
        setBotConfig({
          bot_token: data.bot_token || '',
          admin_user_id: data.admin_user_id ? String(data.admin_user_id) : '',
          web_url: data.web_url || window.location.origin,
        });
      }
    } catch (err) {
      console.error('Failed to fetch bot config:', err);
    } finally {
      setConfigLoading(false);
    }
  };

  const fetchStatus = async () => {
    if (!token) return;
    try {
      const resp = await fetch('/api/telegram-bot/status', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (resp.ok && resp.headers.get('content-type')?.includes('application/json')) {
        const data = await resp.json();
        setStatus({
          isRunning: data.isRunning,
          pid: data.pid,
          startedAt: data.startedAt,
          logs: data.logs || [],
          configValid: data.configValid
        });
      }
    } catch (err) {
      console.error('Failed to fetch bot status:', err);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const resp = await fetch('/api/telegram-bot/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(botConfig)
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setMessage({
          text: isFa ? 'تنظیمات ربات با موفقیت ذخیره شد.' : 'Telegram bot settings saved successfully.',
          type: 'success'
        });
        fetchStatus();
      } else {
        setMessage({
          text: data.error || (isFa ? 'خطا در ذخیره تنظیمات' : 'Failed to save configuration'),
          type: 'error'
        });
      }
    } catch (err: any) {
      setMessage({
        text: err.message || (isFa ? 'خطا در شبکه' : 'Network error'),
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendTestAlert = async () => {
    setTestAlertLoading(true);
    setMessage(null);
    try {
      const resp = await fetch('/api/telegram-bot/alerts/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          bot_token: botConfig.bot_token,
          admin_user_id: botConfig.admin_user_id
        })
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setMessage({
          text: data.message || (isFa ? 'پیام تست با موفقیت به تلگرام ارسال شد!' : 'Test alert sent successfully!'),
          type: 'success'
        });
      } else {
        setMessage({
          text: data.error || (isFa ? 'خطا در ارسال پیام تست' : 'Failed to send test alert'),
          type: 'error'
        });
      }
    } catch (err: any) {
      setMessage({
        text: err.message || (isFa ? 'خطا در ارتباط با سرور' : 'Connection error'),
        type: 'error'
      });
    } finally {
      setTestAlertLoading(false);
    }
  };

  const handleStartBot = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const resp = await fetch('/api/telegram-bot/start', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setMessage({
          text: isFa ? 'ربات تلگرام با موفقیت راه‌اندازی شد.' : 'Telegram bot started successfully.',
          type: 'success'
        });
        fetchStatus();
      } else {
        setMessage({
          text: data.error || (isFa ? 'خطا در راه‌اندازی ربات' : 'Failed to start bot'),
          type: 'error'
        });
      }
    } catch (err: any) {
      setMessage({
        text: err.message || (isFa ? 'خطا در شبکه' : 'Network error'),
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStopBot = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const resp = await fetch('/api/telegram-bot/stop', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (resp.ok) {
        setMessage({
          text: isFa ? 'ربات تلگرام متوقف شد.' : 'Telegram bot stopped successfully.',
          type: 'success'
        });
        fetchStatus();
      }
    } catch (err: any) {
      setMessage({
        text: err.message || (isFa ? 'خطا در شبکه' : 'Network error'),
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6" dir={isFa ? 'rtl' : 'ltr'}>
      {/* Title Header */}
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-neutral-800 pb-3 sm:pb-4 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="p-2 sm:p-2.5 bg-sky-50 dark:bg-sky-950/30 text-sky-500 rounded-lg sm:rounded-xl shrink-0">
            <Bot className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-xl font-bold text-gray-900 dark:text-neutral-100 truncate">
              {isFa ? 'دستیار و مدیریت ربات تلگرام' : 'Telegram Assistant & Bot Manager'}
            </h1>
            <p className="text-[11px] sm:text-sm text-gray-500 dark:text-neutral-400 mt-0.5 truncate">
              {isFa 
                ? 'کنترل کامل از راه دور سرور و مشاهده لاگ‌های زنده ربات تلگرام' 
                : 'Remote server control and live logs monitoring for Telegram bot'}
            </p>
          </div>
        </div>
        
        {/* Status indicator */}
        <div className="flex items-center gap-2 shrink-0">
          {status.isRunning ? (
            <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {isFa ? 'ربات فعال' : 'Bot Running'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-400">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-gray-400"></span>
              {isFa ? 'ربات متوقف' : 'Bot Stopped'}
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div className={`p-3 sm:p-4 rounded-xl flex items-start gap-2.5 sm:gap-3 border ${
          message.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-400' 
            : 'bg-rose-50 dark:bg-rose-950/10 border-rose-100 dark:border-rose-900/30 text-rose-800 dark:text-rose-400'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 mt-0.5 shrink-0" />}
          <span className="text-xs sm:text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        
        {/* Config and control Column */}
        <div className="lg:col-span-1 space-y-4 sm:space-y-6">
          <div className="bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-sm">
            <h3 className="text-xs sm:text-base font-semibold text-gray-900 dark:text-neutral-100 mb-3 sm:mb-4 flex items-center gap-2">
              <Save className="h-4 w-4 sm:h-5 sm:w-5 text-sky-500" />
              {isFa ? 'پیکربندی اتصال تلگرام' : 'Telegram Credentials'}
            </h3>

            <form onSubmit={handleSaveConfig} className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-[11px] sm:text-xs font-semibold text-gray-500 dark:text-neutral-400 mb-1">
                  {isFa ? 'توکن ربات تلگرام (Bot Token)' : 'Telegram Bot Token'}
                </label>
                <input
                  type="password"
                  value={botConfig.bot_token || ''}
                  onChange={(e) => setBotConfig({ ...botConfig, bot_token: e.target.value })}
                  placeholder="e.g. 123456789:ABCdefGhI..."
                  required
                  className="w-full px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-800 dark:text-neutral-200"
                />
              </div>

              <div>
                <label className="block text-[11px] sm:text-xs font-semibold text-gray-500 dark:text-neutral-400 mb-1">
                  {isFa ? 'شناسه عددی ادمین (Admin Chat ID)' : 'Admin User Chat ID'}
                </label>
                <input
                  type="text"
                  value={botConfig.admin_user_id || ''}
                  onChange={(e) => setBotConfig({ ...botConfig, admin_user_id: e.target.value })}
                  placeholder="e.g. 987654321"
                  required
                  className="w-full px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-800 dark:text-neutral-200"
                />
              </div>

              <div>
                <label className="block text-[11px] sm:text-xs font-semibold text-gray-500 dark:text-neutral-400 mb-1">
                  {isFa ? 'آدرس لینک وب اپ پنل (Web Panel URL)' : 'Web Panel URL / WebApp'}
                </label>
                <input
                  type="text"
                  value={botConfig.web_url || ''}
                  onChange={(e) => setBotConfig({ ...botConfig, web_url: e.target.value })}
                  placeholder="e.g. https://your-server-panel.app"
                  className="w-full px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 text-gray-800 dark:text-neutral-200"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={configLoading || loading}
                  className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-400 text-white rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
                >
                  {configLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {isFa ? 'ذخیره' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={handleSendTestAlert}
                  disabled={testAlertLoading || !botConfig.bot_token || !botConfig.admin_user_id}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-neutral-200 dark:disabled:bg-neutral-800 disabled:text-neutral-400 text-white rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
                  title={isFa ? 'ارسال پیام تست به اکانت تلگرام شما' : 'Send test notification to your Telegram'}
                >
                  {testAlertLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  <span>{isFa ? 'تست پیام' : 'Test Alert'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Controller Card */}
          <div className="bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-sm space-y-3 sm:space-y-4">
            <h3 className="text-xs sm:text-base font-semibold text-gray-900 dark:text-neutral-100 flex items-center gap-2">
              <Power className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-500" />
              {isFa ? 'کنترلر وضعیت ربات' : 'Bot Process Control'}
            </h3>

            {!status.configValid && (
              <div className="p-2.5 sm:p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-lg sm:rounded-xl flex gap-2 text-amber-800 dark:text-amber-400 text-[11px] sm:text-xs">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  {isFa 
                    ? 'پیکربندی ربات کامل نیست. ابتدا توکن معتبر و آیدی ادمین را وارد و ذخیره کنید.' 
                    : 'Bot configuration is incomplete. Please enter and save valid keys first.'}
                </span>
              </div>
            )}

            <div className="flex gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleStartBot}
                disabled={status.isRunning || !status.configValid || loading}
                className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-100 dark:disabled:bg-neutral-800 disabled:text-gray-400 text-white rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
              >
                <Power className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                {isFa ? 'راه‌اندازی' : 'Start Bot'}
              </button>

              <button
                type="button"
                onClick={handleStopBot}
                disabled={!status.isRunning || loading}
                className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2.5 bg-rose-500 hover:bg-rose-600 disabled:bg-neutral-100 dark:disabled:bg-neutral-800 disabled:text-gray-400 text-white rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
              >
                <Power className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                {isFa ? 'خاموش کردن' : 'Stop Bot'}
              </button>
            </div>

            {status.isRunning && (
              <div className="border-t border-gray-50 dark:border-neutral-800 pt-2.5 text-[11px] sm:text-xs text-gray-500 dark:text-neutral-400 space-y-1">
                <div className="flex justify-between">
                  <span>{isFa ? 'شناسه پردازش (PID):' : 'Process ID (PID):'}</span>
                  <span className="font-mono text-gray-700 dark:text-neutral-300 font-semibold">{status.pid}</span>
                </div>
                <div className="flex justify-between">
                  <span>{isFa ? 'زمان شروع فعالیت:' : 'Uptime Started At:'}</span>
                  <span className="font-mono text-gray-700 dark:text-neutral-300">
                    {status.startedAt ? status.startedAt.substring(11, 19) : ''}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Section: Live Logs Column */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-sm flex flex-col h-[400px] sm:h-[480px]">
            <div className="flex justify-between items-center mb-3 sm:mb-4 gap-2">
              <h3 className="text-xs sm:text-base font-semibold text-gray-900 dark:text-neutral-100 flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-500" />
                {isFa ? 'لاگ‌های زنده ربات تلگرام' : 'Telegram Bot Live Output Logs'}
              </h3>
              <div className="flex items-center gap-1.5">
                {status.logs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(status.logs.join('\n'));
                      setCopiedLogs(true);
                      setTimeout(() => setCopiedLogs(false), 2000);
                    }}
                    className="px-2.5 py-1 text-xs rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition flex items-center gap-1 cursor-pointer font-sans"
                    title={isFa ? 'کپی تمام لاگ‌ها' : 'Copy All Logs'}
                  >
                    {copiedLogs ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedLogs ? (isFa ? 'کپی شد!' : 'Copied!') : (isFa ? 'کپی لاگ' : 'Copy Logs')}</span>
                  </button>
                )}
                <button 
                  onClick={fetchStatus}
                  className="p-1 sm:p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                  title={isFa ? 'بروزرسانی لاگ‌ها' : 'Refresh Logs'}
                >
                  <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
              </div>
            </div>

            <div
              className="relative flex-1 bg-neutral-950 border border-neutral-900 rounded-lg sm:rounded-xl p-2.5 sm:p-4 font-mono text-[11px] sm:text-xs text-neutral-300 overflow-y-auto space-y-1 select-none"
            >
              {status.logs.length > 0 ? (
                status.logs.map((log, idx) => (
                  <div key={idx} className="whitespace-pre-wrap break-all leading-relaxed hover:bg-neutral-900/50 px-1 py-0.5 rounded select-text cursor-text selection:bg-blue-600/40 selection:text-white">
                    {log}
                  </div>
                ))
              ) : (
                <div className="text-neutral-600 text-center py-16 sm:py-24 select-none">
                  {isFa ? 'هیچ خروجی یا لاگی برای نمایش وجود ندارد.' : 'No output logs available. Start the bot to see logs here.'}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Local Telegram Bot API Server Status & Test Card */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-neutral-800 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-500 rounded-lg shrink-0">
              <Server className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-base font-semibold text-gray-900 dark:text-neutral-100 flex items-center gap-2 flex-wrap">
                <span>{isFa ? 'سرور محلی Telegram Bot API' : 'Local Telegram Bot API Server'}</span>
                {localApiStatus && (
                  localApiStatus.httpReachable ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200/70 dark:border-emerald-900/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      {isFa ? 'فعال و آماده' : 'Online'}
                    </span>
                  ) : localApiStatus.binaryInstalled ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200/70 dark:border-amber-900/40">
                      {isFa ? 'نصب‌شده (غیرفعال)' : 'Installed (Offline)'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-neutral-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-400 border border-gray-200 dark:border-neutral-700">
                      {isFa ? 'نصب‌نشده در این محیط' : 'Not Installed'}
                    </span>
                  )
                )}
              </h3>
              <p className="text-[11px] sm:text-xs text-gray-500 dark:text-neutral-400 mt-0.5">
                {isFa
                  ? 'بررسی و تست زنده راه‌اندازی باینری telegram-bot-api و پاسخ‌دهی روی پورت محلی (آپلود تا ۲ گیگابایت)'
                  : 'Verify and live-test the local telegram-bot-api binary and HTTP server'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={fetchLocalApiStatus}
              disabled={localApiLoading}
              className="p-2 rounded-lg bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-600 dark:text-neutral-300 transition-colors cursor-pointer"
              title={isFa ? 'بروزرسانی وضعیت' : 'Refresh Status'}
            >
              <RefreshCw className={`h-4 w-4 ${localApiLoading ? 'animate-spin' : ''}`} />
            </button>

            {localApiStatus?.binaryInstalled && (
              localApiStatus.processRunning || localApiStatus.httpReachable ? (
                <button
                  type="button"
                  onClick={handleStopLocalBotApi}
                  disabled={localApiActionLoading}
                  className="flex items-center gap-1.5 px-3 py-2 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-400 text-white rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
                >
                  <Power className="h-3.5 w-3.5" />
                  <span>{isFa ? 'توقف' : 'Stop'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartLocalBotApi}
                  disabled={localApiActionLoading || (!localApiStatus.hasApiCredentials && (!apiIdInput.trim() || !apiHashInput.trim()))}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-neutral-200 dark:disabled:bg-neutral-800 disabled:text-neutral-400 text-white rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
                >
                  <Power className="h-3.5 w-3.5" />
                  <span>{isFa ? 'راه‌اندازی Bot API' : 'Start Bot API'}</span>
                </button>
              )
            )}

            <button
              type="button"
              onClick={handleTestLocalBotApi}
              disabled={localApiTesting}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-400 text-white rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold cursor-pointer transition-colors"
            >
              {localApiTesting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
              <span>{isFa ? 'تست راه‌اندازی Bot API' : 'Test Bot API Server'}</span>
            </button>
          </div>
        </div>

        {/* Manual Start Credentials (when env vars aren't set yet and server is offline) */}
        {localApiStatus && localApiStatus.binaryInstalled && !localApiStatus.hasApiCredentials && !localApiStatus.httpReachable && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-gray-50 dark:bg-neutral-950 border border-gray-100 dark:border-neutral-800">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-neutral-400 mb-1">
                API_ID (my.telegram.org)
              </label>
              <input
                type="text"
                value={apiIdInput}
                onChange={(e) => setApiIdInput(e.target.value)}
                placeholder="e.g. 12345678"
                className="w-full px-3 py-1.5 text-xs sm:text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 dark:text-neutral-200 font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 dark:text-neutral-400 mb-1">
                API_HASH (my.telegram.org)
              </label>
              <input
                type="password"
                value={apiHashInput}
                onChange={(e) => setApiHashInput(e.target.value)}
                placeholder="32-char hex API_HASH"
                className="w-full px-3 py-1.5 text-xs sm:text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 dark:text-neutral-200 font-mono"
              />
            </div>
          </div>
        )}

        {/* 4 Diagnostic Tiles */}
        {localApiStatus && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-neutral-950 border border-gray-100 dark:border-neutral-800 space-y-1">
              <div className="text-[11px] text-gray-500 dark:text-neutral-400">
                {isFa ? 'باینری telegram-bot-api' : 'telegram-bot-api Binary'}
              </div>
              <div className={`text-xs sm:text-sm font-semibold ${localApiStatus.binaryInstalled ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {localApiStatus.binaryInstalled
                  ? (isFa ? 'نصب‌شده و قابل اجرا' : 'Installed & Runnable')
                  : (isFa ? 'یافت نشد' : 'Not Found')}
              </div>
              <div className="text-[11px] font-mono text-gray-500 dark:text-neutral-500 truncate" title={localApiStatus.binaryVersion || ''}>
                {localApiStatus.binaryVersion || (isFa ? 'فقط داخل کانتینر Docker نصب است' : 'Available in Docker image')}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-gray-50 dark:bg-neutral-950 border border-gray-100 dark:border-neutral-800 space-y-1">
              <div className="text-[11px] text-gray-500 dark:text-neutral-400">
                {isFa ? 'پروسس و پورت محلی' : 'Process & Local Port'}
              </div>
              <div className={`text-xs sm:text-sm font-semibold ${localApiStatus.httpReachable ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {localApiStatus.httpReachable
                  ? (isFa ? `پاسخ‌گو (${localApiStatus.latencyMs ?? 0}ms)` : `Responding (${localApiStatus.latencyMs ?? 0}ms)`)
                  : (localApiStatus.processRunning
                    ? (isFa ? 'در حال اجرا (بدون پاسخ HTTP)' : 'Running (HTTP unreachable)')
                    : (isFa ? 'متوقف است' : 'Not Running'))}
              </div>
              <div className="text-[11px] font-mono text-gray-500 dark:text-neutral-500 truncate">
                {localApiStatus.baseUrl} {localApiStatus.pid ? `• PID ${localApiStatus.pid}` : ''}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-gray-50 dark:bg-neutral-950 border border-gray-100 dark:border-neutral-800 space-y-1">
              <div className="text-[11px] text-gray-500 dark:text-neutral-400">
                {isFa ? 'متغیرهای API_ID / API_HASH' : 'TELEGRAM_API_ID / HASH'}
              </div>
              <div className={`text-xs sm:text-sm font-semibold ${localApiStatus.hasApiCredentials ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {localApiStatus.hasApiCredentials
                  ? (isFa ? 'تنظیم شده' : 'Configured')
                  : (isFa ? 'تنظیم نشده' : 'Missing')}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-neutral-500 truncate">
                {localApiStatus.hasApiCredentials
                  ? (isFa ? 'آماده استارت خودکار در entrypoint' : 'Ready for entrypoint startup')
                  : (isFa ? 'از my.telegram.org در Railway ست کنید' : 'Set in Railway env vars')}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-gray-50 dark:bg-neutral-950 border border-gray-100 dark:border-neutral-800 space-y-1">
              <div className="text-[11px] text-gray-500 dark:text-neutral-400">
                {isFa ? 'حالت لوکال و سقف آپلود' : 'Local Mode & Max Upload'}
              </div>
              <div className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-200">
                {localApiStatus.localMode
                  ? (isFa ? `فعال (--local)` : 'Enabled (--local)')
                  : (isFa ? 'غیرفعال' : 'Disabled')}
              </div>
              <div className="text-[11px] font-mono text-gray-500 dark:text-neutral-500">
                MAX: {localApiStatus.maxUploadMb} MB
              </div>
            </div>
          </div>
        )}

        {/* Live Test Result Banner */}
        {localApiTestResult && (
          <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
            localApiTestResult.test.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300'
              : localApiTestResult.test.serverAlive
                ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300'
                : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-300'
          }`}>
            {localApiTestResult.test.ok ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            ) : localApiTestResult.test.serverAlive ? (
              <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            )}

            <div className="space-y-1 text-xs sm:text-sm min-w-0">
              {localApiTestResult.test.ok && localApiTestResult.test.mode === 'getMe' && (
                <>
                  <div className="font-semibold">
                    {isFa
                      ? `✅ سرور محلی Bot API کاملاً فعال است و درخواست getMe با موفقیت از آن عبور کرد (${localApiTestResult.test.latencyMs}ms)`
                      : `Local Bot API Server is live and verified via getMe (${localApiTestResult.test.latencyMs}ms)`}
                  </div>
                  <div className="text-xs font-mono opacity-90">
                    Bot: {localApiTestResult.test.botName} (@{localApiTestResult.test.botUsername}) • ID: {localApiTestResult.test.botId}
                  </div>
                </>
              )}

              {localApiTestResult.test.ok && localApiTestResult.test.mode === 'ping' && (
                <>
                  <div className="font-semibold">
                    {isFa
                      ? `✅ سرور محلی Bot API روی پورت محلی بالا و پاسخ‌گو است (${localApiTestResult.test.latencyMs}ms)`
                      : `Local Bot API HTTP Server is online and responding (${localApiTestResult.test.latencyMs}ms)`}
                  </div>
                  <div className="text-xs opacity-90">
                    {isFa
                      ? 'برای تست کامل ارتباط با تلگرام (getMe)، توکن ربات را در بخش بالا وارد کرده و دوباره تست بزنید.'
                      : 'Enter a Bot Token above and re-run test to verify full getMe roundtrip.'}
                  </div>
                </>
              )}

              {!localApiTestResult.test.ok && localApiTestResult.test.serverAlive && (
                <>
                  <div className="font-semibold">
                    {isFa
                      ? `⚠️ سرور محلی Bot API بالا و فعال است، اما درخواست getMe خطا داد (${localApiTestResult.test.latencyMs}ms)`
                      : `Local Bot API Server is alive, but getMe returned an error (${localApiTestResult.test.latencyMs}ms)`}
                  </div>
                  <div className="text-xs font-mono opacity-90">
                    [{localApiTestResult.test.errorCode}] {localApiTestResult.test.error}
                  </div>
                </>
              )}

              {!localApiTestResult.test.ok && !localApiTestResult.test.serverAlive && (
                <>
                  <div className="font-semibold">
                    {isFa
                      ? '❌ سرور محلی Bot API در دسترس نیست'
                      : 'Local Bot API Server is not reachable'}
                  </div>
                  <div className="text-xs opacity-95 break-words leading-relaxed">
                    {localApiTestResult.test.error}
                  </div>
                  {localApiStatus && !localApiStatus.binaryInstalled && (
                    <div className="text-xs mt-1 opacity-90">
                      {isFa
                        ? 'توضیح: پیش‌نمایش AI Studio بدون بیلد Docker اجرا می‌شود؛ پس از دیپلوی پروژه با Dockerfile (مانند Railway) باینری telegram-bot-api به‌صورت خودکار نصب و فعال خواهد شد.'
                        : 'Note: AI Studio preview runs without Docker; once deployed via Dockerfile (e.g., Railway), telegram-bot-api will be installed and started automatically.'}
                    </div>
                  )}
                  {localApiStatus && localApiStatus.binaryInstalled && !localApiStatus.hasApiCredentials && (
                    <div className="text-xs mt-1 opacity-90">
                      {isFa
                        ? 'راهنما: متغیرهای API_ID و API_HASH را در Railway (بخش Variables) ست کنید یا در کادر بالا وارد و دکمه «راه‌اندازی Bot API» را بزنید.'
                        : 'Hint: Set API_ID and API_HASH in Railway Variables or enter them above and click Start Bot API.'}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Bot API Server Logs (if any) */}
        {localApiStatus && localApiStatus.logs.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-gray-500 dark:text-neutral-400 font-mono">
              {localApiStatus.logFilePath}
            </div>
            <div className="bg-neutral-950 border border-neutral-900 rounded-lg p-2.5 font-mono text-[11px] text-neutral-300 max-h-36 overflow-y-auto space-y-0.5">
              {localApiStatus.logs.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
