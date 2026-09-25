"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Share, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as { MSStream?: unknown }).MSStream;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return (navigator as { standalone?: boolean }).standalone === true;
}

export function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHelp, setIosHelp] = useState(false);
  // installed is derived once on mount (no subscription needed): a PWA that
  // is already installed never fires beforeinstallprompt for itself.
  const [installed] = useState(() => isStandalone());
  const ios = isIosDevice();

  useEffect(() => {
    function onPrompt(e: BeforeInstallPromptEvent) {
      e.preventDefault();
      setDeferred(e);
    }
    function onInstalled() {
      setDeferred(null);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) {
      if (isIosDevice()) setIosHelp(true);
      return;
    }
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
  }, [deferred]);

  // Render nothing unless installation is actually available — no UI clutter.
  if (installed) return null;
  if (!deferred && !ios) return null;

  return (
    <>
      <Button
        variant="outline"
        size="icon-sm"
        onClick={install}
        title="Install app"
        aria-label="Install eluue ai agent app"
        className="h-9 w-9 rounded-xl border-border bg-card shadow-sm"
      >
        <Download className="h-4 w-4" />
      </Button>

      <Dialog open={iosHelp} onOpenChange={setIosHelp}>
        <DialogContent>
          <DialogTitle>Install eluue ai agent</DialogTitle>
          <ol className="flex flex-col gap-2.5 text-sm leading-6 text-muted-foreground">
            <li className="flex items-center gap-2">
              <Share className="h-4 w-4 shrink-0 text-primary" /> Tap <b className="text-foreground">Share</b> in Safari&apos;s toolbar.
            </li>
            <li className="flex items-center gap-2">
              <PlusSquare className="h-4 w-4 shrink-0 text-primary" /> Tap <b className="text-foreground">Add to Home Screen</b>.
            </li>
            <li className="flex items-center gap-2">
              <Download className="h-4 w-4 shrink-0 text-primary" /> Tap <b className="text-foreground">Add</b> to install the app.
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
