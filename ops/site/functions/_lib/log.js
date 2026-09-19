/**
 * Server-side logging for ops Pages Functions.
 *
 * Default sink writes one JSON object per line to stdout (console). Cloudflare
 * captures that stream today via `wrangler pages deployment tail`; swap `write`
 * later for Workers Logs, Logpush, or another collector.
 */

export const SERVICE = "gwenda-ops";

const LEVEL_TO_CONSOLE = {
  debug: "log",
  info: "log",
  warn: "warn",
  error: "error",
};

export function createStdoutSink(io = globalThis.console) {
  return function stdoutWrite(record) {
    const method = LEVEL_TO_CONSOLE[record.level] || "log";
    let line;
    try {
      line = JSON.stringify(record);
    } catch {
      line = JSON.stringify({
        ts: record?.ts,
        level: record?.level || "error",
        service: record?.service,
        message: record?.message,
        logError: "failed to serialize log record",
      });
    }
    const fn = io?.[method];
    if (typeof fn === "function") fn.call(io, line);
    else io.log(line);
  };
}

export const stdoutWrite = createStdoutSink();

export function serializeError(error) {
  if (error == null) return { message: String(error) };
  if (typeof error !== "object") return { message: String(error) };
  return {
    name: typeof error.name === "string" ? error.name : undefined,
    message: typeof error.message === "string" ? error.message : String(error),
    status: typeof error.status === "number" ? error.status : undefined,
    stack: typeof error.stack === "string" ? error.stack : undefined,
  };
}

export function requestFields(request) {
  if (!request) return {};
  let path;
  try {
    path = request.url ? new URL(request.url).pathname : undefined;
  } catch {
    path = undefined;
  }
  const headers = request.headers;
  const ray =
    typeof headers?.get === "function" ? headers.get("cf-ray") || undefined : undefined;
  const colo = request.cf?.colo || undefined;
  return {
    method: request.method,
    path,
    ray,
    colo,
  };
}

export function createLogger({
  service = SERVICE,
  write = stdoutWrite,
  fields = {},
  waitUntil,
} = {}) {
  const emit = (level, message, extra = {}) => {
    try {
      const result = write({
        ts: new Date().toISOString(),
        level,
        service,
        message,
        ...fields,
        ...extra,
      });
      if (result && typeof result.then === "function") {
        const pending = result.catch(() => {});
        if (typeof waitUntil === "function") waitUntil(pending);
      }
    } catch {
      // Logging must never fail the request.
    }
  };

  return {
    debug(message, extra) {
      emit("debug", message, extra);
    },
    info(message, extra) {
      emit("info", message, extra);
    },
    warn(message, extra) {
      emit("warn", message, extra);
    },
    error(message, extra) {
      emit("error", message, extra);
    },
    child(extra = {}) {
      return createLogger({
        service,
        write,
        waitUntil,
        fields: { ...fields, ...extra },
      });
    },
  };
}

export function loggerFromContext(context, extra = {}) {
  if (context?.log && typeof context.log.info === "function") {
    return extra && Object.keys(extra).length
      ? context.log.child(extra)
      : context.log;
  }
  return createLogger({
    waitUntil:
      typeof context?.waitUntil === "function"
        ? context.waitUntil.bind(context)
        : undefined,
    fields: {
      ...requestFields(context?.request),
      ...extra,
    },
  });
}

export function attachLogger(context, extra = {}) {
  const log = loggerFromContext(context, extra);
  context.log = log;
  return log;
}
