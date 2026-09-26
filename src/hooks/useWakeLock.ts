"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export function useWakeLock() {
  const [isLocked, setIsLocked] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    if (typeof window !== "undefined" && "wakeLock" in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        setIsLocked(true);
        wakeLockRef.current?.addEventListener("release", () => {
          setIsLocked(false);
        });
      } catch (err) {
        console.warn("Screen Wake Lock không khả dụng trên trình duyệt này:", err);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      setIsLocked(false);
    }
  }, []);

  useEffect(() => {
    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseWakeLock();
    };
  }, [requestWakeLock, releaseWakeLock]);

  return { isLocked, requestWakeLock, releaseWakeLock };
}
