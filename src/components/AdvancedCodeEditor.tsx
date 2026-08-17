import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Save, 
  X, 
  Maximize2, 
  Minimize2, 
  Search, 
  RefreshCw, 
  RotateCcw, 
  RotateCw, 
  Sun, 
  Moon, 
  FileText, 
  ZoomIn, 
  ZoomOut, 
  Replace, 
  Download, 
  WrapText, 
  Hash, 
  Check,
  Code2,
  ChevronDown
} from 'lucide-react';
import Prism from 'prismjs';

// Import Prism language definitions
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-ini';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-docker';

interface AdvancedCodeEditorProps {
  filePath: string;
  initialContent: string;
  onSave: (newContent: string) => Promise<void> | void;
  onClose: () => void;
  lang: 'fa' | 'en';
}

type NotepadTheme = 'dark' | 'light';

// Language detection map
const EXTENSION_MAP: Record<string, { lang: string; name: string }> = {
  js: { lang: 'javascript', name: 'JavaScript' },
  mjs: { lang: 'javascript', name: 'JavaScript' },
  cjs: { lang: 'javascript', name: 'JavaScript' },
  ts: { lang: 'typescript', name: 'TypeScript' },
  mts: { lang: 'typescript', name: 'TypeScript' },
  jsx: { lang: 'jsx', name: 'React JSX' },
  tsx: { lang: 'tsx', name: 'React TSX' },
  py: { lang: 'python', name: 'Python' },
  json: { lang: 'json', name: 'JSON' },
  sh: { lang: 'bash', name: 'Shell / Bash' },
  bash: { lang: 'bash', name: 'Shell / Bash' },
  zsh: { lang: 'bash', name: 'Shell / Bash' },
  html: { lang: 'markup', name: 'HTML' },
  htm: { lang: 'markup', name: 'HTML' },
  xml: { lang: 'markup', name: 'XML' },
  svg: { lang: 'markup', name: 'SVG' },
  css: { lang: 'css', name: 'CSS' },
  scss: { lang: 'css', name: 'SCSS' },
  sass: { lang: 'css', name: 'SASS' },
  sql: { lang: 'sql', name: 'SQL' },
  yaml: { lang: 'yaml', name: 'YAML' },
  yml: { lang: 'yaml', name: 'YAML' },
  md: { lang: 'markdown', name: 'Markdown' },
  markdown: { lang: 'markdown', name: 'Markdown' },
  ini: { lang: 'ini', name: 'INI / Config' },
  conf: { lang: 'ini', name: 'Config' },
  env: { lang: 'bash', name: 'ENV' },
  go: { lang: 'go', name: 'Go' },
  rs: { lang: 'rust', name: 'Rust' },
  java: { lang: 'java', name: 'Java' },
  c: { lang: 'c', name: 'C' },
  cpp: { lang: 'cpp', name: 'C++' },
  h: { lang: 'c', name: 'C Header' },
  dockerfile: { lang: 'docker', name: 'Dockerfile' },
  txt: { lang: 'plain', name: 'Plain Text' },
  log: { lang: 'plain', name: 'Log File' }
};

const SUPPORTED_LANGUAGES = [
  { id: 'plain', name: 'Plain Text' },
  { id: 'javascript', name: 'JavaScript' },
  { id: 'typescript', name: 'TypeScript' },
  { id: 'jsx', name: 'React JSX' },
  { id: 'tsx', name: 'React TSX' },
  { id: 'python', name: 'Python' },
  { id: 'json', name: 'JSON' },
  { id: 'bash', name: 'Shell / Bash' },
  { id: 'markup', name: 'HTML / XML' },
  { id: 'css', name: 'CSS' },
  { id: 'sql', name: 'SQL' },
  { id: 'yaml', name: 'YAML' },
  { id: 'markdown', name: 'Markdown' },
  { id: 'docker', name: 'Dockerfile' },
  { id: 'go', name: 'Go' },
  { id: 'rust', name: 'Rust' },
  { id: 'c', name: 'C / C++' }
];

export const AdvancedCodeEditor: React.FC<AdvancedCodeEditorProps> = ({
  filePath,
  initialContent,
  onSave,
  onClose,
  lang
}) => {
  const isFa = lang === 'fa';
  const fileName = filePath.split('/').pop() || 'Untitled.txt';

  // Automatically detect syntax language from filename
  const detectLanguage = (name: string): { lang: string; name: string } => {
    const lower = name.toLowerCase();
    if (lower === 'dockerfile') return { lang: 'docker', name: 'Dockerfile' };
    if (lower.startsWith('.env')) return { lang: 'bash', name: 'ENV' };
    const ext = lower.split('.').pop() || '';
    return EXTENSION_MAP[ext] || { lang: 'plain', name: 'Plain Text' };
  };

  const detected = detectLanguage(fileName);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(detected.lang);
  const [enableSyntax, setEnableSyntax] = useState(detected.lang !== 'plain');
  const [showLangMenu, setShowLangMenu] = useState(false);

  // Editor Content & History
  const [content, setContent] = useState(initialContent);
  const [history, setHistory] = useState<string[]>([initialContent]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Notepad State & Settings
  const [theme, setTheme] = useState<NotepadTheme>('dark');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [showStatusBar, setShowStatusBar] = useState(true);
  const [fontSize, setFontSize] = useState(14); // In px (100% zoom = 14px)
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  // Find & Replace State
  const [showFindBar, setShowFindBar] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [findStats, setFindStats] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);

  // Track Unsaved Changes
  useEffect(() => {
    setHasChanges(content !== initialContent);
  }, [content, initialContent]);

  // Synchronized Scrolling
  const handleScroll = () => {
    if (!textareaRef.current) return;
    const { scrollTop, scrollLeft } = textareaRef.current;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollTop;
    }
  };

  // Update Cursor Position
  const updateCursorPosition = () => {
    if (!textareaRef.current) return;
    const textBefore = content.substring(0, textareaRef.current.selectionStart);
    const lines = textBefore.split('\n');
    setCursorPos({
      line: lines.length,
      col: lines[lines.length - 1].length + 1
    });
  };

  // Content Change with Undo/Redo tracking
  const handleContentChange = (newText: string, addToHistory = true) => {
    setContent(newText);
    if (addToHistory) {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newText);
      if (newHistory.length > 50) newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setContent(prev);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setContent(next);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(content);
      setHasChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  // Download File as copy
  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Find & Replace Engine
  useEffect(() => {
    if (!findText) {
      setFindStats({ current: 0, total: 0 });
      return;
    }
    const flags = matchCase ? 'g' : 'gi';
    try {
      const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = content.match(new RegExp(escaped, flags));
      setFindStats({ current: matches ? 1 : 0, total: matches ? matches.length : 0 });
    } catch {
      setFindStats({ current: 0, total: 0 });
    }
  }, [findText, content, matchCase]);

  const handleFindNext = (direction: 'next' | 'prev' = 'next') => {
    if (!findText || !textareaRef.current) return;
    const searchTarget = matchCase ? content : content.toLowerCase();
    const query = matchCase ? findText : findText.toLowerCase();

    let startPos = textareaRef.current.selectionEnd;
    if (direction === 'next') {
      let index = searchTarget.indexOf(query, startPos);
      if (index === -1) {
        index = searchTarget.indexOf(query, 0);
      }
      if (index !== -1) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(index, index + query.length);
        updateCursorPosition();
      }
    } else {
      startPos = textareaRef.current.selectionStart - 1;
      let index = searchTarget.lastIndexOf(query, startPos);
      if (index === -1) {
        index = searchTarget.lastIndexOf(query);
      }
      if (index !== -1) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(index, index + query.length);
        updateCursorPosition();
      }
    }
  };

  const handleReplace = () => {
    if (!findText || !textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const selectedText = content.substring(start, end);

    const matches = matchCase 
      ? selectedText === findText 
      : selectedText.toLowerCase() === findText.toLowerCase();

    if (matches) {
      const newText = content.substring(0, start) + replaceText + content.substring(end);
      handleContentChange(newText);
      setTimeout(() => handleFindNext('next'), 0);
    } else {
      handleFindNext('next');
    }
  };

  const handleReplaceAll = () => {
    if (!findText) return;
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, matchCase ? 'g' : 'gi');
    const newText = content.replace(regex, replaceText);
    handleContentChange(newText);
  };

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFindBar(true);
        setTimeout(() => findInputRef.current?.focus(), 50);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setFontSize(prev => Math.min(28, prev + 2));
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        setFontSize(prev => Math.max(10, prev - 2));
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        setFontSize(14);
      } else if (e.key === 'Escape') {
        if (showFindBar) {
          setShowFindBar(false);
        } else if (showLangMenu) {
          setShowLangMenu(false);
        } else if (!isFullscreen) {
          if (hasChanges) {
            if (confirm(isFa ? 'تغییرات شما ذخیره نشده است. آیا مایل به بستن هستید؟' : 'You have unsaved changes. Discard?')) {
              onClose();
            }
          } else {
            onClose();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content, hasChanges, showFindBar, isFullscreen, showLangMenu]);

  // Tab Key in Textarea
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const newContent = content.substring(0, start) + '  ' + content.substring(end);
      handleContentChange(newContent);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  };

  const linesCount = Math.max(1, content.split('\n').length);
  const zoomPercentage = Math.round((fontSize / 14) * 100);

  // Prism Highlight Generation
  const highlightedCode = useMemo(() => {
    if (!enableSyntax || selectedLanguage === 'plain') {
      return null;
    }
    const grammar = Prism.languages[selectedLanguage] || Prism.languages.javascript;
    if (!grammar) return null;
    try {
      return Prism.highlight(content, grammar, selectedLanguage);
    } catch {
      return null;
    }
  }, [content, selectedLanguage, enableSyntax]);

  // Notepad Color Styles
  const isDark = theme === 'dark';
  const containerBg = isDark ? 'bg-[#1e1e1e]' : 'bg-[#ffffff]';
  const titleBarBg = isDark ? 'bg-[#181818]' : 'bg-[#f3f4f6]';
  const toolBarBg = isDark ? 'bg-[#222222]' : 'bg-[#f8f9fa]';
  const editorBg = isDark ? 'bg-[#1e1e1e]' : 'bg-[#ffffff]';
  const textPrimary = isDark ? 'text-[#e6edf3]' : 'text-[#1f2328]';
  const textSecondary = isDark ? 'text-[#8b949e]' : 'text-[#57606a]';
  const borderColor = isDark ? 'border-[#30363d]' : 'border-[#d0d7de]';
  const btnHover = isDark ? 'hover:bg-[#2e343d] hover:text-white' : 'hover:bg-[#e6e8ec] hover:text-black';

  const currentLangLabel = SUPPORTED_LANGUAGES.find(l => l.id === selectedLanguage)?.name || selectedLanguage.toUpperCase();

  return (
    <div className={`fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center ${isFullscreen ? 'p-0' : 'p-2 sm:p-4'}`}>
      {/* Prism Syntax Theme Styles */}
      <style>{`
        .token.comment, .token.prolog, .token.doctype, .token.cdata { color: ${isDark ? '#6a9955' : '#008000'}; font-style: italic; }
        .token.punctuation { color: ${isDark ? '#d4d4d4' : '#24292e'}; }
        .token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol, .token.deleted { color: ${isDark ? '#4ec9b0' : '#098658'}; }
        .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin, .token.inserted { color: ${isDark ? '#ce9178' : '#a31515'}; }
        .token.operator, .token.entity, .token.url, .language-css .token.string, .style .token.string { color: ${isDark ? '#d4d4d4' : '#0000ff'}; }
        .token.atrule, .token.attr-value, .token.keyword { color: ${isDark ? '#569cd6' : '#0000ff'}; font-weight: 600; }
        .token.function, .token.class-name { color: ${isDark ? '#dcdcaa' : '#795e26'}; font-weight: 600; }
        .token.regex, .token.important, .token.variable { color: ${isDark ? '#d16969' : '#e36209'}; }
        .token.important, .token.bold { font-weight: bold; }
        .token.italic { font-style: italic; }
      `}</style>

      <div 
        className={`flex flex-col shadow-2xl overflow-hidden transition-all select-none ${containerBg} ${borderColor} border ${
          isFullscreen 
            ? 'w-full h-full rounded-none' 
            : 'w-full max-w-5xl h-[92vh] rounded-xl sm:rounded-2xl'
        }`}
        style={{ fontFamily: isFa ? 'Vazirmatn, Segoe UI, Tahoma, sans-serif' : 'Segoe UI, Tahoma, sans-serif' }}
      >
        {/* ==================== WINDOWS NOTEPAD TITLE BAR ==================== */}
        <div className={`h-9 px-2 sm:px-3 ${titleBarBg} ${borderColor} border-b flex items-center justify-between shrink-0`}>
          {/* Left: Notepad Icon & File Title */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-4 h-4 rounded flex items-center justify-center bg-blue-600/20 text-blue-500 shrink-0">
              <FileText className="h-3.5 w-3.5" />
            </div>
            <span className={`text-xs sm:text-sm font-semibold truncate ${textPrimary}`} dir="ltr">
              {hasChanges ? '*' : ''}{fileName}
            </span>
          </div>

          {/* Right: Window Controls (Minimize, Maximize, Close) */}
          <div className="flex items-center">
            {/* Save Status Indicator */}
            {saveSuccess && (
              <span className="text-[11px] text-emerald-500 font-medium px-2 flex items-center gap-1">
                <Check className="h-3 w-3" />
                <span className="hidden sm:inline">{isFa ? 'ذخیره شد' : 'Saved'}</span>
              </span>
            )}

            {/* Maximize / Restore Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={`h-7 w-9 flex items-center justify-center ${textSecondary} ${btnHover} transition cursor-pointer`}
              title={isFullscreen ? (isFa ? 'بازیابی پنجره' : 'Restore') : (isFa ? 'تمام‌صفحه' : 'Maximize')}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>

            {/* Close Window */}
            <button
              onClick={() => {
                if (hasChanges) {
                  if (confirm(isFa ? 'تغییرات شما ذخیره نشده است. آیا می‌خواهید فایل را ببندید؟' : 'You have unsaved changes. Discard and exit?')) {
                    onClose();
                  }
                } else {
                  onClose();
                }
              }}
              className="h-7 w-9 flex items-center justify-center text-neutral-400 hover:bg-red-600 hover:text-white transition cursor-pointer rounded-r-xs"
              title={isFa ? 'بستن (Esc)' : 'Close (Esc)'}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ==================== CLEAN MINIMAL TOOLBAR (WITH SYNTAX TOGGLE) ==================== */}
        <div className={`px-2 py-1.5 ${toolBarBg} ${borderColor} border-b flex items-center justify-between gap-2 text-xs shrink-0 select-none overflow-x-auto`}>
          {/* Quick Action Tools */}
          <div className="flex items-center gap-1 sm:gap-1.5 flex-nowrap shrink-0">
            {/* Undo */}
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className={`p-1.5 rounded-md ${textSecondary} ${btnHover} disabled:opacity-30 transition cursor-pointer`}
              title={isFa ? 'لغو آخرین تغییر (Ctrl+Z)' : 'Undo (Ctrl+Z)'}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            {/* Redo */}
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className={`p-1.5 rounded-md ${textSecondary} ${btnHover} disabled:opacity-30 transition cursor-pointer`}
              title={isFa ? 'تکرار تغییر (Ctrl+Y)' : 'Redo (Ctrl+Y)'}
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>

            <div className={`h-4 w-px ${borderColor} border-r mx-0.5`} />

            {/* Syntax Highlighting Toggle */}
            <button
              onClick={() => setEnableSyntax(!enableSyntax)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 ${
                enableSyntax 
                  ? 'bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' 
                  : `${textSecondary} ${btnHover}`
              }`}
              title={isFa ? 'رنگ‌آمیزی خودکار ساختار کد' : 'Syntax Highlighting'}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isFa ? 'رنگ‌آمیزی کد' : 'Syntax'}</span>
            </button>

            {/* Word Wrap Toggle */}
            <button
              onClick={() => setWordWrap(!wordWrap)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 ${
                wordWrap 
                  ? 'bg-blue-600/15 text-blue-600 dark:text-blue-400 border border-blue-500/30' 
                  : `${textSecondary} ${btnHover}`
              }`}
              title={isFa ? 'شکستن خودکار سطرها' : 'Word Wrap'}
            >
              <WrapText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isFa ? 'شکستن خطوط' : 'Wrap'}</span>
            </button>

            {/* Line Numbers Toggle */}
            <button
              onClick={() => setShowLineNumbers(!showLineNumbers)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 ${
                showLineNumbers 
                  ? 'bg-neutral-500/15 text-neutral-800 dark:text-neutral-200 border border-neutral-500/30' 
                  : `${textSecondary} ${btnHover}`
              }`}
              title={isFa ? 'شماره خطوط' : 'Line Numbers'}
            >
              <Hash className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isFa ? 'شماره خط' : 'Lines'}</span>
            </button>

            <div className={`h-4 w-px ${borderColor} border-r mx-0.5`} />

            {/* Zoom In */}
            <button
              onClick={() => setFontSize(prev => Math.min(28, prev + 2))}
              className={`p-1.5 rounded-md ${textSecondary} ${btnHover} transition cursor-pointer`}
              title={isFa ? 'بزرگنمایی (Ctrl +)' : 'Zoom In (Ctrl +)'}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>

            {/* Zoom Out */}
            <button
              onClick={() => setFontSize(prev => Math.max(10, prev - 2))}
              className={`p-1.5 rounded-md ${textSecondary} ${btnHover} transition cursor-pointer`}
              title={isFa ? 'کوچک‌نمایی (Ctrl -)' : 'Zoom Out (Ctrl -)'}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>

            {/* Search / Replace */}
            <button
              onClick={() => setShowFindBar(!showFindBar)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5 ${
                showFindBar 
                  ? 'bg-indigo-600/15 text-indigo-500 dark:text-indigo-400 border border-indigo-500/30' 
                  : `${textSecondary} ${btnHover}`
              }`}
              title={isFa ? 'جستجو و جایگزینی (Ctrl+F)' : 'Find & Replace (Ctrl+F)'}
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isFa ? 'جستجو' : 'Find'}</span>
            </button>

            {/* Download copy */}
            <button
              onClick={handleDownload}
              className={`p-1.5 rounded-md ${textSecondary} ${btnHover} transition cursor-pointer hidden sm:flex`}
              title={isFa ? 'دانلود نسخه کپی' : 'Download Copy'}
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Right Action Tools: Theme & Save */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className={`p-1.5 rounded-md ${textSecondary} ${btnHover} transition cursor-pointer`}
              title={isFa ? (theme === 'dark' ? 'تغییر به تم روشن' : 'تغییر به تم تاریک') : 'Toggle Theme'}
            >
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-indigo-500" />}
            </button>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-3 py-1 rounded-md font-semibold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs ${
                hasChanges 
                  ? 'bg-blue-600 hover:bg-blue-500 text-white animate-pulse' 
                  : 'bg-blue-600/80 hover:bg-blue-600 text-white'
              } disabled:opacity-50`}
              title={isFa ? 'ذخیره فایل (Ctrl+S)' : 'Save (Ctrl+S)'}
            >
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>{isFa ? 'ذخیره' : 'Save'}</span>
            </button>
          </div>
        </div>

        {/* ==================== FIND & REPLACE BAR ==================== */}
        {showFindBar && (
          <div className={`px-3 py-2 ${titleBarBg} ${borderColor} border-b flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 animate-in fade-in slide-in-from-top-1`}>
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              {/* Find Input */}
              <div className="flex items-center gap-1.5 bg-neutral-800 dark:bg-neutral-900 px-2.5 py-1 rounded-md border border-neutral-700 w-full sm:w-52">
                <Search className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                <input
                  ref={findInputRef}
                  type="text"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleFindNext('next'); }}
                  placeholder={isFa ? 'جستجوی متن...' : 'Find text...'}
                  className="bg-transparent border-none outline-none text-neutral-100 text-xs w-full"
                />
                {findStats.total > 0 && (
                  <span className="text-[10px] text-neutral-400 font-mono shrink-0">
                    {findStats.total}
                  </span>
                )}
              </div>

              {/* Replace Input */}
              <div className="flex items-center gap-1.5 bg-neutral-800 dark:bg-neutral-900 px-2.5 py-1 rounded-md border border-neutral-700 w-full sm:w-52">
                <Replace className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                <input
                  type="text"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder={isFa ? 'جایگزین با...' : 'Replace with...'}
                  className="bg-transparent border-none outline-none text-neutral-100 text-xs w-full"
                />
              </div>

              {/* Find / Replace Action Buttons */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => handleFindNext('next')}
                  className="p-1 px-2.5 rounded-md bg-neutral-700 hover:bg-neutral-600 text-white text-[11px] font-medium transition cursor-pointer"
                  title={isFa ? 'یافتن بعدی' : 'Find Next'}
                >
                  {isFa ? 'بعدی' : 'Next'}
                </button>
                <button
                  onClick={() => handleFindNext('prev')}
                  className="p-1 px-2.5 rounded-md bg-neutral-700 hover:bg-neutral-600 text-white text-[11px] font-medium transition cursor-pointer"
                  title={isFa ? 'یافتن قبلی' : 'Find Prev'}
                >
                  {isFa ? 'قبلی' : 'Prev'}
                </button>
                <button
                  onClick={handleReplace}
                  className="p-1 px-2.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium transition cursor-pointer"
                  title={isFa ? 'جایگزینی این مورد' : 'Replace'}
                >
                  {isFa ? 'جایگزینی' : 'Replace'}
                </button>
                <button
                  onClick={handleReplaceAll}
                  className="p-1 px-2.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition cursor-pointer"
                  title={isFa ? 'جایگزینی تمام موارد' : 'Replace All'}
                >
                  {isFa ? 'همه' : 'All'}
                </button>
              </div>

              {/* Match Case Checkbox */}
              <label className="flex items-center gap-1.5 text-[11px] text-neutral-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={matchCase}
                  onChange={(e) => setMatchCase(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-neutral-600 text-blue-600 focus:ring-0 cursor-pointer"
                />
                <span>{isFa ? 'حساس به حروف' : 'Match case'}</span>
              </label>
            </div>

            {/* Close Find Bar */}
            <button
              onClick={() => setShowFindBar(false)}
              className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white transition cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* ==================== NOTEPAD EDITOR MAIN SURFACE (WITH SYNTAX HIGHLIGHTING) ==================== */}
        <div className={`relative flex-1 flex overflow-hidden ${editorBg}`}>
          {/* Line Numbers */}
          {showLineNumbers && (
            <div 
              ref={lineNumbersRef}
              className={`w-10 sm:w-12 py-3 border-r select-none text-right pr-2 shrink-0 font-mono text-[11px] overflow-hidden ${
                isDark ? 'bg-[#181818] border-[#30363d] text-[#6e7681]' : 'bg-[#f6f8fa] border-[#d0d7de] text-[#8c959f]'
              }`}
              style={{ fontSize: `${fontSize - 2}px`, lineHeight: '1.6rem' }}
            >
              {Array.from({ length: linesCount }, (_, i) => i + 1).map(n => (
                <div 
                  key={n} 
                  className={cursorPos.line === n ? (isDark ? 'text-blue-400 font-bold' : 'text-blue-600 font-bold') : ''}
                >
                  {n}
                </div>
              ))}
            </div>
          )}

          {/* Synchronized Highlighting Layer & Textarea Container */}
          <div className="relative flex-1 h-full overflow-hidden">
            {/* Background Syntax Highlighted HTML Layer */}
            {enableSyntax && highlightedCode !== null && (
              <pre
                ref={preRef}
                aria-hidden="true"
                className={`absolute inset-0 pointer-events-none p-3 sm:p-4 m-0 font-mono select-none overflow-hidden ${
                  wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
                }`}
                style={{
                  fontFamily: "Consolas, 'Cascadia Code', 'Courier New', monospace",
                  fontSize: `${fontSize}px`,
                  lineHeight: '1.6rem',
                  tabSize: 2
                }}
                dangerouslySetInnerHTML={{ __html: highlightedCode + (content.endsWith('\n') ? ' ' : '') }}
              />
            )}

            {/* Editable Textarea Layer */}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              onScroll={handleScroll}
              onKeyUp={updateCursorPosition}
              onClick={updateCursorPosition}
              onKeyDown={handleTextareaKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              dir="auto"
              className={`w-full h-full p-3 sm:p-4 outline-none border-none resize-none font-mono transition-colors ${
                enableSyntax && highlightedCode !== null 
                  ? 'bg-transparent text-transparent caret-blue-500 selection:bg-blue-500/30' 
                  : `${editorBg} ${textPrimary}`
              } ${wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto'}`}
              style={{
                fontFamily: "Consolas, 'Cascadia Code', 'Courier New', monospace",
                fontSize: `${fontSize}px`,
                lineHeight: '1.6rem',
                tabSize: 2
              }}
            />
          </div>
        </div>

        {/* ==================== NOTEPAD STATUS BAR ==================== */}
        {showStatusBar && (
          <div className={`h-6 px-3 ${toolBarBg} ${borderColor} border-t flex items-center justify-between text-[11px] font-mono ${textSecondary} shrink-0 select-none relative`}>
            {/* Left: Document Info */}
            <div className="flex items-center gap-4">
              <span>{content.length} {isFa ? 'کاراکتر' : 'chars'}</span>
              <span className="hidden sm:inline-block">
                {content.trim() ? content.trim().split(/\s+/).length : 0} {isFa ? 'کلمه' : 'words'}
              </span>
            </div>

            {/* Right: Language Selector, Line/Col, Zoom, Encoding */}
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Language Selector Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowLangMenu(!showLangMenu)}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition cursor-pointer ${
                    enableSyntax ? 'text-blue-500 dark:text-blue-400 font-semibold hover:bg-neutral-500/15' : 'hover:bg-neutral-500/15'
                  }`}
                  title={isFa ? 'تغییر زبان هایلایت' : 'Change Syntax Language'}
                >
                  <span>{currentLangLabel}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>

                {showLangMenu && (
                  <div className={`absolute bottom-6 right-0 w-44 max-h-56 overflow-y-auto ${titleBarBg} ${borderColor} border rounded-lg shadow-xl py-1 z-50 text-left`}>
                    <div className="px-2 py-1 text-[10px] text-neutral-400 uppercase font-bold border-b border-neutral-700/50">
                      {isFa ? 'انتخاب زبان کد' : 'Syntax Language'}
                    </div>
                    {SUPPORTED_LANGUAGES.map(item => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setSelectedLanguage(item.id);
                          setEnableSyntax(item.id !== 'plain');
                          setShowLangMenu(false);
                        }}
                        className={`w-full text-left px-2.5 py-1 text-xs transition cursor-pointer flex items-center justify-between ${
                          selectedLanguage === item.id 
                            ? 'bg-blue-600 text-white font-medium' 
                            : `${textPrimary} ${btnHover}`
                        }`}
                      >
                        <span>{item.name}</span>
                        {selectedLanguage === item.id && <Check className="h-3 w-3" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
              <span className="hidden sm:inline-block">{zoomPercentage}%</span>
              <span className="hidden sm:inline-block">Windows (CRLF)</span>
              <span>UTF-8</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
