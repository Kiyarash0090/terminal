import React, { useState, useEffect, useRef } from 'react';
import { 
  Youtube, 
  Power, 
  PowerOff, 
  RotateCw, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  FileCode, 
  Terminal, 
  Sparkles, 
  Key, 
  Activity, 
  ChevronDown, 
  ChevronUp, 
  Info,
  RefreshCw,
  Download,
  Play,
  Film,
  Music,
  Eye,
  Calendar,
  Clock,
  ExternalLink,
  Trash2,
  FolderDown,
  ArrowDownToLine,
  Clipboard,
  X,
  Layers,
  Shield
} from 'lucide-react';
import { Language } from '../types';

interface YouTubeManagerProps {
  lang: Language;
  token?: string | null;
}

interface YouTubeQualityOption {
  id: string;
  label: string;
  resolution?: string;
  ext: string;
  type: 'video' | 'audio';
  approxSize?: string;
  formatNote?: string;
  fps?: number;
  qualityBadge?: string;
}

interface YouTubeVideoDetails {
  id: string;
  title: string;
  url: string;
  uploader: string;
  channelUrl?: string;
  thumbnail: string;
  duration: number;
  durationFormatted: string;
  viewCount: number;
  viewCountFormatted: string;
  uploadDate?: string;
  description?: string;
  engine?: 'ytdlp' | 'pytubefix';
  vpnUsed?: boolean;
  vpnProxy?: string;
  qualities: YouTubeQualityOption[];
}

interface YouTubeDownloadJob {
  id: string;
  title: string;
  url: string;
  qualityId: string;
  formatLabel: string;
  type: 'video' | 'audio';
  engine?: 'ytdlp' | 'pytubefix';
  vpnUsed?: boolean;
  vpnProxy?: string;
  status: 'starting' | 'downloading' | 'converting' | 'completed' | 'error';
  progress: number;
  speed: string;
  eta: string;
  totalSize: string;
  fileName: string;
  filePath: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export const YouTubeManager: React.FC<YouTubeManagerProps> = ({ lang, token: propToken }) => {
  const getEffectiveToken = () => propToken || localStorage.getItem('serverdash_token') || '';
  const isFa = lang === 'fa';

  // VPN Status State
  const [vpnStatus, setVpnStatus] = useState<{
    vpnActive: boolean;
    httpProxy?: string;
    socksProxy?: string;
    potRunning?: boolean;
  } | null>(null);

  // Server Status State
  const [potStatus, setPotStatus] = useState<{
    isRunning: boolean;
    desiredRunning: boolean;
    port: number;
    pid: number | null;
    startedAt: string | null;
    lastPingTime: string | null;
    lastPingSuccess: boolean;
    logs: string[];
  } | null>(null);

  const [potRestarting, setPotRestarting] = useState(false);
  const [potToggling, setPotToggling] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  // Video URL & Extraction State
  const [videoUrl, setVideoUrl] = useState('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [videoDetails, setVideoDetails] = useState<YouTubeVideoDetails | null>(null);
  const [qualityTab, setQualityTab] = useState<'video' | 'audio'>('video');
  const [showFullDescription, setShowFullDescription] = useState(false);

  // Downloads State
  const [downloads, setDownloads] = useState<YouTubeDownloadJob[]>([]);
  const [activeDownloadId, setActiveDownloadId] = useState<string | null>(null);
  const [downloadingQualityId, setDownloadingQualityId] = useState<string | null>(null);
  const [extractorEngine, setExtractorEngine] = useState<'ytdlp' | 'pytubefix'>('ytdlp');
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // PO Token Generator State
  const [potMode, setPotMode] = useState<'ytdlp' | 'pytubefix'>('ytdlp');
  const [potTesting, setPotTesting] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [ytdlpSnippetType, setYtdlpSnippetType] = useState<'cli' | 'python'>('cli');
  const [pytubefixSnippetType, setPytubefixSnippetType] = useState<'verifier' | 'static'>('verifier');
  const [potTestResult, setPotTestResult] = useState<{
    success: boolean;
    mode?: 'ytdlp' | 'pytubefix';
    message?: string;
    error?: string;
    poToken?: string;
    rawPoToken?: string;
    visitorData?: string;
    rawVisitorData?: string;
    durationMs?: number;
    ytdlpVerified?: boolean;
    ytdlpFormat?: string;
    pytubefixVerified?: boolean;
    pytubefixTitle?: string;
    snippets?: {
      cliCode?: string;
      pythonCode?: string;
      verifierCode?: string;
      staticCode?: string;
    };
  } | null>(null);

  // Fetch VPN status
  const fetchVpnStatus = async () => {
    try {
      const token = getEffectiveToken();
      const res = await fetch('/api/youtube/vpn-status', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token
        }
      });
      if (res.ok) {
        const data = await res.json();
        setVpnStatus(data);
      }
    } catch {}
  };

  // Fetch PO Token server status
  const fetchPotStatus = async () => {
    try {
      const token = getEffectiveToken();
      const res = await fetch('/api/po-token/status', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token
        }
      });
      if (res.ok) {
        const data = await res.json();
        setPotStatus(data);
      }
    } catch {}
  };

  // Fetch recent download jobs
  const fetchDownloads = async () => {
    try {
      const token = getEffectiveToken();
      const res = await fetch('/api/youtube/downloads', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.jobs)) {
          setDownloads(data.jobs);
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchVpnStatus();
    fetchPotStatus();
    fetchDownloads();
    const interval = setInterval(() => {
      fetchVpnStatus();
      fetchPotStatus();
      fetchDownloads();
    }, 4000);
    return () => clearInterval(interval);
  }, [propToken]);

  // Handle Clipboard Paste
  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setVideoUrl(text.trim());
          handleExtractInfo(text.trim());
        }
      }
    } catch {
      // If clipboard read fails or blocked by iframe permissions, user can paste manually
    }
  };

  // Extract Video Information & Qualities with selected engine (ytdlp | pytubefix)
  const handleExtractInfo = async (urlToExtract?: string, overrideEngine?: 'ytdlp' | 'pytubefix') => {
    const targetUrl = (urlToExtract || videoUrl || '').trim();
    const activeEngine = overrideEngine || extractorEngine;
    if (!targetUrl) {
      setExtractError(isFa ? 'لطفاً لینک ویدیوی یوتیوب را وارد کنید' : 'Please enter a YouTube video URL');
      return;
    }

    setIsExtracting(true);
    setExtractError(null);
    setVideoDetails(null);

    try {
      const token = getEffectiveToken();
      const res = await fetch('/api/youtube/info', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          url: targetUrl,
          engine: activeEngine
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (isFa ? 'خطا در استخراج اطلاعات ویدیو' : 'Failed to extract video information'));
      }

      setVideoDetails(data.details);
    } catch (err: any) {
      setExtractError(err.message || (isFa ? 'خطا در ارتباط با سرور یوتیوب' : 'Network error communicating with YouTube service'));
    } finally {
      setIsExtracting(false);
    }
  };

  // Initiate Download of selected Quality with chosen engine
  const handleDownloadQuality = async (quality: YouTubeQualityOption) => {
    if (!videoUrl || !videoDetails) return;

    setDownloadingQualityId(quality.id);
    try {
      const token = getEffectiveToken();
      const res = await fetch('/api/youtube/download', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: videoUrl,
          qualityId: quality.id,
          type: quality.type,
          formatLabel: quality.label,
          title: videoDetails.title,
          engine: extractorEngine
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در ارسال درخواست دانلود');
      }

      setActiveDownloadId(data.jobId);
      // Immediately refresh download jobs
      await fetchDownloads();

      // Poll status for the active job
      startPollingJob(data.jobId);
    } catch (err: any) {
      alert(isFa ? `خطا در شروع دانلود: ${err.message}` : `Error starting download: ${err.message}`);
    } finally {
      setDownloadingQualityId(null);
    }
  };

  // Poll Download Job
  const startPollingJob = (jobId: string) => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }

    pollTimerRef.current = setInterval(async () => {
      try {
        const token = getEffectiveToken();
        const res = await fetch(`/api/youtube/download/status/${jobId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-auth-token': token
          }
        });

        if (res.ok) {
          const data = await res.json();
          const job: YouTubeDownloadJob = data.job;

          setDownloads(prev => {
            const idx = prev.findIndex(j => j.id === job.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = job;
              return updated;
            }
            return [job, ...prev];
          });

          if (job.status === 'completed' || job.status === 'error') {
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
          }
        }
      } catch {}
    }, 1000);
  };

  // Delete a Downloaded File
  const handleDeleteDownload = async (id: string) => {
    if (!confirm(isFa ? 'آیا از حذف این فایل دانلودی مطمئن هستید؟' : 'Are you sure you want to delete this downloaded file?')) {
      return;
    }

    try {
      const token = getEffectiveToken();
      await fetch(`/api/youtube/download/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token
        }
      });
      setDownloads(prev => prev.filter(j => j.id !== id));
      if (activeDownloadId === id) setActiveDownloadId(null);
    } catch {}
  };

  // Toggle PO Token Service
  const handleTogglePot = async (enable: boolean) => {
    setPotToggling(true);
    try {
      const token = getEffectiveToken();
      const endpoint = enable ? '/api/po-token/start' : '/api/po-token/stop';
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token
        }
      });
      await fetchPotStatus();
    } catch {}
    setPotToggling(false);
  };

  // Restart PO Token Service
  const handleRestartPot = async () => {
    setPotRestarting(true);
    try {
      const token = getEffectiveToken();
      await fetch('/api/po-token/restart', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token
        }
      });
      await fetchPotStatus();
    } catch {}
    setPotRestarting(false);
  };

  // Generate & Test PO Token
  const handleGenerateToken = async (targetMode: 'ytdlp' | 'pytubefix') => {
    setPotTesting(true);
    setPotTestResult(null);
    try {
      const token = getEffectiveToken();
      const res = await fetch('/api/po-token/test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mode: targetMode,
          videoUrl: videoUrl
        })
      });
      const data = await res.json();
      setPotTestResult(data);
    } catch (e: any) {
      setPotTestResult({
        success: false,
        error: e.message || (isFa ? 'خطا در ارتباط با سرور' : 'Connection error')
      });
    }
    setPotTesting(false);
  };

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const activeJob = downloads.find(j => j.id === activeDownloadId) || downloads.find(j => j.status === 'downloading' || j.status === 'converting');

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Top Banner / Header Card */}
      <div className="p-5 sm:p-6 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-rose-500/10 text-rose-500 shrink-0">
              <Youtube className="h-8 w-8" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                  {isFa ? 'بخش اختصاصی یوتیوب (استخراج، دانلود و PO Token)' : 'YouTube Hub (Extract, Download & PO Token)'}
                </h2>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  potStatus?.isRunning 
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                    : 'bg-neutral-500/10 text-neutral-400 border border-neutral-500/20'
                }`}>
                  <span className={`h-2 w-2 rounded-full ${potStatus?.isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`}></span>
                  {potStatus?.isRunning ? (isFa ? 'سرویس توکن آنلاین' : 'Token Server Online') : (isFa ? 'سرویس توکن خاموش' : 'Token Server Offline')}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  vpnStatus?.vpnActive 
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25' 
                    : 'bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 border border-neutral-500/20'
                }`}>
                  <span className={`h-2 w-2 rounded-full ${vpnStatus?.vpnActive ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`}></span>
                  <Shield className="h-3 w-3" />
                  <span>
                    {vpnStatus?.vpnActive 
                      ? (isFa ? 'VPN فعال (استخراج و دانلود از پروکسی ۱۰۸۰۹)' : 'VPN Active (Proxy 10809)') 
                      : (isFa ? 'اتصال مستقیم (VPN خاموش)' : 'Direct Connection')}
                  </span>
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                {isFa 
                  ? 'استخراج اطلاعات، تامبنیل و کیفیت‌های ویدیو با قابلیت دانلود مستقیم در سرور و دستگاه کاربر'
                  : 'Extract video metadata, thumbnail, available resolutions and download directly to server or device.'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {potStatus?.isRunning ? (
              <button
                onClick={() => handleTogglePot(false)}
                disabled={potToggling}
                className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
              >
                {potToggling ? <RotateCw className="h-4 w-4 animate-spin" /> : <PowerOff className="h-4 w-4" />}
                <span>{isFa ? 'خاموش کردن سرور' : 'Stop Token Service'}</span>
              </button>
            ) : (
              <button
                onClick={() => handleTogglePot(true)}
                disabled={potToggling}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 transition shadow-md shadow-emerald-600/20 disabled:opacity-50 cursor-pointer"
              >
                {potToggling ? <RotateCw className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                <span>{isFa ? 'روشن کردن سرور' : 'Start Token Service'}</span>
              </button>
            )}

            {potStatus?.isRunning && (
              <button
                onClick={handleRestartPot}
                disabled={potRestarting}
                className="px-3.5 py-2 rounded-xl bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-white/10 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                title={isFa ? 'راه‌اندازی مجدد سرویس توکن' : 'Restart token service'}
              >
                <RotateCw className={`h-3.5 w-3.5 ${potRestarting ? 'animate-spin text-amber-500' : ''}`} />
                <span>{isFa ? 'راه‌اندازی مجدد' : 'Restart'}</span>
              </button>
            )}

            <button
              onClick={() => { fetchVpnStatus(); fetchPotStatus(); fetchDownloads(); }}
              className="p-2 rounded-xl bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-white/10 transition cursor-pointer"
              title={isFa ? 'بروزرسانی وضعیت' : 'Refresh Status'}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 1: VIDEO INFO EXTRACTOR & DOWNLOADER */}
      <div className="p-5 sm:p-6 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-xl space-y-6">
        <div>
          <h3 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <Film className="h-5 w-5 text-rose-500" />
            <span>{isFa ? 'استخراج اطلاعات و دانلود ویدیوهای یوتیوب' : 'Extract Video Info & Download'}</span>
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            {isFa 
              ? 'آدرس ویدیوی مورد نظر را وارد کرده تا تامبنیل، مشخصات و کلیه کیفیت‌های قابل دریافت استخراج شوند.'
              : 'Enter a YouTube video URL to inspect thumbnails, metadata, and available quality formats.'}
          </p>
        </div>

        {/* Library Engine Selector (yt-dlp vs pytubefix) */}
        <div className="p-3 sm:p-4 rounded-xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200 dark:border-white/5 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-rose-500" />
              <span>{isFa ? 'انتخاب کتابخانه استخراج و دانلود:' : 'Select Extraction & Download Engine:'}</span>
            </span>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {isFa ? 'می‌توانید بین yt-dlp و pytubefix انتخاب کنید' : 'Choose between yt-dlp and pytubefix'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {/* yt-dlp Option */}
            <button
              type="button"
              onClick={() => {
                setExtractorEngine('ytdlp');
                if (videoUrl && videoDetails) handleExtractInfo(videoUrl, 'ytdlp');
              }}
              className={`p-3 rounded-xl border text-right transition cursor-pointer flex items-center justify-between gap-3 min-h-[50px] ${
                extractorEngine === 'ytdlp'
                  ? 'bg-rose-500/10 border-rose-500/40 text-neutral-900 dark:text-white shadow-sm ring-1 ring-rose-500/30'
                  : 'bg-white dark:bg-neutral-900/60 border-neutral-200 dark:border-white/5 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-white/15'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`p-2 rounded-lg ${extractorEngine === 'ytdlp' ? 'bg-rose-500 text-white' : 'bg-neutral-100 dark:bg-white/5 text-neutral-500'}`}>
                  <Terminal className="h-4 w-4 shrink-0" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold font-mono flex items-center gap-1.5">
                    <span>yt-dlp</span>
                    {extractorEngine === 'ytdlp' && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/20 text-rose-600 dark:text-rose-400 font-sans">
                        {isFa ? 'فعال' : 'Active'}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                    {isFa ? 'موتور پیش‌فرض قدرتمند با پشتیبانی از PO Token' : 'Powerful CLI engine with PO Token support'}
                  </p>
                </div>
              </div>
              <div className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                extractorEngine === 'ytdlp' ? 'border-rose-500 bg-rose-500 text-white' : 'border-neutral-300 dark:border-neutral-600'
              }`}>
                {extractorEngine === 'ytdlp' && <Check className="h-2.5 w-2.5 stroke-[3]" />}
              </div>
            </button>

            {/* pytubefix Option */}
            <button
              type="button"
              onClick={() => {
                setExtractorEngine('pytubefix');
                if (videoUrl && videoDetails) handleExtractInfo(videoUrl, 'pytubefix');
              }}
              className={`p-3 rounded-xl border text-right transition cursor-pointer flex items-center justify-between gap-3 min-h-[50px] ${
                extractorEngine === 'pytubefix'
                  ? 'bg-indigo-500/10 border-indigo-500/40 text-neutral-900 dark:text-white shadow-sm ring-1 ring-indigo-500/30'
                  : 'bg-white dark:bg-neutral-900/60 border-neutral-200 dark:border-white/5 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-white/15'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`p-2 rounded-lg ${extractorEngine === 'pytubefix' ? 'bg-indigo-600 text-white' : 'bg-neutral-100 dark:bg-white/5 text-neutral-500'}`}>
                  <FileCode className="h-4 w-4 shrink-0" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold font-mono flex items-center gap-1.5">
                    <span>pytubefix</span>
                    {extractorEngine === 'pytubefix' && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-sans">
                        {isFa ? 'فعال' : 'Active'}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                    {isFa ? 'کتابخانه اختصاصی پایتون با تحلیل مستقیم استریم‌ها' : 'Pure Python YouTube stream library'}
                  </p>
                </div>
              </div>
              <div className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                extractorEngine === 'pytubefix' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-neutral-300 dark:border-neutral-600'
              }`}>
                {extractorEngine === 'pytubefix' && <Check className="h-2.5 w-2.5 stroke-[3]" />}
              </div>
            </button>
          </div>
        </div>

        {/* URL Input Bar */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 block">
            {isFa ? 'لینک ویدیو یوتیوب:' : 'YouTube Video URL:'}
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleExtractInfo()}
                placeholder="https://www.youtube.com/watch?v=... یا https://youtu.be/..."
                className="w-full px-4 py-3 pl-20 sm:pl-24 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-rose-500 dir-ltr text-left font-mono"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {videoUrl && (
                  <button
                    onClick={() => { setVideoUrl(''); setVideoDetails(null); setExtractError(null); }}
                    className="p-1.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-white rounded-lg transition"
                    title={isFa ? 'پاک کردن' : 'Clear'}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={handlePasteClipboard}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-neutral-200 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/15 text-neutral-700 dark:text-neutral-300 flex items-center gap-1 transition"
                  title={isFa ? 'پیست از کلیپ‌بورد' : 'Paste from clipboard'}
                >
                  <Clipboard className="h-3 w-3" />
                  <span>{isFa ? 'پیست' : 'Paste'}</span>
                </button>
              </div>
            </div>

            {/* Extract Button */}
            <button
              onClick={() => handleExtractInfo()}
              disabled={isExtracting}
              className="px-6 py-3 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer shrink-0 min-w-[150px]"
            >
              {isExtracting ? (
                <RotateCw className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span>{isExtracting ? (isFa ? 'در حال استخراج...' : 'Extracting...') : (isFa ? 'استخراج اطلاعات ویدیو' : 'Extract Video Info')}</span>
            </button>
          </div>
        </div>

        {/* Extraction Error Banner */}
        {extractError && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">{isFa ? 'خطا در استخراج اطلاعات:' : 'Extraction Error:'}</span>
              <p className="mt-0.5 font-mono text-[11px] dir-ltr text-left opacity-90">{extractError}</p>
            </div>
          </div>
        )}

        {/* EXTRACTED VIDEO DETAILS DISPLAY */}
        {videoDetails && (
          <div className="space-y-6 pt-2">
            {/* Video Hero Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200 dark:border-white/5 flex flex-col md:flex-row gap-5 items-start">
              {/* Thumbnail Container */}
              <div className="relative w-full md:w-80 shrink-0 aspect-video rounded-xl overflow-hidden shadow-lg bg-neutral-900 group">
                <img 
                  src={videoDetails.thumbnail} 
                  alt={videoDetails.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-between p-3">
                  <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white font-bold text-[10px] tracking-wider uppercase shadow">
                    YouTube
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-black/80 text-white font-mono text-xs font-semibold backdrop-blur-sm flex items-center gap-1">
                    <Clock className="h-3 w-3 text-amber-400" />
                    <span>{videoDetails.durationFormatted}</span>
                  </span>
                </div>
                <a
                  href={videoDetails.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition backdrop-blur-[2px]"
                >
                  <div className="p-3 rounded-full bg-rose-600 text-white shadow-xl transform scale-90 group-hover:scale-100 transition">
                    <Play className="h-6 w-6 fill-current" />
                  </div>
                </a>
              </div>

              {/* Video Info Details */}
              <div className="flex-1 min-w-0 space-y-3 w-full">
                <div>
                  <h4 className="text-base font-bold text-neutral-900 dark:text-white leading-snug break-words">
                    {videoDetails.title}
                  </h4>
                  {videoDetails.uploader && (
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        {videoDetails.uploader}
                      </span>
                      {videoDetails.channelUrl && (
                        <a
                          href={videoDetails.channelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-neutral-900 dark:hover:text-white transition"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Metadata Pills */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="px-3 py-1.5 rounded-lg bg-neutral-200/60 dark:bg-white/5 border border-neutral-300/60 dark:border-white/5 flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300 font-mono">
                    <Layers className="h-3.5 w-3.5 text-rose-500" />
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      {videoDetails.engine === 'pytubefix' ? 'pytubefix' : 'yt-dlp'}
                    </span>
                  </div>

                  <div className="px-3 py-1.5 rounded-lg bg-neutral-200/60 dark:bg-white/5 border border-neutral-300/60 dark:border-white/5 flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
                    <Eye className="h-3.5 w-3.5 text-sky-500" />
                    <span>{isFa ? `${videoDetails.viewCountFormatted} بازدید` : `${videoDetails.viewCountFormatted} views`}</span>
                  </div>

                  <div className="px-3 py-1.5 rounded-lg bg-neutral-200/60 dark:bg-white/5 border border-neutral-300/60 dark:border-white/5 flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                    <span>{videoDetails.durationFormatted}</span>
                  </div>

                  {videoDetails.vpnUsed && (
                    <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                      <Shield className="h-3.5 w-3.5 text-emerald-500" />
                      <span>{isFa ? 'هدایت شده از VPN' : 'Routed via VPN'}</span>
                    </div>
                  )}

                  {videoDetails.uploadDate && (
                    <div className="px-3 py-1.5 rounded-lg bg-neutral-200/60 dark:bg-white/5 border border-neutral-300/60 dark:border-white/5 flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
                      <Calendar className="h-3.5 w-3.5 text-emerald-500" />
                      <span>{videoDetails.uploadDate}</span>
                    </div>
                  )}
                </div>

                {/* Description Preview */}
                {videoDetails.description && (
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed bg-white dark:bg-neutral-900/50 p-3 rounded-xl border border-neutral-200/60 dark:border-white/5">
                    <p className={`whitespace-pre-line ${!showFullDescription ? 'line-clamp-2' : ''}`}>
                      {videoDetails.description}
                    </p>
                    {videoDetails.description.length > 120 && (
                      <button
                        onClick={() => setShowFullDescription(!showFullDescription)}
                        className="text-rose-500 hover:text-rose-400 text-[11px] font-semibold mt-1 flex items-center gap-1 cursor-pointer"
                      >
                        {showFullDescription ? (isFa ? 'بستن توضیحات' : 'Show Less') : (isFa ? 'نمایش بیشتر...' : 'Show More...')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* QUALITIES AND FORMATS SECTION */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-neutral-200 dark:border-white/10">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-sky-500" />
                  <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                    {isFa ? 'کیفیت‌ها و فرمت‌های قابل دانلود' : 'Available Qualities & Download'}
                  </h4>
                </div>

                {/* Format Type Tabs */}
                <div className="flex items-center gap-1 p-1 bg-neutral-100 dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/10">
                  <button
                    onClick={() => setQualityTab('video')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      qualityTab === 'video'
                        ? 'bg-rose-600 text-white shadow'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    <Film className="h-3.5 w-3.5" />
                    <span>{isFa ? 'ویدیو با صدا (MP4)' : 'Video (MP4)'}</span>
                  </button>
                  <button
                    onClick={() => setQualityTab('audio')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      qualityTab === 'audio'
                        ? 'bg-purple-600 text-white shadow'
                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    <Music className="h-3.5 w-3.5" />
                    <span>{isFa ? 'فقط صوت (MP3 / M4A)' : 'Audio Only (MP3)'}</span>
                  </button>
                </div>
              </div>

              {/* Quality Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {videoDetails.qualities
                  .filter(q => q.type === qualityTab)
                  .map((q) => {
                    const isDownloadingThis = downloadingQualityId === q.id;
                    return (
                      <div
                        key={q.id}
                        className="p-4 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] hover:border-rose-500/40 dark:hover:border-rose-500/40 transition flex flex-col justify-between gap-3 shadow-sm hover:shadow"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-xs text-neutral-900 dark:text-white">
                                {q.label}
                              </span>
                              {q.qualityBadge && (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                  q.type === 'audio' 
                                    ? 'bg-purple-500/15 text-purple-500 border border-purple-500/20'
                                    : 'bg-rose-500/15 text-rose-500 border border-rose-500/20'
                                }`}>
                                  {q.qualityBadge}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 block font-mono">
                              .{q.ext} {q.fps ? `• ${q.fps}fps` : ''}
                            </span>
                          </div>

                          {q.approxSize && (
                            <span className="px-2 py-1 rounded-lg bg-neutral-200/80 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 font-mono text-[11px] font-semibold shrink-0">
                              {q.approxSize}
                            </span>
                          )}
                        </div>

                        {/* Download CTA */}
                        <button
                          onClick={() => handleDownloadQuality(q)}
                          disabled={isDownloadingThis}
                          className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-md disabled:opacity-50 ${
                            q.type === 'audio'
                              ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/20'
                              : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'
                          }`}
                        >
                          {isDownloadingThis ? (
                            <RotateCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowDownToLine className="h-4 w-4" />
                          )}
                          <span>
                            {isDownloadingThis 
                              ? (isFa ? 'در حال ارسال به دانلودر...' : 'Queuing download...') 
                              : (isFa ? `دانلود این کیفیت (${q.ext.toUpperCase()})` : `Download (${q.ext.toUpperCase()})`)}
                          </span>
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {/* ACTIVE DOWNLOAD / PROGRESS MONITOR */}
        {activeJob && (
          <div className="p-4 sm:p-5 rounded-2xl bg-neutral-900 border border-neutral-800 text-white shadow-2xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 shrink-0">
                  <Download className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h5 className="font-bold text-xs truncate max-w-md">
                    {activeJob.title}
                  </h5>
                  <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5">
                    <span className="text-rose-400 font-semibold">{activeJob.formatLabel}</span>
                    <span>•</span>
                    <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono text-[10px]">
                      {activeJob.engine || 'yt-dlp'}
                    </span>
                    <span>•</span>
                    <span className="font-mono">{activeJob.totalSize || ''}</span>
                    <span>•</span>
                    <span className="capitalize">{activeJob.status}</span>
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2 shrink-0">
                {activeJob.status === 'completed' ? (
                  <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{isFa ? 'دانلود تکمیل شد' : 'Completed'}</span>
                  </span>
                ) : activeJob.status === 'error' ? (
                  <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" />
                    <span>{isFa ? 'خطا در دانلود' : 'Error'}</span>
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-bold flex items-center gap-1.5">
                    <RotateCw className="h-3.5 w-3.5 animate-spin" />
                    <span>
                      {activeJob.status === 'converting' 
                        ? (isFa ? 'در حال ترکیب و تبدیل...' : 'Converting...') 
                        : (isFa ? 'در حال دانلود...' : 'Downloading...')}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full bg-neutral-800 rounded-full h-2.5 overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 rounded-full ${
                    activeJob.status === 'completed' 
                      ? 'bg-emerald-500' 
                      : activeJob.status === 'error' 
                        ? 'bg-rose-500' 
                        : 'bg-gradient-to-r from-rose-500 to-sky-500'
                  }`}
                  style={{ width: `${Math.max(activeJob.progress, 5)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                <span>{activeJob.progress.toFixed(1)}%</span>
                <div className="flex items-center gap-3">
                  {activeJob.speed && <span>{isFa ? `سرعت: ${activeJob.speed}` : `Speed: ${activeJob.speed}`}</span>}
                  {activeJob.eta && <span>{isFa ? `زمان باقیمانده: ${activeJob.eta}` : `ETA: ${activeJob.eta}`}</span>}
                </div>
              </div>
            </div>

            {/* Error Message */}
            {activeJob.error && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
                {activeJob.error}
              </div>
            )}

            {/* Completed Action Buttons */}
            {activeJob.status === 'completed' && activeJob.fileName && (
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-neutral-800">
                <div className="text-xs text-neutral-300 flex items-center gap-1.5">
                  <FolderDown className="h-4 w-4 text-emerald-400" />
                  <span>{isFa ? 'ذخیره شده در پوشه downloads سرور:' : 'Saved to server /downloads:'}</span>
                  <code className="text-emerald-400 font-mono text-[11px] bg-white/5 px-2 py-0.5 rounded">
                    {activeJob.fileName}
                  </code>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`/api/youtube/download/file/${activeJob.id}?token=${getEffectiveToken()}`}
                    download={activeJob.fileName}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-600/30 cursor-pointer"
                  >
                    <ArrowDownToLine className="h-4 w-4" />
                    <span>{isFa ? 'دریافت مستقیم روی گوشی / سیستم' : 'Download to Device'}</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* RECENT DOWNLOADS LIST */}
        {downloads.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-neutral-200 dark:border-white/10">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
                <FolderDown className="h-4 w-4 text-emerald-500" />
                <span>{isFa ? 'فایل‌های دانلود شده اخیر در سرور' : 'Recent Downloads on Server'}</span>
                <span className="px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-white/10 text-[10px] text-neutral-600 dark:text-neutral-400">
                  {downloads.length}
                </span>
              </h4>
              <button
                onClick={fetchDownloads}
                className="text-xs text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition flex items-center gap-1"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{isFa ? 'بروزرسانی لیست' : 'Refresh'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto">
              {downloads.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl border border-neutral-200 dark:border-white/5 bg-neutral-50/50 dark:bg-white/[0.02] flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-neutral-900 dark:text-white truncate">
                      {item.title}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 flex-wrap">
                      <span className="text-rose-500 font-semibold">{item.formatLabel}</span>
                      <span className="px-1.5 py-0.2 rounded bg-neutral-200 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 font-mono text-[10px]">
                        {item.engine || 'ytdlp'}
                      </span>
                      {item.vpnUsed && (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-sans text-[10px] flex items-center gap-1">
                          <Shield className="h-2.5 w-2.5" />
                          <span>VPN</span>
                        </span>
                      )}
                      {item.totalSize && <span>• {item.totalSize}</span>}
                      <span>• {new Date(item.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.status === 'completed' && (
                      <a
                        href={`/api/youtube/download/file/${item.id}?token=${getEffectiveToken()}`}
                        download={item.fileName}
                        className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition cursor-pointer"
                        title={isFa ? 'دریافت فایل' : 'Download file'}
                      >
                        <ArrowDownToLine className="h-4 w-4" />
                      </a>
                    )}
                    <button
                      onClick={() => handleDeleteDownload(item.id)}
                      className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 transition cursor-pointer"
                      title={isFa ? 'حذف فایل' : 'Delete file'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: PO TOKEN GENERATOR & API TESTER */}
      <div className="p-5 sm:p-6 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200/80 dark:border-white/10">
          <div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <Key className="h-5 w-5 text-amber-500" />
              <span>{isFa ? 'تولیدکننده توکن PO (PO Token Generator)' : 'PO Token Generator'}</span>
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {isFa ? 'نوع ابزار مقصد خود را انتخاب کرده و توکن تازه تولید کنید.' : 'Select your target framework and generate a fresh PO Token.'}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-neutral-100 dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/10 w-full sm:w-auto">
            <button
              onClick={() => { setPotMode('ytdlp'); setPotTestResult(null); }}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                potMode === 'ytdlp'
                  ? 'bg-rose-500 text-white shadow-md'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <Terminal className="h-4 w-4" />
              <span>yt-dlp Generator</span>
            </button>
            <button
              onClick={() => { setPotMode('pytubefix'); setPotTestResult(null); }}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                potMode === 'pytubefix'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <FileCode className="h-4 w-4" />
              <span>Pytubefix Generator</span>
            </button>
          </div>
        </div>

        {/* PO Token Trigger Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {isFa 
              ? `تولید توکن PO سازگار با ${potMode === 'ytdlp' ? 'yt-dlp' : 'Pytubefix'} با استفاده از آدرس وارد شده در بالا.`
              : `Generate ${potMode === 'ytdlp' ? 'yt-dlp' : 'Pytubefix'} compatible PO token using video URL above.`}
          </p>

          <button
            onClick={() => handleGenerateToken(potMode)}
            disabled={potTesting || !potStatus?.isRunning}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 transition disabled:opacity-40 cursor-pointer shadow-md shrink-0 ${
              potMode === 'ytdlp' ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20' : 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/20'
            }`}
          >
            {potTesting ? (
              <RotateCw className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span>
              {potTesting 
                ? (isFa ? 'در حال تولید توکن...' : 'Generating Token...') 
                : (isFa ? `تولید توکن برای ${potMode === 'ytdlp' ? 'yt-dlp' : 'Pytubefix'}` : `Generate Token for ${potMode === 'ytdlp' ? 'yt-dlp' : 'Pytubefix'}`)}
            </span>
          </button>
        </div>

        {/* Test Result Display */}
        {potTestResult && (
          <div className="space-y-4 pt-2">
            <div className={`p-4 rounded-xl border ${
              potTestResult.success 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
            } text-xs flex items-start gap-3`}>
              {potTestResult.success ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
              <div className="flex-1 space-y-1">
                <div className="font-bold text-sm">
                  {potTestResult.success 
                    ? (isFa ? `توکن PO مخصوص ${potMode === 'ytdlp' ? 'yt-dlp' : 'Pytubefix'} با موفقیت تولید و تأیید شد!` : `PO Token generated & verified for ${potMode === 'ytdlp' ? 'yt-dlp' : 'Pytubefix'}!`)
                    : (isFa ? 'خطا در اعتبارسنجی یا تولید توکن' : 'Generation or validation failed')}
                </div>
                <p className="opacity-90">{potTestResult.message || potTestResult.error}</p>
              </div>
            </div>

            {/* Generated Tokens Box */}
            {potTestResult.success && potTestResult.poToken && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* PO Token Card */}
                <div className="bg-neutral-50 dark:bg-white/[0.02] p-4 rounded-xl border border-neutral-200 dark:border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-neutral-700 dark:text-neutral-300">
                      {isFa ? 'مقدار PO Token:' : 'PO Token Value:'}
                    </span>
                    <button
                      onClick={() => copyToClipboard(potTestResult.poToken || '', 'pot_val')}
                      className="px-2 py-1 rounded bg-neutral-200 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/20 text-[11px] flex items-center gap-1 transition cursor-pointer"
                    >
                      {copiedField === 'pot_val' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedField === 'pot_val' ? (isFa ? 'کپی شد' : 'Copied') : (isFa ? 'کپی' : 'Copy')}</span>
                    </button>
                  </div>
                  <div className="p-2.5 rounded-lg bg-neutral-900 text-emerald-400 font-mono text-[11px] break-all select-all dir-ltr text-left">
                    {potTestResult.poToken}
                  </div>
                </div>

                {/* Visitor Data Card */}
                <div className="bg-neutral-50 dark:bg-white/[0.02] p-4 rounded-xl border border-neutral-200 dark:border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-neutral-700 dark:text-neutral-300">
                      {isFa ? 'مقدار Visitor Data:' : 'Visitor Data Value:'}
                    </span>
                    <button
                      onClick={() => copyToClipboard(potTestResult.visitorData || '', 'vis_val')}
                      className="px-2 py-1 rounded bg-neutral-200 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/20 text-[11px] flex items-center gap-1 transition cursor-pointer"
                    >
                      {copiedField === 'vis_val' ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedField === 'vis_val' ? (isFa ? 'کپی شد' : 'Copied') : (isFa ? 'کپی' : 'Copy')}</span>
                    </button>
                  </div>
                  <div className="p-2.5 rounded-lg bg-neutral-900 text-sky-400 font-mono text-[11px] break-all select-all dir-ltr text-left">
                    {potTestResult.visitorData || 'N/A'}
                  </div>
                </div>
              </div>
            )}

            {/* Ready-to-Use Code Snippet Box */}
            {potTestResult.success && potTestResult.snippets && (
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-900 overflow-hidden shadow-xl">
                <div className="px-4 py-3 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold text-neutral-200">
                      {isFa ? 'کد آماده و بهینه‌سازی شده جهت اجرا' : 'Ready-to-use Code Snippet'}
                    </span>
                  </div>

                  {/* Snippet Sub-tabs */}
                  {potMode === 'ytdlp' ? (
                    <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-800 text-xs">
                      <button
                        onClick={() => setYtdlpSnippetType('cli')}
                        className={`px-3 py-1 rounded font-medium transition cursor-pointer ${
                          ytdlpSnippetType === 'cli' ? 'bg-rose-600 text-white' : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        CLI Command
                      </button>
                      <button
                        onClick={() => setYtdlpSnippetType('python')}
                        className={`px-3 py-1 rounded font-medium transition cursor-pointer ${
                          ytdlpSnippetType === 'python' ? 'bg-rose-600 text-white' : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        Python yt_dlp
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-800 text-xs">
                      <button
                        onClick={() => setPytubefixSnippetType('verifier')}
                        className={`px-3 py-1 rounded font-medium transition cursor-pointer ${
                          pytubefixSnippetType === 'verifier' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        Dynamic Verifier
                      </button>
                      <button
                        onClick={() => setPytubefixSnippetType('static')}
                        className={`px-3 py-1 rounded font-medium transition cursor-pointer ${
                          pytubefixSnippetType === 'static' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        Static Token
                      </button>
                    </div>
                  )}
                </div>

                {/* Snippet Textarea & Copy */}
                <div className="p-4 relative font-mono text-xs text-neutral-300 dir-ltr text-left">
                  <button
                    onClick={() => {
                      const snippetToCopy = potMode === 'ytdlp'
                        ? (ytdlpSnippetType === 'cli' ? potTestResult.snippets?.cliCode : potTestResult.snippets?.pythonCode)
                        : (pytubefixSnippetType === 'verifier' ? potTestResult.snippets?.verifierCode : potTestResult.snippets?.staticCode);
                      copyToClipboard(snippetToCopy || '', 'code_snippet');
                    }}
                    className="absolute top-4 right-4 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-sans flex items-center gap-1.5 transition cursor-pointer border border-neutral-700 shadow-md"
                  >
                    {copiedField === 'code_snippet' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedField === 'code_snippet' ? (isFa ? 'کپی شد!' : 'Copied!') : (isFa ? 'کپی کد' : 'Copy Code')}</span>
                  </button>

                  <pre className="whitespace-pre-wrap break-all pr-24 leading-relaxed text-emerald-400/90 font-mono text-xs selection:bg-purple-600/40">
                    {potMode === 'ytdlp'
                      ? (ytdlpSnippetType === 'cli' ? potTestResult.snippets?.cliCode : potTestResult.snippets?.pythonCode)
                      : (pytubefixSnippetType === 'verifier' ? potTestResult.snippets?.verifierCode : potTestResult.snippets?.staticCode)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Logs and Diagnostics Panel */}
      <div className="p-5 sm:p-6 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-xl space-y-4">
        <div 
          onClick={() => setShowLogs(!showLogs)}
          className="flex items-center justify-between cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-sky-500" />
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
              {isFa ? 'لاگ‌های زنده سرویس یوتیوب و PO Token' : 'YouTube & PO Token Live Logs'}
            </h3>
            {potStatus?.logs && (
              <span className="text-xs bg-neutral-100 dark:bg-white/10 px-2 py-0.5 rounded-full text-neutral-600 dark:text-neutral-400">
                {potStatus.logs.length}
              </span>
            )}
          </div>
          <button className="text-neutral-400 hover:text-white transition">
            {showLogs ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>

        {showLogs && (
          <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 text-xs font-mono text-neutral-300 max-h-60 overflow-y-auto dir-ltr text-left space-y-1">
            {potStatus?.logs && potStatus.logs.length > 0 ? (
              potStatus.logs.map((line, idx) => (
                <div key={idx} className="leading-relaxed hover:bg-white/5 px-1.5 py-0.5 rounded transition">
                  {line}
                </div>
              ))
            ) : (
              <div className="text-neutral-500 italic">
                {isFa ? 'هنوز هیچ لاگی ثبت نشده است.' : 'No logs recorded yet.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
