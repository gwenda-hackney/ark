export function buildInviteUrl(baseUrl, eventCode, token) {
  const base = baseUrl.replace(/\/$/, "");
  const code = eventCode?.trim().toLowerCase();
  if (code) {
    return `${base}/events/${code}/${token}`;
  }
  return `${base}/invite/${token}`;
}
