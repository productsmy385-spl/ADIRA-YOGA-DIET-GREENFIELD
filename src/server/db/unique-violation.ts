/**
 * Translate PostgreSQL constraint violations into something a service layer can branch on.
 *
 * The alternative — catching the raw driver error and string-matching its message — puts
 * knowledge of constraint names into every caller and breaks the moment a constraint is
 * renamed. Keeping the translation here means a service can ask "was this a duplicate
 * email?" without knowing what the index is called.
 */

/** 23505 unique_violation. */
const UNIQUE_VIOLATION = "23505";
/** 23503 foreign_key_violation. */
const FOREIGN_KEY_VIOLATION = "23503";
/** 23514 check_violation. */
const CHECK_VIOLATION = "23514";

interface PostgresError {
  code: string;
  constraint?: string;
  detail?: string;
}

function asPostgresError(error: unknown): PostgresError | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as { code?: unknown; constraint?: unknown; detail?: unknown };
  if (typeof candidate.code !== "string") return null;

  return {
    code: candidate.code,
    constraint: typeof candidate.constraint === "string" ? candidate.constraint : undefined,
    detail: typeof candidate.detail === "string" ? candidate.detail : undefined,
  };
}

/**
 * Is this a unique-constraint violation, optionally of one named constraint?
 *
 * Pass the constraint name whenever the caller cares which uniqueness rule was broken.
 * A bare `isUniqueViolation(error)` on a table with several unique indexes will happily
 * report "email already taken" when the real collision was somewhere else entirely.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = asPostgresError(error);
  if (pgError?.code !== UNIQUE_VIOLATION) return false;
  return constraint === undefined || pgError.constraint === constraint;
}

export function isForeignKeyViolation(error: unknown, constraint?: string): boolean {
  const pgError = asPostgresError(error);
  if (pgError?.code !== FOREIGN_KEY_VIOLATION) return false;
  return constraint === undefined || pgError.constraint === constraint;
}

export function isCheckViolation(error: unknown, constraint?: string): boolean {
  const pgError = asPostgresError(error);
  if (pgError?.code !== CHECK_VIOLATION) return false;
  return constraint === undefined || pgError.constraint === constraint;
}

/**
 * The violated constraint's name, or null.
 *
 * Useful for logging. Do NOT put this in a user-facing message: constraint names leak
 * schema structure, and on a multi-tenant system that is free reconnaissance.
 */
export function violatedConstraint(error: unknown): string | null {
  return asPostgresError(error)?.constraint ?? null;
}
