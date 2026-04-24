import type { LogLevel, LoggerService } from "@nestjs/common";

export class JsonLogger implements LoggerService {
  log(message: unknown, ...params: unknown[]): void {
    this.emit("info", message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.emit("error", message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.emit("warn", message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.emit("debug", message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.emit("verbose", message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.emit("fatal", message, params);
  }

  setLogLevels(_levels: LogLevel[]): void {}

  private emit(level: string, message: unknown, params: unknown[]): void {
    const last = params.at(-1);
    const context = typeof last === "string" ? last : undefined;

    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      pid: process.pid,
      ...(context !== undefined ? { context } : {}),
      message: typeof message === "string" ? message : JSON.stringify(message),
    });

    const stream =
      level === "error" || level === "fatal" ? process.stderr : process.stdout;
    stream.write(line + "\n");
  }
}
