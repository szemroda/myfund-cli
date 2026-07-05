export const errorCodes = [
  "MISSING_API_KEY",
  "MISSING_PORTFOLIO",
  "PORTFOLIO_NOT_FOUND",
  "MYFUND_API_ERROR",
  "NETWORK_ERROR",
  "INVALID_ARGUMENTS",
  "POSITION_NOT_FOUND",
  "AMBIGUOUS_POSITION",
  "TOO_MANY_POINTS",
  "CONFIG_ERROR"
] as const;

export type ErrorCode = (typeof errorCodes)[number];

const defaultExitCodes = {
  MISSING_API_KEY: 2,
  MISSING_PORTFOLIO: 2,
  PORTFOLIO_NOT_FOUND: 2,
  MYFUND_API_ERROR: 1,
  NETWORK_ERROR: 1,
  INVALID_ARGUMENTS: 2,
  POSITION_NOT_FOUND: 2,
  AMBIGUOUS_POSITION: 2,
  TOO_MANY_POINTS: 2,
  CONFIG_ERROR: 2
} satisfies Record<ErrorCode, number>;

export type MyfundCliErrorOptions = {
  code: ErrorCode;
  message: string;
  exitCode?: number;
  cause?: unknown;
  details?: Record<string, unknown>;
};

export class MyfundCliError extends Error {
  readonly code: ErrorCode;
  readonly exitCode: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(options: MyfundCliErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "MyfundCliError";
    this.code = options.code;
    this.exitCode = options.exitCode ?? defaultExitCodes[options.code];
    this.details = options.details;
  }

  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ?? {})
      }
    };
  }
}

export const isMyfundCliError = (error: unknown): error is MyfundCliError => {
  return error instanceof MyfundCliError;
};
