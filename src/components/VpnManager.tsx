import React, { useState, useEffect, useRef } from 'react';
import { Globe, Power, RefreshCw, RotateCw, Plus, Trash2, Check, AlertCircle, Zap, ShieldCheck, MapPin, Server, Activity, ArrowUpRight, Copy, CheckCircle2, RotateCcw, X, Terminal, ChevronDown, ChevronUp, ScrollText, Download, Play, Pause, Search, Video, Menu, Upload, FileCode, MoreVertical } from 'lucide-react';
import { Language } from '../types';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { UndoToast } from './UndoToast';

const PING_CACHE_KEY = 'vpn_ping_test_results';

/**
 * تبدیل کد ۲ حرفی کشور (مثل GB یا US) به پرچم ایموجی به شکل پویا
 */
const getCountryFlagEmoji = (countryCode: string | undefined): string => {
  if (!countryCode || countryCode.length !== 2) return '';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  try {
    return String.fromCodePoint(...codePoints);
  } catch {
    return '';
  }
};

interface ProtocolBadgeInfo {
  name: string;
  className: string;
}

/**
 * استخراج نوع پروتکل کانفیگ (VLESS, VMESS, TROJAN, SS, HY2, ...) با استایل متمایز
 */
const getProtocolBadge = (configStr?: string, configType?: string): ProtocolBadgeInfo | null => {
  const str = (configStr || configType || '').trim().toLowerCase();
  if (!str) return null;

  if (str.startsWith('vless://') || str.includes('vless')) {
    return {
      name: 'VLESS',
      className: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30'
    };
  }
  if (str.startsWith('vmess://') || str.includes('vmess')) {
    return {
      name: 'VMESS',
      className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
    };
  }
  if (str.startsWith('trojan://') || str.includes('trojan')) {
    return {
      name: 'TROJAN',
      className: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
    };
  }
  if (str.startsWith('ss://') || str.startsWith('shadowsocks://') || str.includes('shadowsocks')) {
    return {
      name: 'SS',
      className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
    };
  }
  if (str.startsWith('ssr://') || str.includes('shadowsocksr')) {
    return {
      name: 'SSR',
      className: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30'
    };
  }
  if (str.startsWith('hysteria2://') || str.startsWith('hy2://') || str.includes('hysteria2')) {
    return {
      name: 'HY2',
      className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
    };
  }
  if (str.startsWith('hysteria://') || str.includes('hysteria')) {
    return {
      name: 'HYSTERIA',
      className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
    };
  }
  if (str.startsWith('tuic://') || str.includes('tuic')) {
    return {
      name: 'TUIC',
      className: 'bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/30'
    };
  }
  if (str.startsWith('wireguard://') || str.startsWith('wg://') || str.includes('wireguard')) {
    return {
      name: 'WIREGUARD',
      className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30'
    };
  }
  if (str.startsWith('socks5://') || str.startsWith('socks://')) {
    return {
      name: 'SOCKS5',
      className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30'
    };
  }
  if (str.startsWith('http://') || str.startsWith('https://')) {
    return {
      name: 'HTTP',
      className: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30'
    };
  }
  return null;
};

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

/**
 * کپی متن به کلیپ‌بورد با پشتیبانی از روش مدرن و پشتیبان (Fallback)
 */
const safeCopyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('navigator.clipboard.writeText failed, using fallback', err);
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback clipboard copy failed', err);
    return false;
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
    log?: string;
    speedKbps?: number;
    speedMbps?: number;
    speedDisplay?: string;
    elapsedSec?: number;
    ping?: number;
  };
}

/**
 * استخراج سرعت دانلود (بر حسب کیلوبایت بر ثانیه KB/s) برای مقایسه و مرتب‌سازی دقیق کانفیگ‌ها
 */
const getDownloadSpeedKbps = (cfg: VpnConfigItem): number => {
  if (!cfg.testResult || !cfg.testResult.success) return -1;

  if (typeof cfg.testResult.speedKbps === 'number' && cfg.testResult.speedKbps > 0) {
    return cfg.testResult.speedKbps;
  }
  if (typeof cfg.testResult.speedMbps === 'number' && cfg.testResult.speedMbps > 0) {
    return cfg.testResult.speedMbps * 1024;
  }

  const text = (cfg.testResult.output || '') + ' ' + (cfg.testResult.log || '');
  if (!text) return 0;

  // 1. الگوی سرعت دانلود یوتیوب (yt-dlp)
  const ytMatch = text.match(/(?:سرعت(?: دانلود)?|speed)[\s:]+([\d\.]+)\s*(mbps|mb\/s|mib\/s|kbps|kb\/s|kib\/s|gbps|gb\/s)/i);
  if (ytMatch) {
    const val = parseFloat(ytMatch[1]);
    const unit = ytMatch[2].toLowerCase();
    if (unit.includes('g')) return val * 1024 * 1024;
    if (unit.includes('m')) return val * 1024;
    return val;
  }

  // 2. الگوی استاندارد تست دانلود Cloudflare/Speed
  const dlMatch = text.match(/(?:دانلود|download)[\s:]+([\d\.]+)\s*(mbps|mb\/s|kbps|kb\/s)/i);
  if (dlMatch) {
    const val = parseFloat(dlMatch[1]);
    const unit = dlMatch[2].toLowerCase();
    if (unit.includes('m')) return val * 1024;
    return val;
  }

  // 3. الگوی پیشرفت yt-dlp مثل "at 1.50MiB/s"
  const atMatch = text.match(/at\s+([\d\.]+)\s*([kKmMgG]i?B\/s)/i);
  if (atMatch) {
    const val = parseFloat(atMatch[1]);
    const unit = atMatch[2].toLowerCase();
    if (unit.includes('m')) return val * 1024;
    if (unit.includes('g')) return val * 1024 * 1024;
    return val;
  }

  return 0;
};

/**
 * مرتب‌سازی هوشمند کانفیگ‌ها:
 * ۱. کانفیگ‌های سالم قبل از کانفیگ‌های ناسالم/تست‌نشده قرار می‌گیرند.
 * ۲. بین کانفیگ‌های سالم، کانفیگ‌هایی که سرعت دانلود بیشتری (مخصوصاً از یوتیوب) دارند در صدر لیست قرار می‌گیرند.
 */
const sortConfigs = (list: VpnConfigItem[]): VpnConfigItem[] => {
  return [...list].sort((a, b) => {
    const aSuccess = Boolean(a.testResult?.success);
    const bSuccess = Boolean(b.testResult?.success);

    // کانفیگ‌های سالم اول می‌آیند
    if (aSuccess && !bSuccess) return -1;
    if (!aSuccess && bSuccess) return 1;

    // در بین کانفیگ‌های سالم: اولویت بالاتر برای سرعت دانلود بیشتر
    if (aSuccess && bSuccess) {
      const speedA = getDownloadSpeedKbps(a);
      const speedB = getDownloadSpeedKbps(b);
      if (speedA !== speedB) {
        return speedB - speedA; // سرعت دانلود بیشتر، بالاتر در لیست
      }

      // در صورت برابر بودن سرعت دانلود، پینگ کمتر ترجیح داده می‌شود
      const pingA = a.testResult?.ping ?? (a.testResult?.output?.match(/پینگ:\s*([\d\.]+)/)?.[1] ? parseFloat(a.testResult.output.match(/پینگ:\s*([\d\.]+)/)![1]) : 99999);
      const pingB = b.testResult?.ping ?? (b.testResult?.output?.match(/پینگ:\s*([\d\.]+)/)?.[1] ? parseFloat(b.testResult.output.match(/پینگ:\s*([\d\.]+)/)![1]) : 99999);
      if (pingA !== pingB) {
        return pingA - pingB;
      }

      return a.index - b.index;
    }

    // برای کانفیگ‌های غیرسالم: حفظ ترتیب
    const aTested = Boolean(a.testResult && !a.testResult.loading);
    const bTested = Boolean(b.testResult && !b.testResult.loading);
    if (!aTested && bTested) return -1;
    if (aTested && !bTested) return 1;

    return a.index - b.index;
  });
};

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
  isActive?: boolean;
}

export const VpnManager: React.FC<VpnManagerProps> = ({ token, lang, isActive = true }) => {
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
  const [testingYtdlpIndex, setTestingYtdlpIndex] = useState<number | null>(null);
  const [connectingIndex, setConnectingIndex] = useState<number | null>(null);
  const [copiedConfigIndex, setCopiedConfigIndex] = useState<number | null>(null);
  const [copiedBulkConfigs, setCopiedBulkConfigs] = useState(false);
  const [copiedAllConfigs, setCopiedAllConfigs] = useState(false);
  const [testVideoUrl, setTestVideoUrl] = useState('https://youtu.be/bL7rIsAt0P0?is=xZiN13Z4w_6M877R');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // New Config Modal/Input
  const [showAddModal, setShowAddModal] = useState(false);
  const [newConfigStr, setNewConfigStr] = useState('');
  const [newConfigName, setNewConfigName] = useState('');

  // NPVT File Upload State
  const [npvtParsing, setNpvtParsing] = useState(false);
  const [npvtResult, setNpvtResult] = useState<{
    success: boolean;
    count: number;
    message: string;
    fileName?: string;
  } | null>(null);
  const npvtFileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingNpvt, setIsDraggingNpvt] = useState(false);

  // IP Check State
  const [ipData, setIpData] = useState<{ direct: IpInfo | null; vpn: IpInfo | null; proxyActive: boolean } | null>(null);
  const [checkingIp, setCheckingIp] = useState(false);
  const [copiedProxy, setCopiedProxy] = useState(false);

  // Hamburger Menu & YouTube Test Modal
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const [showYoutubeTestModal, setShowYoutubeTestModal] = useState(false);

  // Swipe Gestures, Long-press and Item Dropdown Menu States
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const [swipingIndex, setSwipingIndex] = useState<number | null>(null);
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const isSwipeGesture = useRef<boolean>(false);

  const touchTimeoutRef = useRef<Record<number, NodeJS.Timeout>>({});
  const isLongPressRef = useRef<Record<number, boolean>>({});

  const [openActionRowIndex, setOpenActionRowIndex] = useState<number | null>(null);

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

  // Xray / V2Ray Logs State - Default collapsed and paused
  const [vpnLogs, setVpnLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(false);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
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

  const fetchConfigs = async (silent = false) => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      if (!silent) {
        setLoading(true);
      }
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
        setConfigs(sortConfigs(merged));
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
    if (!token || !isActive) return;
    fetchStatus();
    fetchConfigs();
    fetchIpInfo();
    if (showLogsModal && status.running) {
      fetchVpnLogs();
    }
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchStatus();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [token, isActive]);

  // Polling for Xray / V2Ray Logs: ONLY when VPN is running, logs modal is open, and tab is active
  useEffect(() => {
    if (!isActive || !autoRefreshLogs || !token || !status.running || !showLogsModal) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchVpnLogs(true);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [isActive, autoRefreshLogs, token, status.running, showLogsModal]);

  // Auto scroll to bottom
  useEffect(() => {
    if (autoScrollLogs && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [vpnLogs, autoScrollLogs]);

  // Auto-dismiss notification messages after 4 seconds
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      setMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [message]);

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

  const handleNpvtFile = async (file: File) => {
    if (!file) return;
    setNpvtParsing(true);
    setNpvtResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/vpn/configs/parse-npvt', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();
      if (data.success && data.configs && data.configs.length > 0) {
        const decodedLinks = data.configs.join('\n');
        setNewConfigStr(prev => prev.trim() ? `${prev.trim()}\n${decodedLinks}` : decodedLinks);
        setNpvtResult({
          success: true,
          count: data.configs.length,
          fileName: file.name,
          message: isFa
            ? `تعداد ${data.configs.length} کانفیگ با موفقیت از فایل «${file.name}» استخراج شد.`
            : `Extracted ${data.configs.length} configs from '${file.name}'.`
        });
      } else {
        setNpvtResult({
          success: false,
          count: 0,
          fileName: file.name,
          message: data.error || (isFa ? 'خطا در رمزگشایی فایل NPV Tunnel' : 'Failed to decode NPV Tunnel file')
        });
      }
    } catch (err: any) {
      setNpvtResult({
        success: false,
        count: 0,
        fileName: file.name,
        message: err.message || (isFa ? 'خطای ارتباط با سرور' : 'Connection error')
      });
    } finally {
      setNpvtParsing(false);
      if (npvtFileInputRef.current) {
        npvtFileInputRef.current.value = '';
      }
    }
  };

  const handleTouchStartLongPress = (index: number) => {
    isLongPressRef.current[index] = false;
    if (touchTimeoutRef.current[index]) {
      clearTimeout(touchTimeoutRef.current[index]);
    }
    const timeout = setTimeout(() => {
      isLongPressRef.current[index] = true;
      if (navigator.vibrate) {
        try { navigator.vibrate(40); } catch {}
      }
      toggleSelectIndex(index);
    }, 600);
    touchTimeoutRef.current[index] = timeout;
  };

  const handleTouchEndLongPress = (index: number) => {
    if (touchTimeoutRef.current[index]) {
      clearTimeout(touchTimeoutRef.current[index]);
      delete touchTimeoutRef.current[index];
    }
  };

  const handleTouchStartSwipe = (e: React.TouchEvent, index: number) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setSwipingIndex(index);
    setSwipeOffset(0);
    isSwipeGesture.current = false;
    handleTouchStartLongPress(index);
  };

  const handleTouchMoveSwipe = (e: React.TouchEvent, index: number) => {
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartX.current;
    const deltaY = currentY - touchStartY.current;

    if (!isSwipeGesture.current) {
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        isSwipeGesture.current = true;
        handleTouchEndLongPress(index);
      }
    }

    if (isSwipeGesture.current) {
      const limit = 150;
      const offset = Math.max(-limit, Math.min(limit, deltaX));
      setSwipeOffset(offset);
      if (e.cancelable) {
        e.preventDefault();
      }
    }
  };

  const handleTouchEndSwipe = (index: number, configText: string) => {
    handleTouchEndLongPress(index);
    if (isSwipeGesture.current) {
      if (swipeOffset > 100) {
        handleDeleteConfig(index);
      } else if (swipeOffset < -100) {
        handleCopyConfig(index, configText);
      }
    }
    setSwipingIndex(null);
    setSwipeOffset(0);
    isSwipeGesture.current = false;
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

  const handleSelectHealthyOnly = () => {
    const healthy = configs.filter(c => c.testResult?.success);
    setSelectedIndices(healthy.map(c => c.index));
  };

  const handleBulkCopy = async () => {
    if (selectedIndices.length === 0) return;
    const selectedConfigs = configs
      .filter(c => selectedIndices.includes(c.index) && c.config && c.config.trim())
      .map(c => c.config.trim());

    if (selectedConfigs.length === 0) {
      setMessage({
        text: isFa ? 'هیچ کانفیگی برای کپی یافت نشد' : 'No configs found to copy',
        type: 'error'
      });
      return;
    }

    const textToCopy = selectedConfigs.join('\n');
    const ok = await safeCopyToClipboard(textToCopy);
    if (ok) {
      setCopiedBulkConfigs(true);
      setMessage({
        text: isFa
          ? `تعداد ${selectedConfigs.length} کانفیگ انتخابی با موفقیت در کلیپ‌بورد کپی شد.`
          : `Copied ${selectedConfigs.length} selected configs to clipboard.`,
        type: 'success'
      });
      setTimeout(() => setCopiedBulkConfigs(false), 2500);
    } else {
      setMessage({
        text: isFa ? 'خطا در کپی کانفیگ‌ها به کلیپ‌بورد' : 'Failed to copy configs to clipboard',
        type: 'error'
      });
    }
  };

  const handleCopyAllConfigs = async () => {
    if (configs.length === 0) return;
    const allConfigsText = configs
      .map(c => c.config?.trim())
      .filter(Boolean)
      .join('\n');

    if (!allConfigsText) return;

    const ok = await safeCopyToClipboard(allConfigsText);
    if (ok) {
      setCopiedAllConfigs(true);
      setMessage({
        text: isFa
          ? `تمامی کانفیگ‌ها (${configs.length} مورد) در کلیپ‌بورد کپی شدند.`
          : `Copied all ${configs.length} configs to clipboard.`,
        type: 'success'
      });
      setTimeout(() => setCopiedAllConfigs(false), 2500);
    } else {
      setMessage({
        text: isFa ? 'خطا در کپی کانفیگ‌ها به کلیپ‌بورد' : 'Failed to copy configs to clipboard',
        type: 'error'
      });
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

  const handleDeleteFailedConfigs = async () => {
    const failedConfigs = configs.filter(c => c.testResult && !c.testResult.loading && !c.testResult.success);
    if (failedConfigs.length === 0) {
      setMessage({
        text: isFa
          ? (testingAll ? 'تاکنون هیچ کانفیگ خرابی یافت نشده است. تست همچنان در حال انجام است...' : 'هیچ کانفیگ خرابی (که در تست ناموفق باشد) یافت نشد.')
          : (testingAll ? 'No broken configs found so far. Test is still in progress...' : 'No broken configs found.'),
        type: 'error'
      });
      return;
    }

    const failedIndices = failedConfigs.map(c => c.index);
    try {
      const res = await fetch('/api/vpn/configs/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ indices: failedIndices })
      });
      const data = await res.json();
      if (data.success) {
        if (data.trashId) {
          setUndoToast({
            id: data.trashId,
            trashId: data.trashId,
            message: isFa ? `${failedIndices.length} کانفیگ خراب با موفقیت حذف شد` : `${failedIndices.length} failed configs deleted`
          });
        } else {
          setMessage({
            text: isFa ? `${failedIndices.length} کانفیگ خراب با موفقیت حذف گردید.` : `${failedIndices.length} failed configs deleted.`,
            type: 'success'
          });
        }
        setConfigs(prev => prev.filter(c => !failedIndices.includes(c.index)));
        fetchStatus();
      } else {
        setMessage({ text: data.error || data.message || (isFa ? 'خطا در حذف کانفیگ‌های خراب' : 'Error deleting failed configs'), type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message || (isFa ? 'خطا در برقراری ارتباط' : 'Network error'), type: 'error' });
    }
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
          const removedIndices = deleteModal.indices || [];
          setConfigs(prev => prev.filter(c => !removedIndices.includes(c.index)));
          setSelectedIndices([]);
          fetchConfigs(true);
          fetchStatus();
        } else {
          setMessage({ text: data.error || data.message || (isFa ? 'خطا در حذف کانفیگ‌ها' : 'Error deleting configs'), type: 'error' });
        }
      } else if (deleteModal.type === 'single' && deleteModal.index !== undefined) {
        const targetIndex = deleteModal.index;
        const res = await fetch('/api/vpn/configs/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ index: targetIndex })
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
          setConfigs(prev => prev.filter(c => c.index !== targetIndex));
          fetchConfigs(true);
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
        fetchConfigs(true);
        fetchStatus();
      }
    } catch {}
  };

  const handleSelectConfig = async (index: number) => {
    try {
      setConnectingIndex(index);
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
        fetchConfigs(true);
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
      setConnectingIndex(null);
    }
  };

  const handleCardClick = (index: number) => {
    // If a swipe gesture was happening or a long-press triggered, ignore normal tap
    if (isSwipeGesture.current || isLongPressRef.current[index]) {
      return;
    }
    // If in multi-selection mode, single-click toggles selection
    if (selectedIndices.length > 0) {
      toggleSelectIndex(index);
    } else {
      // Normal mode: Single-click activates this config!
      handleSelectConfig(index);
    }
  };

  const updateSingleConfigResult = (index: number, testObj: {
    success: boolean;
    output: string;
    loading: boolean;
    log?: string;
    speedKbps?: number;
    speedMbps?: number;
    speedDisplay?: string;
    elapsedSec?: number;
    ping?: number;
  }) => {
    setConfigs(prev => {
      const target = prev.find(c => c.index === index);
      if (!target) return prev;
      const cacheKey = target.config || target.name || String(target.index);
      if (!testObj.loading) {
        savePingResults({ [cacheKey]: testObj });
      }
      const updatedTarget = { ...target, testResult: testObj };
      const nextList = prev.map(c => c.index === index ? updatedTarget : c);
      if (!testObj.loading) {
        return sortConfigs(nextList);
      }
      return nextList;
    });
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
        updateSingleConfigResult(index, { success: false, output: pingText, loading: false });
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
      updateSingleConfigResult(index, { success: isSpeedSuccess, output: finalResultText, loading: false, ping: pingVal });
    } catch (err: any) {
      updateSingleConfigResult(index, { success: false, output: err.message || 'Error', loading: false });
    }
  };

  const handleTestYtdlp = async (index: number) => {
    setConfigs(prev => prev.map(c => c.index === index ? {
      ...c,
      testResult: {
        success: false,
        output: isFa ? '▶️ در حال تست دانلود yt-dlp از یوتیوب...' : '▶️ Testing yt-dlp YouTube download...',
        loading: true
      }
    } : c));

    try {
      const res = await fetch('/api/vpn/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ index, mode: 'ytdlp', videoUrl: testVideoUrl })
      });
      const data = await res.json();
      const isSuccess = data.result?.[0] ?? false;
      const text = data.result?.[1] || data.error || (isSuccess ? 'تست yt-dlp موفق بود' : 'تست yt-dlp ناموفق بود');
      const details = data.details || {};
      updateSingleConfigResult(index, {
        success: isSuccess,
        output: text,
        loading: false,
        log: details.log,
        speedKbps: details.speed_kbps,
        speedMbps: details.speed_mbps,
        speedDisplay: details.speed_display,
        elapsedSec: details.elapsed_sec
      });
    } catch (err: any) {
      updateSingleConfigResult(index, { success: false, output: err.message || 'خطا در اجرای تست yt-dlp', loading: false });
    }
  };

  const handleCopyConfig = async (index: number, configStr: string) => {
    if (!configStr) return;
    const ok = await safeCopyToClipboard(configStr);
    if (ok) {
      setCopiedConfigIndex(index);
      setTimeout(() => setCopiedConfigIndex(null), 2000);
    }
  };

  const handleTestYtdlpAll = async () => {
    if (configs.length === 0) return;
    try {
      setTestingAll(true);
      const currentConfigs = [...configs];

      // Mark all configs as queued for yt-dlp test
      setConfigs(prev => prev.map(c => ({
        ...c,
        testResult: {
          success: false,
          output: isFa ? '▶️ در صف تست yt-dlp یوتیوب...' : '▶️ Queued for yt-dlp test...',
          loading: true
        }
      })));

      const BATCH_SIZE = 5;
      for (let i = 0; i < currentConfigs.length; i += BATCH_SIZE) {
        const chunk = currentConfigs.slice(i, i + BATCH_SIZE);
        await Promise.all(
          chunk.map(c => handleTestYtdlp(c.index))
        );
      }
      setConfigs(prev => sortConfigs(prev));
    } finally {
      setTestingAll(false);
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

            updateSingleConfigResult(c.index, { success: isPingSuccess, output: pingText, loading: false });
          } catch (err: any) {
            pingResultsMap[c.index] = {
              success: false,
              output: err.message || 'Error testing ping'
            };
            updateSingleConfigResult(c.index, { success: false, output: err.message || 'Error', loading: false });
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
          updateSingleConfigResult(c.index, { success: isSpeedSuccess, output: finalResultText, loading: false });
        } catch (err: any) {
          // Keep ping result
        }
      }

      setConfigs(prev => sortConfigs(prev));
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

  const handleCopyProxy = async (text: string) => {
    await safeCopyToClipboard(text);
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
      {/* Alert Messages (Auto-dismisses in 4 seconds) */}
      {message && (
        <div
          className={`p-3 sm:p-4 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-between shadow-lg relative overflow-hidden transition-all duration-300 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            {message.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-rose-500" />
            )}
            <span className="leading-relaxed truncate sm:whitespace-normal">{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 opacity-70 hover:opacity-100 transition cursor-pointer shrink-0 ml-2"
            title={isFa ? 'بستن پیام' : 'Dismiss'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ULTRA COMPACT TOP HEADER BANNER (MATCHING INSTAGRAM & YOUTUBE STYLE) */}
      <div className="p-2 sm:p-2.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${
              status.running
                ? 'bg-emerald-500/10 text-emerald-500'
                : 'bg-neutral-100 dark:bg-white/5 text-neutral-400'
            }`}>
              <Globe className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white truncate">
                  {isFa ? 'سامانه تانل و VPN سرور' : 'Server VPN & Tunnel Engine'}
                </h2>
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-semibold shrink-0 ${
                    status.running
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 text-rose-500'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${status.running ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  <span>{status.running ? (isFa ? 'VPN آنلاین' : 'VPN Online') : (isFa ? 'خاموش' : 'Offline')}</span>
                </span>
                {status.activeName && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-mono text-[9px] font-bold shrink-0 max-w-[110px] sm:max-w-none truncate">
                    {status.activeName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                <span>
                  {isFa ? `پروکسی: ${status.socksProxy}` : `Proxy: ${status.socksProxy}`}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyProxy(status.socksProxy)}
                  className="hover:text-blue-500 cursor-pointer"
                  title={isFa ? 'کپی آدرس پروکسی' : 'Copy Proxy'}
                >
                  {copiedProxy ? <Check className="h-2.5 w-2.5 text-emerald-500 inline" /> : <Copy className="h-2.5 w-2.5 inline" />}
                </button>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {isFa ? `${configs.length} کانفیگ` : `${configs.length} configs`}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons (Compact on Mobile) */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 relative">
            <button
              type="button"
              onClick={handleToggleVpn}
              disabled={actionLoading}
              className={`p-1.5 sm:px-2.5 sm:py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition shadow-sm cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                status.running
                  ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
              }`}
              title={status.running ? (isFa ? 'خاموش کردن VPN' : 'Disconnect VPN') : (isFa ? 'روشن کردن VPN' : 'Connect VPN')}
            >
              {actionLoading ? (
                <RotateCw className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin" />
              ) : (
                <Power className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              )}
              <span className="hidden sm:inline">
                {status.running
                  ? (isFa ? 'خاموش کردن' : 'Disconnect')
                  : (isFa ? 'روشن کردن' : 'Connect')}
              </span>
            </button>

            <button
              type="button"
              onClick={fetchStatus}
              className="p-1.5 sm:px-2 sm:py-1 rounded-lg bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-white/10 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
              title={isFa ? 'بروزرسانی وضعیت' : 'Refresh Status'}
            >
              <RefreshCw className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">{isFa ? 'بروزرسانی' : 'Refresh'}</span>
            </button>

            {/* Hamburger Menu Dropdown Button */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenuDropdown(prev => !prev)}
                className={`p-1.5 sm:px-2 sm:py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer border ${
                  showMenuDropdown
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-white/10'
                }`}
                title={isFa ? 'منوی عملیات کانفیگ‌ها' : 'Config Actions Menu'}
              >
                <Menu className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">{isFa ? 'منو' : 'Menu'}</span>
              </button>

              {/* Dropdown Menu Panel */}
              {showMenuDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowMenuDropdown(false)}
                  />
                  <div className={`absolute z-50 mt-1.5 w-56 sm:w-60 min-w-[220px] sm:min-w-[240px] bg-white dark:bg-[#18181b] border border-neutral-200 dark:border-white/10 rounded-xl shadow-xl py-1.5 text-xs ${
                    isFa ? 'left-0' : 'right-0'
                  }`}>
                    {/* Add Config */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenuDropdown(false);
                        setShowAddModal(true);
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2.5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition text-start cursor-pointer"
                    >
                      <div className="p-1 rounded-md bg-indigo-500/10 text-indigo-500 shrink-0">
                        <Plus className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-neutral-900 dark:text-white">
                          {isFa ? 'افزودن کانفیگ' : 'Add Config'}
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          {isFa ? 'ورود لینک تکی یا دسته‌ای' : 'Single or bulk links'}
                        </div>
                      </div>
                    </button>

                    <div className="h-px bg-neutral-200 dark:border-white/10 my-1" />

                    {/* Test All */}
                    <button
                      type="button"
                      disabled={testingAll || configs.length === 0}
                      onClick={() => {
                        setShowMenuDropdown(false);
                        handleTestAllConfigs();
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2.5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition text-start cursor-pointer disabled:opacity-40"
                    >
                      <div className="p-1 rounded-md bg-amber-500/10 text-amber-500 shrink-0">
                        <Zap className={`h-3.5 w-3.5 ${testingAll ? 'animate-bounce' : ''}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-neutral-900 dark:text-white">
                          {testingAll ? (isFa ? 'در حال تست پینگ...' : 'Testing...') : (isFa ? 'تست همه' : 'Test All')}
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          {isFa ? 'بررسی پینگ و سلامت کانفیگ‌ها' : 'Ping test for all configs'}
                        </div>
                      </div>
                    </button>

                    {/* YouTube Test */}
                    <button
                      type="button"
                      disabled={testingAll || configs.length === 0}
                      onClick={() => {
                        setShowMenuDropdown(false);
                        setShowYoutubeTestModal(true);
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2.5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition text-start cursor-pointer disabled:opacity-40"
                    >
                      <div className="p-1 rounded-md bg-red-500/10 text-red-500 shrink-0">
                        <Video className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-neutral-900 dark:text-white">
                          {isFa ? 'تست یوتیوب (yt-dlp)' : 'YouTube Test'}
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          {isFa ? 'تنظیم لینک و ارزیابی سرعت دانلود' : 'Configure video URL & test speed'}
                        </div>
                      </div>
                    </button>

                    <div className="h-px bg-neutral-200 dark:border-white/10 my-1" />

                    {/* Copy All */}
                    <button
                      type="button"
                      disabled={configs.length === 0}
                      onClick={() => {
                        setShowMenuDropdown(false);
                        handleCopyAllConfigs();
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2.5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition text-start cursor-pointer disabled:opacity-40"
                    >
                      <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-500 shrink-0">
                        {copiedAllConfigs ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-neutral-900 dark:text-white">
                          {copiedAllConfigs ? (isFa ? 'کپی شد!' : 'Copied!') : (isFa ? 'کپی همه' : 'Copy All')}
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          {isFa ? `${configs.length} کانفیگ به کلیپ‌بورد` : `${configs.length} configs to clipboard`}
                        </div>
                      </div>
                    </button>

                    {/* View Live Logs */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenuDropdown(false);
                        setShowLogsModal(true);
                        fetchVpnLogs(false);
                        setAutoRefreshLogs(false);
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2.5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition text-start cursor-pointer border-t border-neutral-200/60 dark:border-white/5"
                    >
                      <div className="p-1 rounded-md bg-blue-500/10 text-blue-500 shrink-0">
                        <ScrollText className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-neutral-900 dark:text-white">
                          {isFa ? 'مشاهده لاگ‌های سیستم' : 'View Core Logs'}
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          {isFa ? 'پایش رویدادهای Xray / V2Ray' : 'Xray/V2Ray system logs'}
                        </div>
                      </div>
                    </button>

                    {/* Delete Failed Configs if any */}
                    {configs.some(c => c.testResult && !c.testResult.loading && !c.testResult.success) && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenuDropdown(false);
                          handleDeleteFailedConfigs();
                        }}
                        className="w-full px-3 py-2 flex items-center gap-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition text-start cursor-pointer border-t border-neutral-200 dark:border-white/10 mt-1"
                      >
                        <div className="p-1 rounded-md bg-rose-500/15 text-rose-500 shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold">
                            {isFa ? 'حذف خراب‌ها' : 'Delete Failed'}
                          </div>
                          <div className="text-[10px] text-rose-400">
                            {isFa
                              ? `${configs.filter(c => c.testResult && !c.testResult.loading && !c.testResult.success).length} کانفیگ غیرفعال`
                              : `${configs.filter(c => c.testResult && !c.testResult.loading && !c.testResult.success).length} broken configs`}
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
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
              <div className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400 truncate flex items-center gap-1.5">
                <span className="text-sm sm:text-base leading-none shrink-0" title={ipData.direct.country}>
                  {getCountryFlagEmoji(ipData.direct.country)}
                </span>
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
              <div className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400 truncate flex items-center gap-1.5">
                <span className="text-sm sm:text-base leading-none shrink-0" title={ipData.vpn.country}>
                  {getCountryFlagEmoji(ipData.vpn.country)}
                </span>
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

          <div className="flex items-center gap-2">
            {configs.some(c => c.testResult) && (
              <button
                onClick={handleResetPingResults}
                className="flex items-center justify-center gap-1.5 py-1.5 px-2.5 bg-neutral-100 dark:bg-white/5 hover:bg-rose-500/10 text-neutral-600 dark:text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg text-[10px] sm:text-xs font-medium transition border border-neutral-200 dark:border-white/10 cursor-pointer"
                title={isFa ? 'پاکسازی نتایج تست' : 'Reset Test Results'}
              >
                <RotateCcw className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-neutral-500" />
                <span>{isFa ? 'پاکسازی نتایج' : 'Reset Results'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Testing Progress Banner */}
        {testingAll && (
          <div className="bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-center gap-2.5 text-amber-900 dark:text-amber-200 font-medium">
              <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500 animate-bounce shrink-0" />
              <div>
                <div className="font-bold text-xs sm:text-sm">
                  {isFa ? 'تست گروهی کانفیگ‌ها در حال انجام است...' : 'Testing configs in parallel...'}
                </div>
                <div className="text-[10px] sm:text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                  {isFa
                    ? `کانفیگ‌های سالم: ${configs.filter(c => c.testResult?.success).length} | کانفیگ‌های خراب: ${configs.filter(c => c.testResult && !c.testResult.loading && !c.testResult.success).length}`
                    : `Passed: ${configs.filter(c => c.testResult?.success).length} | Failed: ${configs.filter(c => c.testResult && !c.testResult.loading && !c.testResult.success).length}`}
                </div>
              </div>
            </div>

            {configs.filter(c => c.testResult && !c.testResult.loading && !c.testResult.success).length > 0 && (
              <button
                onClick={handleDeleteFailedConfigs}
                className="w-full sm:w-auto px-3.5 py-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold rounded-lg text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-md animate-pulse shrink-0"
              >
                <Trash2 className="h-4 w-4" />
                <span>
                  {isFa
                    ? `حذف فوری کانفیگ‌های خراب (${configs.filter(c => c.testResult && !c.testResult.loading && !c.testResult.success).length})`
                    : `Delete Failed Now (${configs.filter(c => c.testResult && !c.testResult.loading && !c.testResult.success).length})`}
                </span>
              </button>
            )}
          </div>
        )}



        {/* Configs Table / List */}
        {loading && configs.length === 0 ? (
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
              <div className="flex flex-wrap items-center justify-between gap-2.5 bg-neutral-100 dark:bg-white/5 p-2.5 sm:p-3 rounded-lg sm:rounded-xl border border-neutral-200 dark:border-white/10 text-[11px] sm:text-xs font-medium">
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-1.5 sm:gap-2 cursor-pointer text-neutral-700 dark:text-neutral-300 select-none">
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

                  {configs.some(c => c.testResult?.success) && (
                    <button
                      type="button"
                      onClick={handleSelectHealthyOnly}
                      className="text-[10px] sm:text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1"
                      title={isFa ? 'انتخاب خودکار کانفیگ‌هایی که در تست سالم بوده‌اند' : 'Select configs that passed the test'}
                    >
                      <Zap className="h-3 w-3 text-amber-500" />
                      <span>{isFa ? 'انتخاب کانفیگ‌های سالم' : 'Select healthy only'}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Copy Selected Configs Button */}
                  <button
                    type="button"
                    onClick={handleBulkCopy}
                    className="flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-md sm:rounded-lg text-[11px] sm:text-xs font-semibold transition cursor-pointer shadow-xs"
                    title={isFa ? 'کپی تمامی کانفیگ‌های انتخاب‌شده به کلیپ‌بورد' : 'Copy all selected configs to clipboard'}
                  >
                    {copiedBulkConfigs ? (
                      <>
                        <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-300" />
                        <span>{isFa ? 'کپی شد!' : 'Copied!'}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        <span>
                          {isFa
                            ? `کپی ${selectedIndices.length} کانفیگ انتخابی`
                            : `Copy ${selectedIndices.length} Selected`}
                        </span>
                      </>
                    )}
                  </button>

                  {/* Bulk Delete Button */}
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    disabled={actionLoading}
                    className="flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white rounded-md sm:rounded-lg text-[11px] sm:text-xs font-semibold transition cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    <span>
                      {isFa ? `حذف (${selectedIndices.length})` : `Delete (${selectedIndices.length})`}
                    </span>
                  </button>

                  {/* Deselect / Cancel Button */}
                  <button
                    type="button"
                    onClick={() => setSelectedIndices([])}
                    className="p-1 sm:p-1.5 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white rounded-md hover:bg-neutral-200 dark:hover:bg-white/10 transition cursor-pointer"
                    title={isFa ? 'لغو انتخاب' : 'Clear selection'}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {configs.map((cfg) => {
              const isCurrentActive = status.activeIndex === cfg.index;
              const isSelected = selectedIndices.includes(cfg.index);
              const isSwipingThis = swipingIndex === cfg.index;
              const currentOffset = isSwipingThis ? swipeOffset : 0;

              return (
                <div
                  key={cfg.index}
                  className={`relative overflow-visible rounded-lg sm:rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-100 dark:bg-black/30 group transition duration-200 ${
                    openActionRowIndex === cfg.index ? 'z-30' : 'z-0'
                  }`}
                >
                  {/* Swipe Actions Underlying Background View */}
                  <div className="absolute inset-0 pointer-events-none z-0 rounded-lg sm:rounded-xl overflow-hidden">
                    {/* Swipe Right Indicator -> Show Delete (revealed on the LEFT side) */}
                    <div
                      className={`absolute inset-0 bg-rose-600 flex items-center transition-opacity duration-150 ${
                        currentOffset > 10 ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      <div className="absolute left-3 sm:left-4 top-0 bottom-0 flex items-center gap-2 text-white font-bold text-xs">
                        <div className={`p-2 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center transition-transform ${
                          currentOffset > 90 ? 'scale-110 bg-white/30' : 'scale-100'
                        }`}>
                          <Trash2 className="h-4 w-4 sm:h-5 sm:w-5 text-white animate-pulse" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-extrabold text-xs sm:text-sm">
                            {currentOffset > 90
                              ? (isFa ? 'رها کنید برای حذف' : 'Release to delete')
                              : (isFa ? 'حذف کانفیگ' : 'Delete config')}
                          </span>
                          <span className="text-[10px] text-white/80 hidden sm:inline">
                            {isFa ? 'بکشید به راست' : 'Swipe right'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Swipe Left Indicator -> Show Copy (revealed on the RIGHT side) */}
                    <div
                      className={`absolute inset-0 bg-emerald-600 flex items-center transition-opacity duration-150 ${
                        currentOffset < -10 ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      <div className="absolute right-3 sm:right-4 top-0 bottom-0 flex items-center gap-2 text-white font-bold text-xs">
                        <div className="flex flex-col text-end">
                          <span className="font-extrabold text-xs sm:text-sm">
                            {currentOffset < -90
                              ? (isFa ? 'رها کنید برای کپی' : 'Release to copy')
                              : (isFa ? 'کپی کانفیگ' : 'Copy config')}
                          </span>
                          <span className="text-[10px] text-white/80 hidden sm:inline">
                            {isFa ? 'بکشید به چپ' : 'Swipe left'}
                          </span>
                        </div>
                        <div className={`p-2 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center transition-transform ${
                          currentOffset < -90 ? 'scale-110 bg-white/30' : 'scale-100'
                        }`}>
                          {copiedConfigIndex === cfg.index ? (
                            <Check className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                          ) : (
                            <Copy className="h-4 w-4 sm:h-5 sm:w-5 text-white animate-pulse" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Foreground Main Config Card */}
                  <div
                    onClick={() => handleCardClick(cfg.index)}
                    onTouchStart={(e) => handleTouchStartSwipe(e, cfg.index)}
                    onTouchMove={(e) => handleTouchMoveSwipe(e, cfg.index)}
                    onTouchEnd={() => handleTouchEndSwipe(cfg.index, cfg.config)}
                    style={{
                      transform: `translateX(${currentOffset}px)`,
                    }}
                    className={`p-2.5 sm:p-3 transition-all duration-150 flex items-center justify-between gap-3 relative z-10 select-none rounded-lg sm:rounded-xl cursor-pointer active:scale-[0.99] active:brightness-95 ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-[#1a1b26] ring-2 ring-indigo-500/50 shadow-xs'
                        : isCurrentActive
                        ? 'bg-indigo-50/95 dark:bg-[#181926] border border-indigo-500/40 shadow-xs'
                        : 'bg-white dark:bg-[#121214] border-b border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-[#161619]'
                    }`}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      {/* Checkbox for Multi-Selection: 
                          - When selection mode is active (selectedIndices.length > 0) OR isSelected: ALWAYS visible (opacity-100 scale-100)
                          - When in normal mode: hidden by default on PC (opacity-0 group-hover:opacity-100) */}
                      <div
                        className={`transition-all duration-200 shrink-0 ${
                          selectedIndices.length > 0 || isSelected
                            ? 'opacity-100 scale-100 w-4 sm:w-4.5'
                            : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 w-0 md:w-4 group-hover:w-4 sm:group-hover:w-4.5 overflow-hidden'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSelectIndex(cfg.index);
                          }}
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-neutral-300 dark:border-neutral-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </div>

                      {/* Config Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(() => {
                            const badge = getProtocolBadge(cfg.config, cfg.type);
                            return badge ? (
                              <span
                                className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded border shrink-0 tracking-wider shadow-2xs ${badge.className}`}
                              >
                                {badge.name}
                              </span>
                            ) : null;
                          })()}

                          <span className="font-bold text-xs sm:text-[13px] text-neutral-900 dark:text-white truncate">
                            {cfg.name}
                          </span>
                          {connectingIndex === cfg.index ? (
                            <span className="bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[9px] font-bold px-1.5 py-0.5 rounded-md border border-amber-500/30 flex items-center gap-1 animate-pulse">
                              <RotateCw className="h-2.5 w-2.5 animate-spin" />
                              <span>{isFa ? 'در حال اتصال...' : 'Connecting...'}</span>
                            </span>
                          ) : isCurrentActive ? (
                            <span className="bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[9px] font-bold px-1 py-0.2 rounded-md border border-indigo-500/30">
                              {isFa ? 'فعال' : 'Active'}
                            </span>
                          ) : null}
                          {cfg.testResult?.success && getDownloadSpeedKbps(cfg) > 0 && (
                            <span
                              className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold px-1 py-0.2 rounded-md border border-emerald-500/30 flex items-center gap-0.5 shrink-0"
                            >
                              <Zap className="h-2.5 w-2.5 text-amber-500" />
                              <span>
                                {getDownloadSpeedKbps(cfg) >= 1024
                                  ? `${(getDownloadSpeedKbps(cfg) / 1024).toFixed(1)} MB/s`
                                  : `${Math.round(getDownloadSpeedKbps(cfg))} KB/s`}
                              </span>
                            </span>
                          )}
                        </div>

                        <div className="text-[10px] sm:text-[11px] font-mono text-neutral-500 dark:text-neutral-400 truncate max-w-sm sm:max-w-xl mt-0.5 opacity-80">
                          {cfg.config.substring(0, 60)}...
                        </div>

                        {/* Test Result Output inline/compact */}
                        {cfg.testResult && (
                          <div
                            className={`mt-1 p-1.5 rounded-lg text-[9px] sm:text-[10px] font-mono leading-relaxed relative group/res ${
                              cfg.testResult.loading
                                ? 'bg-amber-500/5 text-amber-500 border border-amber-500/20 animate-pulse'
                                : cfg.testResult.success
                                ? 'bg-emerald-500/5 text-emerald-500 border border-emerald-500/20'
                                : 'bg-rose-500/5 text-rose-500 border border-rose-500/20'
                            }`}
                          >
                            {!cfg.testResult.loading && (
                              <button
                                onClick={() => handleClearSinglePingResult(cfg.index)}
                                className="absolute top-1 left-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition cursor-pointer p-0.5"
                                title={isFa ? 'پاکسازی' : 'Clear'}
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            )}
                            <div className="whitespace-pre-wrap pr-3 dir-rtl:pl-3 dir-rtl:pr-0">{cfg.testResult.output}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* CONSOLIDATED THREE DOTS ACTION DROPDOWN */}
                    <div className="relative shrink-0 z-20">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionRowIndex(openActionRowIndex === cfg.index ? null : cfg.index);
                        }}
                        className={`p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 dark:text-neutral-400 border border-neutral-200 dark:border-white/10 flex items-center justify-center transition cursor-pointer ${
                          openActionRowIndex === cfg.index ? 'bg-indigo-600/10 text-indigo-600 border-indigo-600/30' : ''
                        }`}
                        title={isFa ? 'عملیات' : 'Actions'}
                      >
                        <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </button>

                      {/* Local Dropdown Menu Panel */}
                      {openActionRowIndex === cfg.index && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionRowIndex(null);
                            }}
                          />
                          <div className={`absolute z-50 mt-1 w-44 bg-white dark:bg-[#18181b] border border-neutral-200 dark:border-white/10 rounded-lg shadow-xl py-1 text-xs ${
                            isFa ? 'left-0 right-auto' : 'right-0 left-auto'
                          }`}>
                            {/* Activate / Select */}
                            {!isCurrentActive ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionRowIndex(null);
                                  handleSelectConfig(cfg.index);
                                }}
                                className="w-full px-2.5 py-1.5 flex items-center gap-2 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer text-start transition"
                              >
                                <Check className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                                <span>{isFa ? 'اتصال و فعال‌سازی' : 'Activate & Connect'}</span>
                              </button>
                            ) : (
                              <div className="px-2.5 py-1.5 flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold">
                                <Check className="h-3.5 w-3.5 shrink-0" />
                                <span>{isFa ? 'کانفیگ فعال است' : 'Active Config'}</span>
                              </div>
                            )}

                            {/* Test Ping */}
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionRowIndex(null);
                                handleTestConfig(cfg.index);
                              }}
                              className="w-full px-2.5 py-1.5 flex items-center gap-2 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer text-start transition"
                            >
                              <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              <span>{isFa ? 'تست پینگ و سلامت' : 'Test Ping & Health'}</span>
                            </button>

                            {/* Test YouTube Download */}
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionRowIndex(null);
                                handleTestYtdlp(cfg.index);
                              }}
                              className="w-full px-2.5 py-1.5 flex items-center gap-2 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer text-start transition"
                            >
                              <Video className="h-3.5 w-3.5 text-red-500 shrink-0" />
                              <span>{isFa ? 'تست دانلود یوتیوب' : 'Test YouTube Speed'}</span>
                            </button>

                            {/* Copy Config Link */}
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionRowIndex(null);
                                handleCopyConfig(cfg.index, cfg.config);
                              }}
                              className="w-full px-2.5 py-1.5 flex items-center gap-2 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer text-start transition"
                            >
                              <Copy className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              <span>{isFa ? 'کپی لینک کانفیگ' : 'Copy Config Link'}</span>
                            </button>

                            <div className="h-px bg-neutral-200 dark:border-white/10 my-0.5" />

                            {/* Delete Config */}
                            <button
                              type="button"
                              onClick={() => {
                                setOpenActionRowIndex(null);
                                handleDeleteConfig(cfg.index);
                              }}
                              className="w-full px-2.5 py-1.5 flex items-center gap-2 text-rose-600 hover:bg-rose-50/10 cursor-pointer text-start transition"
                            >
                              <Trash2 className="h-3.5 w-3.5 shrink-0" />
                              <span>{isFa ? 'حذف کانفیگ' : 'Delete Config'}</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>



      {/* Modal Add Config */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-xl sm:rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-3 sm:space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-white/10 pb-3 sm:pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                  <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                    {isFa ? 'افزودن کانفیگ جدید VPN' : 'Add New VPN Config'}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400">
                    {isFa ? 'پشتیبانی از لینک‌های V2Ray و فایل‌های NPV Tunnel (.npvt)' : 'Supports V2Ray links and NPV Tunnel (.npvt) files'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setNpvtResult(null);
                }}
                className="text-neutral-400 hover:text-white text-base sm:text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* NPV Tunnel (.npvt) File Upload Dropzone */}
            <div className="space-y-1.5">
              <label className="block text-[11px] sm:text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                {isFa ? 'بارگذاری فایل NPV Tunnel (.npvt):' : 'Upload NPV Tunnel (.npvt) File:'}
              </label>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingNpvt(true);
                }}
                onDragLeave={() => setIsDraggingNpvt(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingNpvt(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleNpvtFile(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => npvtFileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-3 sm:p-4 text-center cursor-pointer transition ${
                  isDraggingNpvt
                    ? 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-500/10'
                    : 'border-neutral-300 dark:border-white/10 hover:border-indigo-400 dark:hover:border-indigo-500/50 bg-neutral-50/60 dark:bg-white/2 hover:bg-neutral-100/60 dark:hover:bg-white/4'
                }`}
              >
                <input
                  ref={npvtFileInputRef}
                  type="file"
                  accept=".npvt,.txt"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleNpvtFile(e.target.files[0]);
                    }
                  }}
                />

                <div className="flex flex-col items-center justify-center gap-1.5">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
                    {npvtParsing ? (
                      <RotateCw className="h-5 w-5 animate-spin" />
                    ) : (
                      <Upload className="h-5 w-5" />
                    )}
                  </div>
                  <div className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                    {npvtParsing
                      ? (isFa ? 'در حال رمزگشایی و استخراج کانفیگ‌های .npvt...' : 'Decrypting .npvt file...')
                      : (isFa ? 'انتخاب یا رها کردن فایل .npvt' : 'Select or drop .npvt file')}
                  </div>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    {isFa
                      ? 'رمزگشایی خودکار الگوریتم اختصاصی NPV Tunnel و استخراج کانفیگ‌های VLESS، VMess و Trojan'
                      : 'Automatic CTR decryption and extraction of VLESS, VMess, and Trojan configs'}
                  </p>
                </div>
              </div>

              {/* NPVT Feedback Result Banner */}
              {npvtResult && (
                <div
                  className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                    npvtResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {npvtResult.success ? (
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-rose-500 shrink-0" />
                    )}
                    <span className="truncate">{npvtResult.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNpvtResult(null)}
                    className="text-neutral-400 hover:text-neutral-600 dark:hover:text-white text-xs cursor-pointer shrink-0"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            <form onSubmit={handleAddConfig} className="space-y-3 sm:space-y-4">


              <div>
                <label className="block text-[11px] sm:text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  {isFa ? 'لینک یا کدهای کانفیگ (پشتیبانی از چند لینک یا کد NPVT1):' : 'Config Link(s) or NPVT1 Text:'}
                </label>
                <textarea
                  rows={4}
                  value={newConfigStr || ''}
                  onChange={(e) => setNewConfigStr(e.target.value)}
                  placeholder={`vless://...\nvmess://...\ntrojan://...\nss://...\nیا متن خام فایل NPVT1`}
                  required
                  className="w-full bg-neutral-100 dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded-lg sm:rounded-xl p-2.5 sm:p-3 text-xs font-mono text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                />
                <p className="text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                  {isFa
                    ? 'می‌توانید چند لینک vless/vmess/trojan را در خطوط مختلف وارد کنید یا متن خام فایل NPVT1 را مستقیماً پیست کنید.'
                    : 'You can paste multiple links or raw NPVT1 content separated by newlines.'}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 sm:gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setNpvtResult(null);
                  }}
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

      {/* YouTube Test Modal Dialog */}
      {showYoutubeTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#18181b] border border-neutral-200 dark:border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20">
                  <Video className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                    {isFa ? 'تست یوتیوب (yt-dlp + PO Token)' : 'YouTube Download Test'}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400">
                    {isFa ? 'تنظیم لینک ویدیو جهت ارزیابی سرعت و سلامت کانفیگ‌ها' : 'Configure video URL to measure download speed'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowYoutubeTestModal(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                {isFa ? 'لینک ویدیو تست یوتیوب (yt-dlp + PO Token):' : 'YouTube Test Video URL (yt-dlp + PO Token):'}
              </label>
              <input
                type="text"
                value={testVideoUrl}
                onChange={(e) => setTestVideoUrl(e.target.value)}
                placeholder="https://youtu.be/..."
                className="w-full px-3 py-2 bg-neutral-50 dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-500 text-neutral-900 dark:text-white dir-ltr text-left"
              />
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1 pt-0.5">
                <span className="text-amber-500 font-bold">⚡</span>
                <span>
                  {isFa
                    ? 'کانفیگ‌های سالم با بالاترین سرعت دانلود به‌طور خودکار در صدر لیست قرار می‌گیرند.'
                    : 'Healthy configs with the highest speed are automatically ranked to the top.'}
                </span>
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setShowYoutubeTestModal(false)}
                className="px-3.5 py-1.5 rounded-xl border border-neutral-200 dark:border-white/10 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 cursor-pointer"
              >
                {isFa ? 'انصراف' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={testingAll || configs.length === 0}
                onClick={() => {
                  setShowYoutubeTestModal(false);
                  handleTestYtdlpAll();
                }}
                className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Video className="h-3.5 w-3.5" />
                <span>{isFa ? 'شروع تست همه کانفیگ‌ها' : 'Start YouTube Test'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Popup Modal Dialog */}
      {showLogsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-2xl w-full max-w-4xl max-h-[92vh] sm:max-h-[88vh] shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-3.5 sm:p-5 border-b border-neutral-200 dark:border-white/10 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shrink-0">
                  <ScrollText className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white truncate">
                      {isFa ? 'لاگ‌های زنده هسته Xray / V2Ray' : 'Xray / V2Ray Live Logs'}
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
                  <p className="text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                    {isFa ? 'مشاهده رویدادها، ترافیک عبوری و خطاهای احتمالی هسته پروکسی' : 'Real-time core events, connection logs and error trace'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowLogsModal(false);
                  setAutoRefreshLogs(false);
                }}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 transition cursor-pointer"
                title={isFa ? 'بستن' : 'Close'}
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
            </div>

            {/* Toolbar */}
            <div className="p-2.5 sm:p-3.5 bg-neutral-50/70 dark:bg-white/2 border-b border-neutral-200 dark:border-white/10 flex items-center gap-1.5 sm:gap-2 flex-wrap justify-between shrink-0">
              {/* Search filter */}
              <div className="relative flex-1 min-w-[130px] sm:max-w-xs">
                <Search className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                <input
                  type="text"
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  placeholder={isFa ? 'جستجو در لاگ‌ها...' : 'Filter logs...'}
                  className="w-full bg-white dark:bg-[#18181b] border border-neutral-200 dark:border-white/10 rounded-lg pl-2.5 pr-8 py-1.5 text-[11px] sm:text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {logSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setLogSearchQuery('')}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                {/* Auto Refresh Live Stream Toggle */}
                <button
                  type="button"
                  onClick={() => setAutoRefreshLogs(prev => !prev)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition border cursor-pointer ${
                    autoRefreshLogs
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 shadow-xs'
                      : 'bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-white/10 hover:bg-neutral-200 dark:hover:bg-white/10'
                  }`}
                  title={autoRefreshLogs ? (isFa ? 'توقف پخش زنده لاگ‌ها' : 'Pause live logs') : (isFa ? 'شروع پخش زنده خودکار لاگ‌ها' : 'Start live stream')}
                >
                  {autoRefreshLogs ? (
                    <>
                      <Pause className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-500" />
                      <span>{isFa ? 'پخش زنده (فعال)' : 'Live: On'}</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-neutral-500" />
                      <span>{isFa ? 'پخش زنده (غیرفعال)' : 'Live: Off'}</span>
                    </>
                  )}
                </button>

                {/* Manual Refresh */}
                <button
                  type="button"
                  onClick={() => fetchVpnLogs(false)}
                  disabled={logsLoading}
                  className="p-1.5 sm:px-2.5 sm:py-1.5 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 rounded-lg transition border border-neutral-200 dark:border-white/10 text-[11px] sm:text-xs font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title={isFa ? 'بروزرسانی لاگ‌ها' : 'Refresh logs'}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${logsLoading ? 'animate-spin text-indigo-500' : ''}`} />
                  <span className="hidden sm:inline">{isFa ? 'بروزرسانی' : 'Refresh'}</span>
                </button>

                {/* Copy Logs */}
                <button
                  type="button"
                  onClick={handleCopyVpnLogs}
                  disabled={vpnLogs.length === 0}
                  className="p-1.5 sm:px-2.5 sm:py-1.5 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 rounded-lg transition border border-neutral-200 dark:border-white/10 text-[11px] sm:text-xs font-medium flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  title={isFa ? 'کپی تمام لاگ‌ها' : 'Copy all logs'}
                >
                  {copiedLogs ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">{copiedLogs ? (isFa ? 'کپی شد' : 'Copied') : (isFa ? 'کپی' : 'Copy')}</span>
                </button>

                {/* Download Logs */}
                <button
                  type="button"
                  onClick={handleDownloadVpnLogs}
                  disabled={vpnLogs.length === 0}
                  className="p-1.5 sm:p-2 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 rounded-lg transition border border-neutral-200 dark:border-white/10 cursor-pointer disabled:opacity-40"
                  title={isFa ? 'دانلود فایل لاگ' : 'Download log file'}
                >
                  <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>

                {/* Clear Logs */}
                <button
                  type="button"
                  onClick={handleClearVpnLogs}
                  disabled={logsLoading || vpnLogs.length === 0}
                  className="p-1.5 sm:p-2 bg-neutral-100 dark:bg-white/5 hover:bg-rose-500/10 text-neutral-600 dark:text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition border border-neutral-200 dark:border-white/10 cursor-pointer disabled:opacity-40"
                  title={isFa ? 'پاکسازی لاگ‌ها' : 'Clear logs'}
                >
                  <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
              </div>
            </div>

            {/* Console Log Area */}
            <div className="flex-1 p-3 sm:p-4 overflow-hidden flex flex-col bg-neutral-950 min-h-[280px]">
              <div
                ref={logsContainerRef}
                className="flex-1 overflow-y-auto font-mono text-[11px] sm:text-xs space-y-0.5 text-left dir-ltr pr-1 select-text scrollbar-thin"
              >
                {vpnLogs.length === 0 ? (
                  <div className="text-center py-16 text-neutral-500 flex flex-col items-center justify-center gap-2">
                    <ScrollText className="h-8 w-8 opacity-20" />
                    <p>{isFa ? 'هنوز لاگی ثبت نشده است یا سرویس خاموش است.' : 'No logs recorded yet or VPN service is inactive.'}</p>
                    <button
                      type="button"
                      onClick={() => fetchVpnLogs(false)}
                      className="text-xs text-indigo-400 hover:underline cursor-pointer"
                    >
                      {isFa ? 'دریافت مجدد' : 'Fetch now'}
                    </button>
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div className="text-center py-16 text-neutral-500 space-y-1">
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
                        <span className="text-neutral-600 select-none text-[10px] w-6 shrink-0 text-right">
                          {idx + 1}
                        </span>
                        <span className="flex-1">{line}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 bg-neutral-50 dark:bg-[#151518] border-t border-neutral-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 gap-2 shrink-0">
              <div className="flex items-center gap-3">
                <span>
                  {isFa ? 'پروکسی SOCKS5:' : 'SOCKS5:'}{' '}
                  <code className="text-indigo-600 dark:text-indigo-400 font-mono font-semibold">127.0.0.1:10808</code>
                </span>
                <span>
                  {isFa ? 'پروکسی HTTP:' : 'HTTP:'}{' '}
                  <code className="text-indigo-600 dark:text-indigo-400 font-mono font-semibold">127.0.0.1:10809</code>
                </span>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3">
                <div>
                  {autoRefreshLogs ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>{isFa ? 'پخش زنده فعال است (هر ۳ ثانیه)' : 'Live sync (every 3s)'}</span>
                    </span>
                  ) : (
                    <span className="text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
                      <span>{isFa ? 'پخش زنده غیرفعال است' : 'Live sync paused'}</span>
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowLogsModal(false);
                    setAutoRefreshLogs(false);
                  }}
                  className="px-3 py-1 rounded-lg bg-neutral-200 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/15 text-neutral-800 dark:text-neutral-200 font-medium cursor-pointer"
                >
                  {isFa ? 'بستن' : 'Close'}
                </button>
              </div>
            </div>
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
