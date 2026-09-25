"use client";

import { useState } from "react";
import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "next-auth/react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { loginAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

const AUTH_ERRORS: Record<string, string> = {
  OAuthAccountNotLinked:
    "This email is already registered with password login. Log in with your email and password instead.",
  CredentialsSignin: "Invalid email or password.",
  Configuration: "Login is temporarily unavailable. Please try again in a moment.",
  AccessDenied: "Access denied. Please try a different account.",
};

export function LoginForm({
  googleEnabled,
  authError,
  justCreated,
}: {
  googleEnabled?: boolean;
  authError?: string;
  justCreated?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    (_prev: Awaited<ReturnType<typeof loginAction>> | null, formData: FormData) => loginAction(formData),
    null as Awaited<ReturnType<typeof loginAction>> | null,
  );
  const [googlePending, setGooglePending] = useState(false);
  const [email, setEmail] = useState("");

  const providerError = authError ? AUTH_ERRORS[authError] || "Couldn't log you in. Please try again." : null;

  return (
    <div>
      {justCreated ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] p-3 text-[13px] font-medium text-emerald-700 dark:text-emerald-300" role="status">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" /> Workspace created — log in with your new account.
        </p>
      ) : null}
      <form action={formAction} className="flex flex-col gap-4">
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
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />
        </div>
        {state && !state.ok && (state as { code?: string }).code === "ACCOUNT_NOT_FOUND" ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3" role="alert">
            <p className="text-[13px] font-semibold">Account not found</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              You don&apos;t have an account yet. Create your account to continue.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-2.5">
              <Link href="/register">Create account</Link>
            </Button>
          </div>
        ) : null}
        {state && !state.ok && (state as { code?: string }).code !== "ACCOUNT_NOT_FOUND" ? (
          <FieldError>
            <span className="flex items-start gap-1.5">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {state.error}
            </span>
          </FieldError>
        ) : null}
        {providerError ? (
          <p className="flex items-start gap-1.5 text-xs font-medium text-red-600 dark:text-red-400" role="alert">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {providerError}
          </p>
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
            variant="outline"
            className="w-full"
            size="lg"
            loading={googlePending}
            onClick={() => {
              setGooglePending(true);
              signIn("google", { callbackUrl: "/dashboard" });
            }}
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
