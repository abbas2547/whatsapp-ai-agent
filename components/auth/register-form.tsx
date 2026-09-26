"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CircleAlert, CircleCheck, Eye, EyeOff } from "lucide-react";
import { registerAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Strength = { label: string; score: number };

function passwordStrength(password: string): Strength {
  if (!password) return { label: "", score: 0 };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^a-zA-Z0-9]/.test(password)) score += 1;
  if (password.length < 8) return { label: "Too short", score: 1 };
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return { label: labels[score] ?? "Weak", score };
}

const STRENGTH_BAR = ["bg-red-500", "bg-amber-500", "bg-blue-500", "bg-emerald-500"];

export function RegisterForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(
    (_prev: Awaited<ReturnType<typeof registerAction>> | null, formData: FormData) => registerAction(formData),
    null as Awaited<ReturnType<typeof registerAction>> | null,
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const strength = passwordStrength(password);
  // Only judge the match once the user started typing the confirmation —
  // never flash "doesn't match" while the first field is still being filled.
  const touchedConfirm = confirm.length > 0;
  const matches = touchedConfirm && password === confirm;

  function handleSubmit(formData: FormData) {
    if (password !== confirm) {
      setLocalError("Passwords do not match. Please make both fields identical.");
      return;
    }
    if (password.length < 8) {
      setLocalError("Password must be at least 8 characters.");
      return;
    }
    setLocalError(null);
    return formAction(formData);
  }

  return (
    <div>
      <form action={handleSubmit} className="flex flex-col gap-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" autoComplete="name" placeholder="Aarav Sharma" required minLength={2} maxLength={100} />
          </div>
          <div>
            <Label htmlFor="organizationName">Workspace name</Label>
            <Input
              id="organizationName"
              name="organizationName"
              autoComplete="organization"
              placeholder="Acme Inc"
              required
              minLength={2}
              maxLength={100}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="email">Work email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required maxLength={254} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              minLength={8}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-11"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password ? (
            <div className="mt-2 flex items-center gap-2" aria-live="polite">
              <div className="flex flex-1 gap-1">
                {[1, 2, 3, 4].map((level) => (
                  <span
                    key={level}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors",
                      level <= strength.score ? STRENGTH_BAR[strength.score - 1] ?? "bg-muted" : "bg-muted",
                    )}
                  />
                ))}
              </div>
              <span className="text-xs font-medium text-muted-foreground">{strength.label}</span>
            </div>
          ) : (
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              At least 8 characters. Use a password you don&apos;t reuse elsewhere.
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Repeat your password"
              minLength={8}
              maxLength={72}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={touchedConfirm && !matches}
              aria-describedby={touchedConfirm ? "confirm-match-hint" : undefined}
              className={cn("pr-11", touchedConfirm && !matches && "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/30")}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? "Hide confirmation" : "Show confirmation"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {touchedConfirm ? (
            <p
              id="confirm-match-hint"
              aria-live="polite"
              className={cn(
                "mt-1.5 flex items-center gap-1.5 text-xs font-medium",
                matches ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
              )}
            >
              {matches ? (
                <>
                  <CircleCheck className="h-3.5 w-3.5 shrink-0" /> Passwords match
                </>
              ) : (
                <>
                  <CircleAlert className="h-3.5 w-3.5 shrink-0" /> Passwords do not match
                </>
              )}
            </p>
          ) : null}
        </div>
        {localError ? (
          <FieldError>
            <span className="flex items-start gap-1.5">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {localError}
            </span>
          </FieldError>
        ) : null}
        {state && !state.ok ? (
          <FieldError>
            <span className="flex items-start gap-1.5">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {state.error}
            </span>
          </FieldError>
        ) : null}
        <Button type="submit" loading={pending} className="w-full" size="lg">
          {pending ? "Creating workspace…" : "Create workspace"}
        </Button>
      </form>
      <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">
        By creating a workspace you agree to use real business data responsibly. Your credentials are stored encrypted.
      </p>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
