import { AppError, LimitError, publicErrorMessage } from "@/lib/errors";

/**
 * Shared server-action failure envelope. Imported by every file under
 * app/actions/ so each action module stays small and compiles fast.
 */
export function fail(error: unknown) {
  const code = error instanceof AppError ? error.code : undefined;
  const extra =
    error instanceof LimitError ? { upgradePlan: error.upgradePlan } : {};
  return { ok: false as const, error: publicErrorMessage(error), code, ...extra };
}
