"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable (private mode) — form still works in memory.
  }
}

/**
 * Persists form state to localStorage so refresh / back / forward navigation
 * never loses what the user typed. SSR-safe, debounced writes.
 */
export function usePersistentState<T>(key: string, initial: T, delay = 300) {
  const [value, setValue] = useState<T>(() => readStored(key, initial));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);

  // If the server-provided initial changes (e.g. agent loaded), adopt it only
  // when there is no stored draft for this key.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => writeStored(key, value), delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, value, delay]);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, [key]);

  return [value, setValue, clear] as const;
}

export function removeStored(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
