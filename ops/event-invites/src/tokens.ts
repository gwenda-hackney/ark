import { randomBytes } from "node:crypto";

export function generateInviteToken(): string {
  return randomBytes(16).toString("hex");
}
