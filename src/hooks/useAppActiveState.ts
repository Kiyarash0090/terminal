import { useState, useEffect, useCallback, useRef } from 'react';

// 2 minutes of zero user interaction triggers idle/sleep mode
const IDLE_TIMEOUT_MS = 120_000;

export interface AppActiveState {
  isSleeping: boolean;
  isIdle: boolean;
  isVisible: boolean;
  wakeUp: () => void;
}

/**
 * Hook to detect whether the user is actively using the application.
 * When the browser tab is hidden (minimized/switched) or user is inactive for >2 minutes:
 * isSleeping becomes true, allowing components to pause all polling, timers and requests.
 * User background tasks running on the server will continue uninterrupted.
 */
export function useAppActiveState(): AppActiveState {
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    return typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;
  });
  const [isIdle, setIsIdle] = useState<boolean>(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetIdle = useCallback(() => {
    setIsIdle(false);
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      setIsIdle(true);
    }, IDLE_TIMEOUT_MS);
  }, []);

  const wakeUp = useCallback(() => {
    setIsVisible(true);
    resetIdle();
  }, [resetIdle]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleVisibility = () => {
      const visible = document.visibilityState === 'visible';
      setIsVisible(visible);
      if (visible) {
        resetIdle();
      }
    };

    resetIdle();

    const activityEvents = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'] as const;
    activityEvents.forEach((ev) => {
      window.addEventListener(ev, resetIdle, { passive: true });
    });
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      activityEvents.forEach((ev) => {
        window.removeEventListener(ev, resetIdle);
      });
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [resetIdle]);

  const isSleeping = !isVisible || isIdle;

  return {
    isSleeping,
    isIdle,
    isVisible,
    wakeUp
  };
}
