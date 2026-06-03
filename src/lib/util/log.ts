type LogFields = Record<string, unknown>;

/**
 * Minimal structured logger. Never log message bodies, capability tokens,
 * attachment URIs, room participant lists, or raw LDN payloads (see AGENTS.md).
 * OK to log: WebID, route, status, latency, error code, high-level event type.
 */
export const log = {
  debug(fields: LogFields, msg: string) {
    if (typeof window === "undefined") {
      // eslint-disable-next-line no-console
      console.debug(JSON.stringify({ level: "debug", msg, ...fields }));
    }
  },
  info(fields: LogFields, msg: string) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level: "info", msg, ...fields }));
  },
  warn(fields: LogFields, msg: string) {
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({ level: "warn", msg, ...fields }));
  },
  error(fields: LogFields, msg: string) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ level: "error", msg, ...fields }));
  },
};
