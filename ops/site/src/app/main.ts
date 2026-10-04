import { mount } from "svelte";
import "../ui/theme/index.css";
import App from "./App.svelte";
import type { AuthMe } from "./api";
import {
  bootAction,
  goToGate,
  hideSplash,
  onBackForwardRestore,
  showForbidden,
  showRetry,
  showSplash,
} from "./boot";
import { installClientErrorHandlers } from "./client-error";

installClientErrorHandlers();

async function checkSession(): Promise<AuthMe | null> {
  let res: Response;
  try {
    res = await fetch("/api/auth/me", { redirect: "manual", credentials: "same-origin" });
  } catch {
    showRetry();
    return null;
  }
  const action = bootAction(res);
  if (action === "gate") goToGate();
  else if (action === "forbidden") showForbidden();
  else if (action === "retry") showRetry();
  if (action !== "mount") return null;
  return (await res.json()) as AuthMe;
}

// Check the session before mounting, so a signed-out visit only ever sees the
// splash, and the shell has `me` on its first paint (#153).
let mounted = false;

async function boot() {
  const me = await checkSession();
  if (!me) return;
  mount(App, { target: document.getElementById("app")!, props: { me } });
  mounted = true;
  hideSplash();
}

onBackForwardRestore(() => {
  // Restored before the app ever mounted (gate, forbidden): start again.
  if (!mounted) return location.reload();
  showSplash();
  void checkSession().then((me) => {
    if (me) hideSplash();
  });
});

void boot();
