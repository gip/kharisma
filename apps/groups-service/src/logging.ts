import pino from "pino";

export const LOG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export type AppLogger = {
  child(bindings: Record<string, unknown>): AppLogger;
  trace: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  fatal: (...args: unknown[]) => void;
};

export function parseLogLevel(value: string | undefined): LogLevel {
  if (!value) {
    return "info";
  }

  if ((LOG_LEVELS as readonly string[]).includes(value)) {
    return value as LogLevel;
  }

  throw new Error(
    `Invalid LOG_LEVEL "${value}". Expected one of: ${LOG_LEVELS.join(", ")}`,
  );
}

export function createLogger(input: {
  level: LogLevel;
  name?: string;
}): AppLogger {
  const options = {
    level: input.level,
    name: input.name,
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (process.stdout.isTTY) {
    return pino(
      options,
      pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "SYS:standard",
        },
      }),
    ) as unknown as AppLogger;
  }

  return pino(options) as unknown as AppLogger;
}
