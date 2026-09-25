"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleAlert } from "lucide-react";
import { registerAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError, FieldHint } from "@/components/ui/input";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(
    (_prev: Awaited<ReturnType<typeof registerAction>> | null, formData: FormData) => registerAction(formData),
    null as Awaited<ReturnType<typeof registerAction>> | null,
  );

  return (
    <div>
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" autoComplete="name" placeholder="Aarav Sharma" required minLength={2} />
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
            />
          </div>
        </div>
        <div>
          <Label htmlFor="email">Work email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            minLength={8}
            required
          />
          <FieldHint>At least 8 characters. Use a password you don&apos;t reuse elsewhere.</FieldHint>
        </div>
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
