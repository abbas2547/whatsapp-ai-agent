"use client";

import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useDebouncedCallback<T extends (...args: never[]) => void>(fn: T, delay = 300) {
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer) clearTimeout(timer);
  }, [timer]);
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => fn(...args), delay));
  };
}
