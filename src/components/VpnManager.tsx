import React, { useState, useEffect, useRef } from 'react';
import { Globe, Power, RefreshCw, Plus, Trash2, Check, AlertCircle, Zap, ShieldCheck, MapPin, Server, Activity, ArrowUpRight, Copy, CheckCircle2, RotateCcw, X, Terminal, ChevronDown, ChevronUp, ScrollText, Download, Play, Pause, Search } from 'lucide-react';
import { Language } from '../types';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { UndoToast } from './UndoToast';

const PING_CACHE_KEY = 'vpn_ping_test_results';

const getCachedPingResults = (): Record<string, { success: boolean; output: string }> => {
  try {
    const raw = localStorage.getItem(PING_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const savePingResults = (newResults: Record<string, { success: boolean; output: string }>) => {
  try {
    const current = getCachedPingResults();
    const updated = { ...current, ...newResults };
    localStorage.setItem(PING_CACHE_KEY, JSON.stringify(updated));
  } catch {
    // silent fallback
  }
};

const clearPingResults = () => {
  try {
    localStorage.removeItem(PING_CACHE_KEY);
  } catch {
    // silent
  }
};

interface VpnConfigItem {
  index: number;
  name: string;
  config: string;
  isActive: boolean;
  testResult?: {
    success: boolean;
    output: string;
    loading?: boolean;
  };
}

interface IpInfo {
  ip?: string;
  country?: string;
  city?: string;
  org?: string;
  region?: string;
}

interface VpnManagerProps {
  token: string | null;
  lang: Language;
}

export const VpnManager: React.FC<VpnManagerProps> = ({ token, lang }) => {
  const isFa = lang === 'fa';

  const [status, setStatus] = useState<{
    running: boolean;
    enabled: boolean;
    activeIndex: number | null;
    activeName: string | null;
    configsCount: number;
    socksProxy: string;
    httpProxy: string;
  }>({
    running: false,
    enabled: false,
    activeIndex: null,
    activeName: null,
    configsCount: 0,
    socksProxy: '127.0.0.1:10808',
    httpProxy: '127.0.0.1:10809'
  });

  const [configs, setConfigs] = useState<VpnConfigItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [testingAll, setTestingAll] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // New Config Modal/Input
  const [showAddModal, setShowAddModal] = useState(false);
  const [newConfigStr, setNewConfigStr] = useState('');
  const [newConfigName, setNewConfigName] = useState('');

  // IP Check State
  const [ipData, setIpData] = useState<{ direct: IpInfo | null; vpn: IpInfo | null; proxyActive: boolean } | null>(null);
  const [checkingIp, setCheckingIp] = useState(false);
  const [copiedProxy, setCopiedProxy] = useState(false);
  const [showQuickHelp, setShowQuickHelp] = useState(false);
  const [copiedSnippetIndex, setCopiedSnippetIndex] = useState<number | null>(null);
  // Delete Modal state
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: 'single' | 'bulk' | null;
    index?: number;
    indices?: number[];
    configName?: string;
    count?: number;
  }>({ isOpen: false, type: null });
  const [isDeleting, setIsDeleting] = useState(false);
  const [undoToast, setUndoToast] = useState<{ id: string; trashId: string; message: string } | null>(null);

  // Xray / V2Ray Logs State
  const [vpnLogs, setVpnLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [showLogsCard, setShowLogsCard] = useState(true);
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/vpn/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // silent
    }
  };

  const fetchConfigs = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/vpn/configs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        const rawConfigs: VpnConfigItem[] = data.configs || [];
        const cachedResults = getCachedPingResults();
        const merged = rawConfigs.map(c => {
          const cacheKey = c.config || c.name || String(c.index);
          if (cachedResults[cacheKey]) {
            return {
              ...c,
              testResult: {
                ...cachedResults[cacheKey],
                loading: false
              }
            };
          }
          return c;
        });
        setConfigs(merged);
      }
    } catch (err: any) {
      setMessage({ text: isFa ? 'خطا در دریافت کانفیگ‌ها' : 'Error fetching configs', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchIpInfo = async () => {
    if (!token) return;
    try {
      setCheckingIp(true);
      const res = await fetch('/api/vpn/ip-check', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        setIpData(data);
      }
    } catch {
      // silent
    } finally {
      setCheckingIp(false);
    }
  };

  const fetchVpnLogs = async (silent = false) => {
    if (!token) return;
    try {
      if (!silent) setLogsLoading(true);
      const res = await fetch('/api/vpn/logs?lines=300', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        setVpnLogs(data.logs || []);
      }
    } catch {
      // silent
    } finally {
      if (!silent) setLogsLoading(false);
    }
  };

  const handleClearVpnLogs = async () => {
    if (!token) return;
    try {
      setLogsLoading(true);
      const res = await fetch('/api/vpn/logs/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        setVpnLogs([]);
        setMessage({
          text: isFa ? 'لاگ‌های xray/v2ray با موفقیت پاکسازی شدند' : 'Xray/V2Ray logs cleared successfully',
          type: 'success'
        });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setLogsLoading(false);
    }
  };

  const handleCopyVpnLogs = () => {
    const textToCopy = (logSearchQuery.trim() ? filteredLogs : vpnLogs).join('\n');
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const handleDownloadVpnLogs = () => {
    const textToDownload = vpnLogs.join('\n');
    const blob = new Blob([textToDownload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `xray_v2ray_logs_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    fetchStatus();
    fetchConfigs();
    fetchIpInfo();
    fetchVpnLogs();
    const interval = setInterval(() => {
      fetchStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [token]);

  // Polling for Xray / V2Ray Logs
  useEffect(() => {
    if (!autoRefreshLogs || !token) return;
    const interval = setInterval(() => {
      fetchVpnLogs(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefreshLogs, token]);

  // Auto scroll to bottom
  useEffect(() => {
    if (autoScrollLogs && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [vpnLogs, autoScrollLogs]);

  const handleToggleVpn = async () => {
    try {
      setActionLoading(true);
      setMessage(null);
      const endpoint = status.running ? '/api/vpn/stop' : '/api/vpn/start';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message || (isFa ? 'عملیات با موفقیت انجام شد' : 'Success'), type: 'success' });
        setTimeout(() => {
          fetchStatus();
          fetchIpInfo();
        }, 1500);
      } else {
        setMessage({ text: data.error || data.message || (isFa ? 'خطا در تغییر وضعیت VPN' : 'VPN action failed'), type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConfigStr.trim()) return;

    try {
      setActionLoading(true);
      const res = await fetch('/api/vpn/configs/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ configStr: newConfigStr, name: newConfigName })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({
          text: isFa ? `تعداد ${data.added} کانفیگ با موفقیت اضافه شد` : `Successfully added ${data.added} configs`,
          type: 'success'
        });
        setNewConfigStr('');
        setNewConfigName('');
        setShowAddModal(false);
        fetchConfigs();
        fetchStatus();
      } else {
        setMessage({ text: data.error || (isFa ? 'خطا در افزودن کانفیگ' : 'Failed to add config'), type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

  const toggleSelectIndex = (index: number) => {
    setSelectedIndices(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIndices.length === configs.length) {
      setSelectedIndices([]);
    } else {
      setSelectedIndices(configs.map(c => c.index));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIndices.length === 0) return;
    setDeleteModal({
      isOpen: true,
      type: 'bulk',
      indices: selectedIndices,
      count: selectedIndices.length
    });
  };

  const handleDeleteConfig = (index: number) => {
    const configItem = configs.find(c => c.index === index);
    setDeleteModal({
      isOpen: true,
      type: 'single',
      index,
      configName: configItem?.name || `Config #${index + 1}`
    });
  };

  const confirmExecuteVpnDelete = async () => {
    if (!deleteModal.type) return;
    setIsDeleting(true);
    try {
      if (deleteModal.type === 'bulk' && deleteModal.indices) {
        const res = await fetch('/api/vpn/configs/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ indices: deleteModal.indices })
        });
        const data = await res.json();
        if (data.success) {
          if (data.trashId) {
            setUndoToast({
              id: data.trashId,
              trashId: data.trashId,
              message: isFa ? `${deleteModal.count || deleteModal.indices.length} کانفیگ VPN حذف شد` : `${deleteModal.count || deleteModal.indices.length} VPN Configs deleted`
            });
          } else {
            setMessage({ text: data.message || (isFa ? 'کانفیگ‌ها با موفقیت حذف شدند' : 'Configs deleted'), type: 'success' });
          }
          setSelectedIndices([]);
          fetchConfigs();
          fetchStatus();
        } else {
          setMessage({ text: data.error || data.message || (isFa ? 'خطا در حذف کانفیگ‌ها' : 'Error deleting configs'), type: 'error' });
        }
      } else if (deleteModal.type === 'single' && deleteModal.index !== undefined) {
        const res = await fetch('/api/vpn/configs/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ index: deleteModal.index })
        });
        const data = await res.json();
        if (data.success) {
          if (data.trashId) {
            setUndoToast({
              id: data.trashId,
              trashId: data.trashId,
              message: isFa ? `کانفیگ «${deleteModal.configName}» حذف شد` : `'${deleteModal.configName}' deleted`
            });
          } else {
            setMessage({ text: data.message, type: 'success' });
          }
          fetchConfigs();
          fetchStatus();
        } else {
          setMessage({ text: data.error || data.message, type: 'error' });
        }
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setIsDeleting(false);
      setDeleteModal({ isOpen: false, type: null });
    }
  };

  const handleRestoreVpnFromUndo = async (trashId: string) => {
    try {
      const res = await fetch('/api/vpn/configs/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ trashId })
      });
      const data = await res.json();
      if (data.success) {
        fetchConfigs();
        fetchStatus();
      }
    } catch {}
  };

  const handleSelectConfig = async (index: number) => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/vpn/configs/select', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ index })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message, type: 'success' });
        fetchConfigs();
        fetchStatus();
        setTimeout(() => {
          fetchStatus();
          fetchIpInfo();
          fetchVpnLogs(true);
        }, 1200);
      } else {
        setMessage({ text: data.error || data.message, type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleTestConfig = async (index: number) => {
    setConfigs(prev => prev.map(c => c.index === index ? { ...c, testResult: { success: false, output: isFa ? '📶 در حال تست پینگ...' : '📶 Testing ping...', loading: true } } : c));
    try {
      // Step 1: Ping
      const resPing = await fetch('/api/vpn/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ index, mode: 'ping' })
      });
      const dataPing = await resPing.json();
      const isPingSuccess = dataPing.result?.[0] ?? false;
      const pingText = dataPing.result?.[1] || (isPingSuccess ? 'پینگ موفق' : 'پینگ ناموفق');
      const pingVal = dataPing.ping;

      if (!isPingSuccess) {
        const testObj = { success: false, output: pingText, loading: false };
        setConfigs(prev => prev.map(c => {
          if (c.index === index) {
            const cacheKey = c.config || c.name || String(c.index);
            savePingResults({ [cacheKey]: testObj });
            return { ...c, testResult: testObj };
          }
          return c;
        }));
        return;
      }

      // Show ping result live and mark testing speed
      setConfigs(prev => prev.map(c => {
        if (c.index === index) {
          return { ...c, testResult: { success: true, output: `${pingText}\n⚡ ${isFa ? 'در حال تست سرعت (دانلود و آپلود)...' : 'Testing speed...'}`, loading: true } };
        }
        return c;
      }));

      // Step 2: Speed
      const resSpeed = await fetch('/api/vpn/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ index, mode: 'speed', ping: pingVal })
      });
      const dataSpeed = await resSpeed.json();
      const isSpeedSuccess = dataSpeed.result?.[0] ?? true;
      const finalResultText = dataSpeed.result?.[1] || pingText;
      const testObj = { success: isSpeedSuccess, output: finalResultText, loading: false };

      setConfigs(prev => prev.map(c => {
        if (c.index === index) {
          const cacheKey = c.config || c.name || String(c.index);
          savePingResults({ [cacheKey]: testObj });
          return { ...c, testResult: testObj };
        }
        return c;
      }));
    } catch (err: any) {
      setConfigs(prev => prev.map(c => c.index === index ? { ...c, testResult: { success: false, output: err.message, loading: false } } : c));
    }
  };

  const handleTestAllConfigs = async () => {
    if (configs.length === 0) return;
    try {
      setTestingAll(true);

      const currentConfigs = [...configs];

      // Mark all configs as queued for ping
      setConfigs(prev => prev.map(c => ({
        ...c,
        testResult: {
          success: false,
          output: isFa ? '📶 در صف تست پینگ...' : '📶 Queued for ping test...',
          loading: true
        }
      })));

      const pingResultsMap: Record<number, { success: boolean; output: string; ping?: number }> = {};

      // Phase 1: Test ping in batches of 5 concurrently
      const BATCH_SIZE = 5;
      for (let i = 0; i < currentConfigs.length; i += BATCH_SIZE) {
        const chunk = currentConfigs.slice(i, i + BATCH_SIZE);

        await Promise.all(chunk.map(async (c) => {
          setConfigs(prev => prev.map(item => item.index === c.index ? {
            ...item,
            testResult: {
              success: false,
              output: isFa ? '📶 در حال تست پینگ...' : '📶 Testing ping...',
              loading: true
            }
          } : item));

          try {
            const res = await fetch('/api/vpn/test', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ index: c.index, mode: 'ping' })
            });
            const data = await res.json();
            const isPingSuccess = data.result?.[0] ?? false;
            const pingText = data.result?.[1] || (isPingSuccess ? 'پینگ موفق' : 'پینگ ناموفق');
            const pingVal = data.ping;

            pingResultsMap[c.index] = {
              success: isPingSuccess,
              output: pingText,
              ping: pingVal
            };

            const resObj = { success: isPingSuccess, output: pingText, loading: false };
            setConfigs(prev => prev.map(item => {
              if (item.index === c.index) {
                const cacheKey = item.config || item.name || String(item.index);
                savePingResults({ [cacheKey]: resObj });
                return { ...item, testResult: resObj };
              }
              return item;
            }));
          } catch (err: any) {
            pingResultsMap[c.index] = {
              success: false,
              output: err.message || 'Error testing ping'
            };
            setConfigs(prev => prev.map(item => item.index === c.index ? {
              ...item,
              testResult: { success: false, output: err.message || 'Error', loading: false }
            } : item));
          }
        }));
      }

      // Phase 2: Speed test one by one (sequential)
      for (const c of currentConfigs) {
        const pingRes = pingResultsMap[c.index];
        if (!pingRes || !pingRes.success) {
          continue;
        }

        setConfigs(prev => prev.map(item => item.index === c.index ? {
          ...item,
          testResult: {
            success: true,
            output: `${pingRes.output}\n⚡ ${isFa ? 'در حال تست سرعت (دانلود و آپلود)...' : 'Testing speed...'}`,
            loading: true
          }
        } : item));

        try {
          const res = await fetch('/api/vpn/test', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ index: c.index, mode: 'speed', ping: pingRes.ping })
          });
          const data = await res.json();
          const isSpeedSuccess = data.result?.[0] ?? false;
          const finalResultText = data.result?.[1] || pingRes.output;
          const resObj = { success: isSpeedSuccess, output: finalResultText, loading: false };

          setConfigs(prev => prev.map(item => {
            if (item.index === c.index) {
              const cacheKey = item.config || item.name || String(item.index);
              savePingResults({ [cacheKey]: resObj });
              return { ...item, testResult: resObj };
            }
            return item;
          }));
        } catch (err: any) {
          // Keep ping result
        }
      }

    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setTestingAll(false);
    }
  };

  const handleResetPingResults = () => {
    clearPingResults();
    setConfigs(prev => prev.map(c => ({ ...c, testResult: undefined })));
    setMessage({
      text: isFa ? 'نتایج تست پینگ با موفقیت ریسیت (پاکسازی) شدند' : 'Ping test results reset successfully',
      type: 'success'
    });
  };

  const handleClearSinglePingResult = (index: number) => {
    setConfigs(prev => prev.map(c => {
      if (c.index === index) {
        const cacheKey = c.config || c.name || String(c.index);
        try {
          const current = getCachedPingResults();
          delete current[cacheKey];
          localStorage.setItem(PING_CACHE_KEY, JSON.stringify(current));
        } catch {
          // ignore
        }
        return { ...c, testResult: undefined };
      }
      return c;
    }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedProxy(true);
    setTimeout(() => setCopiedProxy(false), 2000);
  };

  const filteredLogs = vpnLogs.filter(line => {
    if (!logSearchQuery.trim()) return true;
    return line.toLowerCase().includes(logSearchQuery.toLowerCase());
  });

  const getLogLineStyle = (line: string) => {
    const lower = line.toLowerCase();
    if (lower.includes('error') || lower.includes('failed') || lower.includes('fail') || lower.includes('rejected') || lower.includes('fatal') || lower.includes('panic')) {
      return 'text-rose-400 font-medium';
    }
    if (lower.includes('warning') || lower.includes('warn') || lower.includes('timeout')) {
      return 'text-amber-300';
    }
    if (lower.includes('started') || lower.includes('listening') || lower.includes('accepted') || lower.includes('success') || lower.includes('ok')) {
      return 'text-emerald-400';
    }
    if (lower.includes('vless') || lower.includes('vmess') || lower.includes('trojan') || lower.includes('proxy') || lower.includes('socks')) {
      return 'text-indigo-300';
    }
    return 'text-neutral-300';
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Alert Messages */}
      {message && (
        <div
          className={`p-3 sm:p-4 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-between shadow-lg ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2 sm:gap-3">
            {message.type === 'success' ? <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" /> : <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />}
            <span className="leading-relaxed">{message.text}</span>
          </div>
          <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100 cursor-pointer">✕</button>
        </div>
      )}

      {/* Main Status Header Card */}
      <div className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-6">
          <div className="flex items-start gap-2.5 sm:gap-4">
            <div
              className={`p-2.5 sm:p-4 rounded-xl sm:rounded-2xl shrink-0 ${
                status.running
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 animate-pulse'
                  : 'bg-neutral-100 dark:bg-white/5 text-neutral-400 border border-neutral-200 dark:border-white/10'
              }`}
            >
              <Globe className="h-5 w-5 sm:h-8 sm:w-8" />
            </div>

            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h2 className="text-sm sm:text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
                  {isFa ? 'سامانه تانل و VPN سرور' : 'Server VPN & Tunnel Engine'}
                </h2>
                <span
                  className={`inline-flex items-center gap-1 sm:gap-1.5 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold ${
                    status.running
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${status.running ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
                  {status.running ? (isFa ? 'VPN فعال است' : 'VPN Online') : (isFa ? 'VPN غیرفعال است' : 'VPN Offline')}
                </span>
              </div>

              <p className="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400">
                {isFa
                  ? 'تانل کردن کل ترافیک سرور، پشتیبانی از vmess، vless، trojan، reality و xhttp'
                  : 'Full server routing via Xray-core with support for VLESS, VMess, Trojan, REALITY & XHTTP'}
              </p>

              <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[11px] sm:text-xs font-mono pt-1.5 sm:pt-2 text-neutral-600 dark:text-neutral-400">
                <span className="flex items-center gap-1 sm:gap-1.5 bg-neutral-100 dark:bg-white/5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-neutral-200 dark:border-white/10">
                  <Server className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-500" />
                  {isFa ? 'کانفیگ فعال:' : 'Active:'} <strong className="text-neutral-900 dark:text-white truncate max-w-[120px] sm:max-w-none">{status.activeName || (isFa ? 'انتخاب نشده' : 'None')}</strong>
                </span>

                <span className="flex items-center gap-1 sm:gap-1.5 bg-neutral-100 dark:bg-white/5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-neutral-200 dark:border-white/10">
                  <ShieldCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-500" />
                  {isFa ? 'پروکسی:' : 'Proxy:'} <strong className="text-neutral-900 dark:text-white">{status.socksProxy}</strong>
                  <button
                    onClick={() => copyToClipboard(status.socksProxy)}
                    className="hover:text-blue-500 ml-1 cursor-pointer"
                    title={isFa ? 'کپی آدرس پروکسی' : 'Copy Proxy'}
                  >
                    {copiedProxy ? <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-500" /> : <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
                  </button>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 self-stretch md:self-auto justify-end">
            <button
              onClick={fetchStatus}
              className="p-2 sm:p-3 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-lg sm:rounded-xl border border-neutral-200 dark:border-white/10 transition cursor-pointer"
              title={isFa ? 'بروزرسانی وضعیت' : 'Refresh Status'}
            >
              <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>

            <button
              onClick={handleToggleVpn}
              disabled={actionLoading}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 sm:gap-3 px-3.5 py-2 sm:px-6 sm:py-3.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold transition shadow-md cursor-pointer ${
                status.running
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
              } disabled:opacity-50`}
            >
              <Power className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>
                {actionLoading
                  ? (isFa ? 'در حال پردازش...' : 'Processing...')
                  : status.running
                  ? (isFa ? 'خاموش کردن VPN' : 'Disconnect VPN')
                  : (isFa ? 'روشن کردن VPN' : 'Connect VPN')}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Live IP & Location Checker Grid */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4">
        {/* Direct IP */}
        <div className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-xl sm:rounded-2xl p-2.5 sm:p-5 shadow-sm space-y-1.5 sm:space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-1 min-w-0">
            <div className="flex items-center gap-1 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 min-w-0 flex-1">
              <MapPin className="h-3 w-3 sm:h-4 sm:w-4 text-amber-500 shrink-0" />
              <span className="truncate">{isFa ? 'IP مستقیم سرور (Direct IP)' : 'Direct Server IP'}</span>
            </div>
            <span className="text-[9px] sm:text-xs font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-500/20 shrink-0">
              {isFa ? 'بدون پروکسی' : 'Direct'}
            </span>
          </div>

          {ipData?.direct ? (
            <div className="space-y-0.5 font-mono min-w-0">
              <div className="text-xs sm:text-lg font-bold text-neutral-900 dark:text-white truncate">
                {ipData.direct.ip || 'نامشخص'}
              </div>
              <div className="text-[9px] sm:text-xs text-neutral-500 dark:text-neutral-400 truncate">
                <span>{ipData.direct.city}, {ipData.direct.country}</span>
              </div>
              <div className="text-[9px] sm:text-xs text-neutral-400 dark:text-neutral-500 truncate">
                {ipData.direct.org}
              </div>
            </div>
          ) : (
            <div className="text-[10px] sm:text-xs text-neutral-400 py-1 truncate">
              {checkingIp ? (isFa ? 'تست IP...' : 'Checking...') : (isFa ? 'نامشخص' : 'No data')}
            </div>
          )}
        </div>

        {/* VPN Proxied IP */}
        <div className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-xl sm:rounded-2xl p-2.5 sm:p-5 shadow-sm space-y-1.5 sm:space-y-3 min-w-0">
          <div className="flex items-center justify-between gap-1 min-w-0">
            <div className="flex items-center gap-1 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 min-w-0 flex-1">
              <ShieldCheck className="h-3 w-3 sm:h-4 sm:w-4 text-emerald-500 shrink-0" />
              <span className="truncate">{isFa ? 'IP خروجی VPN (Proxied IP)' : 'VPN Output IP'}</span>
            </div>
            <span
              className={`text-[9px] sm:text-xs font-mono px-1.5 py-0.5 rounded-full border shrink-0 ${
                ipData?.proxyActive
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-neutral-100 dark:bg-white/5 text-neutral-400 border-neutral-200 dark:border-white/10'
              }`}
            >
              {ipData?.proxyActive ? (isFa ? 'فعال' : 'Proxied') : (isFa ? 'غیرفعال' : 'Inactive')}
            </span>
          </div>

          {ipData?.vpn ? (
            <div className="space-y-0.5 font-mono min-w-0">
              <div className="text-xs sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 truncate">
                {ipData.vpn.ip}
              </div>
              <div className="text-[9px] sm:text-xs text-neutral-500 dark:text-neutral-400 truncate">
                <span>{ipData.vpn.city}, {ipData.vpn.country}</span>
              </div>
              <div className="text-[9px] sm:text-xs text-neutral-400 dark:text-neutral-500 truncate">
                {ipData.vpn.org}
              </div>
            </div>
          ) : (
            <div className="text-[10px] sm:text-xs text-neutral-400 py-1 truncate">
              {checkingIp
                ? (isFa ? 'بررسی...' : 'Checking...')
                : (isFa ? 'غیرمتصل' : 'Disconnected')}
            </div>
          )}

          <div className="pt-0.5 flex justify-end">
            <button
              onClick={fetchIpInfo}
              disabled={checkingIp}
              className="text-[9px] sm:text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`h-2.5 w-2.5 sm:h-3 sm:w-3 ${checkingIp ? 'animate-spin' : ''}`} />
              <span>{isFa ? 'بررسی' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Terminal Proxy Snippets & Cheatsheet */}
      <div className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-sm">
        <button
          onClick={() => setShowQuickHelp(prev => !prev)}
          className="w-full flex items-center justify-between text-start cursor-pointer group"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shrink-0">
              <Terminal className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition truncate">
                {isFa ? 'دستورات آماده ترمینال و متغیرهای پروکسی' : 'Quick Terminal Proxy Commands'}
              </h4>
              <p className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400 truncate">
                {isFa ? 'کپی سریع دستورات export، curl، pip و yt-dlp برای استفاده از پروکسی' : 'One-click copyable proxy snippets for terminal tools'}
              </p>
            </div>
          </div>
          <div className="text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 transition shrink-0 ml-2">
            {showQuickHelp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>

        {showQuickHelp && (
          <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-white/10 space-y-2.5">
            {[
              {
                title: isFa ? 'تنظیم متغیرهای محیطی در ترمینال (All Tools)' : 'Export Environment Variables',
                cmd: 'export all_proxy="socks5://127.0.0.1:10808" http_proxy="socks5://127.0.0.1:10808" https_proxy="socks5://127.0.0.1:10808"'
              },
              {
                title: isFa ? 'تست اتصال با Curl (Remote DNS)' : 'Curl Test (Remote DNS)',
                cmd: 'curl -s --socks5-hostname 127.0.0.1:10808 https://httpbin.org/ip'
              },
              {
                title: isFa ? 'دانلود ویدیو با yt-dlp از طریق پروکسی' : 'yt-dlp via Proxy',
                cmd: 'yt-dlp --proxy "socks5://127.0.0.1:10808" "URL"'
              },
              {
                title: isFa ? 'نصب پکیج پایتون با pip از طریق پروکسی' : 'pip install via Proxy',
                cmd: 'pip install --proxy "socks5://127.0.0.1:10808" <package>'
              },
              {
                title: isFa ? 'اجرای هر برنامه‌ای با Proxychains' : 'Run any CLI tool with Proxychains',
                cmd: 'proxychains4 <command>'
              }
            ].map((item, idx) => (
              <div
                key={idx}
                className="bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/5 rounded-lg p-2 sm:p-2.5 flex items-center justify-between gap-2 min-w-0"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="text-[10px] font-semibold text-neutral-600 dark:text-neutral-400">
                    {item.title}
                  </div>
                  <div className="text-[10px] sm:text-xs font-mono text-indigo-600 dark:text-indigo-400 truncate dir-ltr text-left">
                    {item.cmd}
                  </div>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(item.cmd);
                    setCopiedSnippetIndex(idx);
                    setTimeout(() => setCopiedSnippetIndex(null), 1500);
                  }}
                  className="p-1.5 rounded-md hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-500 dark:text-neutral-400 transition cursor-pointer shrink-0"
                  title={isFa ? 'کپی دستور' : 'Copy command'}
                >
                  {copiedSnippetIndex === idx ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Configs List Header & Controls */}
      <div className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-sm space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h3 className="text-sm sm:text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <Server className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-500" />
              <span>{isFa ? 'لیست کانفیگ‌های ذخیره شده' : 'Saved VPN Configurations'}</span>
            </h3>
            <p className="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {isFa ? 'میتوانید چند لینک به صورت همزمان یا تکی اضافه کنید' : 'Add single or bulk VLESS/VMess/Trojan/Shadowsocks links'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex flex-col gap-1 w-auto">
              <button
                onClick={handleTestAllConfigs}
                disabled={testingAll || configs.length === 0}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-800 dark:text-neutral-200 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-medium transition border border-neutral-200 dark:border-white/10 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Zap className={`h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-500 ${testingAll ? 'animate-bounce' : ''}`} />
                <span>{testingAll ? (isFa ? 'در حال تست...' : 'Testing...') : (isFa ? 'تست همه' : 'Test All')}</span>
              </button>

              <button
                onClick={handleResetPingResults}
                disabled={!configs.some(c => c.testResult)}
                className="flex items-center justify-center py-1 px-2.5 bg-neutral-100 dark:bg-white/5 hover:bg-rose-500/10 text-neutral-700 dark:text-neutral-300 hover:text-rose-600 dark:hover:text-rose-400 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-medium transition border border-neutral-200 dark:border-white/10 cursor-pointer disabled:opacity-40"
                title={isFa ? 'پاکسازی نتایج پینگ' : 'Reset Ping Results'}
              >
                <RotateCcw className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-neutral-500" />
              </button>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md sm:rounded-lg text-[10px] sm:text-xs font-medium transition shadow-xs cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>{isFa ? 'افزودن کانفیگ' : 'Add Config'}</span>
            </button>
          </div>
        </div>

        {/* Configs Table / List */}
        {loading ? (
          <div className="text-center py-8 sm:py-12 text-neutral-400 text-xs sm:text-sm">
            {isFa ? 'در حال بارگذاری کانفیگ‌ها...' : 'Loading configs...'}
          </div>
        ) : configs.length === 0 ? (
          <div className="text-center py-8 sm:py-12 border-2 border-dashed border-neutral-200 dark:border-white/10 rounded-xl sm:rounded-2xl space-y-2.5 sm:space-y-3">
            <Globe className="h-8 w-8 sm:h-10 sm:w-10 text-neutral-400 mx-auto opacity-50" />
            <p className="text-xs sm:text-sm font-medium text-neutral-600 dark:text-neutral-400">
              {isFa ? 'هیچ کانفیگی اضافه نشده است' : 'No VPN configurations found'}
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-1.5 sm:px-4 sm:py-2 bg-indigo-600 text-white rounded-lg sm:rounded-xl text-xs font-semibold hover:bg-indigo-500 transition cursor-pointer"
            >
              {isFa ? 'افزودن اولین کانفیگ' : 'Add First Config'}
            </button>
          </div>
        ) : (
          <div className="space-y-2.5 sm:space-y-3">
            {/* Bulk Toolbar */}
            {selectedIndices.length > 0 && (
              <div className="flex items-center justify-between bg-neutral-100 dark:bg-white/5 p-2.5 sm:p-3 rounded-lg sm:rounded-xl border border-neutral-200 dark:border-white/10 text-[11px] sm:text-xs font-medium">
                <label className="flex items-center gap-1.5 sm:gap-2 cursor-pointer text-neutral-700 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={selectedIndices.length === configs.length && configs.length > 0}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-neutral-300 dark:border-neutral-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>
                    {isFa
                      ? `انتخاب همه (${selectedIndices.length} از ${configs.length})`
                      : `Select All (${selectedIndices.length} of ${configs.length})`}
                  </span>
                </label>

                <button
                  onClick={handleBulkDelete}
                  disabled={actionLoading}
                  className="flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-md sm:rounded-lg text-[11px] sm:text-xs font-semibold transition cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span>
                    {isFa ? `حذف ${selectedIndices.length} مورد` : `Delete ${selectedIndices.length}`}
                  </span>
                </button>
              </div>
            )}

            {configs.map((cfg) => {
              const isCurrentActive = status.activeIndex === cfg.index;
              const isSelected = selectedIndices.includes(cfg.index);
              return (
                <div
                  key={cfg.index}
                  className={`p-2.5 sm:p-4 rounded-lg sm:rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-4 ${
                    isSelected
                      ? 'bg-rose-500/5 border-rose-500/40 dark:bg-rose-500/10'
                      : isCurrentActive
                      ? 'bg-indigo-500/5 border-indigo-500/40 dark:bg-indigo-500/10'
                      : 'bg-neutral-50 dark:bg-[#18181b] border-neutral-200 dark:border-white/5 hover:border-neutral-300 dark:hover:border-white/10'
                  }`}
                >
                  <div className="flex items-start gap-2 sm:gap-3.5 flex-1 min-w-0">
                    {/* Checkbox for Multi-Selection */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectIndex(cfg.index)}
                      className="mt-1 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-neutral-300 dark:border-neutral-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                    />

                    <div className="space-y-0.5 sm:space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <span className="font-bold text-xs sm:text-sm text-neutral-900 dark:text-white truncate">
                          {cfg.name}
                        </span>
                        {isCurrentActive && (
                          <span className="bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-indigo-500/30">
                            {isFa ? 'فعال' : 'Active'}
                          </span>
                        )}
                      </div>

                      <div className="text-[10px] sm:text-xs font-mono text-neutral-500 dark:text-neutral-400 truncate max-w-xl">
                        {cfg.config.substring(0, 70)}...
                      </div>

                      {/* Test Result Output if tested */}
                      {cfg.testResult && (
                        <div
                          className={`mt-1.5 p-2 sm:p-2.5 rounded-lg text-[10px] sm:text-xs font-mono leading-relaxed relative group ${
                            cfg.testResult.loading
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse'
                              : cfg.testResult.success
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {!cfg.testResult.loading && (
                            <button
                              onClick={() => handleClearSinglePingResult(cfg.index)}
                              className="absolute top-1.5 left-1.5 dir-rtl:left-1.5 dir-rtl:right-auto text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition cursor-pointer p-0.5"
                              title={isFa ? 'پاکسازی این نتیجه' : 'Clear this result'}
                            >
                              <X className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                            </button>
                          )}
                          <div className="whitespace-pre-wrap pr-3 dir-rtl:pl-3 dir-rtl:pr-0">{cfg.testResult.output}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Config Action Buttons */}
                  <div className="flex items-center gap-1.5 sm:gap-2 self-end md:self-center shrink-0">
                    <button
                      onClick={() => handleTestConfig(cfg.index)}
                      className="p-1.5 sm:p-2 bg-neutral-200 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/15 text-neutral-800 dark:text-neutral-200 rounded-lg sm:rounded-xl transition flex items-center justify-center cursor-pointer"
                      title={isFa ? 'پینگ' : 'Ping'}
                    >
                      <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
                    </button>

                    {!isCurrentActive && (
                      <button
                        onClick={() => handleSelectConfig(cfg.index)}
                        disabled={actionLoading}
                        className="p-1.5 sm:p-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 rounded-lg sm:rounded-xl transition cursor-pointer border border-indigo-500/20 flex items-center justify-center disabled:opacity-50"
                        title={isFa ? (status.running ? 'انتخاب و اتصال خودکار به این سرور' : 'انتخاب سرور') : (status.running ? 'Select & Reconnect' : 'Select')}
                      >
                        <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </button>
                    )}

                    <button
                      onClick={() => handleDeleteConfig(cfg.index)}
                      className="p-1.5 sm:p-2 text-neutral-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg sm:rounded-xl transition cursor-pointer"
                      title={isFa ? 'حذف کانفیگ' : 'Delete'}
                    >
                      <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Xray / V2Ray Live Logs Section */}
      <div id="vpn-xray-logs-section" className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-sm space-y-3 sm:space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shrink-0">
              <ScrollText className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white truncate">
                  {isFa ? 'لاگ xray/v2ray' : 'Xray / V2Ray Logs'}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    status.running
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-neutral-100 dark:bg-white/5 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-white/10'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${status.running ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`} />
                  <span>{status.running ? (isFa ? 'سرویس فعال' : 'Active') : (isFa ? 'سرویس متوقف' : 'Stopped')}</span>
                </span>
                {vpnLogs.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 font-mono">
                    {filteredLogs.length} {isFa ? 'سطر' : 'lines'}
                  </span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                {isFa ? 'مشاهده رویدادها، ترافیک عبوری و خطاهای احتمالی هسته Xray و V2Ray' : 'Real-time core events, connection logs and error trace'}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            {/* Search filter */}
            <div className="relative flex-1 sm:flex-initial min-w-[130px] sm:min-w-[180px]">
              <Search className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
              <input
                type="text"
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                placeholder={isFa ? 'جستجو در لاگ‌ها...' : 'Filter logs...'}
                className="w-full bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-lg pl-2.5 pr-8 py-1.5 text-[11px] sm:text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {logSearchQuery && (
                <button
                  onClick={() => setLogSearchQuery('')}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Auto Refresh Live Stream Toggle */}
            <button
              onClick={() => setAutoRefreshLogs(prev => !prev)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition border cursor-pointer ${
                autoRefreshLogs
                  ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30'
                  : 'bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-white/10 hover:bg-neutral-200 dark:hover:bg-white/10'
              }`}
              title={autoRefreshLogs ? (isFa ? 'توقف بروزرسانی خودکار' : 'Pause live logs') : (isFa ? 'فعالسازی پخش زنده (هر ۳ ثانیه)' : 'Start live logs')}
            >
              {autoRefreshLogs ? <Pause className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : <Play className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
              <span className="hidden sm:inline">{autoRefreshLogs ? (isFa ? 'زنده' : 'Live') : (isFa ? 'متوقف' : 'Paused')}</span>
            </button>

            {/* Manual Refresh */}
            <button
              onClick={() => fetchVpnLogs(false)}
              disabled={logsLoading}
              className="p-1.5 sm:p-2 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 rounded-lg transition border border-neutral-200 dark:border-white/10 cursor-pointer disabled:opacity-50"
              title={isFa ? 'بروزرسانی لاگ‌ها' : 'Refresh logs'}
            >
              <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${logsLoading ? 'animate-spin text-indigo-500' : ''}`} />
            </button>

            {/* Copy Logs */}
            <button
              onClick={handleCopyVpnLogs}
              disabled={vpnLogs.length === 0}
              className="p-1.5 sm:p-2 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 rounded-lg transition border border-neutral-200 dark:border-white/10 cursor-pointer disabled:opacity-40"
              title={isFa ? 'کپی تمام لاگ‌ها' : 'Copy all logs'}
            >
              {copiedLogs ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
            </button>

            {/* Download Logs */}
            <button
              onClick={handleDownloadVpnLogs}
              disabled={vpnLogs.length === 0}
              className="p-1.5 sm:p-2 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 rounded-lg transition border border-neutral-200 dark:border-white/10 cursor-pointer disabled:opacity-40"
              title={isFa ? 'دانلود فایل لاگ' : 'Download log file'}
            >
              <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>

            {/* Clear Logs */}
            <button
              onClick={handleClearVpnLogs}
              disabled={logsLoading || vpnLogs.length === 0}
              className="p-1.5 sm:p-2 bg-neutral-100 dark:bg-white/5 hover:bg-rose-500/10 text-neutral-600 dark:text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition border border-neutral-200 dark:border-white/10 cursor-pointer disabled:opacity-40"
              title={isFa ? 'پاکسازی لاگ‌ها' : 'Clear logs'}
            >
              <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>

            {/* Minimize / Expand Toggle */}
            <button
              onClick={() => setShowLogsCard(prev => !prev)}
              className="p-1.5 sm:p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition cursor-pointer"
              title={showLogsCard ? (isFa ? 'بستن' : 'Collapse') : (isFa ? 'باز کردن' : 'Expand')}
            >
              {showLogsCard ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Log Viewer Container */}
        {showLogsCard && (
          <div className="space-y-2">
            <div className="bg-[#09090b] dark:bg-black border border-neutral-800 dark:border-white/10 rounded-xl overflow-hidden shadow-inner">
              {/* Terminal Titlebar */}
              <div className="flex items-center justify-between px-3 py-2 bg-neutral-900/90 border-b border-neutral-800 text-[11px] text-neutral-400">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80 inline-block" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80 inline-block" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80 inline-block" />
                  <span className="mr-2 font-mono text-[10px] text-neutral-400 dir-ltr text-left">
                    xray.log {status.running ? '• streaming' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[10px] text-neutral-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoScrollLogs}
                      onChange={(e) => setAutoScrollLogs(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
                    />
                    <span>{isFa ? 'اسکرول خودکار' : 'Auto-scroll'}</span>
                  </label>
                </div>
              </div>

              {/* Logs Content Area */}
              <div
                ref={logsContainerRef}
                className="h-64 sm:h-80 md:h-96 overflow-y-auto overflow-x-auto p-3 font-mono text-[11px] sm:text-xs leading-relaxed dir-ltr text-left scrollbar-thin select-text"
              >
                {vpnLogs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-neutral-500 p-6 text-center space-y-2">
                    <ScrollText className="h-8 w-8 opacity-30 mx-auto" />
                    <p className="text-xs">
                      {isFa
                        ? 'هنوز لاگی ثبت نشده است. با فعال کردن یکی از کانفیگ‌های VPN، خروجی هسته Xray/V2Ray در این قسمت قرار می‌گیرد.'
                        : 'No logs recorded yet. When a VPN config is connected, Xray/V2Ray core logs will appear here in real-time.'}
                    </p>
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-neutral-500 p-6 text-center space-y-2">
                    <Search className="h-6 w-6 opacity-30 mx-auto" />
                    <p className="text-xs">
                      {isFa
                        ? `هیچ خط لاگی مطابق با جستجوی «${logSearchQuery}» یافت نشد.`
                        : `No log entries match the search filter "${logSearchQuery}".`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {filteredLogs.map((line, idx) => (
                      <div
                        key={idx}
                        className={`py-0.5 px-1.5 rounded hover:bg-white/5 transition flex items-start gap-2 whitespace-pre-wrap break-all ${getLogLineStyle(line)}`}
                      >
                        <span className="text-neutral-600 dark:text-neutral-600 select-none text-[10px] w-6 shrink-0 text-right">
                          {idx + 1}
                        </span>
                        <span className="flex-1">{line}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick status footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 px-1 gap-1">
              <div className="flex items-center gap-3">
                <span>
                  {isFa ? 'پروکسی محلی SOCKS5:' : 'Local SOCKS5:'}{' '}
                  <code className="text-indigo-600 dark:text-indigo-400 font-mono font-semibold">127.0.0.1:10808</code>
                </span>
                <span>
                  {isFa ? 'پروکسی HTTP:' : 'HTTP Proxy:'}{' '}
                  <code className="text-indigo-600 dark:text-indigo-400 font-mono font-semibold">127.0.0.1:10809</code>
                </span>
              </div>
              <div>
                {autoRefreshLogs ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    ● {isFa ? 'بروزرسانی خودکار لاگ‌ها هر ۳ ثانیه فعال است' : 'Live auto-sync every 3s'}
                  </span>
                ) : (
                  <span>{isFa ? 'بروزرسانی خودکار غیرفعال است' : 'Auto-sync is paused'}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal Add Config */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-xl sm:rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-white/10 pb-3 sm:pb-4">
              <h3 className="text-sm sm:text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <Plus className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-500" />
                <span>{isFa ? 'افزودن کانفیگ جدید VPN' : 'Add New VPN Config'}</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-neutral-400 hover:text-white text-base sm:text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddConfig} className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-[11px] sm:text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  {isFa ? 'عنوان اختیاری (تک کانفیگ):' : 'Optional Title (For single config):'}
                </label>
                <input
                  type="text"
                  value={newConfigName || ''}
                  onChange={(e) => setNewConfigName(e.target.value)}
                  placeholder={isFa ? 'مثلاً: سرور آلمان VLESS' : 'e.g. Germany VLESS Server'}
                  className="w-full bg-neutral-100 dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded-lg sm:rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] sm:text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  {isFa ? 'لینک یا کدهای کانفیگ (پشتیبانی از چند لینک همزمان):' : 'Config Link(s) or JSON:'}
                </label>
                <textarea
                  rows={4}
                  value={newConfigStr || ''}
                  onChange={(e) => setNewConfigStr(e.target.value)}
                  placeholder={`vless://...\nvmess://...\ntrojan://...\nss://...`}
                  required
                  className="w-full bg-neutral-100 dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded-lg sm:rounded-xl p-2.5 sm:p-3 text-xs font-mono text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                />
                <p className="text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                  {isFa
                    ? 'میتوانید چند لینک vless/vmess/trojan را در خطوط مختلف وارد کنید تا به صورت همزمان ثبت شوند.'
                    : 'You can paste multiple vless/vmess/trojan links separated by newlines.'}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 sm:gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 transition cursor-pointer"
                >
                  {isFa ? 'انصراف' : 'Cancel'}
                </button>

                <button
                  type="submit"
                  disabled={actionLoading || !newConfigStr.trim()}
                  className="px-4 py-2 sm:px-5 sm:py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg sm:rounded-xl text-xs font-semibold transition cursor-pointer shadow-md disabled:opacity-50"
                >
                  {actionLoading ? (isFa ? 'در حال ذخیره...' : 'Saving...') : (isFa ? 'ذخیره کانفیگ‌ها' : 'Save Configs')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, type: null })}
        onConfirm={confirmExecuteVpnDelete}
        isLoading={isDeleting}
        lang={lang}
        itemName={deleteModal.configName}
        itemType={deleteModal.type === 'bulk' ? (isFa ? 'کانفیگ‌های VPN' : 'VPN Configs') : (isFa ? 'کانفیگ VPN' : 'VPN Config')}
        count={deleteModal.count}
        title={isFa ? 'تایید حذف کانفیگ VPN' : 'Confirm VPN Config Deletion'}
        description={
          deleteModal.type === 'bulk'
            ? (isFa ? `آیا از حذف ${deleteModal.count} کانفیگ انتخاب‌شده مطمئن هستید؟ این کانفیگ‌ها به طور کامل از لیست پاک می‌شوند.` : `Are you sure you want to delete ${deleteModal.count} selected configs?`)
            : (isFa ? 'آیا از حذف این کانفیگ VPN اطمینان دارید؟ این عملکرد غیرقابل بازگشت است.' : 'Are you sure you want to delete this VPN config?')
        }
      />

      {/* Undo Toast Notification */}
      {undoToast && (
        <UndoToast
          key={undoToast.id}
          id={undoToast.id}
          message={undoToast.message}
          lang={lang}
          onUndo={() => handleRestoreVpnFromUndo(undoToast.trashId)}
          onClose={() => setUndoToast(null)}
        />
      )}
    </div>
  );
};
