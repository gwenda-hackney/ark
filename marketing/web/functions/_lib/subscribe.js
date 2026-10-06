/**
 * The website's newsletter sign-up: the guests sign-up (shared/guests),
 * stored wherever subscribers live now.
 */
import { subscriberRepository } from "../../../../shared/guests/subscriber-repository.js";
import { subscribe } from "../../../../shared/guests/subscribers.js";

/** @returns {Promise<{ ok: true, status: 200 } | { ok: false, status: number, error: string }>} */
export async function subscribeEmail({ email, tag = "prelaunch", env = {} }) {
  const result = await subscribe(subscriberRepository(env), { email, tag });
  return result.ok ? { ok: true, status: 200 } : result;
}
