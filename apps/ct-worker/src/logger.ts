type Level = "info" | "warn" | "error" | "debug";

function write(level: Level, message: string, extra?: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    pid: process.pid,
    message,
    ...(extra ?? {}),
  });
  const stream = level === "error" ? process.stderr : process.stdout;
  stream.write(line + "\n");
}

export const logger = {
  info: (message: string, extra?: Record<string, unknown>) =>
    write("info", message, extra),
  warn: (message: string, extra?: Record<string, unknown>) =>
    write("warn", message, extra),
  error: (message: string, extra?: Record<string, unknown>) =>
    write("error", message, extra),
  debug: (message: string, extra?: Record<string, unknown>) =>
    write("debug", message, extra),
};
