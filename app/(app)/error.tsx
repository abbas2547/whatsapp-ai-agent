"use client";

import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-10">
      <Card className="p-8 text-center">
        <CircleAlert className="mx-auto h-9 w-9 text-red-500" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          We couldn&apos;t load this page. Your data is safe — please try again.
        </p>
        <CardContent className="flex justify-center gap-2 p-0 pt-5">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>
            Go to dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
