export function buildInviteUrl(baseUrl, token) {
  return `${baseUrl.replace(/\/$/, "")}/invite/${token}`;
}
