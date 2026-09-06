import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AuthState, Language, ThemeMode, User } from './types';
import { Navbar } from './components/Navbar';
import { Sidebar, ActiveTab } from './components/Sidebar';

// Lazy load heavy components for better initial load
const MonitoringDashboard = lazy(() => import('./components/MonitoringDashboard').then(m => ({ default: m.MonitoringDashboard })));
const TerminalView = lazy(() => import('./components/TerminalView').then(m => ({ default: m.TerminalView })));
const FileManager = lazy(() => import('./components/FileManager').then(m => ({ default: m.FileManager })));
const ProcessManager = lazy(() => import('./components/ProcessManager').then(m => ({ default: m.ProcessManager })));
const VpnManager = lazy(() => import('./components/VpnManager').then(m => ({ default: m.VpnManager })));
const YouTubeManager = lazy(() => import('./components/YouTubeManager').then(m => ({ default: m.YouTubeManager })));
const DocumentationModal = lazy(() => import('./components/DocumentationModal').then(m => ({ default: m.DocumentationModal })));
const SecurityModal = lazy(() => import('./components/SecurityModal').then(m => ({ default: m.SecurityModal })));
const LoginModal = lazy(() => import('./components/LoginModal').then(m => ({ default: m.LoginModal })));
const TelegramBotModal = lazy(() => import('./components/TelegramBotModal').then(m => ({ default: m.TelegramBotModal })));

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('serverdash_lang');
    return (saved === 'fa' || saved === 'en') ? saved : 'fa';
  });
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('serverdash_theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>('monitoring');
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);
  const [isDocOpen, setIsDocOpen] = useState(false);
  const [isTelegramBotOpen, setIsTelegramBotOpen] = useState(false);

  const [auth, setAuth] = useState<AuthState>(() => {
    const savedToken = localStorage.getItem('serverdash_token');
    if (savedToken) {
      return {
        isAuthenticated: true,
        user: { username: 'admin', role: 'Administrator', loginTime: new Date().toISOString() },
        token: savedToken
      };
    }
    return { isAuthenticated: false, user: null, token: null };
  });

  // Global Keyboard Shortcut Listener for Documentation (Shift + ? or F1)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // F1 key or Shift + ?
      if (e.key === 'F1') {
        e.preventDefault();
        setIsDocOpen((prev) => !prev);
      } else if (e.shiftKey && (e.key === '?' || e.key === '/')) {
        const target = e.target as HTMLElement;
        const isInput = target && (
          target.tagName === 'INPUT' || 
          target.tagName === 'TEXTAREA' || 
          target.isContentEditable
        );
        // Open doc modal if user is not currently typing in a text field
        if (!isInput) {
          e.preventDefault();
          setIsDocOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Apply RTL/LTR dir attribute based on language
  useEffect(() => {
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    localStorage.setItem('serverdash_lang', lang);
  }, [lang]);

  // Apply dark/light class to root document
  useEffect(() => {
    localStorage.setItem('serverdash_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Verify stored token on load
  useEffect(() => {
    if (auth.token) {
      fetch('/api/auth/me', {
        headers: { 'x-auth-token': auth.token }
      })
        .then((res) => {
          if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
            return res.json();
          }
          throw new Error('Token expired or invalid response');
        })
        .then((data) => {
          if (data && data.user) {
            setAuth((prev) => ({ ...prev, isAuthenticated: true, user: data.user }));
          }
        })
        .catch(() => {
          localStorage.removeItem('serverdash_token');
          setAuth({ isAuthenticated: false, user: null, token: null });
        });
    } else {
      setAuth({ isAuthenticated: false, user: null, token: null });
    }
  }, []);

  const handleLoginSuccess = (token: string, user: User) => {
    localStorage.setItem('serverdash_token', token);
    setAuth({ isAuthenticated: true, user, token });
  };

  const handleLogout = () => {
    localStorage.removeItem('serverdash_token');
    setAuth({ isAuthenticated: false, user: null, token: null });
  };

  const handleCredentialsUpdated = (newToken: string) => {
    localStorage.setItem('serverdash_token', newToken);
    setAuth((prev) => ({ ...prev, token: newToken }));
  };

  const toggleLang = () => {
    setLang((prev) => (prev === 'fa' ? 'en' : 'fa'));
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Full-page login when not authenticated
  if (!auth.isAuthenticated) {
    return (
      <div
        className="min-h-screen bg-neutral-100 dark:bg-[#0A0A0B] text-neutral-900 dark:text-gray-200 font-sans transition-colors duration-200"
        dir={lang === 'fa' ? 'rtl' : 'ltr'}
      >
        <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>}>
          <LoginModal lang={lang} onLoginSuccess={handleLoginSuccess} />
        </Suspense>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-neutral-100 dark:bg-[#0A0A0B] text-neutral-900 dark:text-gray-200 font-sans transition-colors duration-200"
      dir={lang === 'fa' ? 'rtl' : 'ltr'}
    >
      <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div></div>}>
        {/* Top Navbar */}
        <Navbar
          user={auth.user}
          token={auth.token}
          lang={lang}
          theme={theme}
          onToggleLang={toggleLang}
          onToggleTheme={toggleTheme}
          onOpenSecurity={() => setIsSecurityOpen(true)}
          onOpenDocumentation={() => setIsDocOpen(true)}
          onOpenTelegramBot={() => setIsTelegramBotOpen(true)}
          onLogout={handleLogout}
        />

        {/* Main Layout Area */}
        <div className="flex flex-col md:flex-row min-h-[calc(100vh-3rem)] sm:min-h-[calc(100vh-3.5rem)] md:min-h-[calc(100vh-4rem)]">
          {/* Sidebar */}
          <Sidebar activeTab={activeTab} onTabChange={setActiveTab} lang={lang} />

          {/* Content Pane */}
          <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-y-auto">
            <div className={activeTab === 'monitoring' ? '' : 'hidden'}>
              <MonitoringDashboard token={auth.token} lang={lang} active={activeTab === 'monitoring'} />
            </div>
            <div className={activeTab === 'youtube' ? '' : 'hidden'}>
              <YouTubeManager lang={lang} token={auth.token} />
            </div>
            <div className={activeTab === 'terminal' ? '' : 'hidden'}>
              <TerminalView token={auth.token} lang={lang} />
            </div>
            <div className={activeTab === 'fileManager' ? '' : 'hidden'}>
              <FileManager token={auth.token} lang={lang} />
            </div>
            <div className={activeTab === 'processManager' ? '' : 'hidden'}>
              <ProcessManager token={auth.token} lang={lang} />
            </div>

            <div className={activeTab === 'vpnManager' ? '' : 'hidden'}>
              <VpnManager token={auth.token} lang={lang} />
            </div>
          </main>
        </div>

        {/* Telegram Bot Modal Dialog */}
        <TelegramBotModal
          isOpen={isTelegramBotOpen}
          onClose={() => setIsTelegramBotOpen(false)}
          token={auth.token}
          lang={lang}
        />

        {/* Quick Documentation Modal Dialog */}
        <DocumentationModal
          isOpen={isDocOpen}
          onClose={() => setIsDocOpen(false)}
          lang={lang}
        />

        {/* Security Credentials Modal */}
        <SecurityModal
          isOpen={isSecurityOpen}
          onClose={() => setIsSecurityOpen(false)}
          token={auth.token}
          lang={lang}
          onCredentialsUpdated={handleCredentialsUpdated}
        />
      </Suspense>
    </div>
  );
}
