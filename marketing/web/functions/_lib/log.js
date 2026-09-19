/**
 * Structured logs for marketing Pages Functions.
 *
 * One JSON object per line on stdout. Pages live-tail captures this stream;
 * logs are not persisted on Pages (no [observability] in wrangler).
 */

export const SERVICE = "gwenda";

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
    typeof headers?.get === "function"
      ? headers.get("cf-ray") || undefined
      : undefined;
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
} = {}) {
  const emit = (level, message, extra = {}) => {
    try {
      write({
        ts: new Date().toISOString(),
        level,
        service,
        message,
        ...fields,
        ...extra,
      });
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
    event(level, event, extra = {}) {
      emit(level, event, { event, ...extra });
    },
    child(extra = {}) {
      return createLogger({
        service,
        write,
        fields: { ...fields, ...extra },
      });
    },
  };
}

export const log = createLogger();
