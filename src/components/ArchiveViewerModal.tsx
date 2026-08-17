import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileArchive,
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  Image,
  Download,
  FolderDown,
  X,
  Search,
  CheckSquare,
  Square,
  Eye,
  RefreshCw,
  Copy,
  Check,
  HardDrive,
  Info,
  ArrowUpDown,
  Maximize2,
  Minimize2,
  ChevronRight,
  AlertCircle,
  Plus,
  UploadCloud,
  FileUp,
  Trash2,
  Edit2,
  Lock,
  EyeOff
} from 'lucide-react';

export interface ArchiveEntry {
  entryName: string;
  name: string;
  isDirectory: boolean;
  size: number;
  compressedSize?: number;
  mtime?: string;
}

export interface ArchiveInspectData {
  archivePath: string;
  filename: string;
  format: string;
  archiveSize: number;
  totalFiles: number;
  totalDirectories: number;
  totalUncompressedSize: number;
  entries: ArchiveEntry[];
}

interface ArchiveViewerModalProps {
  isOpen: boolean;
  archivePath: string | null;
  currentDir: string;
  token: string;
  lang: 'fa' | 'en';
  onClose: () => void;
  onExtractionSuccess?: (destination: string) => void;
  onArchiveUpdated?: () => void;
}

export const ArchiveViewerModal: React.FC<ArchiveViewerModalProps> = ({
  isOpen,
  archivePath,
  currentDir,
  token,
  lang,
  onClose,
  onExtractionSuccess,
  onArchiveUpdated
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ArchiveInspectData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntries, setSelectedEntries] = useState<string[]>([]);
  const [sortField, setSortField] = useState<'name' | 'size' | 'mtime'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Single file preview state
  const [previewFile, setPreviewFile] = useState<{
    entryName: string;
    fileName: string;
    content?: string;
    base64?: string;
    isText?: boolean;
    size: number;
    loading: boolean;
    error?: string;
  } | null>(null);
  const [copiedPreview, setCopiedPreview] = useState(false);

  // Extract destination state
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractDest, setExtractDest] = useState(currentDir);
  const [extractPassword, setExtractPassword] = useState('');
  const [showExtractPassword, setShowExtractPassword] = useState(false);
  const [showDestInput, setShowDestInput] = useState(false);
  const [extractMessage, setExtractMessage] = useState<string | null>(null);

  // Drag and drop & Add file to archive states
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isAddingFiles, setIsAddingFiles] = useState(false);
  const [addFilesMessage, setAddFilesMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rename states
  const [renamingEntry, setRenamingEntry] = useState<{ oldName: string; newName: string } | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);

  // Delete states / confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ entries: string[]; isFolder?: boolean } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const t = {
    title: lang === 'fa' ? 'پیش‌نمایش محتویات فایل فشرده' : 'Archive Explorer (WinRAR View)',
    extractAll: lang === 'fa' ? 'استخراج همه' : 'Extract All',
    extractSelected: lang === 'fa' ? 'استخراج' : 'Extract',
    extracting: lang === 'fa' ? 'در حال استخراج...' : 'Extracting...',
    addFiles: lang === 'fa' ? 'افزودن فایل' : 'Add Files',
    dropToAdd: lang === 'fa' ? 'فایل‌ها را اینجا رها کنید تا به آرشیو فشرده اضافه شوند' : 'Drop files here to add to archive',
    addingFiles: lang === 'fa' ? 'در حال افزودن فایل‌ها به آرشیو...' : 'Adding files to archive...',
    searchPlaceholder: lang === 'fa' ? 'جستجو در فایل‌های فشرده...' : 'Search inside archive...',
    name: lang === 'fa' ? 'نام' : 'Name',
    size: lang === 'fa' ? 'حجم اصلی' : 'Original Size',
    compressedSize: lang === 'fa' ? 'حجم فشرده' : 'Compressed',
    modified: lang === 'fa' ? 'تاریخ' : 'Date',
    actions: lang === 'fa' ? 'عملیات' : 'Actions',
    preview: lang === 'fa' ? 'پیش‌نمایش' : 'Preview',
    download: lang === 'fa' ? 'دانلود' : 'Download',
    extractSingle: lang === 'fa' ? 'استخراج' : 'Extract',
    rename: lang === 'fa' ? 'تغییر نام' : 'Rename',
    renameTitle: lang === 'fa' ? 'تغییر نام در آرشیو' : 'Rename Entry',
    newNamePlaceholder: lang === 'fa' ? 'نام جدید فایل یا پوشه...' : 'New item name...',
    delete: lang === 'fa' ? 'حذف' : 'Delete',
    deleteSelected: lang === 'fa' ? 'حذف' : 'Delete',
    confirmDeleteTitle: lang === 'fa' ? 'تأیید حذف از آرشیو' : 'Confirm Archive Deletion',
    confirmDeleteMsg: lang === 'fa' 
      ? 'آیا مطمئن هستید که می‌خواهید این مورد را مستقیماً از داخل فایل فشرده حذف کنید؟' 
      : 'Are you sure you want to permanently remove this from the archive?',
    confirmDeleteSelectedMsg: lang === 'fa'
      ? 'آیا مطمئن هستید که می‌خواهید موارد انتخاب‌شده را از داخل فایل فشرده حذف کنید؟'
      : 'Are you sure you want to delete selected items from the archive?',
    save: lang === 'fa' ? 'ذخیره' : 'Save',
    cancel: lang === 'fa' ? 'انصراف' : 'Cancel',
    deleting: lang === 'fa' ? 'در حال حذف...' : 'Deleting...',
    renaming: lang === 'fa' ? 'در حال تغییر نام...' : 'Renaming...',
    close: lang === 'fa' ? 'بستن' : 'Close',
    totalFiles: lang === 'fa' ? 'فایل' : 'Files',
    totalFolders: lang === 'fa' ? 'پوشه' : 'Folders',
    totalSize: lang === 'fa' ? 'حجم کل' : 'Total Size',
    archiveSize: lang === 'fa' ? 'حجم آرشیو' : 'Archive Size',
    saved: lang === 'fa' ? 'صرفه‌جویی' : 'Saved',
    destDirLabel: lang === 'fa' ? 'مسیر مقصد برای استخراج:' : 'Extract Destination:',
    copied: lang === 'fa' ? 'کپی شد!' : 'Copied!',
    copyContent: lang === 'fa' ? 'کپی متن' : 'Copy Content',
    emptyArchive: lang === 'fa' ? 'این آرشیو خالی است یا فایلی یافت نشد.' : 'This archive is empty or no files found.',
    failedLoad: lang === 'fa' ? 'خطا در بارگذاری محتوای فایل فشرده' : 'Failed to inspect archive',
    selectAll: lang === 'fa' ? 'انتخاب همه' : 'Select All',
    deselectAll: lang === 'fa' ? 'لغو' : 'Deselect'
  };

  const fetchArchiveData = async () => {
    if (!archivePath) return;
    setLoading(true);
    setError(null);
    setSelectedEntries([]);
    try {
      const res = await fetch(`/api/files/archive/inspect?path=${encodeURIComponent(archivePath)}`, {
        headers: { 'x-auth-token': token }
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || t.failedLoad);
      }
      const resData: ArchiveInspectData = await res.json();
      setData(resData);
      setExtractDest(currentDir || (archivePath ? archivePath.substring(0, archivePath.lastIndexOf('/')) : '/'));
    } catch (err: any) {
      setError(err.message || t.failedLoad);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && archivePath) {
      fetchArchiveData();
    } else {
      setData(null);
      setError(null);
      setPreviewFile(null);
      setShowDestInput(false);
      setExtractMessage(null);
      setAddFilesMessage(null);
      setIsDraggingOver(false);
    }
  }, [isOpen, archivePath]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (entry: ArchiveEntry) => {
    if (entry.isDirectory) {
      return <Folder className="h-4 w-4 text-amber-500 shrink-0" />;
    }
    const lower = entry.name.toLowerCase();
    if (lower.endsWith('.js') || lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.py') || lower.endsWith('.sh') || lower.endsWith('.json') || lower.endsWith('.html') || lower.endsWith('.css')) {
      return <FileCode className="h-4 w-4 text-emerald-500 shrink-0" />;
    }
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.gif') || lower.endsWith('.svg') || lower.endsWith('.webp')) {
      return <Image className="h-4 w-4 text-purple-400 shrink-0" />;
    }
    if (lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.log') || lower.endsWith('.env') || lower.endsWith('.conf') || lower.endsWith('.ini')) {
      return <FileText className="h-4 w-4 text-blue-400 shrink-0" />;
    }
    if (lower.endsWith('.zip') || lower.endsWith('.tar') || lower.endsWith('.gz') || lower.endsWith('.tgz') || lower.endsWith('.rar') || lower.endsWith('.7z')) {
      return <FileArchive className="h-4 w-4 text-amber-400 shrink-0" />;
    }
    return <File className="h-4 w-4 text-neutral-400 shrink-0" />;
  };

  // Filter and sort entries
  const filteredEntries = useMemo(() => {
    if (!data || !data.entries) return [];
    let list = data.entries;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e => e.entryName.toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      // Directories first
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;

      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'name') {
        valA = a.entryName.toLowerCase();
        valB = b.entryName.toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, searchQuery, sortField, sortOrder]);

  const handleToggleSelect = (entryName: string) => {
    setSelectedEntries(prev => 
      prev.includes(entryName) ? prev.filter(e => e !== entryName) : [...prev, entryName]
    );
  };

  const handleSelectAll = () => {
    if (selectedEntries.length === filteredEntries.length) {
      setSelectedEntries([]);
    } else {
      setSelectedEntries(filteredEntries.map(e => e.entryName));
    }
  };

  const handleSort = (field: 'name' | 'size' | 'mtime') => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Add files directly to the archive (Drag & Drop or Manual Selection)
  const handleAddFilesToArchive = async (filesList: FileList | File[]) => {
    if (!archivePath || filesList.length === 0) return;
    setIsAddingFiles(true);
    setAddFilesMessage(null);

    try {
      const formData = new FormData();
      formData.append('archivePath', archivePath);
      
      const filePaths: string[] = [];
      for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
        formData.append('files', file);
        filePaths.push(file.name);
      }
      formData.append('filePaths', JSON.stringify(filePaths));

      const res = await fetch(`/api/files/archive/add-files?archivePath=${encodeURIComponent(archivePath)}`, {
        method: 'POST',
        headers: {
          'x-auth-token': token
        },
        body: formData
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        setAddFilesMessage({
          text: lang === 'fa' 
            ? `${filesList.length} فایل با موفقیت به آرشیو فشرده اضافه شد.` 
            : `${filesList.length} file(s) added directly to the archive.`
        });
        await fetchArchiveData();
        if (onArchiveUpdated) {
          onArchiveUpdated();
        }
      } else {
        setAddFilesMessage({
          text: resData.error || (lang === 'fa' ? 'خطا در افزودن فایل به آرشیو' : 'Failed to add files to archive'),
          isError: true
        });
      }
    } catch (err: any) {
      setAddFilesMessage({
        text: err.message || (lang === 'fa' ? 'خطا در برقراری ارتباط با سرور' : 'Network error'),
        isError: true
      });
    } finally {
      setIsAddingFiles(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Delete entries directly from archive
  const handleDeleteEntries = async (entriesToDelete: string[]) => {
    if (!archivePath || entriesToDelete.length === 0) return;
    setIsDeleting(true);
    setAddFilesMessage(null);

    try {
      const res = await fetch('/api/files/archive/delete-entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify({
          archivePath,
          entries: entriesToDelete
        })
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        setAddFilesMessage({
          text: lang === 'fa' 
            ? `${entriesToDelete.length} مورد با موفقیت از آرشیو حذف شد.` 
            : `${entriesToDelete.length} item(s) deleted from archive.`
        });
        setSelectedEntries(prev => prev.filter(e => !entriesToDelete.includes(e)));
        if (previewFile && entriesToDelete.includes(previewFile.entryName)) {
          setPreviewFile(null);
        }
        await fetchArchiveData();
        if (onArchiveUpdated) {
          onArchiveUpdated();
        }
      } else {
        setAddFilesMessage({
          text: resData.error || (lang === 'fa' ? 'خطا در حذف از آرشیو' : 'Failed to delete from archive'),
          isError: true
        });
      }
    } catch (err: any) {
      setAddFilesMessage({
        text: err.message || (lang === 'fa' ? 'خطا در برقراری ارتباط با سرور' : 'Network error'),
        isError: true
      });
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
    }
  };

  // Rename an entry directly inside the archive
  const handleRenameEntry = async () => {
    if (!archivePath || !renamingEntry || !renamingEntry.newName.trim()) return;
    if (renamingEntry.oldName === renamingEntry.newName.trim()) {
      setRenamingEntry(null);
      return;
    }

    setIsRenaming(true);
    setAddFilesMessage(null);

    try {
      const res = await fetch('/api/files/archive/rename-entry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify({
          archivePath,
          oldEntryName: renamingEntry.oldName,
          newEntryName: renamingEntry.newName.trim()
        })
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        setAddFilesMessage({
          text: lang === 'fa' ? 'تغییر نام با موفقیت انجام شد.' : 'Item renamed successfully.'
        });
        if (previewFile?.entryName === renamingEntry.oldName) {
          setPreviewFile(null);
        }
        await fetchArchiveData();
        if (onArchiveUpdated) {
          onArchiveUpdated();
        }
      } else {
        setAddFilesMessage({
          text: resData.error || (lang === 'fa' ? 'خطا در تغییر نام' : 'Failed to rename'),
          isError: true
        });
      }
    } catch (err: any) {
      setAddFilesMessage({
        text: err.message || (lang === 'fa' ? 'خطا در برقراری ارتباط با سرور' : 'Network error'),
        isError: true
      });
    } finally {
      setIsRenaming(false);
      setRenamingEntry(null);
    }
  };

  // Preview a single file
  const handlePreviewFile = async (entry: ArchiveEntry) => {
    if (entry.isDirectory || !archivePath) return;
    setPreviewFile({
      entryName: entry.entryName,
      fileName: entry.name,
      size: entry.size,
      loading: true
    });
    try {
      const res = await fetch(
        `/api/files/archive/file?archivePath=${encodeURIComponent(archivePath)}&entryName=${encodeURIComponent(entry.entryName)}`,
        { headers: { 'x-auth-token': token } }
      );
      if (!res.ok) {
        throw new Error('Failed to read entry');
      }
      const resJson = await res.json();
      setPreviewFile({
        entryName: entry.entryName,
        fileName: entry.name,
        size: entry.size,
        loading: false,
        content: resJson.content,
        base64: resJson.base64,
        isText: resJson.isText
      });
    } catch (err: any) {
      setPreviewFile({
        entryName: entry.entryName,
        fileName: entry.name,
        size: entry.size,
        loading: false,
        error: err.message || 'Error loading preview'
      });
    }
  };

  // Download a single file from archive
  const handleDownloadEntry = (entry: ArchiveEntry) => {
    if (!archivePath) return;
    const url = `/api/files/archive/file?archivePath=${encodeURIComponent(archivePath)}&entryName=${encodeURIComponent(entry.entryName)}&download=1&token=${encodeURIComponent(token)}`;
    
    let iframe = document.getElementById('global_download_iframe') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'global_download_iframe';
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
    }
    iframe.src = url;

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = entry.name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
    }, 1500);
  };

  // Extract all files
  const handleExtractAll = async () => {
    if (!archivePath) return;
    setIsExtracting(true);
    setExtractMessage(null);
    try {
      const res = await fetch('/api/files/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify({
          archivePath,
          destinationDir: extractDest.trim() || currentDir,
          password: extractPassword.trim() || undefined
        })
      });
      const resData = await res.json();
      if (res.ok && resData.success) {
        setExtractMessage(lang === 'fa' ? 'تمام فایل‌ها با موفقیت استخراج شدند.' : 'All files extracted successfully.');
        if (onExtractionSuccess) {
          onExtractionSuccess(resData.destination || extractDest);
        }
      } else {
        alert(resData.error || 'Failed to extract');
      }
    } catch (err: any) {
      alert(err.message || 'Error during extraction');
    } finally {
      setIsExtracting(false);
    }
  };

  // Extract selected files
  const handleExtractSelected = async () => {
    if (!archivePath || selectedEntries.length === 0) return;
    setIsExtracting(true);
    setExtractMessage(null);
    try {
      const res = await fetch('/api/files/archive/extract-entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify({
          archivePath,
          entries: selectedEntries,
          destinationDir: extractDest.trim() || currentDir,
          password: extractPassword.trim() || undefined
        })
      });
      const resData = await res.json();
      if (res.ok && resData.success) {
        setExtractMessage(lang === 'fa' ? `${selectedEntries.length} مورد با موفقیت استخراج شد.` : `${selectedEntries.length} items extracted successfully.`);
        if (onExtractionSuccess) {
          onExtractionSuccess(resData.destination || extractDest);
        }
      } else {
        alert(resData.error || 'Failed to extract selected items');
      }
    } catch (err: any) {
      alert(err.message || 'Error during extraction');
    } finally {
      setIsExtracting(false);
    }
  };

  // Copy preview content
  const handleCopyPreview = () => {
    if (previewFile?.content) {
      navigator.clipboard.writeText(previewFile.content);
      setCopiedPreview(true);
      setTimeout(() => setCopiedPreview(false), 2000);
    }
  };

  if (!isOpen) return null;

  const savedPercent = data && data.totalUncompressedSize > 0
    ? Math.max(0, Math.round(((data.totalUncompressedSize - data.archiveSize) / data.totalUncompressedSize) * 100))
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div 
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-5xl h-[92vh] sm:h-[88vh] flex flex-col shadow-2xl overflow-hidden relative"
        dir={lang === 'fa' ? 'rtl' : 'ltr'}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDraggingOver(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDraggingOver(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleAddFilesToArchive(e.dataTransfer.files);
          }
        }}
      >
        {/* Hidden File Input for clicking Add Files */}
        <input
          type="file"
          multiple
          ref={fileInputRef}
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleAddFilesToArchive(e.target.files);
            }
          }}
        />

        {/* Drag & Drop Visual Overlay */}
        {isDraggingOver && (
          <div className="absolute inset-0 z-40 bg-amber-500/15 dark:bg-amber-500/20 backdrop-blur-sm border-2 border-dashed border-amber-500 rounded-2xl flex flex-col items-center justify-center p-6 transition pointer-events-none animate-fadeIn">
            <div className="p-4 rounded-2xl bg-amber-500 text-neutral-950 shadow-xl mb-3 animate-bounce">
              <UploadCloud className="h-10 w-10" />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white">
              {t.dropToAdd}
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1">
              {lang === 'fa' ? 'فایل‌ها مستقیماً درون این فایل فشرده قرار خواهند گرفت' : 'Files will be directly injected into this archive'}
            </p>
          </div>
        )}

        {/* Header (WinRAR style) */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
              <FileArchive className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white truncate">
                  {data?.filename || archivePath?.split('/').pop() || t.title}
                </h3>
                {data?.format && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    {data.format}
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-md" title={archivePath || ''}>
                {archivePath}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchArchiveData}
              disabled={loading || isAddingFiles}
              className="p-2 rounded-xl text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 transition cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800 transition cursor-pointer"
              title={t.close}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Quick Stats Bar */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 py-2.5 sm:px-6 bg-neutral-100/60 dark:bg-neutral-800/40 border-b border-neutral-200 dark:border-neutral-800 text-xs">
            <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
              <span className="font-semibold text-neutral-900 dark:text-white">{data.totalFiles}</span>
              <span className="text-neutral-500">{t.totalFiles}</span>
              {data.totalDirectories > 0 && (
                <span className="text-neutral-400">({data.totalDirectories} {t.totalFolders})</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
              <span className="text-neutral-500">{t.totalSize}:</span>
              <span className="font-mono font-semibold text-neutral-900 dark:text-white">{formatBytes(data.totalUncompressedSize)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
              <span className="text-neutral-500">{t.archiveSize}:</span>
              <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">{formatBytes(data.archiveSize)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
              <span className="text-neutral-500">{t.saved}:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{savedPercent}%</span>
            </div>
          </div>
        )}

        {/* Action Toolbar */}
        <div className="p-3 sm:p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-2 sm:gap-3 bg-white dark:bg-neutral-900">
          {/* Search box */}
          <div className="relative flex-1 min-w-[180px] sm:max-w-xs">
            <Search className={`absolute ${lang === 'fa' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className={`w-full ${lang === 'fa' ? 'pr-9 pl-8' : 'pl-9 pr-8'} py-2 rounded-xl text-xs sm:text-sm bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-500`}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className={`absolute ${lang === 'fa' ? 'left-2.5' : 'right-2.5'} top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Add Files Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isAddingFiles}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              title={lang === 'fa' ? 'افزودن فایل به این آرشیو فشرده' : 'Add files to this archive'}
            >
              {isAddingFiles ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              <span>{isAddingFiles ? t.addingFiles : t.addFiles}</span>
            </button>

            {/* Change destination folder button */}
            <button
              onClick={() => setShowDestInput(!showDestInput)}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 transition flex items-center gap-1.5 cursor-pointer"
              title="Change extract destination folder"
            >
              <FolderOpen className="h-3.5 w-3.5 text-amber-500" />
              <span className="hidden sm:inline">{lang === 'fa' ? 'تغییر مسیر مقصد' : 'Change Dest'}</span>
            </button>

            {/* Extract Selected Button */}
            {selectedEntries.length > 0 && (
              <>
                <button
                  onClick={() => setDeleteConfirm({ entries: selectedEntries })}
                  disabled={isDeleting || isExtracting}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title={t.deleteSelected}
                >
                  {isDeleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  <span>{t.deleteSelected} ({selectedEntries.length})</span>
                </button>

                <button
                  onClick={handleExtractSelected}
                  disabled={isExtracting || isDeleting}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <FolderDown className="h-3.5 w-3.5" />
                  <span>{isExtracting ? t.extracting : `${t.extractSelected} (${selectedEntries.length})`}</span>
                </button>
              </>
            )}

            {/* Extract All Button */}
            <button
              onClick={handleExtractAll}
              disabled={isExtracting || !data || data.entries.length === 0}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 transition flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <FolderDown className="h-4 w-4" />
              <span>{isExtracting ? t.extracting : t.extractAll}</span>
            </button>
          </div>
        </div>

        {/* Destination folder & Password configuration row */}
        {showDestInput && (
          <div className="px-4 py-2.5 bg-amber-500/5 dark:bg-amber-500/10 border-b border-amber-500/20 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <span className="text-neutral-600 dark:text-neutral-300 font-medium whitespace-nowrap">{t.destDirLabel}</span>
              <input
                type="text"
                value={extractDest}
                onChange={(e) => setExtractDest(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div className="flex items-center gap-2 min-w-[200px]">
              <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <div className="relative flex-1">
                <input
                  type={showExtractPassword ? 'text' : 'password'}
                  value={extractPassword}
                  onChange={(e) => setExtractPassword(e.target.value)}
                  placeholder={lang === 'fa' ? 'رمز استخراج (اختیاری)...' : 'Extract password (optional)...'}
                  className="w-full pl-8 pr-2.5 rtl:pr-8 rtl:pl-2.5 py-1.5 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={() => setShowExtractPassword(!showExtractPassword)}
                  className="absolute inset-y-0 left-0 rtl:left-auto rtl:right-0 flex items-center px-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                  tabIndex={-1}
                >
                  {showExtractPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Files message toast banner */}
        {addFilesMessage && (
          <div className={`px-4 py-2 text-xs flex items-center justify-between border-b ${
            addFilesMessage.isError 
              ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400' 
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
          }`}>
            <div className="flex items-center gap-2">
              {addFilesMessage.isError ? <AlertCircle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              <span>{addFilesMessage.text}</span>
            </div>
            <button onClick={() => setAddFilesMessage(null)} className="opacity-70 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Status / Success Toast message inside modal */}
        {extractMessage && (
          <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4" />
              <span>{extractMessage}</span>
            </div>
            <button onClick={() => setExtractMessage(null)} className="text-emerald-500 hover:text-emerald-700">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
          {/* Entries Table */}
          <div className={`flex-1 overflow-y-auto ${previewFile ? 'hidden md:block md:w-1/2' : 'w-full'}`}>
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-neutral-400 gap-3">
                <RefreshCw className="h-8 w-8 animate-spin text-amber-500" />
                <p className="text-sm font-medium">{lang === 'fa' ? 'در حال بررسی محتویات فایل فشرده...' : 'Scanning archive contents...'}</p>
              </div>
            ) : error ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center gap-3">
                <div className="p-3 rounded-full bg-red-500/10 text-red-500">
                  <AlertCircle className="h-8 w-8" />
                </div>
                <h4 className="font-bold text-neutral-900 dark:text-white text-base">{t.failedLoad}</h4>
                <p className="text-xs text-red-500 max-w-md">{error}</p>
                <button
                  onClick={fetchArchiveData}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition"
                >
                  {lang === 'fa' ? 'تلاش مجدد' : 'Retry'}
                </button>
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-neutral-400 gap-3 text-center">
                <FolderOpen className="h-12 w-12 text-neutral-500/40" />
                <p className="text-sm font-medium">{t.emptyArchive}</p>
                <p className="text-xs text-neutral-500 max-w-xs">
                  {lang === 'fa' ? 'می‌توانید فایل‌های خود را به اینجا Drag & Drop کنید تا به این آرشیو اضافه شوند.' : 'You can drag & drop files here to add them to this archive.'}
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t.addFiles}</span>
                </button>
              </div>
            ) : (
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-neutral-50 dark:bg-neutral-800/80 sticky top-0 z-10 border-b border-neutral-200 dark:border-neutral-700/60 text-neutral-500 dark:text-neutral-400">
                  <tr>
                    <th className="p-2.5 sm:p-3 w-8 text-center">
                      <button
                        onClick={handleSelectAll}
                        className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                        title={selectedEntries.length === filteredEntries.length ? t.deselectAll : t.selectAll}
                      >
                        {selectedEntries.length > 0 && selectedEntries.length === filteredEntries.length ? (
                          <CheckSquare className="h-4 w-4 text-amber-500" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </th>
                    <th 
                      onClick={() => handleSort('name')}
                      className="p-2.5 sm:p-3 font-semibold cursor-pointer hover:text-neutral-900 dark:hover:text-white"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{t.name}</span>
                        {sortField === 'name' && <ArrowUpDown className="h-3 w-3 text-amber-500" />}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('size')}
                      className="p-2.5 sm:p-3 font-semibold cursor-pointer hover:text-neutral-900 dark:hover:text-white w-24 text-right"
                    >
                      <div className="flex items-center justify-end gap-1.5">
                        <span>{t.size}</span>
                        {sortField === 'size' && <ArrowUpDown className="h-3 w-3 text-amber-500" />}
                      </div>
                    </th>
                    <th className="p-2.5 sm:p-3 font-semibold hidden sm:table-cell w-24 text-right">
                      {t.compressedSize}
                    </th>
                    <th 
                      onClick={() => handleSort('mtime')}
                      className="p-2.5 sm:p-3 font-semibold cursor-pointer hover:text-neutral-900 dark:hover:text-white hidden lg:table-cell w-36"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{t.modified}</span>
                        {sortField === 'mtime' && <ArrowUpDown className="h-3 w-3 text-amber-500" />}
                      </div>
                    </th>
                    <th className="p-2.5 sm:p-3 font-semibold text-right w-24">
                      {t.actions}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {filteredEntries.map((entry) => {
                    const isSelected = selectedEntries.includes(entry.entryName);
                    const isPreviewing = previewFile?.entryName === entry.entryName;
                    
                    return (
                      <tr 
                        key={entry.entryName}
                        className={`hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition ${
                          isPreviewing ? 'bg-amber-500/10 dark:bg-amber-500/15' : isSelected ? 'bg-amber-500/5 dark:bg-amber-500/5' : ''
                        }`}
                      >
                        <td className="p-2.5 sm:p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(entry.entryName)}
                            className="rounded border-neutral-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                          />
                        </td>
                        <td className="p-2.5 sm:p-3 font-medium text-neutral-800 dark:text-neutral-200">
                          <div 
                            onClick={() => !entry.isDirectory && handlePreviewFile(entry)}
                            className={`flex items-center gap-2 max-w-full truncate ${
                              entry.isDirectory ? '' : 'cursor-pointer hover:text-amber-500 dark:hover:text-amber-400'
                            }`}
                          >
                            {getFileIcon(entry)}
                            <span className="truncate" title={entry.entryName}>
                              {entry.entryName}
                            </span>
                          </div>
                        </td>
                        <td className="p-2.5 sm:p-3 font-mono text-neutral-500 dark:text-neutral-400 text-right whitespace-nowrap">
                          {entry.isDirectory ? '-' : formatBytes(entry.size)}
                        </td>
                        <td className="p-2.5 sm:p-3 font-mono text-neutral-400 text-right whitespace-nowrap hidden sm:table-cell">
                          {entry.isDirectory || !entry.compressedSize ? '-' : formatBytes(entry.compressedSize)}
                        </td>
                        <td className="p-2.5 sm:p-3 text-neutral-400 whitespace-nowrap hidden lg:table-cell">
                          {entry.mtime ? new Date(entry.mtime).toLocaleDateString() : '-'}
                        </td>
                        <td className="p-2.5 sm:p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!entry.isDirectory && (
                              <>
                                <button
                                  onClick={() => handlePreviewFile(entry)}
                                  className="p-1.5 rounded-lg text-neutral-400 hover:text-amber-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
                                  title={t.preview}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDownloadEntry(entry)}
                                  className="p-1.5 rounded-lg text-neutral-400 hover:text-emerald-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
                                  title={t.download}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => setRenamingEntry({ oldName: entry.entryName, newName: entry.name })}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
                              title={t.rename}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm({ entries: [entry.entryName], isFolder: entry.isDirectory })}
                              className="p-1.5 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
                              title={t.delete}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Inline File Preview Panel */}
          {previewFile && (
            <div className="w-full md:w-1/2 border-t md:border-t-0 md:border-l dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/50 flex flex-col h-full overflow-hidden">
              {/* Preview Header */}
              <div className="p-3 sm:p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-white dark:bg-neutral-900">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="font-semibold text-xs sm:text-sm text-neutral-900 dark:text-white truncate" title={previewFile.entryName}>
                    {previewFile.fileName}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400 shrink-0">
                    ({formatBytes(previewFile.size)})
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {previewFile.isText && previewFile.content && (
                    <button
                      onClick={handleCopyPreview}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition flex items-center gap-1 cursor-pointer"
                      title={t.copyContent}
                    >
                      {copiedPreview ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedPreview ? t.copied : t.copyContent}</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const entry = data?.entries.find(e => e.entryName === previewFile.entryName);
                      if (entry) handleDownloadEntry(entry);
                    }}
                    className="p-1.5 rounded-lg text-neutral-500 hover:text-emerald-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                    title={t.download}
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPreviewFile(null)}
                    className="p-1.5 rounded-lg text-neutral-500 hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition cursor-pointer"
                    title={t.close}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Preview Body */}
              <div className="flex-1 overflow-auto p-3 sm:p-4 text-xs font-mono">
                {previewFile.loading ? (
                  <div className="h-full flex flex-col items-center justify-center text-neutral-400 gap-2">
                    <RefreshCw className="h-6 w-6 animate-spin text-amber-500" />
                    <span>Loading preview...</span>
                  </div>
                ) : previewFile.error ? (
                  <div className="p-4 rounded-xl bg-red-500/10 text-red-500 text-center">
                    {previewFile.error}
                  </div>
                ) : previewFile.isText && previewFile.content !== undefined ? (
                  <pre className="text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap break-all leading-relaxed select-text">
                    {previewFile.content || <span className="text-neutral-400 italic">(Empty file)</span>}
                  </pre>
                ) : previewFile.base64 ? (
                  <div className="h-full flex flex-col items-center justify-center p-4">
                    <img
                      src={`data:image/png;base64,${previewFile.base64}`}
                      alt={previewFile.fileName}
                      className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-md border border-neutral-200 dark:border-neutral-800"
                    />
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-neutral-400 text-center p-4 gap-2">
                    <File className="h-8 w-8 text-neutral-500" />
                    <p>{lang === 'fa' ? 'پیش‌نمایش متنی برای این فایل باینری امکان‌پذیر نیست.' : 'Binary file preview not supported directly.'}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-3 sm:px-6 sm:py-3.5 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-900/80 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <span>{filteredEntries.length} {lang === 'fa' ? 'آیتم یافت شد' : 'items shown'}</span>
            <span className="hidden sm:inline text-neutral-400">• {lang === 'fa' ? 'پشتیبانی از Drag & Drop برای افزودن فایل' : 'Drag & Drop files to add'}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition cursor-pointer"
          >
            {t.close}
          </button>
        </div>

        {/* Rename Entry Modal Dialog */}
        {renamingEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
            <div 
              className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                    <Edit2 className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                    {t.renameTitle}
                  </h3>
                </div>
                <button
                  onClick={() => !isRenaming && setRenamingEntry(null)}
                  className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-neutral-500 dark:text-neutral-400">
                  {lang === 'fa' ? 'مسیر و نام فعلی:' : 'Current entry:'}
                </label>
                <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800 font-mono text-xs text-neutral-700 dark:text-neutral-300 truncate">
                  {renamingEntry.oldName}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  {lang === 'fa' ? 'نام جدید:' : 'New name:'}
                </label>
                <input
                  type="text"
                  autoFocus
                  value={renamingEntry.newName}
                  onChange={(e) => setRenamingEntry({ ...renamingEntry, newName: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isRenaming) {
                      handleRenameEntry();
                    } else if (e.key === 'Escape' && !isRenaming) {
                      setRenamingEntry(null);
                    }
                  }}
                  placeholder={t.newNamePlaceholder}
                  className="w-full px-3 py-2 rounded-xl text-xs sm:text-sm bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isRenaming}
                  onClick={() => setRenamingEntry(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  disabled={isRenaming || !renamingEntry.newName.trim()}
                  onClick={handleRenameEntry}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {isRenaming && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>{isRenaming ? t.renaming : t.save}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal Dialog */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
            <div 
              className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-red-500/10 text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                    {t.confirmDeleteTitle}
                  </h3>
                </div>
                <button
                  onClick={() => !isDeleting && setDeleteConfirm(null)}
                  className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                {deleteConfirm.entries.length > 1
                  ? t.confirmDeleteSelectedMsg
                  : t.confirmDeleteMsg}
              </p>

              <div className="max-h-32 overflow-y-auto space-y-1 p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800/60 font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                {deleteConfirm.entries.map((entryName) => (
                  <div key={entryName} className="truncate flex items-center gap-1.5 text-red-600 dark:text-red-400">
                    <Trash2 className="h-3 w-3 shrink-0 opacity-70" />
                    <span className="truncate">{entryName}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeleteConfirm(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => handleDeleteEntries(deleteConfirm.entries)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {isDeleting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>{isDeleting ? t.deleting : (lang === 'fa' ? 'بله، حذف شود' : 'Yes, Delete')}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
