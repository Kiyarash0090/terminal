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
  FileCode,
  Database,
  ChevronDown,
  ChevronUp,
  Server,
  Youtube,
  Minimize2,
  Maximize2,
  Activity,
  Layers,
  ArrowRightLeft
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
    'youtube': false,
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

  // When search query changes, expand matching sections automatically
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

  const expandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    docSections.forEach((s) => (allExpanded[s.id] = true));
    setExpandedSections(allExpanded);
  };

  const collapseAll = () => {
    setExpandedSections({});
  };

  // Categories list
  const categories = [
    { id: 'all', nameFa: 'همه', nameEn: 'All' },
    { id: 'security', nameFa: 'امنیتی و ورود', nameEn: 'Auth & Security' },
    { id: 'terminal', nameFa: 'ترمینال و کلیدها', nameEn: 'Terminal & CLI' },
    { id: 'vpn', nameFa: 'VPN و تانل', nameEn: 'VPN & Tunnel' },
    { id: 'filemanager', nameFa: 'فایل و دیتابیس', nameEn: 'File & DB' },
    { id: 'process', nameFa: 'پردازش و پایتون', nameEn: 'Processes & Pip' },
    { id: 'telegram', nameFa: 'ربات تلگرام', nameEn: 'Telegram Bot' },
    { id: 'youtube', nameFa: 'یوتیوب و دانلود', nameEn: 'YouTube Hub' },
    { id: 'monitoring', nameFa: 'پایش منابع', nameEn: 'Monitoring' },
  ];

  // Comprehensive documentation sections data
  const docSections: DocSection[] = [
    {
      id: 'security',
      category: 'security',
      titleFa: '۱. احراز هویت، امنیت و راه‌اندازی اولیه',
      titleEn: '1. Authentication, Security & Setup',
      icon: Shield,
      badgeFa: 'پایه و حیاتی',
      badgeEn: 'Essential',
      badgeColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      summaryFa: 'مدیریت حساب کاربری، تعیین رمز عبور مدیر، توکن‌های JWT و تنظیمات امنیتی پنل.',
      summaryEn: 'Account management, master admin password setup, JWT tokens, and panel security.',
      keywords: ['admin', 'pass', 'password', 'login', 'token', 'jwt', 'security', 'ورود', 'رمز', 'پسورد', 'امنیت', 'راه‌اندازی'],
      detailsFa: (
        <div className="space-y-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            این سامانه مجهز به سیستم احراز هویت مبتنی بر توکن اختصاصی است. جهت جلوگیری از نفوذ و ارتقای امنیت سرور، هیچ رمز عبور پیش‌فرضی در سامانه هاردکد نشده است؛ در اولین ورود، پنل مستقیماً شما را به صفحه تعیین رمز عبور مدیر هدایت می‌کند.
          </p>

          <div className="p-2.5 sm:p-3 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 space-y-1.5">
            <div className="font-bold text-neutral-900 dark:text-white flex items-center gap-1.5 text-xs">
              <Key className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>سیستم راه‌اندازی بدون رمز پیش‌فرض (Zero Default Password):</span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-neutral-600 dark:text-neutral-400">
              در اولین اجرای پنل، نام کاربری و رمز عبور اصلی توسط خود شما تعیین و روی سرور ذخیره می‌شود. پس از ورود، می‌توانید هر زمان از طریق <strong>آیکون سپر (تنظیمات امنیتی)</strong> رمز عبور یا نام کاربری خود را ویرایش کنید.
            </p>
          </div>

          <div className="space-y-1">
            <h5 className="font-bold text-neutral-800 dark:text-neutral-200">توصیه‌های امنیتی سرور:</h5>
            <ul className="list-disc list-inside space-y-1 pr-1 text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400">
              <li>رمز عبور باید حداقل شامل ۶ کاراکتر و ترکیبی از حروف و اعداد باشد.</li>
              <li>از افشای توکن احراز هویت درخواست‌های API خودداری نمایید.</li>
              <li>در صورت خروج از حساب، تمام نشست‌های فعال لغو می‌گردند.</li>
            </ul>
          </div>
        </div>
      ),
      detailsEn: (
        <div className="space-y-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            The panel features token-based authentication protecting all API endpoints, file operations, and shell executions. No default password is hardcoded; on initial startup, you directly set your master administrator credentials.
          </p>
          <div className="p-2.5 sm:p-3 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 space-y-1">
            <div className="font-bold text-neutral-900 dark:text-white flex items-center gap-1.5 text-xs">
              <Key className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>Zero-Default-Password Security:</span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-neutral-600 dark:text-neutral-400">
              Set your credentials on first login. You can update your master username or password at any time via the <strong>Security Modal (Shield icon)</strong>.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'terminal',
      category: 'terminal',
      titleFa: '۲. ترمینال آنلاین و کلیدهای میانبر (Terminal & CLI)',
      titleEn: '2. Web Terminal & Keyboard Shortcuts',
      icon: Terminal,
      badgeFa: 'برجسته',
      badgeEn: 'Pro Feature',
      badgeColor: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
      summaryFa: 'اجرای زنده دستورات لینوکس، خروجی استریم آنلاین، قابلیت Detach و میانبرهای کاربردی.',
      summaryEn: 'Live bash output streaming, background detach mode, history navigating & shortcuts.',
      keywords: ['ctrl+c', 'ctrl+a+d', 'ctrl+l', 'detach', 'interrupt', 'clear', 'bash', 'terminal', 'cmd', 'شورتکد', 'میانبر', 'ترمینال'],
      detailsFa: (
        <div className="space-y-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            ترمینال تحت وب دسترسی مستقیم به پوسته لینوکس (Bash Shell) را فراهم می‌آورد. تمام خروجی‌های دستورات سنگین و طولانی به صورت بلادرنگ استریم می‌شوند.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[10px] sm:text-[11px]">
            <div className="p-2 sm:p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <div className="flex items-center justify-between text-rose-500 font-bold mb-0.5">
                <span>Ctrl + C</span>
                <span className="text-[9px] bg-rose-500/10 px-1 py-0.5 rounded">Interrupt</span>
              </div>
              <p className="text-neutral-500 dark:text-neutral-400 text-[10px]">توقف فوری دستور فعال و قطع پردازش فورگراند.</p>
            </div>

            <div className="p-2 sm:p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <div className="flex items-center justify-between text-indigo-400 font-bold mb-0.5">
                <span>Ctrl + A + D</span>
                <span className="text-[9px] bg-indigo-500/10 px-1 py-0.5 rounded">Detach</span>
              </div>
              <p className="text-neutral-500 dark:text-neutral-400 text-[10px]">انتقال پردازش به پس‌زمینه بدون قطع شدن برنامه!</p>
            </div>

            <div className="p-2 sm:p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <div className="flex items-center justify-between text-blue-400 font-bold mb-0.5">
                <span>Ctrl + L</span>
                <span className="text-[9px] bg-blue-500/10 px-1 py-0.5 rounded">Clear</span>
              </div>
              <p className="text-neutral-500 dark:text-neutral-400 text-[10px]">پاکسازی کامل صفحه‌نمایش ترمینال.</p>
            </div>

            <div className="p-2 sm:p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <div className="flex items-center justify-between text-amber-400 font-bold mb-0.5">
                <span>↑ / ↓ (کلیدهای جهت)</span>
                <span className="text-[9px] bg-amber-500/10 px-1 py-0.5 rounded">History</span>
              </div>
              <p className="text-neutral-500 dark:text-neutral-400 text-[10px]">پیمایش در تاریخچه دستورات قبلی.</p>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] sm:text-[11px]">
            <strong>نکته کلیدی:</strong> برای اجرای برنامه‌های طولانی یا ربات‌ها، پس از اجرا کلید <code className="bg-amber-500/20 px-1 rounded font-bold">Ctrl + A + D</code> را بزنید تا برنامه حتی با بستن مرورگر به فعالیت خود ادامه دهد.
          </div>
        </div>
      ),
      detailsEn: (
        <div className="space-y-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            Interactive web shell with real-time log streaming, history navigation, and background detaching via Ctrl+A+D.
          </p>
        </div>
      ),
    },
    {
      id: 'vpn',
      category: 'vpn',
      titleFa: '۳. سامانه تانلینگ و VPN سرور (Xray-Core Engine)',
      titleEn: '3. VPN & Tunnel Engine (Xray-core)',
      icon: Globe,
      badgeFa: 'پرکاربرد',
      badgeEn: 'Popular',
      badgeColor: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
      summaryFa: 'عبور ترافیک از کانفیگ‌های VLESS, VMess, Trojan, REALITY و تست پینگ آنلاین.',
      summaryEn: 'Route full server network through VLESS, VMess, Trojan, REALITY with live IP test.',
      keywords: ['vless', 'vmess', 'trojan', 'shadowsocks', 'reality', 'xray', 'v2ray', 'socks5', '10808', '10809', '127.0.0.1:10808', 'tunnel', 'ping', 'ip', 'پروکسی', 'تانل', 'وی‌پی‌ان'],
      detailsFa: (
        <div className="space-y-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            بخش VPN امکان عبور ترافیک شبکه سرور و پردازش‌های لینوکس را از کانفیگ‌های Xray فراهم می‌سازد.
          </p>

          <div className="space-y-1.5">
            <h5 className="font-bold text-neutral-800 dark:text-neutral-200">امکانات اصلی شبکه:</h5>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10px] sm:text-[11px]">
              <li className="p-2 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 flex items-start gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>پشتیبانی پروتکل‌ها:</strong> VLESS, VMess, Trojan, Shadowsocks, REALITY, xhttp, gRPC, WS.</span>
              </li>
              <li className="p-2 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 flex items-start gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>افزودن دسته‌ای (Bulk):</strong> وارد کردن چند کانفیگ همزمان.</span>
              </li>
              <li className="p-2 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 flex items-start gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>تست پینگ زنده:</strong> بررسی پینگ و اتصال کانفیگ‌ها قبل از فعال‌سازی.</span>
              </li>
              <li className="p-2 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 flex items-start gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span><strong>استعلام زنده IP:</strong> مقایسه IP مستقیم و IP خروجی پروکسی همراه با موقعیت جغرافیایی.</span>
              </li>
            </ul>
          </div>

          <div className="p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 space-y-1 font-mono text-[10px] sm:text-[11px]">
            <div className="text-neutral-700 dark:text-neutral-300 font-bold">آدرس‌های پروکسی محلی سرور:</div>
            <div className="flex flex-col sm:flex-row gap-1.5">
              <div className="flex-1 text-emerald-500 font-bold bg-white dark:bg-black/40 p-1.5 rounded-lg border border-neutral-200 dark:border-white/10 flex items-center justify-between">
                <span>SOCKS5: 127.0.0.1:10808</span>
                <button
                  onClick={() => copyToClipboard('127.0.0.1:10808')}
                  className="hover:text-blue-500 cursor-pointer text-[10px] px-1"
                >
                  {copiedText === '127.0.0.1:10808' ? '✓' : 'کپی'}
                </button>
              </div>
              <div className="flex-1 text-sky-500 font-bold bg-white dark:bg-black/40 p-1.5 rounded-lg border border-neutral-200 dark:border-white/10 flex items-center justify-between">
                <span>HTTP: 127.0.0.1:10809</span>
                <button
                  onClick={() => copyToClipboard('127.0.0.1:10809')}
                  className="hover:text-blue-500 cursor-pointer text-[10px] px-1"
                >
                  {copiedText === '127.0.0.1:10809' ? '✓' : 'کپی'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ),
      detailsEn: (
        <div className="space-y-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            Xray-core tunnel manager with local proxy ports (SOCKS5 10808 / HTTP 10809), latency testing, and live IP inspection.
          </p>
        </div>
      ),
    },
    {
      id: 'filemanager',
      category: 'filemanager',
      titleFa: '۴. مدیریت فایل، ویرایشگر کد و دیتابیس SQLite',
      titleEn: '4. File Manager, Code Editor & SQLite Viewer',
      icon: FolderOpen,
      badgeFa: 'پیشرفته',
      badgeEn: 'Advanced',
      badgeColor: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
      summaryFa: 'مرور فایل‌ها، آپلود پوشه‌ای، تغییر Chmod، ویرایش کد و مشاهده جداول SQLite.',
      summaryEn: 'File browser, folder Drag & Drop, Chmod permissions, code editing & SQLite database table viewer.',
      keywords: ['chmod', '755', '644', '777', 'sqlite', 'db', '.db', '.sqlite', 'editor', 'upload', 'zip', 'unzip', 'فایل', 'دیتابیس', 'سطح دسترسی'],
      detailsFa: (
        <div className="space-y-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            مدیریت فایل هوشمند ابزاری کامل برای آپلود، ویرایش، استخراج، تغییر سطح دسترسی (`chmod`) و دانلود گروهی فایل‌ها است.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] sm:text-[11px]">
            <div className="p-2 sm:p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 space-y-0.5">
              <span className="font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                <FileCode className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span>ویرایشگر آنلاین کد:</span>
              </span>
              <p className="text-neutral-500 dark:text-neutral-400 text-[10px]">
                ویرایش مستقیم کدهای Python, JS, JSON, Shell, HTML با هایلایت نحو و ذخیره آنی در سرور.
              </p>
            </div>

            <div className="p-2 sm:p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 space-y-0.5">
              <span className="font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                <span>نمایشگر دیتابیس SQLite:</span>
              </span>
              <p className="text-neutral-500 dark:text-neutral-400 text-[10px]">
                با کلیک روی فایل‌های با پسوند <code className="bg-indigo-500/10 text-indigo-400 px-1 rounded">.db</code> یا <code className="bg-indigo-500/10 text-indigo-400 px-1 rounded">.sqlite</code>، جدول‌ها و داده‌ها را مستقیماً مشاهده کنید!
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 space-y-1.5">
            <h5 className="font-bold text-neutral-900 dark:text-white text-xs">سطوح دسترسی لینوکس (Chmod):</h5>
            <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[10px]">
              <div className="p-1.5 rounded-lg bg-white dark:bg-black/40 border border-neutral-200 dark:border-white/10">
                <span className="text-amber-500 font-bold block text-xs">755</span>
                <span className="text-[9px] text-neutral-500">اسکریپت‌های اجرایی</span>
              </div>
              <div className="p-1.5 rounded-lg bg-white dark:bg-black/40 border border-neutral-200 dark:border-white/10">
                <span className="text-amber-500 font-bold block text-xs">644</span>
                <span className="text-[9px] text-neutral-500">فایل‌های متنی و کد</span>
              </div>
              <div className="p-1.5 rounded-lg bg-white dark:bg-black/40 border border-neutral-200 dark:border-white/10">
                <span className="text-amber-500 font-bold block text-xs">777</span>
                <span className="text-[9px] text-neutral-500">دسترسی کامل همه</span>
              </div>
            </div>
          </div>
        </div>
      ),
      detailsEn: (
        <div className="space-y-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            Full file manager with code editor, Chmod permissions, bulk operations, and SQLite database table viewer.
          </p>
        </div>
      ),
    },
    {
      id: 'process',
      category: 'process',
      titleFa: '۵. مدیریت پردازش‌ها، PM2، پکیج‌های پایتون و دپلوی گیت‌هاب',
      titleEn: '5. PM2 Processes, Python Pip & GitHub Deployer',
      icon: Cpu,
      badgeFa: 'توسعه',
      badgeEn: 'Feature-Rich',
      badgeColor: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
      summaryFa: 'مدیریت سرویس‌های ۲۴ ساعته PM2، نصب کتابخانه‌های Pip3، ساخت اسکریپت و دپلوی از GitHub.',
      summaryEn: 'Keep 24/7 PM2 processes running, manage pip packages, build raw code or clone GitHub repos.',
      keywords: ['pm2', 'pip', 'python', 'pip3', 'github', 'deploy', 'requirements.txt', 'package.json', 'اسکریپت', 'پایتون', 'دیپلوی'],
      detailsFa: (
        <div className="space-y-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            این بخش مدیریت اسکریپت‌ها و برنامه‌های پس‌زمینه سرور را بر عهده دارد. با ابزار PM2، اسکریپت‌های شما پس از ری‌استارت سرور ۲۴ ساعته روشن باقی می‌مانند.
          </p>

          <div className="space-y-1.5">
            <h5 className="font-bold text-neutral-800 dark:text-neutral-200">بخش‌های اصلی:</h5>
            <ul className="space-y-1.5 text-[10px] sm:text-[11px]">
              <li className="p-2 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                <strong className="text-purple-400 block mb-0.5">۱. مدیریت پردازش‌های PM2:</strong>
                مشاهده وضعیت آنلاین، مصرف CPU و RAM، کلیدهای توقف، ری‌استارت و مشاهده لاگ زنده.
              </li>
              <li className="p-2 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                <strong className="text-emerald-400 block mb-0.5">۲. مدیر پکیج‌های پایتون (Python Pip Manager):</strong>
                جستجو، نصب، ارتقا و حذف آسان پکیج‌های پایتون مانند <code className="bg-emerald-500/10 text-emerald-400 px-1 rounded">requests</code>, <code className="bg-emerald-500/10 text-emerald-400 px-1 rounded">aiogram</code>, <code className="bg-emerald-500/10 text-emerald-400 px-1 rounded">pandas</code> بدون ورود دستی به ترمینال!
              </li>
              <li className="p-2 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                <strong className="text-blue-400 block mb-0.5">۳. دپلوی مستقیم از GitHub:</strong>
                وارد کردن لینک مخزن گیت‌هاب، کلون خودکار، نصب وابستگی‌های <code className="bg-blue-500/10 text-blue-400 px-1 rounded">requirements.txt</code> یا <code className="bg-blue-500/10 text-blue-400 px-1 rounded">package.json</code> و راه‌اندازی فوری در PM2.
              </li>
            </ul>
          </div>
        </div>
      ),
      detailsEn: (
        <div className="space-y-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            PM2 daemonization, Python pip3 package manager, and GitHub repo auto-deployer.
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
        <div className="space-y-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            با اتصال توکن ربات تلگرام، سرور خود را از داخل پیام‌رسان تلگرام کنترل کرده و نوتیفیکیشن‌های حیاتی دریافت کنید.
          </p>

          <div className="space-y-1.5">
            <h5 className="font-bold text-neutral-800 dark:text-neutral-200">دستورات اصلی ربات:</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[10px] sm:text-[11px]">
              <div className="p-1.5 sm:p-2 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                <span className="text-cyan-400 font-bold">/status</span> - آمار حیاتی CPU، RAM و پینگ
              </div>
              <div className="p-1.5 sm:p-2 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                <span className="text-cyan-400 font-bold">/vpn_on</span> - روشن کردن تانل VPN سرور
              </div>
              <div className="p-1.5 sm:p-2 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                <span className="text-cyan-400 font-bold">/vpn_off</span> - خاموش کردن تانل VPN
              </div>
              <div className="p-1.5 sm:p-2 rounded-lg bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                <span className="text-cyan-400 font-bold">/pm2_list</span> - لیست اسکریپت‌های در حال اجرای PM2
              </div>
            </div>
          </div>
        </div>
      ),
      detailsEn: (
        <div className="space-y-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            Telegram bot token setup, command execution, and real-time server threshold notifications.
          </p>
        </div>
      ),
    },
    {
      id: 'youtube',
      category: 'youtube',
      titleFa: '۷. بخش یوتیوب و دانلود رسانه (YouTube Hub)',
      titleEn: '7. YouTube Downloader & Media Hub',
      icon: Youtube,
      badgeFa: 'چندموتوره',
      badgeEn: 'Multi-Engine',
      badgeColor: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
      summaryFa: 'استخراج متادیتا و دانلود ویدیو/صوت یوتیوب با yt-dlp و pytubefix و اتصال خودکار به VPN.',
      summaryEn: 'Extract metadata and download YouTube videos/audio via yt-dlp and pytubefix with auto VPN routing.',
      keywords: ['youtube', 'yt-dlp', 'pytubefix', 'mp4', 'mp3', 'download', 'یوتیوب', 'دانلود'],
      detailsFa: (
        <div className="space-y-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            بخش یوتیوب امکان استخراج متادیتا، لیست کیفیت‌های ویدیویی (1080p, 720p, 480p) و فرمت‌های صوتی (MP3, M4A) را با دو موتور yt-dlp و pytubefix فراهم می‌کند.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 font-mono text-[10px] text-center">
            <div className="p-2 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <span className="text-rose-500 font-bold block text-xs">yt-dlp</span>
              <span className="text-[9px] text-neutral-500">موتور اصلی با پشتیبانی پایتون</span>
            </div>
            <div className="p-2 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <span className="text-emerald-500 font-bold block text-xs">VPN PROXY</span>
              <span className="text-[9px] text-neutral-500">عبور ترافیک از پروکسی ۱۰۸۰۹</span>
            </div>
            <div className="p-2 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
              <span className="text-blue-500 font-bold block text-xs">pytubefix</span>
              <span className="text-[9px] text-neutral-500">موتور کمکی سریع</span>
            </div>
          </div>
        </div>
      ),
      detailsEn: (
        <div className="space-y-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            Extract metadata, format qualities, and download MP4 video / MP3 audio using yt-dlp or pytubefix with automatic VPN routing.
          </p>
        </div>
      ),
    },
    {
      id: 'monitoring',
      category: 'monitoring',
      titleFa: '۸. پایش برخط منابع سیستم (Resource Monitoring)',
      titleEn: '8. Real-time System Metrics & Resource Monitoring',
      icon: Activity,
      badgeFa: 'زنده',
      badgeEn: 'Live Metrics',
      badgeColor: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      summaryFa: 'نمایش بلادرنگ آمار CPU، RAM، دیسک، ترافیک شبکه (RX/TX) و متریم‌های Railway.',
      summaryEn: 'Live hardware monitoring for CPU, RAM, Disk, Network I/O and Railway workspace metrics.',
      keywords: ['cpu', 'ram', 'disk', 'network', 'rx', 'tx', 'railway', 'monitoring', 'پایش', 'رم', 'پردازنده'],
      detailsFa: (
        <div className="space-y-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            پایش بلادرنگ اطلاعات سخت‌افزاری سرور لینوکس شامل درصد مصرف پردازنده، حافظه اصلی، فضای دیسک و سرعت ترافیک شبکه (کیلوبایت بر ثانیه).
          </p>
        </div>
      ),
      detailsEn: (
        <div className="space-y-2.5 text-[11px] sm:text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            Live hardware stats for CPU, RAM, Disk usage, Network RX/TX speeds, and Railway Cloud metrics.
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

  const isAllExpanded = Object.keys(expandedSections).length >= docSections.length;

  return (
    <div className={`space-y-3 sm:space-y-4 max-w-5xl mx-auto ${isModalView ? 'pb-2' : 'pb-8'}`}>
      {/* Header Banner */}
      <div className="bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-sm">
        {!isModalView && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
            <div className="flex items-start gap-2.5 sm:gap-3.5">
              <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shrink-0">
                <BookOpen className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                  <span>{isFa ? 'راهنمای جامع و داکیومنت سامانه' : 'System Documentation & Guide'}</span>
                </h2>
                <p className="text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">
                  {isFa
                    ? 'آموزش کامل تمام قابلیت‌های ترمینال، VPN، مدیریت فایل‌ها، دیتابیس SQLite، پردازش‌ها و ربات تلگرام'
                    : 'Comprehensive operational manual for Web Terminal, VPN Engine, PM2 Scripts & System API'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Search Bar & Quick Expand/Collapse Actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 dir-rtl:left-auto dir-rtl:right-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isFa ? 'جستجوی دستورات (مانند: /status, vpn_on, chmod, pm2, 10808...)' : 'Search commands (e.g. /status, vpn_on, chmod, pm2)...'}
              className="w-full bg-neutral-100 dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded-xl pl-8 pr-7 dir-rtl:pl-7 dir-rtl:pr-8 py-1.5 sm:py-2 text-[11px] sm:text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 dir-rtl:right-auto dir-rtl:left-2.5 top-2 text-xs text-neutral-400 hover:text-white cursor-pointer px-1"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={isAllExpanded ? collapseAll : expandAll}
            className="px-2.5 py-1.5 rounded-xl bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-neutral-300 text-[10px] sm:text-xs font-medium border border-neutral-200 dark:border-white/10 flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
            title={isFa ? (isAllExpanded ? 'بستن همه بخش‌ها' : 'باز کردن همه بخش‌ها') : (isAllExpanded ? 'Collapse All' : 'Expand All')}
          >
            {isAllExpanded ? <Minimize2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : <Maximize2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
            <span>{isFa ? (isAllExpanded ? 'بستن همه' : 'باز کردن همه') : (isAllExpanded ? 'Collapse All' : 'Expand All')}</span>
          </button>
        </div>

        {/* Category Pills (Optimized Mobile Padding & Font Size) */}
        <div className="flex items-center gap-1 overflow-x-auto pt-2.5 pb-0.5 no-scrollbar text-[10px] sm:text-[11px]">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
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
      <div className="space-y-2 sm:space-y-3">
        {filteredSections.length === 0 ? (
          <div className="text-center py-8 sm:py-12 bg-white dark:bg-[#121214] border border-neutral-200 dark:border-white/10 rounded-xl p-4 sm:p-6">
            <BookOpen className="h-8 w-8 text-neutral-400 mx-auto opacity-50 mb-1.5" />
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
                {/* Accordion Header Bar */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full p-2.5 sm:p-4 flex items-center justify-between gap-2.5 text-right dir-rtl:text-right dir-ltr:text-left cursor-pointer hover:bg-neutral-50/50 dark:hover:bg-white/[0.02] transition"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 shrink-0 text-indigo-500">
                      <IconComponent className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </div>

                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white">
                          {isFa ? section.titleFa : section.titleEn}
                        </h3>
                        {section.badgeFa && (
                          <span
                            className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                              section.badgeColor || 'bg-neutral-100 text-neutral-600'
                            }`}
                          >
                            {isFa ? section.badgeFa : section.badgeEn}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                        {isFa ? section.summaryFa : section.summaryEn}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-neutral-400 p-0.5">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {/* Expanded Details Content */}
                {isExpanded && (
                  <div className="px-3 pb-3 sm:px-4 sm:pb-4 pt-1 border-t border-neutral-100 dark:border-white/5 bg-neutral-50/30 dark:bg-black/10">
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
