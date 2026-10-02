import React, { useState, useEffect, useRef } from 'react';
import {
  Instagram,
  Shield,
  KeyRound,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  RefreshCw,
  Trash2,
  Download,
  Copy,
  Check,
  Eye,
  EyeOff,
  Cookie,
  FileJson,
  UserCheck,
  Users,
  Image as ImageIcon,
  Upload,
  Lock,
  Sparkles,
  FileText,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Terminal,
  CheckCircle,
  Plus,
  LogIn,
  X,
  Film,
  Play,
  Pause,
  ExternalLink,
  MessageCircle,
  Heart,
  Clock,
  Calendar,
  Bookmark,
  Share2,
  Clipboard,
  Grid,
  BookOpen,
  Layers,
  CheckCheck,
  Server
} from 'lucide-react';
import { Language } from '../types';

interface InstagramManagerProps {
  lang: Language;
  token?: string | null;
}

export interface InstagramPageInfo {
  username: string;
  full_name: string;
  biography: string;
  follower_count: number;
  following_count: number;
  media_count: number;
  is_verified: boolean;
  profile_pic_url: string;
  cached_at: string;
}

export interface InstagramMediaItem {
  id: string;
  pk: string;
  code: string;
  url: string;
  media_type: 'video' | 'reel' | 'photo' | 'carousel' | 'story';
  product_type?: string;
  is_video: boolean;
  caption: string;
  like_count?: number;
  comment_count?: number;
  view_count?: number;
  video_duration?: number;
  thumbnail_url: string;
  video_url?: string;
  taken_at?: string;
  user?: {
    username: string;
    full_name: string;
    profile_pic_url: string;
    is_verified: boolean;
  };
  items?: Array<{
    index: number;
    type: 'video' | 'photo';
    video_url?: string | null;
    image_url?: string;
    thumbnail_url?: string;
  }>;
  items_count?: number;
}

export interface InstagramProfileData {
  pk: string;
  username: string;
  full_name: string;
  biography: string;
  external_url: string;
  follower_count: number;
  following_count: number;
  media_count: number;
  is_private: boolean;
  is_verified: boolean;
  profile_pic_url: string;
  profile_pic_url_hd: string;
  has_active_stories: boolean;
  active_stories_count: number;
  recent_medias?: Array<{
    id: string;
    pk: string;
    code: string;
    url: string;
    type: 'video' | 'photo' | 'carousel';
    thumbnail_url: string;
    video_url?: string | null;
    like_count: number;
    comment_count: number;
    caption: string;
  }>;
}

export interface InstagramStoryItem {
  id: string;
  pk: string;
  code: string;
  type: 'video' | 'photo';
  is_video: boolean;
  video_url?: string | null;
  image_url: string;
  thumbnail_url: string;
  duration?: number;
  caption?: string;
  taken_at?: string;
  expiring_at?: string;
}

export interface InstagramHighlightAlbum {
  id: string;
  title: string;
  cover_url: string;
  media_count: number;
  items: InstagramStoryItem[];
}

export interface InstagramAccountItem {
  id: string;
  username: string;
  isActive: boolean;
  pageInfo: InstagramPageInfo;
  session: Record<string, any>;
  cookiesTxt: string;
  hasCookiesTxt: boolean;
  summary: {
    dsUserId: string;
    model: string;
    manufacturer: string;
    device: string;
    androidVersion: number;
    androidRelease: string;
    appVersion: string;
    locale: string;
    country: string;
    lastLogin: number | null;
    userAgent: string;
  };
  files: {
    accountSessionPath: string;
    accountPageInfoPath: string;
    accountCookiesPath: string;
    rootSessionPath: string;
    rootPageInfoPath: string;
    rootCookiesPath: string;
  };
}

const DEVICE_PRESETS = [
  {
    id: 'pixel_9_pro_xl_a15',
    label: 'Google Pixel 9 Pro XL (Android 15 · API 35 · komodo)',
    short: 'Pixel 9 Pro XL (Android 15)'
  },
  {
    id: 'pixel_8_pro_a15',
    label: 'Google Pixel 8 Pro (Android 15 · API 35 · husky)',
    short: 'Pixel 8 Pro (Android 15)'
  },
  {
    id: 'galaxy_s25_ultra_a15',
    label: 'Samsung Galaxy S25 Ultra (Android 15 · API 35 · SM-S938B)',
    short: 'Galaxy S25 Ultra (Android 15)'
  },
  {
    id: 'galaxy_s24_ultra_a15',
    label: 'Samsung Galaxy S24 Ultra (Android 15 · API 35 · SM-S928B)',
    short: 'Galaxy S24 Ultra (Android 15)'
  },
  {
    id: 'xiaomi_15_pro_a15',
    label: 'Xiaomi 15 Pro (Android 15 · API 35 · haotian)',
    short: 'Xiaomi 15 Pro (Android 15)'
  },
  {
    id: 'pixel_8_pro',
    label: 'Google Pixel 8 Pro (Android 14 · API 34 · husky)',
    short: 'Pixel 8 Pro (Android 14)'
  },
  {
    id: 'galaxy_s24_ultra',
    label: 'Samsung Galaxy S24 Ultra (Android 14 · API 34 · SM-S928B)',
    short: 'Galaxy S24 Ultra (Android 14)'
  },
  {
    id: 'pixel_7_pro',
    label: 'Google Pixel 7 Pro (Android 14 · API 34 · cheetah)',
    short: 'Pixel 7 Pro (Android 14)'
  },
  {
    id: 'xiaomi_14_pro',
    label: 'Xiaomi 14 Pro (Android 14 · API 34 · shennong)',
    short: 'Xiaomi 14 Pro (Android 14)'
  },
  {
    id: 'oneplus_12',
    label: 'OnePlus 12 (Android 14 · API 34 · CPH2581)',
    short: 'OnePlus 12 (Android 14)'
  }
];

const APP_VERSION_PRESETS = [
  {
    id: '448.0.0.0.20',
    label: 'Instagram 448.0.0.0.20 (نسخه رسمی و سازگار با احراز هویت Bloks CAA)'
  },
  {
    id: '446.0.0.49.77',
    label: 'Instagram 446.0.0.49.77 (Code: 385211303)'
  }
];

export const InstagramManager: React.FC<InstagramManagerProps> = ({ lang, token: propToken }) => {
  const getEffectiveToken = () => propToken || localStorage.getItem('serverdash_token') || '';
  const isFa = lang === 'fa';

  // Accounts & Server State
  const [accounts, setAccounts] = useState<InstagramAccountItem[]>([]);
  const [activeUsername, setActiveUsername] = useState<string | null>(null);
  const [vpnActive, setVpnActive] = useState(false);
  const [httpProxy, setHttpProxy] = useState('http://127.0.0.1:10809');
  const [rootFilesExist, setRootFilesExist] = useState<{ session: boolean; pageInfo: boolean; cookies: boolean }>({
    session: false,
    pageInfo: false,
    cookies: false
  });
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);

  // Primary Tabs: 'downloader' | 'saved' | 'login'
  const [mainTab, setMainTab] = useState<'downloader' | 'saved' | 'login'>('downloader');
  // Login Sub-Methods: 'credentials' | 'sessionid' | 'import'
  const [loginMethod, setLoginMethod] = useState<'credentials' | 'sessionid' | 'import'>('credentials');
  const [hasSetInitialMode, setHasSetInitialMode] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Instagram Downloader State
  const [downloaderTab, setDownloaderTab] = useState<'extract' | 'profile' | 'stories' | 'highlights'>('extract');
  const [downloadInput, setDownloadInput] = useState('');
  const [isExtractingMedia, setIsExtractingMedia] = useState(false);
  const [extractedMedia, setExtractedMedia] = useState<InstagramMediaItem | null>(null);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);
  const [profileData, setProfileData] = useState<InstagramProfileData | null>(null);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);
  const [storiesData, setStoriesData] = useState<{ username: string; user?: any; count?: number; stories: InstagramStoryItem[]; message?: string } | null>(null);
  const [isFetchingStories, setIsFetchingStories] = useState(false);
  const [highlightsData, setHighlightsData] = useState<{ username: string; user?: any; count?: number; highlights: InstagramHighlightAlbum[]; message?: string } | null>(null);
  const [isFetchingHighlights, setIsFetchingHighlights] = useState(false);
  const [activeHighlight, setActiveHighlight] = useState<InstagramHighlightAlbum | null>(null);
  const [isLoadingHighlightItems, setIsLoadingHighlightItems] = useState(false);
  const [downloaderError, setDownloaderError] = useState<string | null>(null);
  const [downloadingFileKey, setDownloadingFileKey] = useState<string | null>(null);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<string | null>(null);

  // Credentials Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [totpSeed, setTotpSeed] = useState('');
  const [showTotpSeedInput, setShowTotpSeedInput] = useState(false);
  const [showAdvancedStealth, setShowAdvancedStealth] = useState(false);
  const [deviceProfile, setDeviceProfile] = useState('pixel_9_pro_xl_a15');
  const [appVersion, setAppVersion] = useState('448.0.0.0.20');
  const [useVpn, setUseVpn] = useState(true);
  const [customProxy, setCustomProxy] = useState('');
  const [forceNewDevice, setForceNewDevice] = useState(false);

  // 2FA / Challenge Interactive Step State
  const [pendingStep, setPendingStep] = useState<{
    type: 'two_factor_required' | 'challenge_required';
    username: string;
    methodLabel?: string;
    obfuscatedPhone?: string;
    message: string;
  } | null>(null);

  // SessionID Login State
  const [sessionIdInput, setSessionIdInput] = useState('');
  const [sessionIdUsernameHint, setSessionIdUsernameHint] = useState('');

  // Import JSON State
  const [importSessionJson, setImportSessionJson] = useState('');
  const [importPageInfoJson, setImportPageInfoJson] = useState('');
  const [importUsernameHint, setImportUsernameHint] = useState('');
  const sessionFileInputRef = useRef<HTMLInputElement | null>(null);
  const pageInfoFileInputRef = useRef<HTMLInputElement | null>(null);

  // Action Statuses
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [busyAccountAction, setBusyAccountAction] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // File Inspector Modal / Drawer State
  const [inspectedAccount, setInspectedAccount] = useState<InstagramAccountItem | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'cookies' | 'session' | 'page_info'>('cookies');
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);

  const getMediaProxyUrl = (rawUrl: string, isVideo = false, download = false, downloadName = '') => {
    if (!rawUrl) return '';
    const token = getEffectiveToken();
    let proxy = `/api/instagram/media-proxy?url=${encodeURIComponent(rawUrl)}&type=${isVideo ? 'video' : 'image'}&token=${encodeURIComponent(token)}`;
    if (download) {
      proxy += `&download=1&name=${encodeURIComponent(downloadName || (isVideo ? 'instagram_video.mp4' : 'instagram_photo.jpg'))}`;
    }
    return proxy;
  };

  const handlePasteToDownloader = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          const clean = text.trim();
          setDownloadInput(clean);
          if (clean.includes('/p/') || clean.includes('/reel/') || clean.includes('/stories/')) {
            handleExtractMedia(clean);
          } else if (clean.startsWith('@') || clean.includes('instagram.com/')) {
            handleFetchProfile(clean);
          }
        }
      }
    } catch {
      // ignore
    }
  };

  const handleExtractMedia = async (urlOverride?: string) => {
    const targetUrl = (urlOverride || downloadInput).trim();
    if (!targetUrl) {
      setDownloaderError(isFa ? 'لطفاً لینک پست، ریلز یا استوری اینستاگرام را وارد کنید.' : 'Please enter an Instagram URL.');
      return;
    }
    setIsExtractingMedia(true);
    setDownloaderError(null);
    setExtractedMedia(null);
    setActiveCarouselIndex(0);

    try {
      const token = getEffectiveToken();
      const res = await fetch('/api/instagram/downloader/extract', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: targetUrl,
          account: activeUsername || undefined
        })
      });
      const data = await res.json();
      if (data.success && data.media) {
        setExtractedMedia(data.media);
        setDownloaderTab('extract');
      } else {
        setDownloaderError(data.error || (isFa ? 'خطا در استخراج مدیا از لینک وارد شده' : 'Failed to extract media'));
      }
    } catch (err: any) {
      setDownloaderError(err.message || (isFa ? 'عدم برقراری ارتباط با سرور' : 'Connection error'));
    } finally {
      setIsExtractingMedia(false);
    }
  };

  const handleFetchProfile = async (usernameOverride?: string) => {
    const targetUname = (usernameOverride || downloadInput).trim();
    if (!targetUname) {
      setDownloaderError(isFa ? 'لطفاً نام کاربری یا لینک پروفایل پیج را وارد کنید.' : 'Please enter username or profile URL.');
      return;
    }
    setIsFetchingProfile(true);
    setDownloaderError(null);
    setProfileData(null);

    try {
      const token = getEffectiveToken();
      const res = await fetch('/api/instagram/downloader/profile', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: targetUname,
          account: activeUsername || undefined
        })
      });
      const data = await res.json();
      if (data.success && data.profile) {
        setProfileData(data.profile);
        setDownloaderTab('profile');
      } else {
        setDownloaderError(data.error || (isFa ? 'خطا در دریافت مشخصات پیج' : 'Failed to fetch profile'));
      }
    } catch (err: any) {
      setDownloaderError(err.message || (isFa ? 'خطا در ارتباط با سرور' : 'Connection error'));
    } finally {
      setIsFetchingProfile(false);
    }
  };

  const handleFetchStories = async (usernameOverride?: string) => {
    const targetUname = (usernameOverride || downloadInput || profileData?.username || '').trim();
    if (!targetUname) {
      setDownloaderError(isFa ? 'لطفاً نام کاربری پیج مورد نظر را وارد کنید.' : 'Please enter target username.');
      return;
    }
    setIsFetchingStories(true);
    setDownloaderError(null);
    setStoriesData(null);

    try {
      const token = getEffectiveToken();
      const res = await fetch('/api/instagram/downloader/stories', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: targetUname,
          account: activeUsername || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        setStoriesData(data);
        setDownloaderTab('stories');
      } else {
        setDownloaderError(data.error || (isFa ? 'خطا در دریافت استوری‌ها' : 'Failed to fetch stories'));
      }
    } catch (err: any) {
      setDownloaderError(err.message || (isFa ? 'خطا در دریافت اطلاعات' : 'Connection error'));
    } finally {
      setIsFetchingStories(false);
    }
  };

  const handleFetchHighlights = async (usernameOverride?: string) => {
    const targetUname = (usernameOverride || downloadInput || profileData?.username || '').trim();
    if (!targetUname) {
      setDownloaderError(isFa ? 'لطفاً آیدی پیج را وارد نمایید.' : 'Please enter username.');
      return;
    }
    setIsFetchingHighlights(true);
    setDownloaderError(null);
    setHighlightsData(null);
    setActiveHighlight(null);

    try {
      const token = getEffectiveToken();
      const res = await fetch('/api/instagram/downloader/highlights', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: targetUname,
          account: activeUsername || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        setHighlightsData(data);
        setDownloaderTab('highlights');
      } else {
        setDownloaderError(data.error || (isFa ? 'خطا در استخراج هایلایت‌ها' : 'Failed to fetch highlights'));
      }
    } catch (err: any) {
      setDownloaderError(err.message || (isFa ? 'خطا در ارتباط با سرور' : 'Connection error'));
    } finally {
      setIsFetchingHighlights(false);
    }
  };

  const handleSelectHighlight = async (hl: InstagramHighlightAlbum) => {
    setActiveHighlight(hl);
    if (!hl.items || hl.items.length === 0) {
      setIsLoadingHighlightItems(true);
      try {
        const token = getEffectiveToken();
        const res = await fetch('/api/instagram/downloader/highlight-items', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'x-auth-token': token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            highlight_pk: hl.id,
            account: activeUsername || undefined
          })
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.items)) {
          const updatedHl: InstagramHighlightAlbum = {
            ...hl,
            items: data.items,
            media_count: data.items.length
          };
          setActiveHighlight(updatedHl);
          setHighlightsData((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              highlights: prev.highlights.map((item) => (item.id === hl.id ? updatedHl : item))
            };
          });
        }
      } catch {
        // ignore
      } finally {
        setIsLoadingHighlightItems(false);
      }
    }
  };

  const handleDownloadFileToServer = async (url: string, filename: string, type: 'video' | 'photo', keyId: string) => {
    setDownloadingFileKey(keyId);
    try {
      const token = getEffectiveToken();
      const res = await fetch('/api/instagram/downloader/download-file', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url, filename, type })
      });
      const data = await res.json();
      if (data.success) {
        setDownloadSuccessToast(isFa ? `فایل «${data.fileName}» در پوشه دانلودهای سرور ذخیره شد.` : `File saved to server (${data.fileName})`);
        setTimeout(() => setDownloadSuccessToast(null), 3500);
      } else {
        setDownloaderError(data.error || (isFa ? 'خطا در دانلود فایل روی سرور' : 'Download failed'));
      }
    } catch (err: any) {
      setDownloaderError(err.message || 'Download error');
    } finally {
      setDownloadingFileKey(null);
    }
  };

  const fetchAccounts = async (silent = false) => {
    if (!silent) setIsLoadingAccounts(true);
    try {
      const token = getEffectiveToken();
      const res = await fetch('/api/instagram/accounts', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-auth-token': token
        }
      });
      if (res.ok) {
        const data = await res.json();
        const list: InstagramAccountItem[] = Array.isArray(data.accounts) ? data.accounts : [];
        setAccounts(list);
        setActiveUsername(data.activeUsername || null);
        setVpnActive(Boolean(data.vpnActive));
        if (data.httpProxy) setHttpProxy(data.httpProxy);
        if (data.rootFilesExist) setRootFilesExist(data.rootFilesExist);

        if (inspectedAccount) {
          const updated = list.find(a => a.id === inspectedAccount.id || a.username === inspectedAccount.username);
          if (updated) setInspectedAccount(updated);
        }

        if (!hasSetInitialMode) {
          setHasSetInitialMode(true);
        }
      }
    } catch {
      // ignore
    } finally {
      if (!silent) setIsLoadingAccounts(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    const interval = setInterval(() => fetchAccounts(true), 8000);
    return () => clearInterval(interval);
  }, [propToken]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2200);
  };

  // Handle Username/Password + 2FA Login
  const handleCredentialsLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim() || !password) {
      setStatusMessage({
        type: 'error',
        text: isFa ? 'لطفاً نام کاربری و رمز عبور اینستاگرام را وارد کنید.' : 'Please enter both Instagram username and password.'
      });
      return;
    }

    if (pendingStep && !verificationCode.trim() && !totpSeed.trim()) {
      setStatusMessage({
        type: 'warning',
        text: isFa ? 'لطفاً کد تایید دو مرحله‌ای (۶ رقمی یا کد بازیابی ۸ رقمی) را وارد کنید.' : 'Please enter the 2FA verification code.'
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const token = getEffectiveToken();
      const res = await fetch('/api/instagram/login', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
          verification_code: pendingStep ? verificationCode.trim() : '',
          totp_seed: pendingStep ? totpSeed.trim() : '',
          device_profile: deviceProfile,
          app_version: appVersion,
          use_vpn: useVpn,
          custom_proxy: customProxy.trim(),
          force_new_device: forceNewDevice
        })
      });

      const data = await res.json();

      if (data.status === 'two_factor_required' || data.status === 'challenge_required') {
        setPendingStep({
          type: data.status,
          username: data.username || username.trim(),
          methodLabel: data.methodLabel,
          obfuscatedPhone: data.obfuscatedPhone,
          message: data.message
        });
        setStatusMessage({
          type: 'warning',
          text: data.message
        });
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || (isFa ? 'خطا در ورود به اکانت اینستاگرام' : 'Instagram login failed'));
      }

      // Logged in!
      setPendingStep(null);
      setVerificationCode('');
      setTotpSeed('');
      setShowTotpSeedInput(false);
      setPassword('');
      setForceNewDevice(false);
      setStatusMessage({
        type: 'success',
        text: data.message || (isFa ? 'ورود با موفقیت انجام شد و فایل‌های سشن و کوکی ذخیره شدند.' : 'Logged in and saved session files successfully.')
      });

      setMainTab('saved');
      await fetchAccounts();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || (isFa ? 'خطا در ارتباط با سرویس aiograpi' : 'Error communicating with aiograpi service')
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle SessionID Login
  const handleSessionIdLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionIdInput.trim()) {
      setStatusMessage({
        type: 'error',
        text: isFa ? 'لطفاً رشته sessionid اینستاگرام را وارد کنید.' : 'Please enter the Instagram sessionid.'
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const token = getEffectiveToken();
      const res = await fetch('/api/instagram/login-sessionid', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionid: sessionIdInput.trim(),
          username: sessionIdUsernameHint.trim(),
          device_profile: deviceProfile,
          app_version: appVersion,
          use_vpn: useVpn,
          custom_proxy: customProxy.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (isFa ? 'خطا در ثبت SessionID' : 'Failed to login with SessionID'));
      }

      setSessionIdInput('');
      setSessionIdUsernameHint('');
      setStatusMessage({
        type: 'success',
        text: data.message
      });
      setMainTab('saved');
      await fetchAccounts();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Import Session JSON
  const handleImportSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importSessionJson.trim()) {
      setStatusMessage({
        type: 'error',
        text: isFa ? 'لطفاً محتوای فایل instagram_session.json را وارد یا آپلود کنید.' : 'Please provide instagram_session.json content.'
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const token = getEffectiveToken();
      const res = await fetch('/api/instagram/import-session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session: importSessionJson.trim(),
          page_info: importPageInfoJson.trim() || null,
          username: importUsernameHint.trim(),
          use_vpn: useVpn,
          custom_proxy: customProxy.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || (isFa ? 'خطا در وارد کردن سشن' : 'Failed to import session'));
      }

      setImportSessionJson('');
      setImportPageInfoJson('');
      setImportUsernameHint('');
      setStatusMessage({
        type: 'success',
        text: data.message
      });
      setMainTab('saved');
      await fetchAccounts();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle File Upload for JSON Import
  const handleFileUploadRead = (file: File, target: 'session' | 'page_info') => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result || '');
      if (target === 'session') {
        setImportSessionJson(content);
      } else {
        setImportPageInfoJson(content);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  // Activate Account as Root Session
  const handleActivateAccount = async (acc: InstagramAccountItem) => {
    const key = `activate_${acc.id}`;
    setBusyAccountAction(key);
    setStatusMessage(null);
    try {
      const token = getEffectiveToken();
      const res = await fetch(`/api/instagram/activate/${encodeURIComponent(acc.id)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-auth-token': token
        }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در فعال‌سازی سشن');
      }
      setStatusMessage({ type: 'success', text: data.message });
      await fetchAccounts(true);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setBusyAccountAction(null);
    }
  };

  // Verify Session & Refresh Page Info
  const handleVerifyAccount = async (acc: InstagramAccountItem) => {
    const key = `verify_${acc.id}`;
    setBusyAccountAction(key);
    setStatusMessage(null);
    try {
      const token = getEffectiveToken();
      const res = await fetch(`/api/instagram/verify/${encodeURIComponent(acc.id)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-auth-token': token
        }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در بررسی سشن');
      }
      setStatusMessage({
        type: data.isValid ? 'success' : 'warning',
        text: data.message
      });
      await fetchAccounts(true);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setBusyAccountAction(null);
    }
  };

  // Extract Netscape cookies.txt & Optionally Download
  const handleExtractCookies = async (acc: InstagramAccountItem, downloadImmediately = false) => {
    const key = `cookies_${acc.id}`;
    setBusyAccountAction(key);
    setStatusMessage(null);
    try {
      const token = getEffectiveToken();
      const res = await fetch(`/api/instagram/extract-cookies/${encodeURIComponent(acc.id)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-auth-token': token
        }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در استخراج کوکی');
      }

      setStatusMessage({
        type: 'success',
        text: data.message
      });

      await fetchAccounts(true);

      if (downloadImmediately) {
        triggerDownloadFile(acc.id, 'cookies', 'cookies.txt');
      } else {
        setInspectedAccount({
          ...acc,
          cookiesTxt: data.cookiesTxt || acc.cookiesTxt,
          hasCookiesTxt: true
        });
        setInspectorTab('cookies');
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setBusyAccountAction(null);
    }
  };

  // Download file helper (instagram_session.json, instagram_page_info.json, cookies.txt)
  // Generates pure in-memory Blob files or uses authenticated fetch to completely bypass
  // Cloud Run / AI Studio preview proxy interception that serves "<title>Cookie check</title>" HTML.
  const triggerDownloadFile = async (accountId: string, fileType: 'session' | 'page_info' | 'cookies', fileName: string) => {
    try {
      const targetAcc = accounts.find((a) => a.id === accountId || a.username === accountId);
      let content = '';
      let mimeType = 'application/json;charset=utf-8';

      if (fileType === 'session' && targetAcc?.session && Object.keys(targetAcc.session).length > 0) {
        content = JSON.stringify(targetAcc.session, null, 4);
      } else if (fileType === 'page_info' && targetAcc?.pageInfo) {
        content = JSON.stringify(targetAcc.pageInfo, null, 2);
      } else if (fileType === 'cookies' && targetAcc?.cookiesTxt && targetAcc.cookiesTxt.trim()) {
        content = targetAcc.cookiesTxt;
        mimeType = 'text/plain;charset=utf-8';
      }

      // If not cached in memory, fetch from backend via authenticated POST/GET
      if (!content) {
        const token = getEffectiveToken();
        const res = await fetch(`/api/instagram/download/${encodeURIComponent(accountId)}/${fileType}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-auth-token': token
          }
        });

        if (!res.ok) {
          const errText = await res.text();
          let errDetail = `${res.status} ${res.statusText}`;
          try {
            const parsed = JSON.parse(errText);
            if (parsed.error) errDetail = parsed.error;
          } catch {}
          throw new Error(errDetail);
        }

        content = await res.text();
        if (fileType === 'cookies') {
          mimeType = 'text/plain;charset=utf-8';
        }
      }

      // Strict check: if response is an HTML page (like Cloud Run cookie check or login page), abort
      const trimmed = content.trim();
      if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html') || trimmed.includes('<title>Cookie check</title>')) {
        throw new Error(
          isFa
            ? 'خطا در دریافت فایل: به جای محتوای سشن، صفحه امنیتی سرور دریافت شد.'
            : 'Server returned HTML auth page instead of raw session data.'
        );
      }

      // Create pure Blob in browser memory
      const blob = new Blob([content], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

      setStatusMessage({
        type: 'success',
        text: isFa ? `فایل ${fileName} با موفقیت دانلود شد.` : `${fileName} downloaded successfully.`
      });
    } catch (err: any) {
      console.error('Download error:', err);
      setStatusMessage({
        type: 'error',
        text: (isFa ? 'خطا در دانلود فایل: ' : 'Error downloading file: ') + (err.message || String(err))
      });
    }
  };

  // Delete Account Session
  const handleDeleteAccount = async (acc: InstagramAccountItem) => {
    const confirmed = window.confirm(
      isFa
        ? `آیا از حذف سشن و فایل‌های اکانت @${acc.username} اطمینان دارید؟`
        : `Are you sure you want to delete session files for @${acc.username}?`
    );
    if (!confirmed) return;

    const key = `delete_${acc.id}`;
    setBusyAccountAction(key);
    setStatusMessage(null);
    try {
      const token = getEffectiveToken();
      const res = await fetch(`/api/instagram/accounts/${encodeURIComponent(acc.id)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-auth-token': token
        }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'خطا در حذف سشن');
      }
      if (inspectedAccount?.id === acc.id) {
        setInspectedAccount(null);
      }
      if (selectedAccountId === acc.id) {
        setSelectedAccountId(null);
      }
      setStatusMessage({ type: 'success', text: data.message });
      await fetchAccounts(true);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setBusyAccountAction(null);
    }
  };

  const getAvatarUrl = (rawUrl: string) => {
    if (!rawUrl) return '';
    const token = getEffectiveToken();
    return `/api/instagram/avatar-proxy?url=${encodeURIComponent(rawUrl)}&token=${encodeURIComponent(token)}`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* ULTRA COMPACT TOP HEADER BANNER */}
      <div className="p-2 sm:p-2.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-pink-500/10 text-pink-500 shrink-0">
              <Instagram className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white truncate">
                  {isFa ? 'مدیریت سشن و کوکی اینستاگرام' : 'Instagram Session & Cookie Hub'}
                </h2>
                <span className="px-1 py-0.2 rounded bg-pink-500/10 text-pink-600 dark:text-pink-400 font-mono text-[9px] font-bold shrink-0">
                  aiograpi
                </span>
                {activeUsername && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-semibold shrink-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-mono truncate max-w-[100px] sm:max-w-none">@{activeUsername}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
                <span className={vpnActive ? 'text-emerald-600 dark:text-emerald-400 font-medium' : ''}>
                  {vpnActive
                    ? (isFa ? `VPN (${httpProxy})` : `VPN (${httpProxy})`)
                    : (isFa ? 'مستقیم' : 'Direct')}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {isFa ? `${accounts.length} اکانت` : `${accounts.length} accounts`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Compact root files indicators (visible on tablet/desktop) */}
            <div className="hidden md:flex items-center gap-2 text-[9px] font-mono text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-white/5 px-2 py-0.5 rounded-md border border-neutral-200/60 dark:border-white/5">
              <span className="flex items-center gap-1">
                <CheckCircle2 className={`h-2.5 w-2.5 ${rootFilesExist.session ? 'text-emerald-500' : 'text-neutral-400'}`} />
                <span>session.json</span>
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className={`h-2.5 w-2.5 ${rootFilesExist.cookies ? 'text-emerald-500' : 'text-neutral-400'}`} />
                <span>cookies.txt</span>
              </span>
            </div>

            <button
              type="button"
              onClick={() => fetchAccounts()}
              className="p-1.5 sm:px-2 sm:py-1 rounded-lg bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-white/10 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
              title={isFa ? 'بروزرسانی وضعیت' : 'Refresh status'}
            >
              <RefreshCw className={`h-3 w-3 ${isLoadingAccounts ? 'animate-spin text-pink-500' : ''}`} />
              <span className="hidden sm:inline">{isFa ? 'بروزرسانی' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* STATUS MESSAGE ALERT */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-start justify-between gap-3 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
              : statusMessage.type === 'warning'
              ? 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300'
              : 'bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <div className="leading-relaxed font-medium">{statusMessage.text}</div>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition shrink-0 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* MAIN UNIFIED PANEL: SAVED SESSIONS + LOGIN MODES */}
      <div className="p-4 sm:p-5 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-sm space-y-4">
        {/* Panel Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200 dark:border-white/10">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              {mainTab === 'downloader' ? (
                <>
                  <Download className="h-4.5 w-4.5 text-pink-500 shrink-0" />
                  <span>{isFa ? 'دانلود مدیا و استعلام مشخصات پیج اینستاگرام' : 'Instagram Media Downloader & Profile Hub'}</span>
                </>
              ) : mainTab === 'saved' ? (
                <>
                  <Users className="h-4.5 w-4.5 text-pink-500 shrink-0" />
                  <span>{isFa ? 'سشن‌های ذخیره‌شده و مدیریت اکانت‌ها' : 'Saved Sessions & Accounts'}</span>
                </>
              ) : (
                <>
                  <LogIn className="h-4.5 w-4.5 text-pink-500 shrink-0" />
                  <span>{isFa ? 'لاگین به اینستاگرام و ساخت سشن' : 'Instagram Login & Session Builder'}</span>
                </>
              )}
            </h3>
            <p className="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {mainTab === 'downloader'
                ? (isFa
                    ? 'دانلود پست، ریلز، اسلایدی (آلبوم)، استوری‌های ۲۴ ساعته، هایلایت‌ها و استعلام بیو و آمار پیج'
                    : 'Download posts, reels, carousels, 24h stories, highlights, and inspect profile metadata')
                : mainTab === 'saved'
                ? (isFa
                    ? 'مدیریت اکانت‌ها، سوئیچ سشن فعال، کپی سشن و خروجی کوکی Netscape'
                    : 'Manage accounts, switch active session, copy session & export cookies')
                : (isFa
                    ? 'ورود با نام کاربری و پسورد، کد SessionID، یا ایمپورت فایل JSON جهت ساخت سشن ضد بن'
                    : 'Login with credentials/2FA, SessionID or JSON file to generate stealth sessions')}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {mainTab !== 'downloader' && (
              <button
                type="button"
                onClick={() => { setMainTab('downloader'); setStatusMessage(null); }}
                className="px-2.5 py-1.5 rounded-xl bg-pink-500/10 hover:bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-500/20 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{isFa ? 'بخش دانلود' : 'Downloader'}</span>
              </button>
            )}
            {mainTab !== 'login' && (
              <button
                type="button"
                onClick={() => { setMainTab('login'); setStatusMessage(null); }}
                className="px-2.5 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-pink-600/20 transition cursor-pointer"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>{isFa ? 'لاگین' : 'Login'}</span>
              </button>
            )}
          </div>
        </div>

        {/* 3 Main Tabs Segmented Selector */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
          <button
            type="button"
            onClick={() => { setMainTab('downloader'); setStatusMessage(null); }}
            className={`py-1.5 sm:py-2 px-1.5 sm:px-3 rounded-lg text-[10px] sm:text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 ${
              mainTab === 'downloader'
                ? 'bg-white dark:bg-neutral-800 text-pink-600 dark:text-pink-400 shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="whitespace-nowrap">{isFa ? 'دانلود از اینستاگرام' : 'Downloader'}</span>
          </button>

          <button
            type="button"
            onClick={() => { setMainTab('saved'); setStatusMessage(null); }}
            className={`py-1.5 sm:py-2 px-1.5 sm:px-3 rounded-lg text-[10px] sm:text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 ${
              mainTab === 'saved'
                ? 'bg-white dark:bg-neutral-800 text-pink-600 dark:text-pink-400 shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="whitespace-nowrap">{isFa ? 'سشن‌های ذخیره' : 'Saved Sessions'}</span>
            {accounts.length > 0 && (
              <span className={`px-1 sm:px-1.5 py-0.2 rounded-full text-[8px] sm:text-[10px] font-mono ${
                mainTab === 'saved'
                  ? 'bg-pink-500/15 text-pink-600 dark:text-pink-400 font-bold'
                  : 'bg-neutral-200 dark:bg-white/10 text-neutral-600 dark:text-neutral-300'
              }`}>
                {accounts.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => { setMainTab('login'); setStatusMessage(null); }}
            className={`py-1.5 sm:py-2 px-1.5 sm:px-3 rounded-lg text-[10px] sm:text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 ${
              mainTab === 'login'
                ? 'bg-white dark:bg-neutral-800 text-pink-600 dark:text-pink-400 shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <LogIn className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
            <span className="whitespace-nowrap">{isFa ? 'لاگین به اکانت' : 'Login'}</span>
          </button>
        </div>

        {/* TAB 0: INSTAGRAM DOWNLOADER & PROFILE HUB */}
        {mainTab === 'downloader' && (
          <div className="space-y-4 pt-1">
            {/* Downloader Sub-Tabs Selector */}
            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-neutral-100/80 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => { setDownloaderTab('extract'); setDownloaderError(null); }}
                className={`py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
                  downloaderTab === 'extract'
                    ? 'bg-white dark:bg-neutral-800 text-pink-600 dark:text-pink-400 shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Film className="h-3.5 w-3.5 shrink-0 text-pink-500" />
                <span className="truncate">{isFa ? 'پست و ریلز' : 'Post & Reel'}</span>
              </button>

              <button
                type="button"
                onClick={() => { setDownloaderTab('profile'); setDownloaderError(null); }}
                className={`py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
                  downloaderTab === 'profile'
                    ? 'bg-white dark:bg-neutral-800 text-pink-600 dark:text-pink-400 shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <UserCheck className="h-3.5 w-3.5 shrink-0 text-pink-500" />
                <span className="truncate">{isFa ? 'اطلاعات پیج' : 'Page Profile'}</span>
              </button>

              <button
                type="button"
                onClick={() => { setDownloaderTab('stories'); setDownloaderError(null); }}
                className={`py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
                  downloaderTab === 'stories'
                    ? 'bg-white dark:bg-neutral-800 text-pink-600 dark:text-pink-400 shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Clock className="h-3.5 w-3.5 shrink-0 text-pink-500" />
                <span className="truncate">{isFa ? 'استوری‌ها' : 'Stories'}</span>
              </button>

              <button
                type="button"
                onClick={() => { setDownloaderTab('highlights'); setDownloaderError(null); }}
                className={`py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1 ${
                  downloaderTab === 'highlights'
                    ? 'bg-white dark:bg-neutral-800 text-pink-600 dark:text-pink-400 shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Bookmark className="h-3.5 w-3.5 shrink-0 text-pink-500" />
                <span className="truncate">{isFa ? 'هایلایت‌ها' : 'Highlights'}</span>
              </button>
            </div>

            {/* Downloader Input Bar (Styled matching YouTube Downloader) */}
            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-[11px] sm:text-xs font-semibold text-neutral-700 dark:text-neutral-300 block">
                {downloaderTab === 'extract'
                  ? (isFa ? 'لینک پست، ریلز، ویدیو یا استوری اینستاگرام:' : 'Instagram Post / Reel / Carousel URL:')
                  : downloaderTab === 'profile'
                  ? (isFa ? 'آیدی پیج یا لینک پروفایل اینستاگرام:' : 'Instagram Username or Profile URL:')
                  : downloaderTab === 'stories'
                  ? (isFa ? 'آیدی پیج جهت دریافت استوری‌های فعال ۲۴ ساعته:' : 'Username to fetch active 24h stories:')
                  : (isFa ? 'آیدی پیج جهت استخراج آلبوم‌های هایلایت:' : 'Username to fetch highlight albums:')}
              </label>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={downloadInput}
                    onChange={(e) => setDownloadInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (downloaderTab === 'extract') handleExtractMedia();
                        else if (downloaderTab === 'profile') handleFetchProfile();
                        else if (downloaderTab === 'stories') handleFetchStories();
                        else handleFetchHighlights();
                      }
                    }}
                    placeholder={
                      downloaderTab === 'extract'
                        ? 'https://www.instagram.com/p/... یا https://www.instagram.com/reel/...'
                        : downloaderTab === 'profile'
                        ? '@instagram یا https://www.instagram.com/username'
                        : '@username (مثلاً cristiano یا nasa)'
                    }
                    className="w-full py-2.5 sm:py-3 pl-3.5 sm:pl-4 pr-24 sm:pr-28 text-xs rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-pink-500 dir-ltr text-left font-mono placeholder:text-neutral-400"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
                    {downloadInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setDownloadInput('');
                          setExtractedMedia(null);
                          setProfileData(null);
                          setStoriesData(null);
                          setHighlightsData(null);
                          setDownloaderError(null);
                        }}
                        className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-white rounded-lg transition cursor-pointer"
                        title={isFa ? 'پاک کردن' : 'Clear'}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handlePasteToDownloader}
                      className="px-2 py-1 text-[10px] sm:text-[11px] font-medium rounded-lg bg-neutral-200/90 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/15 text-neutral-700 dark:text-neutral-300 flex items-center gap-1 transition cursor-pointer shrink-0 whitespace-nowrap shadow-xs"
                      title={isFa ? 'پیست از کلیپ‌بورد' : 'Paste from clipboard'}
                    >
                      <Clipboard className="h-3 w-3" />
                      <span>{isFa ? 'پیست' : 'Paste'}</span>
                    </button>
                  </div>
                </div>

                {/* Primary Action Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (downloaderTab === 'extract') handleExtractMedia();
                    else if (downloaderTab === 'profile') handleFetchProfile();
                    else if (downloaderTab === 'stories') handleFetchStories();
                    else handleFetchHighlights();
                  }}
                  disabled={isExtractingMedia || isFetchingProfile || isFetchingStories || isFetchingHighlights}
                  className="px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl text-[11px] sm:text-xs font-bold text-white bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 shadow-md shadow-pink-600/20 flex items-center justify-center gap-1.5 sm:gap-2 transition disabled:opacity-50 cursor-pointer shrink-0 min-w-0 sm:min-w-[150px] whitespace-nowrap"
                >
                  {(isExtractingMedia || isFetchingProfile || isFetchingStories || isFetchingHighlights) ? (
                    <RotateCw className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  )}
                  <span>
                    {(isExtractingMedia || isFetchingProfile || isFetchingStories || isFetchingHighlights)
                      ? (isFa ? 'در حال پردازش...' : 'Processing...')
                      : downloaderTab === 'extract'
                      ? (isFa ? 'استخراج و دانلود مدیا' : 'Extract & Download')
                      : downloaderTab === 'profile'
                      ? (isFa ? 'استعلام اطلاعات پیج' : 'Fetch Profile')
                      : downloaderTab === 'stories'
                      ? (isFa ? 'دریافت استوری‌ها' : 'Fetch Stories')
                      : (isFa ? 'استخراج هایلایت‌ها' : 'Fetch Highlights')}
                  </span>
                </button>
              </div>
            </div>

            {/* Downloader Error Alert */}
            {downloaderError && (
              <div className="p-3 sm:p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-xs flex items-start justify-between gap-2 shadow-xs">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{downloaderError}</span>
                </div>
                <button
                  onClick={() => setDownloaderError(null)}
                  className="p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Download Success Toast */}
            {downloadSuccessToast && (
              <div className="p-3 sm:p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between gap-2 shadow-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="font-semibold">{downloadSuccessToast}</span>
                </div>
                <button
                  onClick={() => setDownloadSuccessToast(null)}
                  className="p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* 1. EXTRACTED MEDIA DISPLAY (POST / REEL / CAROUSEL / STORY) */}
            {downloaderTab === 'extract' && extractedMedia && (
              <div className="p-3.5 sm:p-5 rounded-2xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] space-y-4">
                {/* Media Header: Author info + Media Type Badge */}
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-neutral-200 dark:border-white/10">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {extractedMedia.user?.profile_pic_url ? (
                      <img
                        src={getAvatarUrl(extractedMedia.user.profile_pic_url)}
                        alt={extractedMedia.user.username}
                        className="h-9 w-9 rounded-full object-cover border border-neutral-200 dark:border-white/10 shrink-0"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-pink-500/10 text-pink-500 flex items-center justify-center shrink-0">
                        <Instagram className="h-4.5 w-4.5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs sm:text-sm text-neutral-900 dark:text-white truncate dir-ltr">
                          @{extractedMedia.user?.username || 'instagram_user'}
                        </span>
                        {extractedMedia.user?.is_verified && (
                          <CheckCircle className="h-3.5 w-3.5 text-sky-500 fill-sky-500/20 shrink-0" />
                        )}
                      </div>
                      {extractedMedia.user?.full_name && (
                        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                          {extractedMedia.user.full_name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pink-500/15 text-pink-600 dark:text-pink-400 border border-pink-500/20 flex items-center gap-1">
                      {extractedMedia.media_type === 'reel' ? (
                        <>
                          <Film className="h-3 w-3" />
                          <span>ریلز (Reel)</span>
                        </>
                      ) : extractedMedia.media_type === 'carousel' ? (
                        <>
                          <Layers className="h-3 w-3" />
                          <span>{isFa ? `آلبوم اسلایدی (${extractedMedia.items_count || extractedMedia.items?.length})` : `Carousel (${extractedMedia.items_count})`}</span>
                        </>
                      ) : extractedMedia.media_type === 'video' ? (
                        <>
                          <Play className="h-3 w-3" />
                          <span>ویدیو (Video)</span>
                        </>
                      ) : (
                        <>
                          <ImageIcon className="h-3 w-3" />
                          <span>عکس (Photo)</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Media Preview & Viewer */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  {/* Visual Player / Slider Area */}
                  <div className="space-y-2">
                    <div className="relative rounded-xl overflow-hidden bg-black aspect-square sm:aspect-4/3 flex items-center justify-center border border-neutral-200 dark:border-white/10 group">
                      {(() => {
                        const currentItem = extractedMedia.items && extractedMedia.items[activeCarouselIndex]
                          ? extractedMedia.items[activeCarouselIndex]
                          : {
                              type: extractedMedia.is_video ? 'video' : 'photo',
                              video_url: extractedMedia.video_url,
                              image_url: extractedMedia.thumbnail_url,
                              thumbnail_url: extractedMedia.thumbnail_url
                            };

                        if (currentItem.type === 'video' && currentItem.video_url) {
                          return (
                            <video
                              key={currentItem.video_url}
                              src={getMediaProxyUrl(currentItem.video_url, true)}
                              poster={getMediaProxyUrl(currentItem.thumbnail_url || extractedMedia.thumbnail_url)}
                              controls
                              playsInline
                              className="w-full h-full object-contain"
                            />
                          );
                        }
                        return (
                          <img
                            key={currentItem.image_url || currentItem.thumbnail_url}
                            src={getMediaProxyUrl(currentItem.image_url || currentItem.thumbnail_url || extractedMedia.thumbnail_url)}
                            alt="Instagram Media"
                            className="w-full h-full object-contain"
                          />
                        );
                      })()}

                      {/* Carousel Left/Right Buttons */}
                      {extractedMedia.items && extractedMedia.items.length > 1 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setActiveCarouselIndex((prev) => (prev > 0 ? prev - 1 : extractedMedia.items!.length - 1))}
                            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs transition cursor-pointer z-10"
                            title={isFa ? 'اسلاید قبلی' : 'Previous slide'}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveCarouselIndex((prev) => (prev < extractedMedia.items!.length - 1 ? prev + 1 : 0))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs transition cursor-pointer z-10"
                            title={isFa ? 'اسلاید بعدی' : 'Next slide'}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                          {/* Slide Counter Badge */}
                          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-mono font-bold backdrop-blur-xs">
                            {activeCarouselIndex + 1} / {extractedMedia.items.length}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Carousel Thumbnail Strip */}
                    {extractedMedia.items && extractedMedia.items.length > 1 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                        {extractedMedia.items.map((itm, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setActiveCarouselIndex(idx)}
                            className={`h-12 w-12 rounded-lg overflow-hidden border-2 shrink-0 transition relative cursor-pointer ${
                              activeCarouselIndex === idx
                                ? 'border-pink-500 ring-2 ring-pink-500/30'
                                : 'border-transparent opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img
                              src={getMediaProxyUrl(itm.thumbnail_url || itm.image_url || '')}
                              alt={`Slide ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                            {itm.type === 'video' && (
                              <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white">
                                <Play className="h-3 w-3 fill-white" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Media Details & Download Actions */}
                  <div className="space-y-3">
                    {/* Stats pills */}
                    <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
                      {extractedMedia.like_count !== undefined && (
                        <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300">
                          <Heart className="h-3 w-3 text-rose-500 fill-rose-500/20" />
                          <span>{extractedMedia.like_count.toLocaleString()} {isFa ? 'لایک' : 'likes'}</span>
                        </span>
                      )}
                      {extractedMedia.comment_count !== undefined && (
                        <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300">
                          <MessageCircle className="h-3 w-3 text-sky-500" />
                          <span>{extractedMedia.comment_count.toLocaleString()} {isFa ? 'نظر' : 'comments'}</span>
                        </span>
                      )}
                      {extractedMedia.view_count ? (
                        <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300">
                          <Eye className="h-3 w-3 text-emerald-500" />
                          <span>{extractedMedia.view_count.toLocaleString()} {isFa ? 'بازدید' : 'views'}</span>
                        </span>
                      ) : null}
                      {extractedMedia.video_duration ? (
                        <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-neutral-300">
                          <Clock className="h-3 w-3 text-amber-500" />
                          <span>{Math.round(extractedMedia.video_duration)} ثانیه</span>
                        </span>
                      ) : null}
                    </div>

                    {/* Caption Box with Copy Action */}
                    {extractedMedia.caption && (
                      <div className="p-3 rounded-xl bg-neutral-100/70 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-neutral-500 dark:text-neutral-400 font-semibold">
                          <span>{isFa ? 'متن کپشن:' : 'Caption:'}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(extractedMedia.caption, 'caption')}
                            className="text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            {copiedKey === 'caption' ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                            <span>{copiedKey === 'caption' ? (isFa ? 'کپی شد' : 'Copied') : (isFa ? 'کپی کپشن' : 'Copy')}</span>
                          </button>
                        </div>
                        <p className="text-xs text-neutral-800 dark:text-neutral-200 line-clamp-4 whitespace-pre-wrap leading-relaxed select-text">
                          {extractedMedia.caption}
                        </p>
                      </div>
                    )}

                    {/* Download Actions */}
                    <div className="space-y-2 pt-1">
                      <span className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 block">
                        {isFa ? 'گزینه‌های دانلود مستقیم:' : 'Download Options:'}
                      </span>

                      {/* Download Current Active Slide / Single Media */}
                      {(() => {
                        const currentItem = extractedMedia.items && extractedMedia.items[activeCarouselIndex]
                          ? extractedMedia.items[activeCarouselIndex]
                          : {
                              type: extractedMedia.is_video ? 'video' : 'photo',
                              video_url: extractedMedia.video_url,
                              image_url: extractedMedia.thumbnail_url
                            };
                        const targetUrl = currentItem.type === 'video' ? currentItem.video_url : (currentItem.image_url || extractedMedia.thumbnail_url);
                        const fileName = `instagram_${extractedMedia.user?.username || 'media'}_${extractedMedia.code}_${activeCarouselIndex + 1}.${currentItem.type === 'video' ? 'mp4' : 'jpg'}`;

                        return (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <a
                              href={getMediaProxyUrl(targetUrl || '', currentItem.type === 'video', true, fileName)}
                              download={fileName}
                              className="flex-1 px-4 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm shadow-pink-600/20 transition cursor-pointer"
                            >
                              <Download className="h-4 w-4" />
                              <span>
                                {currentItem.type === 'video'
                                  ? (isFa ? `دانلود ویدیو (MP4) - اسلاید ${activeCarouselIndex + 1}` : `Download Video (MP4) #${activeCarouselIndex + 1}`)
                                  : (isFa ? `دانلود تصویر اصلی (JPG) - اسلاید ${activeCarouselIndex + 1}` : `Download Photo (JPG) #${activeCarouselIndex + 1}`)}
                              </span>
                            </a>

                            <button
                              type="button"
                              onClick={() => handleDownloadFileToServer(targetUrl || '', fileName, currentItem.type === 'video' ? 'video' : 'photo', `slide_${activeCarouselIndex}`)}
                              disabled={downloadingFileKey === `slide_${activeCarouselIndex}`}
                              className="px-3 py-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-white/10 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 shrink-0"
                              title={isFa ? 'ذخیره در پوشه دانلودهای سرور' : 'Save to server downloads'}
                            >
                              {downloadingFileKey === `slide_${activeCarouselIndex}` ? (
                                <RotateCw className="h-3.5 w-3.5 animate-spin text-pink-500" />
                              ) : (
                                <Server className="h-3.5 w-3.5 text-pink-500" />
                              )}
                              <span>{isFa ? 'ذخیره روی سرور' : 'Save on Server'}</span>
                            </button>
                          </div>
                        );
                      })()}

                      {/* Download All Items in Carousel */}
                      {extractedMedia.items && extractedMedia.items.length > 1 && (
                        <div className="pt-1.5">
                          <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-semibold block pb-1">
                            {isFa ? `دانلود جداگانه تمام ${extractedMedia.items.length} اسلاید:` : `Download all ${extractedMedia.items.length} slides individually:`}
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                            {extractedMedia.items.map((itm, idx) => {
                              const sName = `instagram_${extractedMedia.user?.username || 'media'}_${extractedMedia.code}_slide_${idx + 1}.${itm.type === 'video' ? 'mp4' : 'jpg'}`;
                              const sUrl = itm.type === 'video' ? itm.video_url : (itm.image_url || itm.thumbnail_url);
                              return (
                                <a
                                  key={idx}
                                  href={getMediaProxyUrl(sUrl || '', itm.type === 'video', true, sName)}
                                  download={sName}
                                  className="p-1.5 rounded-lg bg-neutral-100 dark:bg-white/5 hover:bg-pink-500/10 hover:text-pink-600 text-[11px] font-medium border border-neutral-200 dark:border-white/10 flex items-center justify-between gap-1 transition"
                                >
                                  <span className="flex items-center gap-1">
                                    {itm.type === 'video' ? <Film className="h-3 w-3 text-pink-500" /> : <ImageIcon className="h-3 w-3 text-sky-500" />}
                                    <span>اسلاید {idx + 1}</span>
                                  </span>
                                  <Download className="h-3 w-3 opacity-60" />
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. PROFILE & BIO INSPECTOR DISPLAY */}
            {downloaderTab === 'profile' && profileData && (
              <div className="p-4 sm:p-5 rounded-2xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] space-y-4">
                {/* Profile Header Glass Card */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 pb-4 border-b border-neutral-200 dark:border-white/10 text-center sm:text-start">
                  <div className="relative group">
                    <img
                      src={getAvatarUrl(profileData.profile_pic_url_hd || profileData.profile_pic_url)}
                      alt={profileData.username}
                      className="h-20 w-20 sm:h-24 sm:w-24 rounded-full object-cover border-2 border-pink-500/30 p-0.5 shadow-md"
                    />
                    <a
                      href={getMediaProxyUrl(profileData.profile_pic_url_hd || profileData.profile_pic_url, false, true, `${profileData.username}_avatar_hd.jpg`)}
                      download={`${profileData.username}_avatar_hd.jpg`}
                      className="absolute inset-0 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-[10px] font-bold"
                      title={isFa ? 'دانلود عکس پروفایل با کیفیت بالا' : 'Download HD Avatar'}
                    >
                      <Download className="h-5 w-5" />
                    </a>
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                      <h4 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white font-mono dir-ltr">
                        @{profileData.username}
                      </h4>
                      {profileData.is_verified && (
                        <CheckCircle className="h-4 w-4 text-sky-500 fill-sky-500/20 shrink-0" />
                      )}
                      {profileData.is_private && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium">
                          {isFa ? 'پیج خصوصی (Private)' : 'Private'}
                        </span>
                      )}
                    </div>

                    {profileData.full_name && (
                      <div className="text-xs sm:text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                        {profileData.full_name}
                      </div>
                    )}

                    {profileData.biography && (
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap leading-relaxed max-w-2xl select-text">
                        {profileData.biography}
                      </p>
                    )}

                    {profileData.external_url && (
                      <a
                        href={profileData.external_url.startsWith('http') ? profileData.external_url : `https://${profileData.external_url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-1 dir-ltr inline-flex"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>{profileData.external_url}</span>
                      </a>
                    )}
                  </div>

                  {/* Profile Action Buttons */}
                  <div className="flex sm:flex-col items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleFetchStories(profileData.username)}
                      disabled={isFetchingStories}
                      className="px-3 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-pink-600/20 transition cursor-pointer whitespace-nowrap"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      <span>{isFa ? 'مشاهده استوری‌ها' : 'Stories'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleFetchHighlights(profileData.username)}
                      disabled={isFetchingHighlights}
                      className="px-3 py-1.5 rounded-xl bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-white/10 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                    >
                      <Bookmark className="h-3.5 w-3.5 text-pink-500" />
                      <span>{isFa ? 'هایلایت‌ها' : 'Highlights'}</span>
                    </button>
                  </div>
                </div>

                {/* 3 Large Stat Pills */}
                <div className="grid grid-cols-3 gap-2 sm:gap-4 font-mono text-center">
                  <div className="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 shadow-xs">
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400 block font-sans">
                      {isFa ? 'تعداد پست‌ها' : 'Posts'}
                    </span>
                    <span className="text-sm sm:text-lg font-bold text-neutral-900 dark:text-white">
                      {profileData.media_count.toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 shadow-xs">
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400 block font-sans">
                      {isFa ? 'دنبال‌کننده‌ها (Followers)' : 'Followers'}
                    </span>
                    <span className="text-sm sm:text-lg font-bold text-pink-600 dark:text-pink-400">
                      {profileData.follower_count.toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 shadow-xs">
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400 block font-sans">
                      {isFa ? 'دنبال‌شوندگان (Following)' : 'Following'}
                    </span>
                    <span className="text-sm sm:text-lg font-bold text-neutral-900 dark:text-white">
                      {profileData.following_count.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Recent Posts Grid Preview */}
                {profileData.recent_medias && profileData.recent_medias.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                        <Grid className="h-3.5 w-3.5 text-pink-500" />
                        <span>{isFa ? 'پست‌های اخیر پیج (جهت دانلود روی هر مورد کلیک کنید):' : 'Recent Posts (Click to extract & download):'}</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      {profileData.recent_medias.map((m) => (
                        <div
                          key={m.id || m.code}
                          onClick={() => {
                            if (m.url) {
                              setDownloadInput(m.url);
                              setDownloaderTab('extract');
                              handleExtractMedia(m.url);
                            }
                          }}
                          className="group relative aspect-square rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 cursor-pointer shadow-xs hover:border-pink-500 transition"
                        >
                          <img
                            src={getMediaProxyUrl(m.thumbnail_url)}
                            alt="Post Thumbnail"
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-1 text-white p-2 text-center">
                            <span className="text-[11px] font-bold flex items-center gap-1">
                              <Download className="h-3.5 w-3.5" />
                              <span>{isFa ? 'استخراج و دانلود' : 'Extract'}</span>
                            </span>
                            <div className="flex items-center gap-2 text-[9px] font-mono opacity-90">
                              <span className="flex items-center gap-0.5">
                                <Heart className="h-2.5 w-2.5 fill-white" />
                                <span>{m.like_count}</span>
                              </span>
                              <span className="flex items-center gap-0.5">
                                <MessageCircle className="h-2.5 w-2.5 fill-white" />
                                <span>{m.comment_count}</span>
                              </span>
                            </div>
                          </div>
                          {m.type === 'video' && (
                            <div className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/60 text-white">
                              <Film className="h-3 w-3" />
                            </div>
                          )}
                          {m.type === 'carousel' && (
                            <div className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/60 text-white">
                              <Layers className="h-3 w-3" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. STORIES DISPLAY */}
            {downloaderTab === 'stories' && storiesData && (
              <div className="p-4 sm:p-5 rounded-2xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-pink-500" />
                    <span className="font-bold text-xs sm:text-sm text-neutral-900 dark:text-white">
                      {isFa ? `استوری‌های فعال پیج @${storiesData.username}` : `Active Stories for @${storiesData.username}`}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-pink-500/15 text-pink-600 dark:text-pink-400">
                      {storiesData.stories.length} {isFa ? 'استوری' : 'stories'}
                    </span>
                  </div>
                </div>

                {storiesData.stories.length === 0 ? (
                  <div className="py-8 text-center text-xs text-neutral-500 dark:text-neutral-400">
                    {isFa ? 'در حال حاضر هیچ استوری فعالی برای این اکانت یافت نشد.' : 'No active stories found for this account.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {storiesData.stories.map((story, idx) => {
                      const fileName = `story_${storiesData.username}_${story.pk || idx + 1}.${story.is_video ? 'mp4' : 'jpg'}`;
                      const targetUrl = story.is_video ? story.video_url : story.image_url;

                      return (
                        <div
                          key={story.id || idx}
                          className="rounded-xl overflow-hidden bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 flex flex-col shadow-xs group"
                        >
                          <div className="relative aspect-9/16 bg-black flex items-center justify-center overflow-hidden">
                            <img
                              src={getMediaProxyUrl(story.thumbnail_url || story.image_url)}
                              alt="Story"
                              className="w-full h-full object-cover"
                            />
                            {story.is_video && (
                              <div className="absolute top-2 right-2 p-1 rounded-md bg-black/60 text-white">
                                <Film className="h-3 w-3" />
                              </div>
                            )}
                            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[9px] text-white bg-black/60 px-1.5 py-0.5 rounded-md backdrop-blur-xs font-mono">
                              <span>استوری {idx + 1}</span>
                              {story.duration ? <span>{Math.round(story.duration)}s</span> : null}
                            </div>
                          </div>

                          <div className="p-2.5 space-y-1.5 flex-1 flex flex-col justify-between">
                            {story.caption && (
                              <p className="text-[10px] text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-tight">
                                {story.caption}
                              </p>
                            )}

                            <div className="flex items-center gap-1.5 pt-1">
                              <a
                                href={getMediaProxyUrl(targetUrl || '', story.is_video, true, fileName)}
                                download={fileName}
                                className="flex-1 py-1.5 px-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-[10px] font-bold flex items-center justify-center gap-1 shadow-xs transition"
                              >
                                <Download className="h-3 w-3" />
                                <span>{isFa ? 'دانلود' : 'Download'}</span>
                              </a>
                              <button
                                type="button"
                                onClick={() => handleDownloadFileToServer(targetUrl || '', fileName, story.is_video ? 'video' : 'photo', `story_${idx}`)}
                                disabled={downloadingFileKey === `story_${idx}`}
                                className="p-1.5 rounded-lg bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-white/10 transition cursor-pointer"
                                title={isFa ? 'ذخیره در سرور' : 'Save to server'}
                              >
                                {downloadingFileKey === `story_${idx}` ? (
                                  <RotateCw className="h-3 w-3 animate-spin text-pink-500" />
                                ) : (
                                  <Server className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 4. HIGHLIGHTS DISPLAY */}
            {downloaderTab === 'highlights' && highlightsData && (
              <div className="p-4 sm:p-5 rounded-2xl border border-neutral-200 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <Bookmark className="h-4 w-4 text-pink-500" />
                    <span className="font-bold text-xs sm:text-sm text-neutral-900 dark:text-white">
                      {isFa ? `آلبوم‌های هایلایت @${highlightsData.username}` : `Highlights for @${highlightsData.username}`}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-pink-500/15 text-pink-600 dark:text-pink-400">
                      {highlightsData.highlights.length} {isFa ? 'آلبوم' : 'albums'}
                    </span>
                  </div>
                </div>

                {highlightsData.highlights.length === 0 ? (
                  <div className="py-8 text-center text-xs text-neutral-500 dark:text-neutral-400">
                    {isFa ? 'هیچ آلبوم هایلایتی برای این پیج یافت نشد.' : 'No highlights found for this account.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {highlightsData.highlights.map((hl) => (
                      <div
                        key={hl.id}
                        onClick={() => handleSelectHighlight(hl)}
                        className={`p-3 rounded-xl bg-white dark:bg-neutral-900 border transition cursor-pointer flex flex-col items-center text-center space-y-2 shadow-xs group ${
                          activeHighlight?.id === hl.id
                            ? 'border-pink-500 ring-2 ring-pink-500/30'
                            : 'border-neutral-200 dark:border-white/10 hover:border-pink-500/50'
                        }`}
                      >
                        <div className="relative h-16 w-16 sm:h-18 sm:w-18 rounded-full p-0.5 border-2 border-pink-500/40 group-hover:border-pink-500 overflow-hidden shadow-xs">
                          <img
                            src={getMediaProxyUrl(hl.cover_url)}
                            alt={hl.title}
                            className="w-full h-full rounded-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 w-full">
                          <span className="text-xs font-bold text-neutral-900 dark:text-white truncate block">
                            {hl.title || 'Highlight'}
                          </span>
                          <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                            {hl.items.length > 0 ? hl.items.length : hl.media_count} {isFa ? 'مورد' : 'items'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Selected Highlight Items Modal / Drawer */}
                {activeHighlight && (
                  <div className="p-4 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 space-y-3 mt-4">
                    <div className="flex items-center justify-between pb-2 border-b border-neutral-200 dark:border-white/10">
                      <div className="flex items-center gap-2">
                        <Bookmark className="h-4 w-4 text-pink-500" />
                        <span className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white">
                          {isFa ? `محتوای هایلایت «${activeHighlight.title}»:` : `Contents of "${activeHighlight.title}":`}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-mono">({activeHighlight.items.length} استوری)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveHighlight(null)}
                        className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-white cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {isLoadingHighlightItems ? (
                      <div className="py-8 flex flex-col items-center justify-center gap-2 text-neutral-500">
                        <RotateCw className="h-5 w-5 animate-spin text-pink-500" />
                        <span className="text-xs">{isFa ? 'در حال دریافت استوری‌های این هایلایت...' : 'Loading highlight stories...'}</span>
                      </div>
                    ) : activeHighlight.items.length === 0 ? (
                      <div className="py-6 text-center space-y-2">
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {isFa ? 'استوری‌های این هایلایت به صورت خودکار دریافت نشد.' : 'Could not load stories for this highlight.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleSelectHighlight(activeHighlight)}
                          className="px-3 py-1.5 rounded-lg bg-pink-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <RotateCw className="h-3 w-3" />
                          <span>{isFa ? 'تلاش مجدد دریافت' : 'Retry'}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-96 overflow-y-auto p-1">
                        {activeHighlight.items.map((itm, idx) => {
                          const hFileName = `highlight_${highlightsData.username}_${activeHighlight.title}_${idx + 1}.${itm.is_video ? 'mp4' : 'jpg'}`;
                          const hUrl = itm.is_video ? itm.video_url : itm.image_url;

                          return (
                            <div
                              key={itm.id || idx}
                              className="rounded-lg overflow-hidden border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-black/40 flex flex-col"
                            >
                              <div className="relative aspect-9/16 bg-black flex items-center justify-center">
                                <img
                                  src={getMediaProxyUrl(itm.thumbnail_url || itm.image_url)}
                                  alt="Highlight item"
                                  className="w-full h-full object-cover"
                                />
                                {itm.is_video && (
                                  <div className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white">
                                    <Film className="h-2.5 w-2.5" />
                                  </div>
                                )}
                              </div>
                              <div className="p-1.5 flex flex-col gap-1">
                                <a
                                  href={getMediaProxyUrl(hUrl || '', itm.is_video, true, hFileName)}
                                  download={hFileName}
                                  className="w-full py-1 rounded bg-pink-600 hover:bg-pink-500 text-white text-[9px] font-bold flex items-center justify-center gap-1 transition"
                                >
                                  <Download className="h-2.5 w-2.5" />
                                  <span>{isFa ? 'دانلود' : 'Save'}</span>
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 1: SAVED SESSIONS & ACCOUNTS */}
        {mainTab === 'saved' && (
          <div className="space-y-4 pt-1">
            {isLoadingAccounts ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2.5 text-neutral-400">
                <RotateCw className="h-6 w-6 animate-spin text-pink-500" />
                <span className="text-xs font-medium">{isFa ? 'در حال دریافت اطلاعات سشن‌ها...' : 'Loading sessions...'}</span>
              </div>
            ) : accounts.length === 0 ? (
              <div className="py-10 px-4 text-center rounded-2xl border border-dashed border-neutral-200 dark:border-white/10 space-y-3 bg-neutral-50/50 dark:bg-white/[0.01]">
                <Instagram className="h-8 w-8 text-neutral-400 mx-auto" />
                <div className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
                  {isFa ? 'هنوز هیچ سشن اینستاگرامی ذخیره نشده است' : 'No Instagram sessions saved yet'}
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-md mx-auto leading-relaxed">
                  {isFa
                    ? 'روی دکمه لاگین به اینستاگرام کلیک کنید و با نام کاربری و رمز عبور یا SessionID وارد شوید تا سشن ضد بن و فایل‌های کوکی Netscape به صورت خودکار ساخته شوند.'
                    : 'Click Login to Instagram to authenticate with credentials or SessionID to generate stealth sessions and Netscape cookies.'}
                </p>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setMainTab('login'); setLoginMethod('credentials'); setStatusMessage(null); }}
                    className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm shadow-pink-600/20 transition cursor-pointer"
                  >
                    <LogIn className="h-3.5 w-3.5" />
                    <span>{isFa ? 'لاگین به اینستاگرام' : 'Login to Instagram'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMainTab('login'); setLoginMethod('sessionid'); setStatusMessage(null); }}
                    className="px-3.5 py-2 rounded-xl bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-white/10 text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Cookie className="h-3.5 w-3.5 text-pink-500" />
                    <span>{isFa ? 'ورود با SessionID' : 'Login by SessionID'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                {/* Account Selection Buttons Bar */}
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 flex items-center justify-between">
                    <span>
                      {isFa
                        ? 'برای نمایش جزئیات، کپی و دانلود فایل‌های سشن روی دکمه هر اکانت بزنید:'
                        : 'Click on any session button to view files & actions:'}
                    </span>
                    <span className="font-mono text-[10px] text-pink-600 dark:text-pink-400 font-bold">
                      {accounts.length} {isFa ? 'سشن ذخیره' : 'Saved'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {accounts.map((acc) => {
                      const isSelected = selectedAccountId === acc.id;
                      const info = acc.pageInfo;
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => setSelectedAccountId(isSelected ? null : acc.id)}
                          className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                            isSelected
                              ? 'border-pink-500 bg-pink-500/10 text-pink-600 dark:text-pink-400 ring-2 ring-pink-500/20 shadow-sm'
                              : 'border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.03] hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300'
                          }`}
                        >
                          <div className="relative h-6 w-6 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800 shrink-0 border border-neutral-300 dark:border-white/10 flex items-center justify-center">
                            {info.profile_pic_url ? (
                              <img
                                src={getAvatarUrl(info.profile_pic_url)}
                                alt={info.username}
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Instagram className="h-3 w-3 text-neutral-400" />
                            )}
                          </div>

                          <span className="font-mono dir-ltr font-bold truncate max-w-[140px] sm:max-w-none">
                            @{info.username}
                          </span>

                          {info.is_verified && (
                            <CheckCircle className="h-3 w-3 text-sky-500 shrink-0" />
                          )}

                          {acc.isActive && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold shrink-0">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>{isFa ? 'اصلی' : 'Active'}</span>
                            </span>
                          )}

                          {isSelected ? (
                            <ChevronUp className="h-3.5 w-3.5 text-pink-500 shrink-0" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Hint when no account is selected */}
                {!selectedAccountId && (
                  <div className="py-7 px-4 text-center rounded-xl border border-dashed border-neutral-200 dark:border-white/10 text-xs text-neutral-500 dark:text-neutral-400 bg-neutral-50/40 dark:bg-white/[0.01] space-y-1">
                    <p className="font-medium">
                      {isFa
                        ? 'برای مشاهده اطلاعات، دانلود مستقیم session.json و cookies.txt روی دکمه اکانت مورد نظر در بالا کلیک کنید.'
                        : 'Click on any account button above to view session details and download files.'}
                    </p>
                  </div>
                )}

                {/* Selected Account Details Card */}
                {selectedAccountId && (() => {
                  const acc = accounts.find((a) => a.id === selectedAccountId);
                  if (!acc) return null;

                  const info = acc.pageInfo;
                  const isVerifying = busyAccountAction === `verify_${acc.id}`;
                  const isActivating = busyAccountAction === `activate_${acc.id}`;
                  const isExtracting = busyAccountAction === `cookies_${acc.id}`;
                  const isDeleting = busyAccountAction === `delete_${acc.id}`;
                  const isExpanded = expandedAccountId === acc.id;

                  return (
                    <div
                      key={acc.id}
                      className={`p-3.5 sm:p-4 rounded-xl border transition space-y-3 ${
                        acc.isActive
                          ? 'border-pink-500/40 bg-pink-500/[0.02] dark:bg-pink-500/[0.03]'
                          : 'border-neutral-200 dark:border-white/10 bg-neutral-50/40 dark:bg-white/[0.01]'
                      }`}
                    >
                      {/* Top Row: Avatar + Account Info + Quick Actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative h-9 w-9 sm:h-10 sm:w-10 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800 shrink-0 border border-neutral-300 dark:border-white/10 flex items-center justify-center">
                            {info.profile_pic_url ? (
                              <img
                                src={getAvatarUrl(info.profile_pic_url)}
                                alt={info.username}
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                            <Instagram className="h-4 w-4 text-neutral-400 absolute -z-0" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-xs sm:text-sm text-neutral-900 dark:text-white font-mono dir-ltr truncate">
                                @{info.username}
                              </span>
                              {info.is_verified && (
                                <CheckCircle className="h-3 w-3 text-sky-500 shrink-0" />
                              )}
                              {acc.isActive && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold shrink-0">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  <span>{isFa ? 'سشن اصلی' : 'Active'}</span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 tabular-nums truncate">
                              {info.full_name && (
                                <span className="font-medium text-neutral-700 dark:text-neutral-300 truncate max-w-[90px] sm:max-w-none">
                                  {info.full_name} ·
                                </span>
                              )}
                              <span>{info.follower_count.toLocaleString()} {isFa ? 'فالوور' : 'followers'}</span>
                              <span>·</span>
                              <span>{info.media_count.toLocaleString()} {isFa ? 'پست' : 'posts'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Top-Right Mini Buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          {!acc.isActive && (
                            <button
                              type="button"
                              onClick={() => handleActivateAccount(acc)}
                              disabled={isActivating}
                              className="px-2 py-1 rounded-lg bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 text-[10px] sm:text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                              title={isFa ? 'انتخاب به عنوان سشن اصلی سرور' : 'Set as primary active session'}
                            >
                              {isActivating ? <RotateCw className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                              <span>{isFa ? 'انتخاب اصلی' : 'Set Active'}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleVerifyAccount(acc)}
                            disabled={isVerifying}
                            className="p-1.5 rounded-lg bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-white/10 transition cursor-pointer"
                            title={isFa ? 'بررسی سلامت سشن و اطلاعات پیج' : 'Verify session & refresh page info'}
                          >
                            <RefreshCw className={`h-3 w-3 ${isVerifying ? 'animate-spin text-pink-500' : ''}`} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteAccount(acc)}
                            disabled={isDeleting}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition cursor-pointer"
                            title={isFa ? 'حذف سشن و فایل‌ها' : 'Delete session files'}
                          >
                            {isDeleting ? <RotateCw className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedAccountId(null)}
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition cursor-pointer"
                            title={isFa ? 'بستن' : 'Close'}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* File Action Cards Grid (Responsive 2-Col on Tablet/Desktop, Clean Stack on Mobile) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-neutral-200/60 dark:border-white/5">
                        {/* 1. Session JSON Box */}
                        <div className="flex items-center justify-between p-2 rounded-xl bg-pink-500/[0.03] dark:bg-pink-500/[0.05] border border-pink-500/15">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="p-1.5 rounded-lg bg-pink-500/10 text-pink-500 shrink-0">
                              <FileJson className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold font-mono text-neutral-800 dark:text-neutral-200 truncate">
                                session.json
                              </div>
                              <div className="text-[9px] text-neutral-400 truncate">
                                {isFa ? 'سشن ربات (JSON)' : 'Robot session'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const jsonStr = JSON.stringify(acc.session, null, 4);
                                copyToClipboard(jsonStr, `session_card_${acc.id}`);
                              }}
                              className="px-2 py-1 rounded-lg bg-white dark:bg-white/10 hover:bg-neutral-100 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-white/10 text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer"
                              title={isFa ? 'کپی متن کامل JSON سشن' : 'Copy session JSON'}
                            >
                              {copiedKey === `session_card_${acc.id}` ? (
                                <>
                                  <Check className="h-3 w-3 text-emerald-500" />
                                  <span className="text-emerald-500 font-bold">{isFa ? 'کپی شد' : 'Copied'}</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3 text-neutral-500" />
                                  <span>{isFa ? 'کپی' : 'Copy'}</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => triggerDownloadFile(acc.id, 'session', 'instagram_session.json')}
                              className="px-2 py-1 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                              title={isFa ? 'دانلود مستقیم فایل instagram_session.json' : 'Download instagram_session.json'}
                            >
                              <Download className="h-3 w-3" />
                              <span>{isFa ? 'دانلود' : 'DL'}</span>
                            </button>
                          </div>
                        </div>

                        {/* 2. Netscape cookies.txt Box */}
                        <div className="flex items-center justify-between p-2 rounded-xl bg-amber-500/[0.04] dark:bg-amber-500/[0.06] border border-amber-500/20">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
                              <Cookie className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold font-mono text-amber-900 dark:text-amber-200 truncate">
                                cookies.txt
                              </div>
                              <div className="text-[9px] text-neutral-400 truncate">
                                Netscape / yt-dlp
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {acc.cookiesTxt && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(acc.cookiesTxt, `cookies_card_${acc.id}`)}
                                className="px-2 py-1 rounded-lg bg-white dark:bg-white/10 hover:bg-neutral-100 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-white/10 text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer"
                                title={isFa ? 'کپی مستقیم متن فایل cookies.txt' : 'Copy cookies.txt content'}
                              >
                                {copiedKey === `cookies_card_${acc.id}` ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-500" />
                                    <span className="text-emerald-500 font-bold">{isFa ? 'کپی شد' : 'Copied'}</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3 text-amber-600" />
                                    <span>{isFa ? 'کپی' : 'Copy'}</span>
                                  </>
                                )}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleExtractCookies(acc, true)}
                              disabled={isExtracting}
                              className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                              title={isFa ? 'استخراج زنده و دانلود cookies.txt' : 'Extract and download Netscape cookies.txt'}
                            >
                              {isExtracting ? (
                                <RotateCw className="h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3" />
                              )}
                              <span>{acc.cookiesTxt ? (isFa ? 'دانلود' : 'DL') : (isFa ? 'استخراج' : 'Extract')}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Compact Bottom Toolbar: Page Info, Inspect Modal, Device Toggle */}
                      <div className="flex items-center justify-between gap-1 text-[10px] pt-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => triggerDownloadFile(acc.id, 'page_info', 'instagram_page_info.json')}
                            className="px-2 py-0.5 rounded-md hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 font-mono flex items-center gap-1 transition cursor-pointer"
                            title="instagram_page_info.json"
                          >
                            <Download className="h-2.5 w-2.5 text-sky-500" />
                            <span>page_info.json</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setInspectedAccount(acc);
                              setInspectorTab('cookies');
                            }}
                            className="px-2 py-0.5 rounded-md hover:bg-pink-500/10 text-pink-600 dark:text-pink-400 font-semibold flex items-center gap-1 transition cursor-pointer"
                          >
                            <FileText className="h-2.5 w-2.5" />
                            <span>{isFa ? 'مشاهده فایل‌ها' : 'Inspect'}</span>
                          </button>
                        </div>

                        {/* Collapsible Device Accordion Trigger */}
                        <button
                          type="button"
                          onClick={() => setExpandedAccountId(isExpanded ? null : acc.id)}
                          className="px-1.5 py-0.5 rounded-md hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 flex items-center gap-1 transition cursor-pointer"
                          title={isFa ? 'نمایش/مخفی‌سازی مشخصات دستگاه' : 'Toggle device specs'}
                        >
                          <span>{isFa ? 'دستگاه' : 'Device'}</span>
                          {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                      </div>

                      {/* Collapsible Device Details Panel */}
                      {isExpanded && (
                        <div className="p-2.5 rounded-lg bg-neutral-100/70 dark:bg-white/[0.02] border border-neutral-200/60 dark:border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono text-neutral-600 dark:text-neutral-400 animate-fadeIn">
                          <div>
                            <span className="text-neutral-400 block text-[9px]">{isFa ? 'مدل دستگاه' : 'Model'}</span>
                            <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate block">
                              {acc.summary.model}
                            </span>
                          </div>
                          <div>
                            <span className="text-neutral-400 block text-[9px]">Android / App</span>
                            <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate block">
                              v{acc.summary.androidRelease} · {acc.summary.appVersion.split('.')[0]}
                            </span>
                          </div>
                          <div>
                            <span className="text-neutral-400 block text-[9px]">DS User ID</span>
                            <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate block">
                              {acc.summary.dsUserId || 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="text-neutral-400 block text-[9px]">{isFa ? 'آخرین کش' : 'Cached At'}</span>
                            <span className="font-semibold text-neutral-800 dark:text-neutral-200 truncate block">
                              {info.cached_at ? info.cached_at.slice(0, 10) : 'N/A'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* FILE CONTENT INSPECTOR */}
            {inspectedAccount && (
              <div className="p-3.5 sm:p-5 rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#121214] shadow-sm space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-neutral-200 dark:border-white/10">
                  <div>
                    <h4 className="text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                      <FileJson className="h-4 w-4 text-pink-500" />
                      <span>
                        {isFa
                          ? `پیش‌نمایش فایل‌های اکانت @${inspectedAccount.username}`
                          : `Files for @${inspectedAccount.username}`}
                      </span>
                    </h4>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono mt-0.5">
                      {inspectorTab === 'cookies'
                        ? 'cookies.txt (Netscape Cookie File)'
                        : inspectorTab === 'session'
                        ? 'instagram_session.json'
                        : 'instagram_page_info.json'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setInspectorTab('cookies')}
                        className={`px-2 py-1 rounded-lg font-mono font-bold transition cursor-pointer ${
                          inspectorTab === 'cookies'
                            ? 'bg-amber-600 text-white'
                            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                        }`}
                      >
                        cookies.txt
                      </button>
                      <button
                        type="button"
                        onClick={() => setInspectorTab('session')}
                        className={`px-2 py-1 rounded-lg font-mono font-bold transition cursor-pointer ${
                          inspectorTab === 'session'
                            ? 'bg-pink-600 text-white'
                            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                        }`}
                      >
                        session.json
                      </button>
                      <button
                        type="button"
                        onClick={() => setInspectorTab('page_info')}
                        className={`px-2 py-1 rounded-lg font-mono font-bold transition cursor-pointer ${
                          inspectorTab === 'page_info'
                            ? 'bg-sky-600 text-white'
                            : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                        }`}
                      >
                        page_info.json
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setInspectedAccount(null)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Action Bar for Inspected File */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono dir-ltr truncate">
                    {inspectorTab === 'cookies'
                      ? inspectedAccount.files.rootCookiesPath
                      : inspectorTab === 'session'
                      ? inspectedAccount.files.rootSessionPath
                      : inspectedAccount.files.rootPageInfoPath}
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const content =
                          inspectorTab === 'cookies'
                            ? inspectedAccount.cookiesTxt
                            : inspectorTab === 'session'
                            ? JSON.stringify(inspectedAccount.session, null, 4)
                            : JSON.stringify(inspectedAccount.pageInfo, null, 2);
                        copyToClipboard(content, `inspect_${inspectorTab}`);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-white/10 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {copiedKey === `inspect_${inspectorTab}` ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="text-emerald-500">{isFa ? 'کپی شد!' : 'Copied!'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>{isFa ? 'کپی محتوا' : 'Copy'}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const fileName =
                          inspectorTab === 'cookies'
                            ? 'cookies.txt'
                            : inspectorTab === 'session'
                            ? 'instagram_session.json'
                            : 'instagram_page_info.json';
                        triggerDownloadFile(inspectedAccount.id, inspectorTab, fileName);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>{isFa ? 'دانلود فایل' : 'Download File'}</span>
                    </button>
                  </div>
                </div>

                <pre
                  dir="ltr"
                  className="p-4 rounded-xl bg-neutral-950 text-neutral-200 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-80 border border-white/10 text-left"
                >
                  {inspectorTab === 'cookies'
                    ? inspectedAccount.cookiesTxt
                    : inspectorTab === 'session'
                    ? JSON.stringify(inspectedAccount.session, null, 4)
                    : JSON.stringify(inspectedAccount.pageInfo, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LOGIN TO INSTAGRAM (WITH 3 SUB-METHODS) */}
        {mainTab === 'login' && (
          <div className="max-w-xl mx-auto space-y-4 pt-1">
            {/* 3 Login Method Sub-Tabs */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => { setLoginMethod('credentials'); setStatusMessage(null); }}
                className={`py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1 ${
                  loginMethod === 'credentials'
                    ? 'bg-white dark:bg-neutral-800 text-pink-600 dark:text-pink-400 font-bold shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <KeyRound className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                <span className="whitespace-nowrap">{isFa ? 'نام کاربری و پسورد' : 'Username & Pass'}</span>
              </button>

              <button
                type="button"
                onClick={() => { setLoginMethod('sessionid'); setStatusMessage(null); }}
                className={`py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1 ${
                  loginMethod === 'sessionid'
                    ? 'bg-white dark:bg-neutral-800 text-pink-600 dark:text-pink-400 font-bold shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Cookie className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                <span className="whitespace-nowrap">{isFa ? 'ورود با SessionID' : 'By SessionID'}</span>
              </button>

              <button
                type="button"
                onClick={() => { setLoginMethod('import'); setStatusMessage(null); }}
                className={`py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[10px] sm:text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1 ${
                  loginMethod === 'import'
                    ? 'bg-white dark:bg-neutral-800 text-pink-600 dark:text-pink-400 font-bold shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <FileJson className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                <span className="whitespace-nowrap">{isFa ? 'ایمپورت سشن' : 'Import JSON'}</span>
              </button>
            </div>

            {/* Sub-Method 1: Username & Password (2FA only shown on demand) */}
            {loginMethod === 'credentials' && (
              <form onSubmit={handleCredentialsLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                    {isFa ? 'نام کاربری اینستاگرام (Username):' : 'Instagram Username:'}
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (pendingStep && pendingStep.username !== e.target.value.trim()) {
                        setPendingStep(null);
                        setVerificationCode('');
                        setTotpSeed('');
                        setShowTotpSeedInput(false);
                      }
                    }}
                    placeholder="mster_bombastic"
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-pink-500 text-left"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                    {isFa ? 'رمز عبور (Password):' : 'Password:'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      dir="ltr"
                      className="w-full px-3.5 py-2.5 pr-10 text-xs font-mono rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-pink-500 text-left"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Dynamic 2FA / Challenge Box: ONLY shown when Instagram requires it */}
                {pendingStep && (
                  <div className="p-3.5 rounded-xl border bg-amber-500/10 border-amber-500/40 ring-2 ring-amber-500/20 transition space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5 text-amber-500 animate-bounce" />
                        <span>
                          {pendingStep.type === 'two_factor_required'
                            ? (isFa ? 'ورود کد تایید دو مرحله‌ای (2FA):' : 'Enter 2FA Verification Code:')
                            : (isFa ? 'ورود کد امنیتی چلنج اینستاگرام:' : 'Enter Security Challenge Code:')}
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingStep(null);
                          setVerificationCode('');
                          setTotpSeed('');
                          setShowTotpSeedInput(false);
                        }}
                        className="text-[11px] text-neutral-500 hover:text-rose-500 cursor-pointer"
                      >
                        {isFa ? 'انصراف / تلاش مجدد' : 'Cancel / Retry'}
                      </button>
                    </div>

                    <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                      {pendingStep.message}
                    </p>

                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder={isFa ? 'کد ۶ رقمی (مثلاً 123456) یا کد بازیابی ۸ رقمی' : '6-digit 2FA code or 8-digit backup code'}
                      dir="ltr"
                      autoFocus
                      className="w-full px-3.5 py-2.5 text-sm font-mono font-bold tracking-widest rounded-xl bg-white dark:bg-neutral-900 border border-amber-400 dark:border-amber-500/40 focus:outline-none focus:ring-2 focus:ring-amber-500 text-center"
                    />

                    {pendingStep.type === 'two_factor_required' && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowTotpSeedInput(!showTotpSeedInput)}
                          className="text-[11px] text-pink-600 dark:text-pink-400 hover:underline cursor-pointer"
                        >
                          {showTotpSeedInput
                            ? (isFa ? 'بستن بخش کلید TOTP Secret' : 'Hide TOTP Secret Key')
                            : (isFa ? 'استفاده از کلید مخفی Authenticator (TOTP Seed) به‌جای کد دستی' : 'Use TOTP Secret Key instead')}
                        </button>
                        {showTotpSeedInput && (
                          <input
                            type="text"
                            value={totpSeed}
                            onChange={(e) => setTotpSeed(e.target.value)}
                            placeholder="JBSWY3DPEHPK3PXP..."
                            dir="ltr"
                            className="mt-1.5 w-full px-3 py-2 text-xs font-mono rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-pink-500 text-left"
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Anti-Ban Stealth Hardware Settings Accordion */}
                <div className="rounded-xl border border-neutral-200 dark:border-white/10 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedStealth(!showAdvancedStealth)}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 dark:bg-white/[0.02] hover:bg-neutral-100 dark:hover:bg-white/[0.04] flex items-center justify-between text-xs font-semibold text-neutral-700 dark:text-neutral-300 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-emerald-500" />
                      <span>{isFa ? 'تنظیمات ضد شناسایی ربات (اندروید ۱۵ / ۱۴ و پروکسی)' : 'Anti-Ban Device (Android 15 / 14) & Proxy'}</span>
                    </span>
                    {showAdvancedStealth ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  {showAdvancedStealth && (
                    <div className="p-3.5 space-y-3 bg-white dark:bg-[#121214] border-t border-neutral-200 dark:border-white/10 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                          {isFa ? 'مدل گوشی شبیه‌سازی‌شده (Android 15 & 14 Fingerprint):' : 'Simulated Android 15 / 14 Hardware:'}
                        </label>
                        <select
                          value={deviceProfile}
                          onChange={(e) => setDeviceProfile(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 text-xs font-mono"
                        >
                          {DEVICE_PRESETS.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                          {isFa ? 'نسخه کلاینت اینستاگرام و Bloks Hash:' : 'Instagram App Version & Bloks Profile:'}
                        </label>
                        <select
                          value={appVersion}
                          onChange={(e) => setAppVersion(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 text-xs font-mono"
                        >
                          {APP_VERSION_PRESETS.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={useVpn}
                            onChange={(e) => setUseVpn(e.target.checked)}
                            className="rounded border-neutral-300 text-pink-600 focus:ring-pink-500"
                          />
                          <span className="text-[11px] text-neutral-700 dark:text-neutral-300">
                            {isFa ? 'عبور خودکار ترافیک از VPN سرور (در صورت روشن بودن)' : 'Route through active Server VPN'}
                          </span>
                        </label>
                      </div>

                      <div>
                        <label className="block text-[11px] text-neutral-500 dark:text-neutral-400 mb-1">
                          {isFa ? 'پروکسی اختصاصی (اختیاری - مثلاً http://user:pass@ip:port):' : 'Custom Proxy URL (Optional):'}
                        </label>
                        <input
                          type="text"
                          value={customProxy}
                          onChange={(e) => setCustomProxy(e.target.value)}
                          placeholder="http://127.0.0.1:10809"
                          dir="ltr"
                          className="w-full px-3 py-1.5 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 text-xs font-mono text-left"
                        />
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={forceNewDevice}
                          onChange={(e) => setForceNewDevice(e.target.checked)}
                          className="rounded border-neutral-300 text-pink-600 focus:ring-pink-500"
                        />
                        <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          {isFa
                            ? 'تولید UUID سخت‌افزاری جدید (پیشنهاد نمی‌شود مگر در صورت تغییر کامل گوشی)'
                            : 'Generate fresh device UUIDs (only check if replacing device)'}
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full py-3 px-4 rounded-xl text-xs font-bold text-white shadow-md flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 ${
                    pendingStep
                      ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'
                      : 'bg-pink-600 hover:bg-pink-500 shadow-pink-600/20'
                  }`}
                >
                  {isSubmitting ? (
                    <RotateCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  <span>
                    {isSubmitting
                      ? (isFa ? 'در حال ارتباط امن با اینستاگرام...' : 'Authenticating via aiograpi...')
                      : pendingStep
                      ? (isFa ? 'تایید کد دو مرحله‌ای و ذخیره سشن' : 'Verify 2FA Code & Save Session')
                      : (isFa ? 'ورود به اکانت و ذخیره سشن (aiograpi)' : 'Login & Save Session (aiograpi)')}
                  </span>
                </button>
              </form>
            )}

            {/* Sub-Method 2: Login by SessionID */}
            {loginMethod === 'sessionid' && (
              <form onSubmit={handleSessionIdLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                    {isFa ? 'مقدار کوکی sessionid اینستاگرام:' : 'Instagram sessionid Cookie Value:'}
                  </label>
                  <textarea
                    rows={3}
                    value={sessionIdInput}
                    onChange={(e) => setSessionIdInput(e.target.value)}
                    placeholder="30683574727%3AYM2NVuZUu1fx68%3A12%3AAYhfQ_zPA2hqoHU_4qv9g9dXhMnRNc8rG7_abj-vcw"
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-pink-500 text-left"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                    {isFa ? 'نام کاربری اکانت (اختیاری - در صورت عدم دریافت خودکار):' : 'Username Hint (Optional):'}
                  </label>
                  <input
                    type="text"
                    value={sessionIdUsernameHint}
                    onChange={(e) => setSessionIdUsernameHint(e.target.value)}
                    placeholder="mster_bombastic"
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-pink-500 text-left"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-pink-600 hover:bg-pink-500 shadow-md shadow-pink-600/20 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <RotateCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  <span>
                    {isSubmitting
                      ? (isFa ? 'در حال ساخت سشن و استخراج کوکی...' : 'Building Session...')
                      : (isFa ? 'ثبت SessionID و ساخت فایل‌های سشن و کوکی' : 'Login with SessionID & Save Files')}
                  </span>
                </button>
              </form>
            )}

            {/* Sub-Method 3: Import Existing Session JSON */}
            {loginMethod === 'import' && (
              <form onSubmit={handleImportSession} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      {isFa ? 'محتوای instagram_session.json:' : 'instagram_session.json Content:'}
                    </label>
                    <input
                      ref={sessionFileInputRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileUploadRead(f, 'session');
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => sessionFileInputRef.current?.click()}
                      className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-white/10 hover:bg-neutral-200 dark:hover:bg-white/15 text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="h-3 w-3" />
                      <span>{isFa ? 'انتخاب فایل JSON' : 'Upload JSON'}</span>
                    </button>
                  </div>
                  <textarea
                    rows={5}
                    value={importSessionJson}
                    onChange={(e) => setImportSessionJson(e.target.value)}
                    placeholder='{"uuids": {...}, "authorization_data": {"ds_user_id": "...", "sessionid": "..."}}'
                    dir="ltr"
                    className="w-full px-3 py-2 text-[11px] font-mono rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-pink-500 text-left"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      {isFa ? 'محتوای instagram_page_info.json (اختیاری):' : 'instagram_page_info.json Content (Optional):'}
                    </label>
                    <input
                      ref={pageInfoFileInputRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileUploadRead(f, 'page_info');
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => pageInfoFileInputRef.current?.click()}
                      className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-white/10 hover:bg-neutral-200 dark:hover:bg-white/15 text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="h-3 w-3" />
                      <span>{isFa ? 'انتخاب فایل پیج' : 'Upload Info'}</span>
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={importPageInfoJson}
                    onChange={(e) => setImportPageInfoJson(e.target.value)}
                    placeholder='{"username": "mster_bombastic", "full_name": "...", "follower_count": 3, ...}'
                    dir="ltr"
                    className="w-full px-3 py-2 text-[11px] font-mono rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-pink-500 text-left"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    {isFa ? 'نام کاربری اکانت (در صورت نبود فایل پیج):' : 'Username (if page_info not provided):'}
                  </label>
                  <input
                    type="text"
                    value={importUsernameHint}
                    onChange={(e) => setImportUsernameHint(e.target.value)}
                    placeholder="mster_bombastic"
                    dir="ltr"
                    className="w-full px-3.5 py-2 text-xs font-mono rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-pink-500 text-left"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-pink-600 hover:bg-pink-500 shadow-md shadow-pink-600/20 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? <RotateCw className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
                  <span>
                    {isSubmitting
                      ? (isFa ? 'در حال پردازش و ذخیره سشن...' : 'Importing Session...')
                      : (isFa ? 'ذخیره سشن و استخراج خودکار کوکی Netscape' : 'Save Session & Extract Netscape Cookies')}
                  </span>
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InstagramManager;
