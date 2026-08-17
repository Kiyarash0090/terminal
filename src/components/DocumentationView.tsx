import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Shield,
  Terminal,
  Cpu,
  FolderOpen,
  Globe,
  Bot,
  Search,
  Key,
  CheckCircle2,
  Zap,
  Code2,
  Package,
  Database,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  Lock,
  Activity,
  FileCode,
  HardDrive,
  RefreshCw,
  Server
} from 'lucide-react';
import { Language } from '../types';

interface DocumentationViewProps {
  lang: Language;
  isModalView?: boolean;
  autoFocusSearch?: boolean;
}

interface DocSection {
  id: string;
  category: string;
  titleFa: string;
  titleEn: string;
  icon: React.ElementType;
  badgeFa?: string;
  badgeEn?: string;
  badgeColor?: string;
  summaryFa: string;
  summaryEn: string;
  keywords?: string[];
  detailsFa: React.ReactNode;
  detailsEn: React.ReactNode;
}

export const DocumentationView: React.FC<DocumentationViewProps> = ({ 
  lang, 
  isModalView = false, 
  autoFocusSearch = false 
}) => {
  const isFa = lang === 'fa';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'security': true,
    'terminal': true,
    'vpn': true,
    'filemanager': false,
    'process': false,
    'telegram': false,
    'monitoring': false,
  });
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Focus search input on mount if requested
  useEffect(() => {
    if (autoFocusSearch && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [autoFocusSearch]);

  // When search query changes, expand matching sections automatically for quick reading
  useEffect(() => {
    if (searchQuery.trim()) {
      const allExpanded: Record<string, boolean> = {};
      docSections.forEach((s) => (allExpanded[s.id] = true));
      setExpandedSections(allExpanded);
    }
  }, [searchQuery]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Categories list
  const categories = [
    { id: 'all', nameFa: 'همه بخش‌ها', nameEn: 'All Sections' },
    { id: 'security', nameFa: 'احراز هویت و امنیت', nameEn: 'Auth & Security' },
    { id: 'terminal', nameFa: 'ترمینال و دستورات', nameEn: 'Terminal & CLI' },
    { id: 'vpn', nameFa: 'VPN و تانل سرور', nameEn: 'VPN & Tunnel' },
    { id: 'filemanager', nameFa: 'مدیریت فایل و دیتابیس', nameEn: 'File & DB Manager' },
    { id: 'process', nameFa: 'پردازش‌ها و پایتون', nameEn: 'Processes & Python' },
    { id: 'telegram', nameFa: 'ربات تلگرام', nameEn: 'Telegram Bot' },
    { id: 'monitoring', nameFa: 'پایش منابع سرور', nameEn: 'System Monitoring' },
  ];

  // Comprehensive documentation sections data
  const docSections: DocSection[] = [
    {
      id: 'security',
      category: 'security',
      titleFa: '۱. امنیت، لاگین و تنظیمات دسترسی',
      titleEn: '1. Security, Login & Authentication',
      icon: Shield,
      badgeFa: 'پایه و ضروری',
      badgeEn: 'Essential',
      badgeColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      summaryFa: 'مدیریت حساب کاربری، تغییر رمز عبور، کلیدهای API و احراز هویت هوشمند پنل.',
      summaryEn: 'Account management, password updates, API keys, and secure authentication.',
      keywords: ['admin', 'admin123', 'pass', 'password', 'login', 'token', 'jwt', 'security', 'ورود', 'رمز', 'پسورد', 'امنیت'],
      detailsFa: (
        <div className="space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            این سامانه مجهز به سیستم احراز هویت امن مبتنی بر توکن است. برای جلوگیری از دسترسی‌های غیرمجاز به سرور، تمام درخواست‌های ترمینال، فایل‌ها و دستورات حساس احراز هویت می‌شوند.
          </p>

          <div className="p-3 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 space-y-2">
            <div className="font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Key className="h-4 w-4 text-amber-500" />
              <span>اطلاعات ورود پیش‌فرض (کاهش ریسک با تغییر سریع):</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
              <span className="bg-white dark:bg-black/40 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-white/10">
                نام کاربری: <strong className="text-emerald-500">admin</strong>
              </span>
              <span className="bg-white dark:bg-black/40 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-white/10">
                رمز عبور: <strong className="text-emerald-500">admin123</strong>
              </span>
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <h5 className="font-bold text-neutral-800 dark:text-neutral-200">نکات مهم امنیتی:</h5>
            <ul className="list-disc list-inside space-y-1 pr-1 text-neutral-500 dark:text-neutral-400">
              <li>بلافاصله پس از اولین ورود، به بخش <strong>تنظیمات امنیتی</strong> رفته و رمز عبور را تغییر دهید.</li>
              <li>از افشای اطلاعات توکن API پنل خودداری کنید؛ زیرا امکان اجرای دستورات ریشه را فراهم می‌کند.</li>
              <li>نشست‌های فعال سرور پس از خروج لغو خواهند شد.</li>
            </ul>
          </div>
        </div>
      ),
      detailsEn: (
        <div className="space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            The panel features token-based JWT authentication protecting all API endpoints, file operations, and shell terminal executions.
          </p>
          <div className="p-3 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 space-y-2">
            <div className="font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <Key className="h-4 w-4 text-amber-500" />
              <span>Default Credentials:</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
              <span className="bg-white dark:bg-black/40 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-white/10">
                Username: <strong className="text-emerald-500">admin</strong>
              </span>
              <span className="bg-white dark:bg-black/40 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-white/10">
                Password: <strong className="text-emerald-500">admin123</strong>
              </span>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'terminal',
      category: 'terminal',
      titleFa: '۲. ترمینال تحت وب و کلیدهای میانبر (Terminal & CLI)',
      titleEn: '2. Web Terminal & Keyboard Shortcuts',
      icon: Terminal,
      badgeFa: 'امکانات حرفه‌ای',
      badgeEn: 'Pro Feature',
      badgeColor: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
      summaryFa: 'اجرای زنده دستورات لینوکس، خروجی استریم زنده، قابلیت Detach و کلیدهای میانبر کاربردی.',
      summaryEn: 'Live bash terminal output, background detach mode, history navigating & shortcuts.',
      keywords: ['ctrl+c', 'ctrl+a+d', 'ctrl+l', 'detach', 'interrupt', 'clear', 'bash', 'terminal', 'cmd', 'شورتکد', 'میانبر', 'ترمینال'],
      detailsFa: (
        <div className="space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            ترمینال وب به شما دسترسی مستقیم به پوسته لینوکس سرور می‌دهد. تمام خروجی‌های دستورات سنگین و طولانی به صورت آنلاین استریم می‌شوند.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono text-[11px]">
            <div className="p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <div className="flex items-center justify-between text-rose-500 font-bold mb-1">
                <span>Ctrl + C</span>
                <span className="text-[10px] bg-rose-500/10 px-1.5 py-0.5 rounded">Interrupt</span>
              </div>
              <p className="text-neutral-500 dark:text-neutral-400 text-[11px]">توقف فوری دستور فعال و قطع پردازش فورگراند.</p>
            </div>

            <div className="p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <div className="flex items-center justify-between text-indigo-400 font-bold mb-1">
                <span>Ctrl + A + D</span>
                <span className="text-[10px] bg-indigo-500/10 px-1.5 py-0.5 rounded">Detach</span>
              </div>
              <p className="text-neutral-500 dark:text-neutral-400 text-[11px]">جدا شدن از لاگ و انتقال ادامه اجرا به پس‌زمینه بدون قطع شدن برنامه!</p>
            </div>

            <div className="p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <div className="flex items-center justify-between text-blue-400 font-bold mb-1">
                <span>Ctrl + L</span>
                <span className="text-[10px] bg-blue-500/10 px-1.5 py-0.5 rounded">Clear</span>
              </div>
              <p className="text-neutral-500 dark:text-neutral-400 text-[11px]">پاکسازی کامل متن ترمینال برای داشتن فضای تمیز.</p>
            </div>

            <div className="p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <div className="flex items-center justify-between text-amber-400 font-bold mb-1">
                <span>↑ / ↓ (کلیدهای جهت)</span>
                <span className="text-[10px] bg-amber-500/10 px-1.5 py-0.5 rounded">History</span>
              </div>
              <p className="text-neutral-500 dark:text-neutral-400 text-[11px]">پیمایش در تاریخچه دستورات قبلی تایپ شده.</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px]">
            <strong>نکته کلیدی اجرا:</strong> اگر برنامه‌ای مثل اسکریپت پایتون یا ربات تلگرام را اجرا کردید، نیازی نیست پنجره ترمینال را باز نگه دارید؛ با زدن <code className="bg-amber-500/20 px-1 py-0.5 rounded font-bold">Ctrl + A + D</code> برنامه بدون توقف به اجرا ادامه می‌دهد.
          </div>
        </div>
      ),
      detailsEn: (
        <div className="space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            The interactive shell streams standard output and error logs in real-time. Supports background detaching and full terminal shortcuts.
          </p>
        </div>
      ),
    },
    {
      id: 'vpn',
      category: 'vpn',
      titleFa: '۳. سامانه تانلینگ و VPN سرور (Xray Engine)',
      titleEn: '3. VPN & Tunnel Engine (Xray-core)',
      icon: Globe,
      badgeFa: 'محبوب',
      badgeEn: 'Popular',
      badgeColor: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
      summaryFa: 'هدایت کل ترافیک سرور از پروکسی، پشتیبانی از VLESS, VMess, Trojan, REALITY و تست پینگ آنلاین.',
      summaryEn: 'Route full server network through VLESS, VMess, Trojan, REALITY with live IP test.',
      keywords: ['vless', 'vmess', 'trojan', 'shadowsocks', 'reality', 'xray', 'v2ray', 'socks5', '10808', '127.0.0.1:10808', 'tunnel', 'ping', 'ip', 'پروکسی', 'تانل', 'وی‌پی‌ان'],
      detailsFa: (
        <div className="space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            بخش VPN و تانل به سرور لینوکس شما اجازه می‌دهد کل ترافیک یا ترافیک برنامه‌های خاص (مثل ربات‌های تلگرام و درخواست‌های API خارجی) را از کانفیگ‌های V2Ray / Xray عبور دهد.
          </p>

          <div className="space-y-2">
            <h5 className="font-bold text-neutral-800 dark:text-neutral-200">قابلیت‌های اصلی بخش VPN:</h5>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <li className="p-2 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>پشتیبانی کامل پروتکل‌ها:</strong> vless، vmess، trojan، shadowsocks، reality، xhttp، grpc و ws.</span>
              </li>
              <li className="p-2 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>افزودن دسته‌ای (Bulk Add):</strong> چسباندن ده‌ها لینک همزمان متصل به خطوط مختلف.</span>
              </li>
              <li className="p-2 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>تست پینگ زنده:</strong> بررسی تاخیر و دسترسی‌پذیری تک‌تک یا همه کانفیگ‌ها قبل از اتصال.</span>
              </li>
              <li className="p-2 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>بررسی اتوماتیک IP و موقعیت:</strong> نمایش IP مستقیم سرور در برابر IP خروجی پروکسی همراه با کشور و ISP.</span>
              </li>
            </ul>
          </div>

          <div className="p-3 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 space-y-1 font-mono text-[11px]">
            <div className="text-neutral-700 dark:text-neutral-300 font-bold">آدرس پروکسی SOCKS5 محلی سرور:</div>
            <div className="text-emerald-500 font-bold bg-white dark:bg-black/40 p-2 rounded-lg border border-neutral-200 dark:border-white/10 flex items-center justify-between">
              <span>127.0.0.1:10808</span>
              <button
                onClick={() => copyToClipboard('127.0.0.1:10808')}
                className="hover:text-blue-500 cursor-pointer text-xs"
              >
                {copiedText === '127.0.0.1:10808' ? 'کپی شد ✓' : 'کپی'}
              </button>
            </div>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-1">
              میتوانید در اسکریپت‌های Python یا cURL از این پروکسی برای عبور تحریم‌ها استفاده کنید.
            </p>
          </div>
        </div>
      ),
      detailsEn: (
        <div className="space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            Connects your server to Xray-core outbound tunnels supporting VLESS, VMess, Trojan, and REALITY protocols.
          </p>
        </div>
      ),
    },
    {
      id: 'filemanager',
      category: 'filemanager',
      titleFa: '۴. مدیریت فایل و ویرایشگر کد + نمایشگر دیتابیس (File & DB Manager)',
      titleEn: '4. File Manager, Code Editor & SQLite Viewer',
      icon: FolderOpen,
      badgeFa: 'پیشرفته',
      badgeEn: 'Advanced',
      badgeColor: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
      summaryFa: 'مدیریت کامل فایل‌ها، آپلود پوشه‌ای و چندتایی، ویرایش کد، تغییر Chmod و نمایش دیتابیس SQLite.',
      summaryEn: 'Full file ops, drag & drop folder upload, live code editor, Chmod & SQLite database viewer.',
      keywords: ['chmod', '755', '644', '777', 'sqlite', 'db', '.db', '.sqlite', 'editor', 'upload', 'zip', 'unzip', 'فایل', 'دیتابیس', 'سطح دسترسی'],
      detailsFa: (
        <div className="space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            مدیریت فایل هوشمند ابزاری کامل برای مرور، آپلود، ساخت، ویرایش و مدیریت سطح دسترسی تمامی فایل‌ها و دایرکتوری‌های سرور است.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div className="p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 space-y-1">
              <span className="font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                <FileCode className="h-4 w-4 text-blue-400" />
                <span>ویرایشگر آنلاین کد:</span>
              </span>
              <p className="text-neutral-500 dark:text-neutral-400">
                ویرایش مستقیم کدهای Python, JS, JSON, Shell, HTML با هایلایت نحو و ذخیره آنی در سرور.
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 space-y-1">
              <span className="font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                <Database className="h-4 w-4 text-indigo-400" />
                <span>نمایشگر دیتابیس SQLite:</span>
              </span>
              <p className="text-neutral-500 dark:text-neutral-400">
                با کلیک روی فایل‌های با پسوند <code className="bg-indigo-500/10 text-indigo-400 px-1 rounded">.db</code> یا <code className="bg-indigo-500/10 text-indigo-400 px-1 rounded">.sqlite</code>، جدول‌ها و داده‌ها را مستقیماً مشاهده کنید!
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 space-y-2">
            <h5 className="font-bold text-neutral-900 dark:text-white">راهنمای سطوح دسترسی لینوکس (Chmod):</h5>
            <div className="grid grid-cols-3 gap-2 text-center font-mono text-[11px]">
              <div className="p-2 rounded-lg bg-white dark:bg-black/40 border border-neutral-200 dark:border-white/10">
                <span className="text-amber-500 font-bold block text-sm">755</span>
                <span className="text-[10px] text-neutral-500">اجرایی مناسب اسکریپت‌ها</span>
              </div>
              <div className="p-2 rounded-lg bg-white dark:bg-black/40 border border-neutral-200 dark:border-white/10">
                <span className="text-amber-500 font-bold block text-sm">644</span>
                <span className="text-[10px] text-neutral-500">استاندارد فایل‌های متنی/کد</span>
              </div>
              <div className="p-2 rounded-lg bg-white dark:bg-black/40 border border-neutral-200 dark:border-white/10">
                <span className="text-amber-500 font-bold block text-sm">777</span>
                <span className="text-[10px] text-neutral-500">دسترسی کامل همه کاربران</span>
              </div>
            </div>
          </div>
        </div>
      ),
      detailsEn: (
        <div className="space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            Manage server files with code editing, Chmod permissions, bulk operations, and built-in SQLite database table viewer.
          </p>
        </div>
      ),
    },
    {
      id: 'process',
      category: 'process',
      titleFa: '۵. مدیریت پردازش‌ها، PM2، پکیج‌های پایتون و دیپلوی گیت‌هاب',
      titleEn: '5. PM2 Processes, Python Pip & GitHub Deployer',
      icon: Cpu,
      badgeFa: 'کاربردی',
      badgeEn: 'Feature-Rich',
      badgeColor: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
      summaryFa: 'مدیریت سرویس‌های ۲۴ ساعته با PM2، نصب کتابخانه‌های pip3، ساخت اسکریپت و دیپلوی از GitHub.',
      summaryEn: 'Keep 24/7 PM2 processes running, manage pip packages, build raw code or clone GitHub repos.',
      keywords: ['pm2', 'pip', 'python', 'pip3', 'github', 'deploy', 'requirements.txt', 'package.json', 'اسکریپت', 'پایتون', 'دیپلوی'],
      detailsFa: (
        <div className="space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            این بخش قلب مدیریت برنامه‌ها و اسکریپت‌های سرور شماست. با ابزار PM2، اسکریپت‌های شما حتی پس از ری‌استارت سرور، ۲۴ ساعته روشن باقی می‌مانند.
          </p>

          <div className="space-y-2">
            <h5 className="font-bold text-neutral-800 dark:text-neutral-200">بخش‌های اصلی مدیریت پردازش:</h5>
            <ul className="space-y-2 text-[11px]">
              <li className="p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                <strong className="text-purple-400 block mb-0.5">۱. جدول پردازش‌های PM2:</strong>
                مشاهده وضعیت آنلاین/آفلاین، مصرف CPU و RAM، تعداد ری‌استارت‌ها، مشاهده لاگ زنده و کلیدهای کنترل (شروع، توقف، ری‌استارت، حذف).
              </li>
              <li className="p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                <strong className="text-emerald-400 block mb-0.5">۲. مدیر پکیج‌های پایتون (Python Pip Manager):</strong>
                جستجو، نصب، ارتقا و حذف آسان پکیج‌های پایتون مانند <code className="bg-emerald-500/10 text-emerald-400 px-1 rounded">requests</code>, <code className="bg-emerald-500/10 text-emerald-400 px-1 rounded">aiogram</code>, <code className="bg-emerald-500/10 text-emerald-400 px-1 rounded">telebot</code>, <code className="bg-emerald-500/10 text-emerald-400 px-1 rounded">pandas</code> بدون نیاز به ورود دستی به ترمینال!
              </li>
              <li className="p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                <strong className="text-blue-400 block mb-0.5">۳. دیپلوی مستقیم از GitHub:</strong>
                وارد کردن لینک مخزن گیت‌هاب (ریپوزیتوری عمومی یا خصوصی با توکن)، کلون خودکار، تشخیص نوع پروژه (پایتون/نودجی‌اس)، نصب وابستگی‌ها (<code className="bg-blue-500/10 text-blue-400 px-1 rounded">requirements.txt</code> یا <code className="bg-blue-500/10 text-blue-400 px-1 rounded">package.json</code>) و راه‌اندازی فوری در PM2.
              </li>
              <li className="p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                <strong className="text-amber-400 block mb-0.5">۴. ساخت اسکریپت مستقیم (Direct Code Deployer):</strong>
                تایپ یا چسباندن مستقیم کدهای پایتون/نود، تعیین نام پردازش و دیپلوی خودکار.
              </li>
            </ul>
          </div>
        </div>
      ),
      detailsEn: (
        <div className="space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            PM2 process daemonization, Python pip3 package management, raw code builder, and GitHub repo auto-deployer.
          </p>
        </div>
      ),
    },
    {
      id: 'telegram',
      category: 'telegram',
      titleFa: '۶. ربات تلگرام و هشداردهنده هوشمند (Telegram Bot Manager)',
      titleEn: '6. Telegram Bot Controller & Server Alerts',
      icon: Bot,
      badgeFa: 'هوشمند',
      badgeEn: 'Smart Bot',
      badgeColor: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
      summaryFa: 'اتصال ربات تلگرام، دریافت هشدارهای فشار منابع، خاموش/روشن کردن VPN و اجرای دستورات با تلگرام.',
      summaryEn: 'Connect Telegram bot token, receive server threshold alerts, control VPN & system via chat.',
      keywords: ['telegram', 'bot', '/status', '/vpn_on', '/vpn_off', '/pm2_list', 'botfather', 'token', 'تلگرام', 'ربات', 'دستورات'],
      detailsFa: (
        <div className="space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            با اتصال توکن ربات تلگرام، می‌توانید سرور خود را از داخل پیام‌رسان تلگرام کنترل کرده و نوتیفیکیشن‌های حیاتی دریافت کنید.
          </p>

          <div className="space-y-2">
            <h5 className="font-bold text-neutral-800 dark:text-neutral-200">دستورات قابل استفاده در ربات تلگرام:</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
              <div className="p-2 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                <span className="text-cyan-400 font-bold">/status</span> - دریافت آمار حیاتی CPU، RAM و پینگ
              </div>
              <div className="p-2 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                <span className="text-cyan-400 font-bold">/vpn_on</span> - روشن کردن تانل VPN سرور
              </div>
              <div className="p-2 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                <span className="text-cyan-400 font-bold">/vpn_off</span> - خاموش کردن تانل VPN
              </div>
              <div className="p-2 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                <span className="text-cyan-400 font-bold">/pm2_list</span> - لیست اسکریپت‌های در حال اجرای PM2
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-700 dark:text-cyan-300 text-[11px]">
            <strong>کنترل از راه دور:</strong> با ارسال دستورات فوق می‌توانید وضعیت سرور را مشاهده نموده و ربات و تانل را از داخل تلگرام مدیریت کنید.
          </div>
        </div>
      ),
      detailsEn: (
        <div className="space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            Manage Telegram bot token, execute control commands, and receive auto notifications for resource spikes or server downtime.
          </p>
        </div>
      ),
    },
    {
      id: 'monitoring',
      category: 'monitoring',
      titleFa: '۷. پایش زنده منابع سرور (System Monitoring)',
      titleEn: '7. Live System Monitoring & Resource Analytics',
      icon: Activity,
      badgeFa: 'زنده',
      badgeEn: 'Realtime',
      badgeColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      summaryFa: 'نمودارهای زنده CPU, RAM, Disk و ترافیک شبکه (Download/Upload) با نرخ بروزرسانی قابل تنظیم.',
      summaryEn: 'Real-time charts for CPU, RAM, Disk, and Rx/Tx Network speeds with variable refresh rate.',
      detailsFa: (
        <div className="space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            داشبورد پایش منابع تمام شاخص‌های کلیدی سخت‌افزار سرور را با استفاده از نمودارهای وکتوری زنده نمایش می‌دهد.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] text-center">
            <div className="p-2 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <span className="text-blue-500 font-bold block text-sm">CPU</span>
              <span className="text-[10px] text-neutral-500">مصرف پردازنده و هسته‌ها</span>
            </div>
            <div className="p-2 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <span className="text-purple-500 font-bold block text-sm">RAM</span>
              <span className="text-[10px] text-neutral-500">حافظه استفاده‌شده و آزاد</span>
            </div>
            <div className="p-2 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <span className="text-amber-500 font-bold block text-sm">DISK</span>
              <span className="text-[10px] text-neutral-500">فضای ذخیره‌سازی اصلی</span>
            </div>
            <div className="p-2 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <span className="text-emerald-500 font-bold block text-sm">NETWORK</span>
              <span className="text-[10px] text-neutral-500">پهنای باند Rx / Tx</span>
            </div>
          </div>
        </div>
      ),
      detailsEn: (
        <div className="space-y-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            Displays CPU, Memory, Disk usage, and active network throughput (Rx/Tx) via SVG live visual charts.
          </p>
        </div>
      ),
    },
  ];

  // Filtering logic
  const filteredSections = docSections.filter((section) => {
    const matchesCategory = selectedCategory === 'all' || section.category === selectedCategory;
    const query = searchQuery.toLowerCase().trim();
    if (!query) return matchesCategory;

    const title = (isFa ? section.titleFa : section.titleEn).toLowerCase();
    const summary = (isFa ? section.summaryFa : section.summaryEn).toLowerCase();
    const category = section.category.toLowerCase();
    const badge = ((isFa ? section.badgeFa : section.badgeEn) || '').toLowerCase();
    const keywords = (section.keywords || []).join(' ').toLowerCase();

    const matchesSearch = 
      title.includes(query) || 
      summary.includes(query) || 
      category.includes(query) || 
      badge.includes(query) ||
      keywords.includes(query);

    return matchesCategory && matchesSearch;
  });

  return (
    <div className={`space-y-4 max-w-5xl mx-auto ${isModalView ? 'pb-2' : 'pb-8'}`}>
      {/* Header Banner */}
      <div className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-sm">
        {!isModalView && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-start gap-2.5 sm:gap-4">
              <div className="p-2.5 sm:p-3 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shrink-0">
                <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                  <span>{isFa ? 'راهنمای جامع و داکیومنت سامانه' : 'System Documentation & Guide'}</span>
                </h2>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                  {isFa
                    ? 'آموزش کامل تمام قابلیت‌های ترمینال، VPN، مدیریت فایل‌ها، پردازش‌های PM2 و ربات تلگرام'
                    : 'Comprehensive operational manual for Web Terminal, VPN Engine, PM2 Scripts & System API'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className={`flex flex-col sm:flex-row gap-2.5 ${!isModalView ? 'pt-3 border-t border-neutral-200 dark:border-white/10' : ''}`}>
          <div className="relative flex-1">
            <Search className="absolute left-3 dir-rtl:left-auto dir-rtl:right-3 top-2.5 h-4 w-4 text-neutral-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isFa ? 'جستجوی سریع دستورات (مانند: /status, vpn_on, chmod, pm2, 10808...)' : 'Quick search commands (e.g. /status, vpn_on, chmod, pm2)...'}
              className="w-full bg-neutral-100 dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded-xl pl-9 pr-8 dir-rtl:pl-8 dir-rtl:pr-9 py-2 text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 dir-rtl:right-auto dir-rtl:left-3 top-2.5 text-xs text-neutral-400 hover:text-white cursor-pointer px-1"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-3 pb-1 no-scrollbar text-[11px]">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-white/10'
              }`}
            >
              {isFa ? cat.nameFa : cat.nameEn}
            </button>
          ))}
        </div>
      </div>

      {/* Doc Sections List */}
      <div className="space-y-3">
        {filteredSections.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-xl p-6">
            <BookOpen className="h-10 w-10 text-neutral-400 mx-auto opacity-50 mb-2" />
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {isFa ? 'هیچ موردی مطابق با جستجوی شما یافت نشد.' : 'No documentation section matches your search query.'}
            </p>
          </div>
        ) : (
          filteredSections.map((section) => {
            const IconComponent = section.icon;
            const isExpanded = !!expandedSections[section.id];

            return (
              <div
                key={section.id}
                className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-xl sm:rounded-2xl overflow-hidden shadow-sm transition hover:border-neutral-300 dark:hover:border-white/20"
              >
                {/* Accordion Bar */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full p-3.5 sm:p-5 flex items-start sm:items-center justify-between gap-3 text-right dir-rtl:text-right dir-ltr:text-left cursor-pointer hover:bg-neutral-50/50 dark:hover:bg-white/[0.02] transition"
                >
                  <div className="flex items-start sm:items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
                    <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 shrink-0 text-indigo-500">
                      <IconComponent className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>

                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white">
                          {isFa ? section.titleFa : section.titleEn}
                        </h3>
                        {section.badgeFa && (
                          <span
                            className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
                              section.badgeColor || 'bg-neutral-100 text-neutral-600'
                            }`}
                          >
                            {isFa ? section.badgeFa : section.badgeEn}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 truncate">
                        {isFa ? section.summaryFa : section.summaryEn}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-neutral-400 mt-1 sm:mt-0">
                    {isExpanded ? <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5" /> : <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5" />}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-3.5 pb-4 sm:px-5 sm:pb-5 pt-1 border-t border-neutral-100 dark:border-white/5 bg-neutral-50/30 dark:bg-black/10">
                    {isFa ? section.detailsFa : section.detailsEn}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
