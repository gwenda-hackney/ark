/** JSON helpers and safe error handling for Cloudflare Pages Functions. */

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

/**
 * Catch unexpected runtime errors so a single bad request cannot take down
 * the worker isolate without a response.
 */
export function withApiHandler(handler) {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      console.error("API handler error:", error);
      return jsonResponse(
        { error: "Something went wrong. Please try again." },
        500,
      );
    }
  };
}
