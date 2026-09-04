import React, { useState, useRef, useEffect } from 'react';
import {
  Terminal as TerminalIcon,
  Trash2,
  Copy,
  Check,
  CornerDownLeft,
  Sparkles,
  LogOut,
  Radio,
  ArrowDown,
  Plus,
  X,
  Edit2,
  CheckCheck,
  Layers,
  SquareTerminal,
  ZoomIn,
  ZoomOut,
  Type,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Language, TerminalTab, TerminalHistoryItem } from '../types';
import { translations } from '../locales/translations';

interface TerminalViewProps {
  token: string | null;
  lang: Language;
}

export const FONT_SIZES = [
  { size: 'xs', label: '10px', classPre: 'text-[10px]', classCmd: 'text-[10px]' },
  { size: 'sm', label: '11px', classPre: 'text-[11px]', classCmd: 'text-[11px]' },
  { size: 'base', label: '12px', classPre: 'text-xs', classCmd: 'text-xs' },
  { size: 'md', label: '13px', classPre: 'text-[13px]', classCmd: 'text-[13px]' },
  { size: 'lg', label: '14px', classPre: 'text-sm', classCmd: 'text-sm' },
  { size: 'xl', label: '16px', classPre: 'text-base', classCmd: 'text-base' },
  { size: '2xl', label: '18px', classPre: 'text-lg', classCmd: 'text-lg' }
];

const createDefaultTab = (id: string, index: number, defaultCwd: string = '~'): TerminalTab => ({
  id,
  title: `Terminal ${index}`,
  cwd: defaultCwd,
  history: [
    {
      id: `init_${id}`,
      command: 'uname -a && uptime',
      output: 'Linux serverdash 6.6.0-x86_64 #1 SMP PREEMPT_DYNAMIC GNU/Linux\nSystem uptime: 12:34:56 up 5 days, 2 user, load average: 0.12, 0.15, 0.10',
      cwd: defaultCwd,
      timestamp: new Date().toLocaleTimeString(),
      isRunning: false
    }
  ],
  command: '',
  isExecuting: false,
  currentProcessId: null,
  executedCommandsList: ['uname -a && uptime'],
  commandHistoryIndex: -1,
  autoScroll: true
});

export const TerminalView: React.FC<TerminalViewProps> = ({ token, lang }) => {
  const t = translations[lang];
  const isFa = lang === 'fa';

  // Global default server CWD
  const [serverDefaultCwd, setServerDefaultCwd] = useState('~');

  // Multi-tab state
  const [tabs, setTabs] = useState<TerminalTab[]>([
    createDefaultTab('tab_1', 1, '~')
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab_1');
  const [nextTabCounter, setNextTabCounter] = useState(2);

  // Tab renaming state
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabTitle, setEditingTabTitle] = useState('');

  // Per-tab abort controllers for parallel execution
  const abortControllersRef = useRef<{ [tabId: string]: AbortController }>({});
  const draftCommandRefs = useRef<{ [tabId: string]: string }>({});

  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Terminal font size zoom state
  const [fontSizeIdx, setFontSizeIdx] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('terminal_font_size_idx');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed < FONT_SIZES.length) {
          return parsed;
        }
      }
    } catch (e) {}
    return 3; // Default 13px
  });

  const handleZoomIn = () => {
    setFontSizeIdx(prev => {
      const next = Math.min(prev + 1, FONT_SIZES.length - 1);
      try { localStorage.setItem('terminal_font_size_idx', next.toString()); } catch (e) {}
      return next;
    });
  };

  const handleZoomOut = () => {
    setFontSizeIdx(prev => {
      const next = Math.max(prev - 1, 0);
      try { localStorage.setItem('terminal_font_size_idx', next.toString()); } catch (e) {}
      return next;
    });
  };

  const handleResetZoom = () => {
    setFontSizeIdx(3);
    try { localStorage.setItem('terminal_font_size_idx', '3'); } catch (e) {}
  };

  const toggleFullscreen = () => {
    setIsFullscreen(prev => !prev);
  };

  // Mobile touch & selection interaction tracking
  const isTouchingRef = useRef<boolean>(false);
  const isSelectingRef = useRef<boolean>(false);
  const touchEndTimeoutRef = useRef<any>(null);
  const scrollDebounceTimerRef = useRef<any>(null);

  // Track native text selection on mobile and desktop
  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection()?.toString();
      isSelectingRef.current = !!(sel && sel.trim().length > 0);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  // Fetch initial terminal CWD on mount
  useEffect(() => {
    fetch('/api/terminal/cwd', {
      headers: { 'x-auth-token': token || '' }
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.cwd) {
          setServerDefaultCwd(data.cwd);
          setTabs(prev => prev.map(tab => {
            if (tab.id === 'tab_1' && tab.cwd === '~') {
              return {
                ...tab,
                cwd: data.cwd,
                history: tab.history.map(h => h.id === 'init_tab_1' ? { ...h, cwd: data.cwd } : h)
              };
            }
            return tab;
          }));
        }
      })
      .catch(() => {});
  }, [token]);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const ctrlAPressedRef = useRef<boolean>(false);
  const ctrlATimeoutRef = useRef<any>(null);

  // Contained scroll-to-bottom without whole-window jumping
  const scrollToBottom = (instant = false) => {
    if (!terminalScrollRef.current) return;
    const el = terminalScrollRef.current;
    if (instant) {
      el.scrollTop = el.scrollHeight;
    } else {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // Auto-scroll when active tab's history updates
  useEffect(() => {
    // If user is currently touching, dragging, or selecting text on mobile/desktop, do not interrupt
    if (isTouchingRef.current || isSelectingRef.current) return;
    const sel = window.getSelection()?.toString();
    if (sel && sel.trim().length > 0) return;

    if (activeTab?.autoScroll) {
      scrollToBottom(false);
    }
  }, [activeTab?.history, activeTab?.autoScroll, activeTabId]);

  // Focus rename input on editing
  useEffect(() => {
    if (editingTabId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingTabId]);

  // Helper to update specific tab
  const updateTab = (tabId: string, updater: (prevTab: TerminalTab) => TerminalTab) => {
    setTabs(prev => prev.map(tab => tab.id === tabId ? updater(tab) : tab));
  };

  const handleTerminalScroll = (e: React.UIEvent<HTMLDivElement>) => {
    // Never trigger component re-render while user is actively touching or selecting text
    if (isTouchingRef.current || isSelectingRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight <= 30;

    if (scrollDebounceTimerRef.current) clearTimeout(scrollDebounceTimerRef.current);
    scrollDebounceTimerRef.current = setTimeout(() => {
      if (isTouchingRef.current || isSelectingRef.current) return;
      if (activeTab && activeTab.autoScroll !== isAtBottom) {
        updateTab(activeTab.id, prev => ({ ...prev, autoScroll: isAtBottom }));
      }
    }, 150);
  };

  // Add new tab
  const handleAddNewTab = () => {
    if (tabs.length >= 10) {
      alert(isFa ? 'حداکثر ۱۰ تب می‌توانید به صورت همزمان باز داشته باشید.' : 'Maximum 10 simultaneous terminal tabs allowed.');
      return;
    }
    const newId = `tab_${Date.now()}`;
    const initialCwd = activeTab ? activeTab.cwd : serverDefaultCwd;
    const newTab = createDefaultTab(newId, nextTabCounter, initialCwd);
    setNextTabCounter(prev => prev + 1);
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Close tab
  const handleCloseTab = (e: React.MouseEvent, tabIdToClose: string) => {
    e.stopPropagation();
    const tabToClose = tabs.find(t => t.id === tabIdToClose);
    if (!tabToClose) return;

    if (tabToClose.isExecuting) {
      const confirmClose = window.confirm(
        t.confirmCloseRunningTab || 'دستوری در این تب در حال اجراست. آیا از بستن تب مطمئنید؟ (دستور در پس‌زمینه ادامه خواهد یافت)'
      );
      if (!confirmClose) return;
      // Abort frontend stream only (process runs in background)
      if (abortControllersRef.current[tabIdToClose]) {
        abortControllersRef.current[tabIdToClose].abort();
        delete abortControllersRef.current[tabIdToClose];
      }
    }

    if (tabs.length === 1) {
      // Reset only remaining tab
      const freshTab = createDefaultTab('tab_1', 1, serverDefaultCwd);
      setTabs([freshTab]);
      setActiveTabId('tab_1');
      return;
    }

    const filteredTabs = tabs.filter(t => t.id !== tabIdToClose);
    setTabs(filteredTabs);

    if (activeTabId === tabIdToClose) {
      const closingIndex = tabs.findIndex(t => t.id === tabIdToClose);
      const nextActive = filteredTabs[Math.min(closingIndex, filteredTabs.length - 1)];
      if (nextActive) {
        setActiveTabId(nextActive.id);
      }
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Start editing tab title
  const handleStartRename = (e: React.MouseEvent, tabId: string, currentTitle: string) => {
    e.stopPropagation();
    setEditingTabId(tabId);
    setEditingTabTitle(currentTitle);
  };

  const handleSaveRename = (tabId: string) => {
    if (editingTabTitle.trim()) {
      updateTab(tabId, prev => ({ ...prev, title: editingTabTitle.trim() }));
    }
    setEditingTabId(null);
  };

  // Global key listener for shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Tab switching with Alt + Number (Alt + 1, Alt + 2...)
      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        const num = parseInt(e.key, 10);
        if (!isNaN(num) && num >= 1 && num <= tabs.length) {
          e.preventDefault();
          setActiveTabId(tabs[num - 1].id);
          return;
        }
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault();
          handleAddNewTab();
          return;
        }
        if (e.key === 'w' || e.key === 'W') {
          e.preventDefault();
          if (activeTab) {
            handleCloseTab({ stopPropagation: () => {} } as any, activeTab.id);
          }
          return;
        }
      }

      // Track Ctrl+A sequence for Detach (Ctrl+A then D)
      if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
        ctrlAPressedRef.current = true;
        if (ctrlATimeoutRef.current) clearTimeout(ctrlATimeoutRef.current);
        ctrlATimeoutRef.current = setTimeout(() => {
          ctrlAPressedRef.current = false;
        }, 1500);
      }

      if (e.key === 'd' || e.key === 'D') {
        if (ctrlAPressedRef.current || (e.ctrlKey && (e.key === 'd' || e.key === 'D'))) {
          e.preventDefault();
          ctrlAPressedRef.current = false;
          if (activeTab?.isExecuting) {
            handleDetach(activeTab.id);
          }
        }
      }

      // Ctrl + C shortcut: If text is highlighted, allow default copy; otherwise Interrupt active running process
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        const sel = window.getSelection()?.toString();
        if (sel && sel.trim().length > 0) {
          // Allow native browser copy without interrupting
          return;
        }

        if (activeTab?.isExecuting) {
          e.preventDefault();
          handleInterrupt(activeTab.id);
        }
      }

      if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        setIsFullscreen(false);
        return;
      }

      if (e.key === 'F11' || (e.altKey && e.key === 'Enter')) {
        e.preventDefault();
        toggleFullscreen();
        return;
      }

      // Font size zoom shortcuts: Ctrl + '+' / '=' (Zoom in), Ctrl + '-' (Zoom out), Ctrl + '0' (Reset)
      if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        handleZoomIn();
        return;
      }
      if (e.ctrlKey && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        handleZoomOut();
        return;
      }
      if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        handleResetZoom();
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [tabs, activeTabId, activeTab]);

  // Execute command on target tab
  const executeCommand = async (cmdToRun?: string, targetTabId: string = activeTabId) => {
    const tab = tabs.find(t => t.id === targetTabId);
    if (!tab) return;

    const finalCmd = cmdToRun !== undefined ? cmdToRun : tab.command;
    if (!finalCmd.trim() || tab.isExecuting) return;

    const trimmed = finalCmd.trim();

    // Update command history for this tab
    updateTab(targetTabId, prev => ({
      ...prev,
      command: '',
      commandHistoryIndex: -1,
      isExecuting: true,
      executedCommandsList: prev.executedCommandsList.length > 0 && prev.executedCommandsList[prev.executedCommandsList.length - 1] === trimmed
        ? prev.executedCommandsList
        : [...prev.executedCommandsList, trimmed]
    }));

    draftCommandRefs.current[targetTabId] = '';

    const itemId = 'item_' + Date.now();
    updateTab(targetTabId, prev => ({
      ...prev,
      history: [
        ...prev.history,
        {
          id: itemId,
          command: trimmed,
          output: '',
          cwd: prev.cwd,
          timestamp: new Date().toLocaleTimeString(),
          isRunning: true
        }
      ]
    }));

    const controller = new AbortController();
    abortControllersRef.current[targetTabId] = controller;

    try {
      const res = await fetch('/api/terminal/exec-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ command: trimmed, cwd: tab.cwd }),
        signal: controller.signal
      });

      if (!res.ok || !res.body) {
        throw new Error(`Execution request failed: ${res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmedLine.slice(6));
              if (data.type === 'init') {
                updateTab(targetTabId, prev => ({
                  ...prev,
                  cwd: data.cwd || prev.cwd,
                  currentProcessId: data.processId || prev.currentProcessId
                }));
              } else if (data.type === 'output') {
                updateTab(targetTabId, prev => ({
                  ...prev,
                  history: prev.history.map(item =>
                    item.id === itemId
                      ? { ...item, output: item.output + data.text }
                      : item
                  )
                }));
              } else if (data.type === 'exit') {
                updateTab(targetTabId, prev => ({
                  ...prev,
                  history: prev.history.map(item =>
                    item.id === itemId
                      ? { ...item, isRunning: false, exitCode: data.exitCode }
                      : item
                  )
                }));
              }
            } catch (err) {
              console.error('Failed to parse SSE payload:', err);
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        // User detached manually
      } else {
        updateTab(targetTabId, prev => ({
          ...prev,
          history: prev.history.map(item =>
            item.id === itemId
              ? {
                  ...item,
                  output: item.output + `\n[Error: ${e.message}]`,
                  isRunning: false
                }
              : item
          )
        }));
      }
    } finally {
      updateTab(targetTabId, prev => ({
        ...prev,
        isExecuting: false,
        currentProcessId: null
      }));
      delete abortControllersRef.current[targetTabId];
      if (activeTabId === targetTabId) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }
  };

  // Detach log viewer (Ctrl+A+D)
  const handleDetach = (tabId: string = activeTabId) => {
    if (abortControllersRef.current[tabId]) {
      abortControllersRef.current[tabId].abort();
      delete abortControllersRef.current[tabId];
    }
    updateTab(tabId, prev => ({
      ...prev,
      isExecuting: false,
      currentProcessId: null,
      history: prev.history.map(item =>
        item.isRunning
          ? {
              ...item,
              isRunning: false,
              output: item.output + '\n\n[🔒 برنامه در پس‌زمینه در حال اجراست | جهت مشاهده لاگ زنده به بخش "پردازش‌ها و اسکریپت‌ها" بروید (Ctrl+A+D)]'
            }
          : item
      )
    }));
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Send interactive STDIN input to a running process
  const sendInputToRunningProcess = async (inputStr: string, targetTabId: string = activeTabId) => {
    const tab = tabs.find(t => t.id === targetTabId);
    if (!tab) return;

    const trimmedInput = inputStr;

    // Clear input field and update history with user input line
    updateTab(targetTabId, prev => ({
      ...prev,
      command: '',
      history: prev.history.map(item =>
        item.isRunning
          ? { ...item, output: item.output + `${trimmedInput}\n` }
          : item
      )
    }));

    try {
      await fetch('/api/terminal/input', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({
          processId: tab.currentProcessId,
          input: trimmedInput
        })
      });
    } catch (err) {
      console.error('Failed to send terminal input:', err);
    } finally {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  // Interrupt process (Ctrl+C)
  const handleInterrupt = async (tabId: string = activeTabId) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    try {
      if (abortControllersRef.current[tabId]) {
        abortControllersRef.current[tabId].abort();
        delete abortControllersRef.current[tabId];
      }
      await fetch('/api/terminal/interrupt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token || ''
        },
        body: JSON.stringify({ processId: tab.currentProcessId })
      });

      updateTab(tabId, prev => ({
        ...prev,
        isExecuting: false,
        currentProcessId: null,
        history: prev.history.map(item =>
          item.isRunning
            ? {
                ...item,
                isRunning: false,
                output: item.output + '\n^C\n[توقف دستور توسط کاربر | Process interrupted (SIGINT)]'
              }
            : item
        )
      }));
    } catch (e) {
      console.error('Failed to interrupt:', e);
    } finally {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleClear = (tabId: string = activeTabId) => {
    updateTab(tabId, prev => ({ ...prev, history: [] }));
  };

  const navigateHistory = (direction: 'up' | 'down') => {
    if (!activeTab || activeTab.executedCommandsList.length === 0) return;

    const list = activeTab.executedCommandsList;
    const currentIndex = activeTab.commandHistoryIndex;

    if (direction === 'up') {
      if (currentIndex === -1) {
        draftCommandRefs.current[activeTab.id] = activeTab.command;
      }
      const nextIndex = currentIndex < list.length - 1 ? currentIndex + 1 : currentIndex;
      const targetCmd = list[list.length - 1 - nextIndex] || '';

      updateTab(activeTab.id, prev => ({
        ...prev,
        commandHistoryIndex: nextIndex,
        command: targetCmd
      }));

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = inputRef.current.selectionEnd = targetCmd.length;
        }
      }, 0);
    } else if (direction === 'down') {
      if (currentIndex > 0) {
        const nextIndex = currentIndex - 1;
        const targetCmd = list[list.length - 1 - nextIndex] || '';
        updateTab(activeTab.id, prev => ({
          ...prev,
          commandHistoryIndex: nextIndex,
          command: targetCmd
        }));
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.selectionStart = inputRef.current.selectionEnd = targetCmd.length;
          }
        }, 0);
      } else if (currentIndex === 0) {
        const targetCmd = draftCommandRefs.current[activeTab.id] || '';
        updateTab(activeTab.id, prev => ({
          ...prev,
          commandHistoryIndex: -1,
          command: targetCmd
        }));
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.selectionStart = inputRef.current.selectionEnd = targetCmd.length;
          }
        }, 0);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ctrl + L (Clear terminal screen)
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      handleClear();
      return;
    }

    // Arrow Up (History previous)
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      navigateHistory('up');
      return;
    }

    // Arrow Down (History next)
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      navigateHistory('down');
      return;
    }

    // Tab autocomplete
    if (e.key === 'Tab') {
      e.preventDefault();
      const suggestions = [
        'python3 terminal_bot.py',
        'systemctl status',
        'ls -la',
        'top',
        'df -h',
        'free -m',
        'ps aux',
        'netstat -tuln',
        'htop',
        'uptime',
        'journalctl -n 20'
      ];
      const matched = suggestions.find(s => s.startsWith(activeTab.command));
      if (matched) {
        updateTab(activeTab.id, prev => ({ ...prev, command: matched }));
      }
      return;
    }

    // Enter key execution or input submission
    if (e.key === 'Enter') {
      if (activeTab?.isExecuting) {
        sendInputToRunningProcess(activeTab.command, activeTab.id);
      } else {
        executeCommand();
      }
    }
  };

  const handleCopyLogs = () => {
    if (!activeTab) return;
    const fullText = activeTab.history
      .map(item => `[${item.timestamp}] ${item.cwd}$ ${item.command}\n${item.output}`)
      .join('\n\n');
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const quickPills = [
    { label: 'python3 terminal_bot.py', cmd: 'python3 terminal_bot.py' },
    { label: 'ls -la', cmd: 'ls -la' },
    { label: 'df -h', cmd: 'df -h' },
    { label: 'free -m', cmd: 'free -m' },
    { label: 'ps aux | head -n 10', cmd: 'ps aux | head -n 10' },
    { label: 'uptime', cmd: 'uptime' }
  ];

  const runningTabsCount = tabs.filter(t => t.isExecuting).length;

  return (
    <div className={`transition-all duration-200 ${
      isFullscreen
        ? 'fixed inset-0 z-[100] bg-[#09090b] flex flex-col p-1.5 sm:p-3 w-screen h-[100dvh] overflow-hidden'
        : 'space-y-3'
    }`}>
      {/* Top Quick Actions Bar: Quick Pills & Info (hidden in fullscreen to maximize terminal height) */}
      {!isFullscreen && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs select-none">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-none">
            <span className="text-neutral-500 shrink-0 flex items-center gap-1 font-medium">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              {t.quickCommands}
            </span>
            {quickPills.map(p => (
              <button
                key={p.cmd}
                onClick={() => executeCommand(p.cmd)}
                disabled={activeTab?.isExecuting}
                className="px-2.5 py-1 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-white/5 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 font-mono text-neutral-700 dark:text-gray-300 disabled:opacity-40 transition shrink-0 cursor-pointer text-xs"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Running tabs badge */}
          {runningTabsCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-xs font-semibold">
              <Radio className="h-3.5 w-3.5 animate-pulse text-amber-500" />
              <span>
                {isFa ? `${runningTabsCount} تب در حال اجرای دستور` : `${runningTabsCount} active command(s)`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Live Running Banner if Current Tab is Attached */}
      {activeTab?.isExecuting && (
        <div className={`p-2.5 sm:p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-semibold flex items-center justify-between gap-3 shadow-md select-none shrink-0 ${isFullscreen ? 'mb-1.5' : ''}`}>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 animate-ping text-amber-500" />
            <span>{t.runningProcess || 'برنامه در حال اجراست... لاگ‌ها به صورت زنده نمایش داده می‌شوند.'}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleInterrupt(activeTab.id)}
              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-500 transition text-xs shrink-0 cursor-pointer flex items-center gap-1"
              title="Ctrl+C"
            >
              <span>توقف (Ctrl+C)</span>
            </button>
            <button
              onClick={() => handleDetach(activeTab.id)}
              className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 transition text-xs shrink-0 cursor-pointer flex items-center gap-1"
              title="Ctrl+A+D"
            >
              <LogOut className="h-3 w-3" />
              <span>خروج از لاگ (Ctrl+A+D)</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Terminal Outer Container */}
      <div className={`rounded-2xl border border-neutral-200 dark:border-white/10 bg-neutral-900 dark:bg-[#121214] shadow-2xl overflow-hidden flex flex-col ${
        isFullscreen ? 'flex-1 h-full min-h-0' : ''
      }`}>

        {/* 📑 MULTI-TAB STRIP HEADER */}
        <div className="bg-neutral-950/80 border-b border-white/10 flex items-center justify-between px-2 pt-2 gap-2 select-none overflow-x-auto scrollbar-none">
          {/* Tabs List */}
          <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto scrollbar-none py-0.5">
            {tabs.map((tab, idx) => {
              const isActive = tab.id === activeTabId;
              const isEditing = editingTabId === tab.id;

              return (
                <div
                  key={tab.id}
                  onClick={() => {
                    setActiveTabId(tab.id);
                    setTimeout(() => inputRef.current?.focus(), 50);
                  }}
                  onDoubleClick={(e) => handleStartRename(e, tab.id, tab.title)}
                  className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-t-xl text-xs font-mono transition-all cursor-pointer shrink-0 max-w-[190px] sm:max-w-[240px] border-t border-x ${
                    isActive
                      ? 'bg-neutral-900 dark:bg-[#121214] border-white/15 text-neutral-100 shadow-md font-semibold'
                      : 'bg-neutral-900/40 border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/70'
                  }`}
                  title={`${tab.title} (${tab.cwd}) - Alt+${idx + 1}`}
                >
                  {/* Status indicator / Live icon */}
                  {tab.isExecuting ? (
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                  ) : (
                    <SquareTerminal className={`h-3.5 w-3.5 ${isActive ? 'text-emerald-400' : 'text-neutral-500'}`} />
                  )}

                  {/* Title or Inline Edit Input */}
                  {isEditing ? (
                    <div className="flex items-center gap-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={renameInputRef}
                        type="text"
                        value={editingTabTitle}
                        onChange={(e) => setEditingTabTitle(e.target.value)}
                        onBlur={() => handleSaveRename(tab.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(tab.id);
                          if (e.key === 'Escape') setEditingTabId(null);
                        }}
                        className="w-24 px-1 py-0.5 text-xs bg-neutral-800 border border-blue-500 rounded text-neutral-100 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveRename(tab.id)}
                        className="p-0.5 text-emerald-400 hover:text-emerald-300"
                      >
                        <CheckCheck className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <span className="truncate">{tab.title}</span>
                  )}

                  {/* Tab Number Hint (Alt+1..9) */}
                  <span className="text-[9px] text-neutral-500 opacity-60 hidden sm:inline">
                    {idx < 9 ? `Alt+${idx + 1}` : ''}
                  </span>

                  {/* Action Icons: Edit & Close */}
                  <div className="flex items-center gap-0.5 ml-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={(e) => handleStartRename(e, tab.id, tab.title)}
                        className="p-0.5 rounded hover:bg-white/10 text-neutral-400 hover:text-neutral-200 transition"
                        title={t.renameTab || 'تغییر نام تب'}
                      >
                        <Edit2 className="h-2.5 w-2.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleCloseTab(e, tab.id)}
                      className="p-0.5 rounded hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 transition"
                      title={t.closeTab || 'بستن تب (Alt+W)'}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* ➕ New Tab Button */}
            <button
              type="button"
              onClick={handleAddNewTab}
              className="p-1.5 ml-1 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/5 transition flex items-center gap-1 text-xs shrink-0 cursor-pointer shadow-sm"
              title={t.newTab ? `${t.newTab} (Alt+T)` : 'تب جدید (Alt+T)'}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="text-[11px] hidden md:inline">{t.newTab || 'تب جدید'}</span>
            </button>
          </div>

          {/* Right Tab Controls: Fullscreen, Zoom, Copy, Clear */}
          <div className="flex items-center gap-1 sm:gap-1.5 pb-1 shrink-0 text-xs">
            {/* Fullscreen Toggle Button */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isFullscreen
                  ? 'bg-blue-600/30 border-blue-500/40 text-blue-300 hover:bg-blue-600/50'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 text-neutral-300 hover:text-white'
              }`}
              title={isFullscreen ? (t.exitFullscreen || 'خروج از تمام‌صفحه (Esc / F11)') : (t.fullscreen || 'حالت تمام‌صفحه (F11)')}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>

            {/* Font Size Zoom Controls */}
            <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-0.5 text-xs select-none">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={fontSizeIdx <= 0}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-30 text-neutral-300 hover:text-white transition cursor-pointer"
                title={t.zoomOut || 'کوچک‌نمایی قلم (Ctrl+-)'}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                className="px-1.5 py-0.5 text-[10px] font-mono font-medium text-neutral-300 hover:text-white hover:bg-white/10 rounded transition cursor-pointer"
                title={t.resetFontSize || 'اندازه پیش‌فرض قلم (Ctrl+0)'}
              >
                {FONT_SIZES[fontSizeIdx].label}
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={fontSizeIdx >= FONT_SIZES.length - 1}
                className="p-1 rounded hover:bg-white/10 disabled:opacity-30 text-neutral-300 hover:text-white transition cursor-pointer"
                title={t.zoomIn || 'بزرگ‌نمایی قلم (Ctrl++)'}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyLogs}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition cursor-pointer"
              title={t.copyOutput || 'کپی خروجی تب فعلی'}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => handleClear(activeTab?.id)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-neutral-300 hover:text-rose-400 transition cursor-pointer"
              title={t.clearTerminal || 'پاکسازی صفحه (Ctrl+L)'}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Console View Area */}
        <div
          className={`text-neutral-100 font-mono text-sm p-3 sm:p-4 flex flex-col overflow-hidden cursor-text w-full max-w-full relative select-none ${
            isFullscreen ? 'flex-1 h-full min-h-0' : 'h-[calc(100vh-19rem)] min-h-[380px] md:h-[520px]'
          }`}
          dir="ltr"
          onClick={(e) => {
            if (isSelectingRef.current) return;
            const sel = window.getSelection()?.toString().trim();
            if (sel && sel.length > 0) return;
            const target = e.target as HTMLElement;
            if (target.closest('button, input, textarea, a, select')) return;
            inputRef.current?.focus({ preventScroll: true });
          }}
        >
          {/* Terminal Console Subheader Info */}
          <div className="flex items-center justify-between pb-2 mb-2 sm:pb-3 sm:mb-3 border-b border-white/10 shrink-0 text-xs text-neutral-400 select-none">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex gap-1.5 shrink-0">
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              </div>
              <span className="ml-1 sm:ml-2 font-mono text-[11px] sm:text-xs text-gray-400 truncate max-w-[180px] sm:max-w-md select-none">
                root@linux-server:~ {activeTab?.cwd}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[9px] sm:text-[10px] text-gray-500 uppercase tracking-widest shrink-0 ml-1 sm:ml-2 select-none">
              <span className="font-semibold text-neutral-400">{activeTab?.title}</span>
              <span>•</span>
              <span>{activeTab?.isExecuting ? '🔴 Stream Attached' : '🟢 Ready'}</span>
            </div>
          </div>

          {/* Scrollable Command Output Area */}
          <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
            <div
              ref={terminalScrollRef}
              onScroll={handleTerminalScroll}
              onTouchStart={() => {
                isTouchingRef.current = true;
                if (touchEndTimeoutRef.current) clearTimeout(touchEndTimeoutRef.current);
              }}
              onTouchEnd={() => {
                if (touchEndTimeoutRef.current) clearTimeout(touchEndTimeoutRef.current);
                touchEndTimeoutRef.current = setTimeout(() => {
                  isTouchingRef.current = false;
                }, 500);
              }}
              className="flex-1 overflow-y-auto space-y-3 sm:space-y-4 pr-1 scrollbar-thin scrollbar-thumb-neutral-800 w-full max-w-full overscroll-contain touch-pan-y select-text cursor-text"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {activeTab?.history.map((item) => (
                <div key={item.id} className="space-y-1 w-full max-w-full overflow-hidden select-text">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-neutral-400 text-xs select-text">
                    <div className="flex items-center gap-1 min-w-0 shrink-0 text-[11px] sm:text-xs">
                      <span className="text-emerald-400 font-bold shrink-0">root@server</span>
                      <span>:</span>
                      <span className="text-blue-400 font-medium truncate max-w-[90px] sm:max-w-[280px]" title={item.cwd}>
                        {item.cwd}
                      </span>
                      <span className="text-neutral-200">$</span>
                    </div>
                    <span className={`text-neutral-100 font-semibold break-all ${FONT_SIZES[fontSizeIdx].classCmd} font-mono select-text cursor-text selection:bg-blue-600/50 selection:text-white`}>
                      {item.command}
                    </span>
                    {item.isRunning && (
                      <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full animate-pulse shrink-0 select-none">
                        <Radio className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> LIVE
                      </span>
                    )}
                    <span className="text-neutral-600 text-[10px] sm:text-[11px] font-sans ml-auto shrink-0 select-none">
                      {item.timestamp}
                    </span>
                  </div>

                  <pre className={`text-neutral-300 whitespace-pre-wrap break-words ${FONT_SIZES[fontSizeIdx].classPre} pl-2 border-l-2 border-neutral-800 bg-neutral-900/40 p-2 sm:p-2.5 rounded-r-lg font-mono overflow-x-auto max-w-full select-text cursor-text selection:bg-blue-600/50 selection:text-white`}>
                    {item.output || (item.isRunning ? 'در حال دریافت لاگ‌های اولیه...' : 'دستور بدون خروجی متنی اجرا شد.')}
                  </pre>
                </div>
              ))}
            </div>

            {/* Scroll to bottom floating button */}
            {!activeTab?.autoScroll && (
              <button
                type="button"
                onClick={() => {
                  if (activeTab) updateTab(activeTab.id, prev => ({ ...prev, autoScroll: true }));
                  scrollToBottom(false);
                }}
                className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-sans px-3 py-1 rounded-full shadow-lg flex items-center gap-1.5 opacity-90 transition cursor-pointer border border-white/20 z-20"
              >
                <ArrowDown className="h-3 w-3" />
                <span>{isFa ? 'اسکرول به انتهای خروجی' : 'Scroll to Bottom'}</span>
              </button>
            )}
          </div>

          {/* Mobile & Quick Keys Toolbar */}
          <div className="pt-2 border-t border-white/5 flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-xs shrink-0 select-none">
            <span className="text-[10px] text-neutral-500 font-mono shrink-0 px-1">KEYS:</span>
            {[
              { label: '↑', action: () => navigateHistory('up') },
              { label: '↓', action: () => navigateHistory('down') },
              { label: 'y (بله)', action: () => activeTab?.isExecuting ? sendInputToRunningProcess('y', activeTab.id) : updateTab(activeTab.id, prev => ({ ...prev, command: prev.command + 'y' })) },
              { label: 'n (خیر)', action: () => activeTab?.isExecuting ? sendInputToRunningProcess('n', activeTab.id) : updateTab(activeTab.id, prev => ({ ...prev, command: prev.command + 'n' })) },
              { label: '↵ Enter', action: () => activeTab?.isExecuting ? sendInputToRunningProcess(activeTab.command || '', activeTab.id) : executeCommand() },
              { label: '+Tab', action: handleAddNewTab },
              { label: 'A-', action: handleZoomOut },
              { label: 'A+', action: handleZoomIn },
              { label: '|', action: () => updateTab(activeTab.id, prev => ({ ...prev, command: prev.command + '|' })) },
              { label: '/', action: () => updateTab(activeTab.id, prev => ({ ...prev, command: prev.command + '/' })) },
              { label: 'Tab', action: () => handleKeyDown({ key: 'Tab', preventDefault: () => {} } as any) },
              { label: 'Ctrl+C', action: () => handleInterrupt(activeTab.id) },
              { label: 'Ctrl+A+D', action: () => handleDetach(activeTab.id) },
              { label: 'clear', action: () => handleClear(activeTab.id) }
            ].map((k, idx) => (
              <button
                key={idx}
                type="button"
                onClick={k.action}
                className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 active:bg-blue-600 text-neutral-300 hover:text-white font-mono text-[11px] border border-white/10 shrink-0 cursor-pointer transition"
              >
                {k.label}
              </button>
            ))}
          </div>

          {/* Active Input Line */}
          <div className="flex items-center gap-1.5 sm:gap-2 pt-2 border-t border-white/5 w-full max-w-full overflow-hidden shrink-0">
            <div className="flex items-center gap-1 text-xs shrink-0 select-none">
              <span className="text-emerald-400 font-bold text-[11px] sm:text-xs">root@server</span>
              <span className="text-neutral-400">:</span>
              <span className="text-blue-400 font-medium truncate max-w-[70px] sm:max-w-[200px] text-[11px] sm:text-xs" title={activeTab?.cwd}>
                {activeTab?.cwd}
              </span>
              <span className="text-neutral-200">$</span>
            </div>
            <input
              ref={inputRef}
              type="text"
              value={activeTab?.command || ''}
              onChange={(e) => updateTab(activeTab.id, prev => ({ ...prev, command: e.target.value }))}
              onKeyDown={handleKeyDown}
              placeholder={
                activeTab?.isExecuting
                  ? (isFa ? 'ورودی/پاسخ دستور را تایپ کرده و Enter بزنید...' : 'Type input/response and press Enter...')
                  : t.cmdPlaceholder
              }
              className={`flex-1 min-w-[60px] bg-transparent border-none outline-none font-mono ${FONT_SIZES[fontSizeIdx].classCmd} focus:ring-0 ${
                activeTab?.isExecuting ? 'text-amber-300 placeholder-amber-500/70' : 'text-neutral-100 placeholder-neutral-500'
              }`}
              autoFocus
            />
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto select-none">
              {activeTab?.isExecuting && (
                <button
                  type="button"
                  onClick={() => handleDetach(activeTab.id)}
                  className="px-2 py-1 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-xs font-sans transition cursor-pointer flex items-center gap-1 shrink-0"
                  title="Ctrl+A+D"
                >
                  <LogOut className="h-3 w-3" />
                  <span className="hidden sm:inline">جدا شدن</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (activeTab?.isExecuting) {
                    sendInputToRunningProcess(activeTab.command, activeTab.id);
                  } else {
                    executeCommand();
                  }
                }}
                disabled={!activeTab?.command.trim() && !activeTab?.isExecuting}
                className={`p-1.5 rounded text-white disabled:opacity-40 transition cursor-pointer shrink-0 ${
                  activeTab?.isExecuting ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
                title={activeTab?.isExecuting ? 'ارسال ورودی به برنامه' : 'اجرای دستور'}
              >
                <CornerDownLeft className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
