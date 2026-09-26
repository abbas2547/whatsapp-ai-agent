import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(),
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 characters (generate with `openssl rand -base64 32`)"),
  NEXTAUTH_URL: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function env(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function appUrl() {
  return env().NEXT_PUBLIC_APP_URL || env().NEXTAUTH_URL || "http://localhost:3000";
}

export function whatsappVerifyToken() {
  return env().WHATSAPP_VERIFY_TOKEN || env().META_VERIFY_TOKEN || "";
}

export function isPlaceholder(value?: string | null) {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return (
    v.length === 0 ||
    v.includes("your_") ||
    (v.startsWith("your") && v.includes("here")) ||
    v === "changeme"
  );
}
