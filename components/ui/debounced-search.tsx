"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchInput } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";

export function DebouncedSearch({
  param = "q",
  placeholder = "Search…",
  initial = "",
  className = "",
}: {
  param?: string;
  placeholder?: string;
  initial?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const debounced = useDebouncedValue(value, 300);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const current = params.get(param) || "";
    if (debounced.trim() === current.trim()) return;
    const next = new URLSearchParams(params.toString());
    if (debounced.trim()) next.set(param, debounced.trim());
    else next.delete(param);
    next.delete("page");
    startTransition(() => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <SearchInput
      type="search"
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      aria-label={placeholder}
      className={className}
    />
  );
}
