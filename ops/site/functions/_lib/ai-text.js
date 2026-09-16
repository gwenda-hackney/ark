/** Pull assistant text from Workers AI / OpenAI-style chat results. */
export function aiMessageText(result) {
  if (typeof result === "string") return result;
  if (typeof result !== "object" || !result) return "";
  if (typeof result.response === "string") return result.response;
  if (typeof result.text === "string") return result.text;
  if (typeof result.result === "string") return result.result;
  const choice = Array.isArray(result.choices) ? result.choices[0] : null;
  const message = choice?.message;
  if (typeof message === "string") return message;
  if (message && typeof message.content === "string") return message.content;
  if (Array.isArray(message?.content)) {
    return message.content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("");
  }
  if (typeof result.result === "object" && result.result) {
    if (typeof result.result.response === "string") return result.result.response;
  }
  if (Array.isArray(result)) {
    return result
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.response === "string") return part.response;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("");
  }
  return "";
}
