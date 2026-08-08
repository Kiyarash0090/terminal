import React, { useEffect, useState } from 'react';
import { Cpu, HardDrive, Network, Clock, Server, Activity, RefreshCw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { SystemMetrics, Language } from '../types';
import { translations } from '../locales/translations';

interface MonitoringDashboardProps {
  token: string | null;
  lang: Language;
  active?: boolean;
}

export const MonitoringDashboard: React.FC<MonitoringDashboardProps> = ({ token, lang, active = true }) => {
  const t = translations[lang];
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [history, setHistory] = useState<SystemMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshRate, setRefreshRate] = useState<number>(2000);

  const fetchMetrics = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/metrics/live', {
        headers: {
          'x-auth-token': token || ''
        }
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        if (data && data.current) {
          setMetrics(data.current);
          setHistory(data.history || []);
        }
      }
    } catch (e) {
      console.error('Failed to fetch metrics:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, refreshRate);
    return () => clearInterval(interval);
  }, [refreshRate, token]);

  const formatUptime = (sec: number) => {
    const days = Math.floor(sec / (3600 * 24));
    const hours = Math.floor((sec % (3600 * 24)) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const chartData = history.map((m, i) => ({
    time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    cpu: m.cpuPercent,
    ram: m.ramPercent,
    rx: m.netRxKbps,
    tx: m.netTxKbps
  }));

  if (loading && !metrics) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 text-emerald-500 animate-spin mb-3" />
        <p className="text-neutral-500 font-medium">در حال بارگیری داده‌های زنده سرور...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-200 dark:border-white/10">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
              <Activity className="h-4 w-4" />
            </div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">
              {t.monitoring}
            </h2>
          </div>
          {metrics && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-[11px] font-mono text-neutral-600 dark:text-neutral-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span>{metrics.hostname}</span>
              <span className="opacity-40">&bull;</span>
              <span>{metrics.platform}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-xs text-neutral-600 dark:text-neutral-400">
            <span>{t.refreshInterval}:</span>
            <select
              value={refreshRate}
              onChange={(e) => setRefreshRate(Number(e.target.value))}
              className="bg-transparent font-medium text-neutral-900 dark:text-white focus:outline-none cursor-pointer py-0.5"
            >
              <option value={1000} className="bg-white dark:bg-[#121214]">1 {t.sec}</option>
              <option value={2000} className="bg-white dark:bg-[#121214]">2 {t.sec}</option>
              <option value={5000} className="bg-white dark:bg-[#121214]">5 {t.sec}</option>
            </select>
          </div>

          <button
            onClick={fetchMetrics}
            className="p-1.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 transition text-neutral-700 dark:text-neutral-300 cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Metric Summary Cards - Mobile View (Compact Rows) */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {/* CPU */}
        <div className="p-3 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 shrink-0">
              <Cpu className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate">{t.cpuUsage}</div>
              <div className="text-[10px] text-neutral-500 font-mono">{metrics?.cpuCores} {t.cores}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-16 bg-neutral-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: `${metrics?.cpuPercent || 0}%` }} />
            </div>
            <span className="text-sm font-extrabold font-mono text-neutral-900 dark:text-white w-10 text-left">
              {metrics?.cpuPercent}%
            </span>
          </div>
        </div>

        {/* RAM */}
        <div className="p-3 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 shrink-0">
              <Server className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate">{t.ramUsage}</div>
              <div className="text-[10px] text-neutral-500 font-mono truncate">{metrics?.ramUsedMB} / {metrics?.ramTotalMB} MB</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-16 bg-neutral-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
              <div className="bg-purple-500 h-full transition-all duration-500" style={{ width: `${metrics?.ramPercent || 0}%` }} />
            </div>
            <span className="text-sm font-extrabold font-mono text-neutral-900 dark:text-white w-10 text-left">
              {metrics?.ramPercent}%
            </span>
          </div>
        </div>

        {/* Disk */}
        <div className="p-3 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 shrink-0">
              <HardDrive className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate">{t.diskUsage}</div>
              <div className="text-[10px] text-neutral-500 font-mono truncate">{metrics?.diskUsedGB} / {metrics?.diskTotalGB} GB</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-16 bg-neutral-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
              <div className="bg-amber-500 h-full transition-all duration-500" style={{ width: `${metrics?.diskPercent || 0}%` }} />
            </div>
            <span className="text-sm font-extrabold font-mono text-neutral-900 dark:text-white w-10 text-left">
              {metrics?.diskPercent}%
            </span>
          </div>
        </div>

        {/* Uptime & Network */}
        <div className="p-3 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
              <Clock className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 truncate">{t.uptime}</div>
              <div className="text-[10px] text-neutral-500 font-mono dir-ltr">↓ {metrics?.netRxKbps} KB/s &bull; ↑ {metrics?.netTxKbps} KB/s</div>
            </div>
          </div>
          <span className="text-xs font-extrabold font-mono text-neutral-900 dark:text-white shrink-0">
            {formatUptime(metrics?.uptimeSeconds || 0)}
          </span>
        </div>
      </div>

      {/* Metric Summary Cards - Desktop View (Classic Grid) */}
      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU Card */}
        <div className="p-4 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-2xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              {t.cpuUsage}
            </span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Cpu className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-neutral-900 dark:text-white">
              {metrics?.cpuPercent}%
            </span>
            <span className="text-xs text-neutral-500 font-mono">
              ({metrics?.cpuCores} {t.cores})
            </span>
          </div>
          <div className="w-full bg-neutral-200 dark:bg-white/5 h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all duration-500"
              style={{ width: `${metrics?.cpuPercent || 0}%` }}
            ></div>
          </div>
        </div>

        {/* RAM Card */}
        <div className="p-4 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-2xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              {t.ramUsage}
            </span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <Server className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-neutral-900 dark:text-white">
              {metrics?.ramPercent}%
            </span>
            <span className="text-xs text-neutral-500 font-mono">
              ({metrics?.ramUsedMB} MB / {metrics?.ramTotalMB} MB)
            </span>
          </div>
          <div className="w-full bg-neutral-200 dark:bg-white/5 h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-purple-500 h-full transition-all duration-500"
              style={{ width: `${metrics?.ramPercent || 0}%` }}
            ></div>
          </div>
        </div>

        {/* Disk Card */}
        <div className="p-4 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-2xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              {t.diskUsage}
            </span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <HardDrive className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold font-mono text-neutral-900 dark:text-white">
              {metrics?.diskPercent}%
            </span>
            <span className="text-xs text-neutral-500 font-mono">
              ({metrics?.diskUsedGB} GB / {metrics?.diskTotalGB} GB)
            </span>
          </div>
          <div className="w-full bg-neutral-200 dark:bg-white/5 h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-amber-500 h-full transition-all duration-500"
              style={{ width: `${metrics?.diskPercent || 0}%` }}
            ></div>
          </div>
        </div>

        {/* Network & Uptime Card */}
        <div className="p-4 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-2xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              {t.uptime}
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono text-neutral-900 dark:text-white">
              {formatUptime(metrics?.uptimeSeconds || 0)}
            </span>
          </div>
          <div className="mt-3 text-xs text-neutral-500 dark:text-neutral-400 flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-white/5 font-mono">
            <span>{t.rxSpeed}: {metrics?.netRxKbps} KB/s</span>
            <span>{t.txSpeed}: {metrics?.netTxKbps} KB/s</span>
          </div>
        </div>
      </div>

      {/* Live Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* CPU Chart */}
        <div className="p-3.5 sm:p-5 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-md sm:shadow-2xl">
          <h3 className="text-xs font-semibold text-neutral-800 dark:text-neutral-300 mb-2.5 sm:mb-4 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-blue-500" />
            <span>{t.cpuHistory} (%)</span>
          </h3>
          <div className="h-44 sm:h-64 w-full">
            {active && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="cpuColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#888' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#888' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#121214', borderColor: '#333', borderRadius: '12px' }} />
                  <Area type="monotone" dataKey="cpu" stroke="#2563eb" fillOpacity={1} fill="url(#cpuColor)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* RAM Chart */}
        <div className="p-3.5 sm:p-5 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-md sm:shadow-2xl">
          <h3 className="text-xs font-semibold text-neutral-800 dark:text-neutral-300 mb-2.5 sm:mb-4 flex items-center gap-2">
            <Server className="h-4 w-4 text-purple-500" />
            <span>{t.ramHistory} (%)</span>
          </h3>
          <div className="h-44 sm:h-64 w-full">
            {active && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="ramColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#888' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#888' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#121214', borderColor: '#333', borderRadius: '12px' }} />
                  <Area type="monotone" dataKey="ram" stroke="#a855f7" fillOpacity={1} fill="url(#ramColor)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Network Traffic Chart */}
        <div className="p-3.5 sm:p-5 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-md sm:shadow-2xl lg:col-span-2">
          <h3 className="text-xs font-semibold text-neutral-800 dark:text-neutral-300 mb-2.5 sm:mb-4 flex items-center gap-2">
            <Network className="h-4 w-4 text-emerald-500" />
            <span>{t.netHistory}</span>
          </h3>
          <div className="h-44 sm:h-64 w-full">
            {active && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#888' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#888' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#121214', borderColor: '#333', borderRadius: '12px' }} />
                  <Line type="monotone" dataKey="rx" name={t.rxSpeed} stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="tx" name={t.txSpeed} stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
