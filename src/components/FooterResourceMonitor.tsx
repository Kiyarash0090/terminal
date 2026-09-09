import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Cpu,
  Activity,
  HardDrive,
  Clock,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  X,
  Server,
  Zap,
  Info,
  Layers
} from 'lucide-react';
import { Language, SystemMetrics } from '../types';

interface FooterResourceMonitorProps {
  token: string | null;
  lang: Language;
}

export const FooterResourceMonitor: React.FC<FooterResourceMonitorProps> = ({ token, lang }) => {
  const isFa = lang === 'fa';
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [history, setHistory] = useState<SystemMetrics[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [intervalSec, setIntervalSec] = useState<number>(3);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isOpen &&
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Fetch live metrics from /api/metrics/live
  const fetchMetrics = useCallback(
    async (isManual = false) => {
      if (!token) return;
      if (isManual) setRefreshing(true);

      try {
        const res = await fetch('/api/metrics/live', {
          headers: {
            'x-auth-token': token,
            'Accept': 'application/json'
          }
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (data && data.current) {
          setMetrics(data.current);
          if (Array.isArray(data.history)) {
            setHistory(data.history);
          }
          setLastUpdated(new Date());
          setError(null);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch metrics');
      } finally {
        setLoading(false);
        if (isManual) {
          setTimeout(() => setRefreshing(false), 500);
        }
      }
    },
    [token]
  );

  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchMetrics(false);
  }, [fetchMetrics]);

  // Polling interval with document visibility support
  useEffect(() => {
    if (intervalSec <= 0) return;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchMetrics(false);
      }
    }, intervalSec * 1000);

    return () => clearInterval(interval);
  }, [fetchMetrics, intervalSec]);

  // Format uptime
  const formatUptime = (totalSeconds: number | undefined): string => {
    if (!totalSeconds || totalSeconds < 0) return isFa ? 'نامشخص' : 'N/A';
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);

    if (days > 0) {
      return isFa ? `${days} روز و ${hours} ساعت` : `${days}d ${hours}h`;
    }
    if (hours > 0) {
      return isFa ? `${hours} ساعت و ${mins} دقیقه` : `${hours}h ${mins}m`;
    }
    return isFa ? `${mins} دقیقه` : `${mins}m`;
  };

  // Format network speed (KB/s or MB/s)
  const formatNetSpeed = (kbps: number | undefined): string => {
    if (kbps === undefined || isNaN(kbps)) return '0 KB/s';
    if (kbps >= 1024) {
      return `${(kbps / 1024).toFixed(1)} MB/s`;
    }
    return `${Math.round(kbps)} KB/s`;
  };

  // Color coding helper for percentage values
  const getPercentColor = (pct: number) => {
    if (pct >= 85) return 'text-rose-500 dark:text-rose-400';
    if (pct >= 65) return 'text-amber-500 dark:text-amber-400';
    return 'text-emerald-500 dark:text-emerald-400';
  };

  const getPercentBadge = (pct: number) => {
    if (pct >= 85) return 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/20';
    if (pct >= 65) return 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/20';
    return 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/20';
  };

  const getBarColor = (pct: number) => {
    if (pct >= 85) return 'bg-rose-500';
    if (pct >= 65) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <footer className="sticky bottom-0 z-20 w-full border-t border-neutral-200/90 dark:border-white/10 bg-neutral-50/90 dark:bg-[#0c0c0e]/95 backdrop-blur-md py-1 px-3 flex items-center justify-center shrink-0">
      <div className="relative">
        {/* Minimal Resource Pill - Small Width */}
        <div
          ref={triggerRef}
          onClick={() => setIsOpen((prev) => !prev)}
          className="group inline-flex items-center gap-1.5 sm:gap-2.5 px-2.5 sm:px-3 py-1 bg-white dark:bg-white/5 hover:bg-neutral-100 dark:hover:bg-white/10 border border-neutral-200/90 dark:border-white/10 rounded-full text-[10.5px] sm:text-xs font-medium text-neutral-700 dark:text-neutral-300 transition-all cursor-pointer shadow-xs max-w-fit select-none"
          title={isFa ? 'کلیک برای مشاهده جزئیات پایش سرور' : 'Click to view server metrics details'}
          role="button"
          tabIndex={0}
        >
          {/* Pulsing Live indicator */}
          <span className="flex h-2 w-2 relative shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>

          {/* Minimal Label */}
          <span className="font-semibold text-neutral-900 dark:text-neutral-100 text-[10px] sm:text-xs hidden sm:inline">
            {isFa ? 'پایش سرور' : 'Server'}
          </span>

          <span className="text-neutral-300 dark:text-neutral-700 hidden sm:inline">|</span>

          {/* CPU Metric */}
          <div className="flex items-center gap-1">
            <Cpu className="h-3 w-3 text-blue-500 shrink-0" />
            <span className="font-mono font-semibold">
              CPU: <span className={metrics ? getPercentColor(metrics.cpuPercent) : ''}>
                {metrics ? `${metrics.cpuPercent}%` : '...'}
              </span>
            </span>
          </div>

          <span className="text-neutral-300 dark:text-neutral-700">|</span>

          {/* RAM Metric */}
          <div className="flex items-center gap-1">
            <Activity className="h-3 w-3 text-purple-500 shrink-0" />
            <span className="font-mono font-semibold">
              RAM: <span className={metrics ? getPercentColor(metrics.ramPercent) : ''}>
                {metrics ? `${metrics.ramPercent}%` : '...'}
              </span>
            </span>
            {metrics && (
              <span className="text-[9.5px] text-neutral-400 dark:text-neutral-500 hidden md:inline font-mono">
                ({(metrics.ramUsedMB / 1024).toFixed(1)}GB)
              </span>
            )}
          </div>

          <span className="text-neutral-300 dark:text-neutral-700">|</span>

          {/* Disk Metric */}
          <div className="flex items-center gap-1">
            <HardDrive className="h-3 w-3 text-amber-500 shrink-0" />
            <span className="font-mono font-semibold">
              Disk: <span className={metrics ? getPercentColor(metrics.diskPercent) : ''}>
                {metrics ? `${metrics.diskPercent}%` : '...'}
              </span>
            </span>
          </div>

          {/* Uptime on slightly larger screens */}
          {metrics && (
            <>
              <span className="text-neutral-300 dark:text-neutral-700 hidden sm:inline">|</span>
              <div className="hidden sm:flex items-center gap-1 text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                <Clock className="h-2.5 w-2.5 text-neutral-400 shrink-0" />
                <span>{formatUptime(metrics.uptimeSeconds)}</span>
              </div>
            </>
          )}

          {/* Arrow Indicator */}
          <div className="ml-0.5 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 transition-colors">
            {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </div>
        </div>

        {/* Detailed Monitoring Popover Modal */}
        {isOpen && (
          <div
            ref={popoverRef}
            className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-[94vw] sm:w-[490px] max-w-[520px] bg-white dark:bg-[#141417] border border-neutral-200 dark:border-white/10 rounded-2xl shadow-2xl p-3.5 sm:p-4 text-xs z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
            dir={isFa ? 'rtl' : 'ltr'}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-white/5 mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Server className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-neutral-900 dark:text-white text-xs sm:text-sm">
                    {isFa ? 'پایش زنده منابع سرور' : 'Server Resource Monitor'}
                  </h4>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    {metrics?.hostname || 'Host'} • {metrics?.platform || 'Linux'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchMetrics(true);
                  }}
                  disabled={refreshing}
                  className="p-1.5 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 transition cursor-pointer"
                  title={isFa ? 'بروزرسانی دستی' : 'Refresh now'}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-blue-500' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                  }}
                  className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-white rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 transition cursor-pointer"
                  title={isFa ? 'بستن' : 'Close'}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Container Resource Notice if applicable */}
            {metrics?.containerInfo && (
              <div className="mb-3 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg text-[10px] text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                <Info className="h-3 w-3 shrink-0 text-blue-500" />
                <span>{metrics.containerInfo}</span>
              </div>
            )}

            {/* 4 Core Metric Cards */}
            <div className="grid grid-cols-2 gap-2 sm:gap-2.5 mb-3">
              {/* CPU Card */}
              <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200/70 dark:border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400 font-medium">
                    <Cpu className="h-3.5 w-3.5 text-blue-500" />
                    <span>{isFa ? 'پردازنده' : 'CPU'}</span>
                  </span>
                  <span
                    className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] border ${
                      metrics ? getPercentBadge(metrics.cpuPercent) : ''
                    }`}
                  >
                    {metrics ? `${metrics.cpuPercent}%` : '...'}
                  </span>
                </div>
                <div className="w-full bg-neutral-200 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full transition-all duration-300 ${metrics ? getBarColor(metrics.cpuPercent) : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(100, Math.max(0, metrics?.cpuPercent || 0))}%` }}
                  />
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400 flex justify-between">
                  <span>{metrics?.cpuCores || 1} {isFa ? 'هسته' : 'Cores'}</span>
                  <span className="truncate max-w-[120px]" title={metrics?.cpuModel}>
                    {metrics?.cpuModel?.replace(/Intel\(R\)|Core\(TM\)|Processor/g, '').trim()}
                  </span>
                </div>
              </div>

              {/* RAM Card */}
              <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200/70 dark:border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400 font-medium">
                    <Activity className="h-3.5 w-3.5 text-purple-500" />
                    <span>{isFa ? 'حافظه رم' : 'RAM'}</span>
                  </span>
                  <span
                    className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] border ${
                      metrics ? getPercentBadge(metrics.ramPercent) : ''
                    }`}
                  >
                    {metrics ? `${metrics.ramPercent}%` : '...'}
                  </span>
                </div>
                <div className="w-full bg-neutral-200 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full transition-all duration-300 ${metrics ? getBarColor(metrics.ramPercent) : 'bg-purple-500'}`}
                    style={{ width: `${Math.min(100, Math.max(0, metrics?.ramPercent || 0))}%` }}
                  />
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400 flex justify-between font-mono">
                  <span>
                    {metrics ? `${(metrics.ramUsedMB / 1024).toFixed(1)} GB` : '0'}
                  </span>
                  <span>
                    / {metrics ? `${(metrics.ramTotalMB / 1024).toFixed(1)} GB` : '0'}
                  </span>
                </div>
              </div>

              {/* Disk Card */}
              <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200/70 dark:border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400 font-medium">
                    <HardDrive className="h-3.5 w-3.5 text-amber-500" />
                    <span>{isFa ? 'فضای دیسک' : 'Disk'}</span>
                  </span>
                  <span
                    className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] border ${
                      metrics ? getPercentBadge(metrics.diskPercent) : ''
                    }`}
                  >
                    {metrics ? `${metrics.diskPercent}%` : '...'}
                  </span>
                </div>
                <div className="w-full bg-neutral-200 dark:bg-neutral-800 h-1.5 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full transition-all duration-300 ${metrics ? getBarColor(metrics.diskPercent) : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, Math.max(0, metrics?.diskPercent || 0))}%` }}
                  />
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400 flex justify-between font-mono">
                  <span>
                    {metrics ? `${metrics.diskUsedGB} GB` : '0'}
                  </span>
                  <span>
                    / {metrics ? `${metrics.diskTotalGB} GB` : '0'}
                  </span>
                </div>
              </div>

              {/* Network & Uptime Card */}
              <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200/70 dark:border-white/5 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-1 text-neutral-600 dark:text-neutral-400 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-emerald-500" />
                    <span>{isFa ? 'شبکه و فعالیت' : 'Network'}</span>
                  </span>
                  {metrics?.loadAvg && (
                    <span className="text-[9px] font-mono text-neutral-400" title="Load Average">
                      LA: {metrics.loadAvg.slice(0, 2).join(', ')}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between font-mono text-[10px] py-1 border-b border-neutral-100 dark:border-white/5">
                  <span className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
                    <ArrowDown className="h-2.5 w-2.5 text-emerald-500" />
                    <span>Rx:</span>
                  </span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {formatNetSpeed(metrics?.netRxKbps)}
                  </span>
                </div>

                <div className="flex items-center justify-between font-mono text-[10px] pt-1">
                  <span className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
                    <ArrowUp className="h-2.5 w-2.5 text-blue-500" />
                    <span>Tx:</span>
                  </span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {formatNetSpeed(metrics?.netTxKbps)}
                  </span>
                </div>
              </div>
            </div>

            {/* Sparkline trend from history */}
            {history.length > 3 && (
              <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200/70 dark:border-white/5 mb-3">
                <div className="flex items-center justify-between text-[10px] text-neutral-500 dark:text-neutral-400 mb-1.5">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Layers className="h-3 w-3 text-indigo-500" />
                    <span>{isFa ? 'روند مصرف ۳۰ نقطه اخیر' : 'Recent Trend History'}</span>
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[9.5px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                      <span>CPU</span>
                    </span>
                    <span className="flex items-center gap-1 text-[9.5px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-purple-500"></span>
                      <span>RAM</span>
                    </span>
                  </div>
                </div>

                {/* Mini SVG Sparkline */}
                <div className="h-10 w-full flex items-end gap-1 pt-1">
                  {history.slice(-24).map((pt, i) => {
                    const cpuH = Math.max(4, Math.min(36, Math.round((pt.cpuPercent / 100) * 36)));
                    const ramH = Math.max(4, Math.min(36, Math.round((pt.ramPercent / 100) * 36)));
                    return (
                      <div
                        key={i}
                        className="flex-1 flex items-end justify-center gap-0.5 h-full group/bar relative"
                        title={`CPU: ${pt.cpuPercent}% | RAM: ${pt.ramPercent}%`}
                      >
                        <div
                          className="w-full max-w-[6px] bg-blue-500/70 hover:bg-blue-500 rounded-t-xs transition-all"
                          style={{ height: `${cpuH}px` }}
                        />
                        <div
                          className="w-full max-w-[6px] bg-purple-500/70 hover:bg-purple-500 rounded-t-xs transition-all"
                          style={{ height: `${ramH}px` }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bottom Controls of Popover */}
            <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-white/5 text-[10px] text-neutral-500 dark:text-neutral-400">
              <div className="flex items-center gap-1.5">
                <span>{isFa ? 'بروزرسانی:' : 'Refresh:'}</span>
                {[2, 5, 10].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setIntervalSec(sec)}
                    className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
                      intervalSec === sec
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'bg-neutral-200 dark:bg-white/10 hover:bg-neutral-300 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    {sec}{isFa ? 'ث' : 's'}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setIntervalSec(0)}
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition ${
                    intervalSec === 0
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'bg-neutral-200 dark:bg-white/10 hover:bg-neutral-300 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {isFa ? 'توقف' : 'Pause'}
                </button>
              </div>

              {lastUpdated && (
                <span className="font-mono">
                  {lastUpdated.toLocaleTimeString(isFa ? 'fa-IR' : 'en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </footer>
  );
};
