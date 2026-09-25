export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 400,
  ) {
    super(message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, "NOT_FOUND", 404);
  }
}

/** Plan-limit error carrying the recommended upgrade tier for UI CTAs. */
export class LimitError extends AppError {
  constructor(
    message: string,
    code: "LIMIT_REACHED_AGENTS" | "LIMIT_REACHED_NUMBERS" | "LIMIT_REACHED_CONVERSATIONS" | "LIMIT_REACHED_CONTACTS",
    public upgradePlan: "starter" | "pro" | "business",
  ) {
    super(message, code, 403);
  }
}

function prismaCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as Record<string, unknown>;
  // PrismaClientKnownRequestError exposes `.code`; initialization errors
  // (auth / unreachable / TLS) expose `.errorCode`. Duck-typed on purpose so
  // this module never imports @prisma/client (it must stay client-safe).
  const code = record.code ?? record.errorCode;
  return typeof code === "string" ? code : undefined;
}

export function publicErrorMessage(error: unknown) {
  if (error instanceof AppError) return error.message;
  // Zod validation errors: surface the first human-readable issue (safe —
  // messages come from our own schemas, never from user input).
  if (typeof error === "object" && error !== null && (error as { name?: unknown }).name === "ZodError") {
    const issues = (error as { issues?: Array<{ message?: unknown }> }).issues;
    const first = issues?.find((i) => typeof i.message === "string")?.message as string | undefined;
    if (first) return first;
  }
  switch (prismaCode(error)) {
    case "P1000":
      return "Database authentication failed. The database user or password in DATABASE_URL is wrong — reset the database password (Supabase: Database settings) and update .env.local, then restart the dev server.";
    case "P1001":
      return "Cannot reach the database server. Check that DATABASE_URL is correct, the database is running (Supabase project not paused), and your network allows the connection.";
    case "P1002":
      return "The database timed out. It may be starting up or overloaded — wait a moment and try again.";
    case "P1017":
      return "Lost connection to the database. The server may have closed idle connections — try again.";
    case "P2002":
      return "That record already exists. Try different details or log in instead.";
    case "P2021":
    case "P2022":
      return "The database schema is out of date. Run `npx prisma db push` (dev) or apply pending migrations, then restart.";
    default:
      return "Something went wrong. Please try again.";
  }
}
