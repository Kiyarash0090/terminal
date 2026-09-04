import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  Volume2,
  VolumeX,
  Music,
  Film,
  Image as ImageIcon,
  FileText,
  RotateCcw,
  SkipBack,
  SkipForward,
  Repeat
} from 'lucide-react';
import { FileItem, Language } from '../types';
import { translations } from '../locales/translations';

interface MediaViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string | null;
  items: FileItem[];
  token: string | null;
  lang: Language;
}

export const isMediaFile = (filename: string): boolean => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mediaExtensions = [
    // Images
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff', 'tif', 'avif',
    // Video
    'mp4', 'webm', 'ogg', 'mkv', 'mov', 'avi', '3gp', 'm4v',
    // Audio
    'mp3', 'wav', 'aac', 'flac', 'm4a', 'opus', 'wma',
    // Documents
    'pdf'
  ];
  return mediaExtensions.includes(ext);
};

export const getMediaType = (filename: string): 'image' | 'video' | 'audio' | 'pdf' | 'unknown' => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff', 'tif', 'avif'].includes(ext)) {
    return 'image';
  }
  if (['mp4', 'webm', 'ogg', 'mkv', 'mov', 'avi', '3gp', 'm4v'].includes(ext)) {
    return 'video';
  }
  if (['mp3', 'wav', 'aac', 'flac', 'm4a', 'opus', 'wma'].includes(ext)) {
    return 'audio';
  }
  if (ext === 'pdf') {
    return 'pdf';
  }
  return 'unknown';
};

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  isOpen,
  onClose,
  filePath,
  items,
  token,
  lang
}) => {
  const t = translations[lang];
  
  // Filter all media files from the current folder
  const mediaItems = React.useMemo(() => {
    return items.filter(item => !item.isDirectory && isMediaFile(item.name));
  }, [items]);

  const [currentIndex, setCurrentIndex] = useState<number>(0);

  useEffect(() => {
    if (filePath) {
      const idx = mediaItems.findIndex(i => i.path === filePath);
      if (idx !== -1) {
        setCurrentIndex(idx);
      } else {
        setCurrentIndex(0);
      }
    }
  }, [filePath, mediaItems]);

  const currentItem = mediaItems[currentIndex] || null;
  const currentPath = currentItem ? currentItem.path : filePath || '';
  const mediaType = currentItem ? getMediaType(currentItem.name) : getMediaType(filePath || '');

  // Image controls
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  // Audio / Video custom state
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isLoop, setIsLoop] = useState<boolean>(false);

  // Reset controls when current media item changes
  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setDimensions(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [currentIndex, currentPath]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        if (lang === 'fa') {
          handlePrev();
        } else {
          handleNext();
        }
      } else if (e.key === 'ArrowLeft') {
        if (lang === 'fa') {
          handleNext();
        } else {
          handlePrev();
        }
      } else if (e.key === ' ') {
        if (mediaType === 'video' || mediaType === 'audio') {
          e.preventDefault();
          togglePlay();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, mediaItems, currentIndex, isPlaying, mediaType, lang]);

  if (!isOpen || !currentPath) return null;

  const streamUrl = `/api/files/stream?path=${encodeURIComponent(currentPath)}&token=${encodeURIComponent(token || '')}`;
  const downloadUrl = `/api/files/download?path=${encodeURIComponent(currentPath)}&token=${encodeURIComponent(token || '')}`;
  const fileName = currentItem ? currentItem.name : currentPath.split('/').pop() || 'media';

  const handlePrev = () => {
    if (mediaItems.length === 0) return;
    setCurrentIndex(prev => (prev - 1 + mediaItems.length) % mediaItems.length);
  };

  const handleNext = () => {
    if (mediaItems.length === 0) return;
    setCurrentIndex(prev => (prev + 1) % mediaItems.length);
  };

  const togglePlay = () => {
    if (!mediaRef.current) return;
    if (isPlaying) {
      mediaRef.current.pause();
    } else {
      mediaRef.current.play();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (mediaRef.current) {
      mediaRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    setIsMuted(vol === 0);
    if (mediaRef.current) {
      mediaRef.current.volume = vol;
      mediaRef.current.muted = vol === 0;
    }
  };

  const toggleMute = () => {
    if (!mediaRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    mediaRef.current.muted = nextMuted;
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (mediaRef.current) {
      mediaRef.current.playbackRate = rate;
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const skipTime = (seconds: number) => {
    if (!mediaRef.current) return;
    mediaRef.current.currentTime = Math.max(0, Math.min(duration, mediaRef.current.currentTime + seconds));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between p-2 sm:p-4 select-none animate-fadeIn">
      
      {/* Top Header Controls Bar */}
      <div className="flex items-center justify-between gap-2 p-2 sm:p-3 rounded-2xl bg-neutral-900/80 border border-white/10 text-white shadow-xl backdrop-blur-xl z-20 shrink-0">
        
        {/* Title & Badge */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-white/10 text-amber-400 shrink-0">
            {mediaType === 'image' && <ImageIcon className="h-5 w-5" />}
            {mediaType === 'video' && <Film className="h-5 w-5 text-purple-400" />}
            {mediaType === 'audio' && <Music className="h-5 w-5 text-rose-400" />}
            {mediaType === 'pdf' && <FileText className="h-5 w-5 text-red-400" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-white truncate max-w-[180px] sm:max-w-xs md:max-w-md font-mono" title={fileName}>
              {fileName}
            </h3>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs text-neutral-400 font-mono">
              <span className="uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-white/10 text-amber-300">
                {fileName.split('.').pop()}
              </span>
              {mediaItems.length > 0 && (
                <span>
                  {currentIndex + 1} / {mediaItems.length}
                </span>
              )}
              {dimensions && (
                <span className="hidden sm:inline-block">
                  • {dimensions.width} × {dimensions.height} px
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          
          {/* Navigation Buttons */}
          {mediaItems.length > 1 && (
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 me-1 sm:me-2">
              <button
                onClick={handlePrev}
                className="p-1.5 rounded-lg hover:bg-white/15 text-neutral-200 hover:text-white transition cursor-pointer"
                title={lang === 'fa' ? 'رسانه قبلی' : 'Previous media'}
              >
                <ChevronRight className="h-4 w-4 rtl:rotate-180" />
              </button>
              <button
                onClick={handleNext}
                className="p-1.5 rounded-lg hover:bg-white/15 text-neutral-200 hover:text-white transition cursor-pointer"
                title={lang === 'fa' ? 'رسانه بعدی' : 'Next media'}
              >
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
              </button>
            </div>
          )}

          <a
            href={streamUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-neutral-200 hover:text-white transition flex items-center justify-center cursor-pointer"
            title={lang === 'fa' ? 'باز کردن در تب جدید' : 'Open in new tab'}
          >
            <ExternalLink className="h-4 w-4" />
          </a>

          <a
            href={downloadUrl}
            download={fileName}
            className="p-2 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white transition flex items-center justify-center cursor-pointer shadow-lg shadow-emerald-500/20"
            title={lang === 'fa' ? 'دانلود فایل' : 'Download file'}
          >
            <Download className="h-4 w-4" />
          </a>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white transition flex items-center justify-center cursor-pointer"
            title={lang === 'fa' ? 'بستن' : 'Close'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Content Viewer Canvas Area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden my-2 rounded-2xl bg-black/40 border border-white/5">
        
        {/* Next/Prev Floating Mobile Touch Buttons */}
        {mediaItems.length > 1 && (
          <>
            <button
              onClick={handlePrev}
              className="absolute start-2 z-30 p-2 sm:p-3 rounded-2xl bg-black/60 hover:bg-black/90 text-white/80 hover:text-white backdrop-blur-md border border-white/10 transition cursor-pointer shadow-2xl"
              title={lang === 'fa' ? 'قبلی' : 'Previous'}
            >
              <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6 rtl:rotate-180" />
            </button>
            <button
              onClick={handleNext}
              className="absolute end-2 z-30 p-2 sm:p-3 rounded-2xl bg-black/60 hover:bg-black/90 text-white/80 hover:text-white backdrop-blur-md border border-white/10 transition cursor-pointer shadow-2xl"
              title={lang === 'fa' ? 'بعدی' : 'Next'}
            >
              <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6 rtl:rotate-180" />
            </button>
          </>
        )}

        {/* 1. IMAGE VIEWER */}
        {mediaType === 'image' && (
          <div className="relative w-full h-full flex items-center justify-center overflow-auto p-4">
            <img
              src={streamUrl}
              alt={fileName}
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transition: 'transform 0.2s ease-out',
                maxHeight: '100%',
                maxWidth: '100%',
                objectFit: 'contain'
              }}
              className="rounded-lg shadow-2xl select-none"
              onLoad={(e) => {
                const target = e.target as HTMLImageElement;
                setDimensions({ width: target.naturalWidth, height: target.naturalHeight });
              }}
            />
          </div>
        )}

        {/* 2. VIDEO PLAYER */}
        {mediaType === 'video' && (
          <div className="relative w-full h-full flex items-center justify-center p-2">
            <video
              ref={mediaRef as React.RefObject<HTMLVideoElement>}
              src={streamUrl}
              controls
              autoPlay
              playsInline
              className="max-w-full max-h-full rounded-xl shadow-2xl bg-black"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={() => {
                if (mediaRef.current) {
                  setCurrentTime(mediaRef.current.currentTime);
                }
              }}
              onLoadedMetadata={() => {
                if (mediaRef.current) {
                  setDuration(mediaRef.current.duration);
                }
              }}
            />
          </div>
        )}

        {/* 3. AUDIO PLAYER */}
        {mediaType === 'audio' && (
          <div className="w-full max-w-lg p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-neutral-900 via-neutral-900/90 to-neutral-950 border border-white/10 shadow-2xl flex flex-col items-center text-center space-y-6">
            
            {/* Animated Album / Wave Card */}
            <div className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-3xl bg-gradient-to-br from-rose-500/20 via-purple-500/20 to-amber-500/20 border border-white/10 flex items-center justify-center shadow-inner overflow-hidden group">
              <div className={`absolute inset-0 bg-rose-500/10 rounded-full blur-2xl transition-all duration-700 ${isPlaying ? 'scale-150 opacity-100 animate-pulse' : 'scale-75 opacity-0'}`} />
              <Music className={`h-16 w-16 sm:h-20 sm:w-20 text-rose-400 transition-transform duration-500 ${isPlaying ? 'scale-110 drop-shadow-[0_0_15px_rgba(244,63,94,0.6)]' : 'scale-100 opacity-80'}`} />
              
              {/* Sound Wave Animation */}
              {isPlaying && (
                <div className="absolute bottom-3 flex items-end gap-1 h-6">
                  <div className="w-1 bg-rose-400 rounded-full animate-[bounce_1s_infinite_100ms]" style={{ height: '80%' }} />
                  <div className="w-1 bg-amber-400 rounded-full animate-[bounce_1s_infinite_300ms]" style={{ height: '100%' }} />
                  <div className="w-1 bg-purple-400 rounded-full animate-[bounce_1s_infinite_200ms]" style={{ height: '60%' }} />
                  <div className="w-1 bg-rose-400 rounded-full animate-[bounce_1s_infinite_400ms]" style={{ height: '90%' }} />
                </div>
              )}
            </div>

            {/* Title */}
            <div className="space-y-1 max-w-full">
              <h4 className="text-base sm:text-lg font-bold text-white truncate max-w-xs font-mono">
                {fileName}
              </h4>
              <p className="text-xs text-rose-400 font-semibold uppercase tracking-wider">
                {lang === 'fa' ? 'فایل صوتی' : 'Audio Track'}
              </p>
            </div>

            {/* Hidden Native Audio Element */}
            <audio
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              src={streamUrl}
              autoPlay
              loop={isLoop}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={() => {
                if (mediaRef.current) {
                  setCurrentTime(mediaRef.current.currentTime);
                }
              }}
              onLoadedMetadata={() => {
                if (mediaRef.current) {
                  setDuration(mediaRef.current.duration);
                }
              }}
            />

            {/* Scrubbing Bar & Time Display */}
            <div className="w-full space-y-1.5">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-rose-500 focus:outline-none"
              />
              <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-3 sm:gap-4 w-full">
              
              <button
                onClick={() => setIsLoop(!isLoop)}
                className={`p-2.5 rounded-xl transition cursor-pointer ${
                  isLoop ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'text-neutral-400 hover:text-white'
                }`}
                title={lang === 'fa' ? 'تکرار پخش' : 'Repeat'}
              >
                <Repeat className="h-4 w-4" />
              </button>

              <button
                onClick={() => skipTime(-10)}
                className="p-2.5 rounded-xl text-neutral-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="-10 sec"
              >
                <SkipBack className="h-5 w-5" />
              </button>

              <button
                onClick={togglePlay}
                className="p-4 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white transition transform hover:scale-105 active:scale-95 cursor-pointer shadow-xl shadow-rose-500/30"
              >
                {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 fill-current" />}
              </button>

              <button
                onClick={() => skipTime(10)}
                className="p-2.5 rounded-xl text-neutral-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                title="+10 sec"
              >
                <SkipForward className="h-5 w-5" />
              </button>

              <button
                onClick={toggleMute}
                className="p-2.5 rounded-xl text-neutral-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                {isMuted ? <VolumeX className="h-5 w-5 text-rose-400" /> : <Volume2 className="h-5 w-5" />}
              </button>
            </div>
          </div>
        )}

        {/* 4. PDF VIEWER */}
        {mediaType === 'pdf' && (
          <iframe
            src={streamUrl}
            title={fileName}
            className="w-full h-full rounded-xl border-0 shadow-2xl bg-white"
          />
        )}

        {/* UNKNOWN MEDIA FALLBACK */}
        {mediaType === 'unknown' && (
          <div className="flex flex-col items-center justify-center p-8 text-center text-neutral-400 space-y-3">
            <FileText className="h-12 w-12 text-neutral-500" />
            <p className="text-sm font-semibold">{lang === 'fa' ? 'پیش‌نمایش آنلاین برای این نوع فایل پشتیبانی نمی‌شود.' : 'Online preview is not available for this file type.'}</p>
            <a
              href={downloadUrl}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition cursor-pointer flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              <span>{t.download}</span>
            </a>
          </div>
        )}
      </div>

      {/* Bottom Control Toolbar (For Image Controls or Speed adjustment) */}
      <div className="flex items-center justify-between gap-2 p-2 sm:p-3 rounded-2xl bg-neutral-900/80 border border-white/10 text-white shadow-xl backdrop-blur-xl z-20 shrink-0">
        
        {/* Left Info / Counter */}
        <div className="text-xs font-mono text-neutral-400">
          {mediaType === 'image' && zoom !== 1 && (
            <span>Zoom: {Math.round(zoom * 100)}%</span>
          )}
          {(mediaType === 'video' || mediaType === 'audio') && (
            <span className="flex items-center gap-1">
              <span>Rate:</span>
              {[0.75, 1, 1.25, 1.5, 2].map(rate => (
                <button
                  key={rate}
                  onClick={() => handlePlaybackRateChange(rate)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                    playbackRate === rate ? 'bg-amber-500 text-black' : 'bg-white/10 hover:bg-white/20 text-neutral-300'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </span>
          )}
        </div>

        {/* Image Control Tools */}
        {mediaType === 'image' && (
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setZoom(z => Math.max(0.2, z - 0.25))}
              className="p-1.5 rounded-lg hover:bg-white/15 text-neutral-200 transition cursor-pointer"
              title={lang === 'fa' ? 'کوچک‌نمایی' : 'Zoom out'}
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="px-2 py-1 rounded-lg hover:bg-white/15 text-xs font-mono text-neutral-200 transition cursor-pointer"
              title={lang === 'fa' ? 'اندازه اصلی' : 'Reset zoom'}
            >
              100%
            </button>
            <button
              onClick={() => setZoom(z => Math.min(5, z + 0.25))}
              className="p-1.5 rounded-lg hover:bg-white/15 text-neutral-200 transition cursor-pointer"
              title={lang === 'fa' ? 'بزرگ‌نمایی' : 'Zoom in'}
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <div className="w-px h-4 bg-white/10 my-auto mx-1" />
            <button
              onClick={() => setRotation(r => (r + 90) % 360)}
              className="p-1.5 rounded-lg hover:bg-white/15 text-neutral-200 transition cursor-pointer"
              title={lang === 'fa' ? 'چرخش ۹۰ درجه' : 'Rotate'}
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Right Close hint */}
        <div className="text-[11px] text-neutral-500 hidden sm:block">
          {lang === 'fa' ? 'راهنما: از کلیدهای کیبورد ← و → برای جابجایی بین فایل‌های رسانه‌ای استفاده کنید' : 'Tip: Use ← and → keys to switch between media files'}
        </div>
      </div>
    </div>
  );
};
