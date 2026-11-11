/**
 * Where the dev server can reach itself. Never the request's Host header:
 * a browser outside the container comes in through a forwarded port
 * (localhost:4322 → the container's 4321), and nothing inside the container
 * listens on that one.
 *
 * @param {{ address?: string, family?: string, port?: number } | string | null | undefined} address
 *   what `server.httpServer.address()` gives
 * @param {number} [fallbackPort] the port asked for, until the server is up
 */
export function devOwnOrigin(address, fallbackPort = 4321) {
  const port =
    (address && typeof address === "object" && address.port) || fallbackPort;
  const host =
    address && typeof address === "object" ? String(address.address || "") : "";
  // Listening on every interface: loopback is one of them.
  if (!host || host === "0.0.0.0") return `http://127.0.0.1:${port}`;
  if (host === "::") return `http://localhost:${port}`;
  return `http://${host.includes(":") ? `[${host}]` : host}:${port}`;
}
