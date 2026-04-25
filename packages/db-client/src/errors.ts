import { DatabaseError } from "pg";

export type DbErrorCode =
  | "unique_violation"
  | "foreign_key_violation"
  | "not_null_violation"
  | "check_violation"
  | "connection_error"
  | "unknown";

export class DbError extends Error {
  readonly code: DbErrorCode;
  readonly detail: string | undefined;
  readonly constraint: string | undefined;

  constructor(message: string, code: DbErrorCode, detail?: string, constraint?: string) {
    super(message);
    this.name = "DbError";
    this.code = code;
    this.detail = detail;
    this.constraint = constraint;
  }
}

const PG_CODE_MAP: Record<string, DbErrorCode> = {
  "23505": "unique_violation",
  "23503": "foreign_key_violation",
  "23502": "not_null_violation",
  "23514": "check_violation",
  "08001": "connection_error",
  "08006": "connection_error",
};

export function mapDbError(err: unknown): DbError {
  if (err instanceof DbError) {
    return err;
  }
  if (err instanceof DatabaseError) {
    const code =
      err.code !== undefined ? (PG_CODE_MAP[err.code] ?? "unknown") : "unknown";
    return new DbError(err.message, code, err.detail, err.constraint);
  }
  if (err instanceof Error) {
    return new DbError(err.message, "unknown");
  }
  return new DbError(String(err), "unknown");
}
