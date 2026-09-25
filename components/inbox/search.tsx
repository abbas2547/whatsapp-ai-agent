"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchInput } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";

export function InboxSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const debounced = useDebouncedValue(value, 300);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const current = params.get("q") || "";
    if (debounced.trim() === current.trim()) return;
    const next = new URLSearchParams(params.toString());
    if (debounced.trim()) next.set("q", debounced.trim());
    else next.delete("q");
    next.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <SearchInput
      type="search"
      placeholder="Search name or phone…"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      aria-label="Search conversations"
      className="w-full sm:w-64"
    />
  );
}
