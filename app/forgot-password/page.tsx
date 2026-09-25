import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { KeyRound } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage() {
  const session = await auth();
  if (session?.user) redirect(session.user.organizationId ? "/dashboard" : "/onboarding");

  return (
    <AuthShell title="Reset your password" subtitle="Self-service password reset isn't available yet.">
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
          <KeyRound className="h-5 w-5 text-primary" />
        </span>
        <p className="text-sm leading-6 text-muted-foreground">
          Password reset emails are not implemented in this version. Ask your workspace owner or
          administrator to reset your password, or create a new workspace with a different email
          address.
        </p>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/login">Back to login</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Create account</Link>
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
