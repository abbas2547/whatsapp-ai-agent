"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/utils";
import { registerWorkspace } from "@/services/organization/organization.service";
import { fail } from "./_shared";

export async function registerAction(formData: FormData) {
  // Basic abuse guard keyed on email (server actions have no trusted IP).
  try {
    const rawEmail = String(formData.get("email") || "").toLowerCase().trim();
    if (rawEmail) {
      const limited = rateLimit(`register:${rawEmail}`, 5, 60 * 60_000);
      if (!limited.success) {
        return fail(new AppError("Too many attempts. Please try again later.", "RATE_LIMITED", 429));
      }
    }
    const parsed = z
      .object({
        name: z.string().trim().min(2, "Please enter your name").max(100),
        email: z.string().trim().email("Please enter a valid email address").max(254),
        password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password must be at most 72 characters"),
        confirmPassword: z.string().min(1, "Please confirm your password").max(72),
        organizationName: z.string().trim().min(2, "Please name your workspace").max(100),
      })
      .refine((v) => v.password === v.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
      })
      .parse({
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
        confirmPassword: formData.get("confirmPassword"),
        organizationName: formData.get("organizationName"),
      });
    await registerWorkspace(parsed);
  } catch (error) {
    return fail(error);
  }
  // Spec flow is Register → Login (no auto sign-in): the new user signs in
  // explicitly so credentials are verified through the real auth provider.
  const next = safeNextPath(formData.get("next"));
  redirect(next ? `/login?created=1&next=${encodeURIComponent(next)}` : "/login?created=1");
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").toLowerCase().trim().slice(0, 254);
  const password = String(formData.get("password") || "").slice(0, 72);
  const next = safeNextPath(formData.get("next")) ?? "/dashboard";
  if (!email || !password) {
    return fail(new AppError("Enter your email and password.", "INVALID_LOGIN", 401));
  }
  // Brute-force guard: key on the account identifier (IP headers are spoofable
  // in server actions, so email is the stable key). 10 attempts / 10 min.
  const limited = rateLimit(`login:${email}`, 10, 10 * 60_000);
  if (!limited.success) {
    return fail(new AppError("Too many login attempts. Please wait a few minutes and try again.", "RATE_LIMITED", 429));
  }
  // NOTE: no pre-lookup — returning distinct "account not found" vs "wrong
  // password" lets attackers enumerate registered emails. Always go through
  // the real provider and return one generic message.
  try {
    await signIn("credentials", { email, password, redirectTo: next });
  } catch (error) {
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    return fail(new AppError("Invalid email or password.", "INVALID_LOGIN", 401));
  }
}
