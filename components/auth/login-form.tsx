"use client";

import { useState } from "react";
import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "next-auth/react";
import { CircleAlert, CircleCheck, Eye, EyeOff } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

const AUTH_ERRORS: Record<string, string> = {
  OAuthAccountNotLinked:
    "This email is already registered with password login. Log in with your email and password instead.",
  CredentialsSignin: "Invalid email or password.",
  // OAuth round-trip failures (expired tab, restarted server, pop-up
  // blockers, or opening the app under a different host mid-flow): the fix is
  // always to start the Google sign-in again from this page.
  OAuthSignin: "Couldn't start Google sign-in. Please try again.",
  OAuthCallback: "Google sign-in was interrupted. Please click “Continue with Google” again.",
  OAuthCreateAccount: "Couldn't create your account with Google. Please try again.",
  EmailCreateAccount: "Couldn't create your account. Please try again.",
  Callback: "This sign-in link expired. Please start the sign-in again.",
  Verification: "This sign-in link is invalid or expired. Please try again.",
  SessionRequired: "Please log in to continue.",
  Configuration: "Login is temporarily unavailable. Please try again in a moment.",
  AccessDenied: "Access denied. Please try a different account.",
};

export function LoginForm({
  googleEnabled,
  authError,
  justCreated,
  next,
}: {
  googleEnabled?: boolean;
  authError?: string;
  justCreated?: boolean;
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: Awaited<ReturnType<typeof loginAction>> | null, formData: FormData) => loginAction(formData),
    null as Awaited<ReturnType<typeof loginAction>> | null,
  );
  const [googlePending, setGooglePending] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");

  const providerError = authError ? AUTH_ERRORS[authError] || "Couldn't log you in. Please try again." : null;

  async function handleGoogle() {
    if (googlePending) return;
    setGooglePending(true);
    setGoogleError(null);
    try {
      // redirect:true navigates the browser to Google on success. If the app
      // server itself is unreachable the call throws — surface that instead
      // of spinning forever.
      await signIn("google", { callbackUrl: next ?? "/dashboard" });
    } catch {
      setGoogleError("Couldn't reach the login server. Make sure the app is running (npm run dev), then try again.");
    } finally {
      setGooglePending(false);
    }
  }

  return (
    <div>
      {justCreated ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] p-3 text-[13px] font-medium text-emerald-700 dark:text-emerald-300" role="status">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" /> Workspace created — log in with your new account.
        </p>
      ) : null}
      <form action={formAction} className="flex flex-col gap-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label htmlFor="password" className="mb-0">Password</Label>
            <Link href="/forgot-password" className="text-xs font-medium text-muted-foreground hover:text-foreground">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              maxLength={72}
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
        </div>
        {state && !state.ok ? (
          <FieldError>
            <span className="flex items-start gap-1.5">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {state.error}
            </span>
          </FieldError>
        ) : null}
        {providerError ? (
          <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3" role="alert">
            <p className="flex items-start gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {providerError}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              This usually means the previous sign-in was interrupted.{" "}
              <Link
                href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
                className="font-semibold text-primary hover:underline"
              >
                Start again
              </Link>{" "}
              from this page and complete Google sign-in in the same tab. Still stuck?{" "}
              <a
                href="/api/auth/diagnostics"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-primary hover:underline"
              >
                Open the connection check
              </a>{" "}
              and send what it shows to support.
            </p>
          </div>
        ) : null}
        <Button type="submit" loading={pending} className="w-full" size="lg">
          {pending ? "Logging in…" : "Log in"}
        </Button>
      </form>

      {googleEnabled ? (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or continue with
            <div className="h-px flex-1 bg-border" />
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            size="lg"
            loading={googlePending}
            onClick={handleGoogle}
          >
            {!googlePending && (
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.3h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.7z" />
                <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.1.1-3.6 2.8v.1C3.5 21.3 7.4 24 12 24z" />
                <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.5-2.7H1.5C.6 8.7 0 10.2 0 12s.6 3.3 1.5 4.8l3.7-2.4z" />
                <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.4 0 3.5 2.7 1.5 6.8l3.7 2.9c1-2.9 3.7-5 6.8-5z" />
              </svg>
            )}
            Continue with Google
          </Button>
          {googleError ? (
            <p className="mt-2.5 flex items-start gap-1.5 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {googleError}
            </p>
          ) : null}
        </>
      ) : null}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          Create a workspace
        </Link>
      </p>
    </div>
  );
}
