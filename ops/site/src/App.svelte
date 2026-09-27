<script lang="ts">
	import { onMount } from "svelte";
	import { ShellLayout } from "./shell";
	import { Button, Toaster } from "./ui";
	import { fade, fly } from "svelte/transition";
	import HomeOverview from "./features/home/HomeOverview.svelte";
	import MenuWorkbench from "./features/menu/MenuWorkbench.svelte";
	import InventoryWorkbench from "./features/inventory/InventoryWorkbench.svelte";
	import LightspeedPage from "./features/inventory/LightspeedPage.svelte";
	import LightspeedExportPage from "./features/inventory/LightspeedExportPage.svelte";
	import LightspeedMenusPage from "./features/inventory/LightspeedMenusPage.svelte";
	import SuppliersPage from "./features/inventory/SuppliersPage.svelte";
	import ConfigPage from "./features/config/ConfigPage.svelte";
	import SectionsPage from "./features/menu/SectionsPage.svelte";
	import UsersPage from "./features/users/UsersPage.svelte";
	import WebPage from "./features/web/WebPage.svelte";
	import DevToolsPage from "./features/web/DevToolsPage.svelte";
	import SettingsPage from "./features/web/SettingsPage.svelte";
	import FormsPage from "./features/forms/FormsPage.svelte";
	import EventsPage from "./features/events/EventsPage.svelte";
	import ArtistsPage from "./features/artists/ArtistsPage.svelte";
	import { parseShellPath, shellPageKey, readPath } from "./lib/nav";
	import { NAV_ROUTES } from "./lib/nav-routes";
	import { loadPourSettings } from "./lib/settings.svelte";
	import { easeOut, fadeMs, flyMs } from "./lib/motion";
	import { normalizeClientError, reportClientError } from "./lib/client-error";
	import { toast } from "./lib/toast.svelte";

	const routes = NAV_ROUTES;

	let path = $state(readPath());

	onMount(() => {
		void loadPourSettings();
	});

	function pageKey(current: string): string {
		return shellPageKey(current);
	}

	function onPageError(error: unknown) {
		const report = reportClientError("svelte.boundary", error);
		toast.error(`Page error: ${report.message}`);
	}

	function errorMessage(error: unknown): string {
		return normalizeClientError(error).message;
	}
</script>

<ShellLayout {routes} bind:path>
	{#snippet children({ path: current })}
		{@const key = pageKey(current)}
		{@const print = Boolean(parseShellPath(current).print)}
		{#key key}
			<svelte:boundary onerror={onPageError}>
				<div
					class="page"
					class:fill={key === "menu" || key === "inventory" || key === "events" || key === "forms"}
					in:fly={{ y: print ? 0 : 10, duration: print ? 0 : flyMs, easing: easeOut }}
					out:fade={{ duration: print ? 0 : fadeMs, easing: easeOut }}
				>
					{#if key === "home"}
						<HomeOverview />
					{:else if key === "menu"}
						<MenuWorkbench path={current} />
					{:else if key === "inventory"}
						<InventoryWorkbench path={current} />
					{:else if key === "lightspeed"}
						{#if parseShellPath(current).view === "export"}
							<LightspeedExportPage />
						{:else if parseShellPath(current).view === "menus"}
							<LightspeedMenusPage />
						{:else}
							<LightspeedPage />
						{/if}
					{:else if key === "suppliers"}
						<SuppliersPage />
					{:else if key === "users"}
						<UsersPage />
					{:else if key === "web"}
						{#if parseShellPath(current).view === "dev"}
							<DevToolsPage />
						{:else if parseShellPath(current).view === "settings"}
							<SettingsPage />
						{:else}
							<WebPage />
						{/if}
					{:else if key === "forms"}
						<FormsPage path={current} />
					{:else if key === "events"}
						<EventsPage path={current} />
					{:else if key === "artists"}
						<ArtistsPage path={current} />
					{:else if key === "sections"}
						<SectionsPage />
					{:else if key === "config"}
						<ConfigPage />
					{:else}
						<HomeOverview />
					{/if}
				</div>

				{#snippet failed(error, reset)}
					<div class="page page-crash" role="alert">
						<div class="crash">
							<h1 class="crash-title">This page hit an error</h1>
							<p class="crash-copy">
								Something broke while rendering. The shell is still up. Try again, or
								reload the page.
							</p>
							<p class="crash-message">{errorMessage(error)}</p>
							<div class="crash-actions">
								<Button type="button" variant="primary" onclick={reset}>
									Try again
								</Button>
								<Button
									type="button"
									variant="outline"
									onclick={() => window.location.reload()}
								>
									Reload page
								</Button>
							</div>
						</div>
					</div>
				{/snippet}
			</svelte:boundary>
		{/key}
	{/snippet}
</ShellLayout>
<Toaster />

<style>
	.page {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		min-height: 0;
		width: 100%;
		background: var(--background);
	}

	.page.fill :global(.workbench),
	.page.fill :global(.frame),
	.page.fill :global(.events-root),
	.page.fill :global(.forms-root) {
		flex: 1;
		min-height: 0;
	}

	.page-crash {
		align-items: center;
		justify-content: center;
		padding: 2rem 1.25rem;
	}

	.crash {
		width: min(36rem, 100%);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.crash-title {
		margin: 0;
		font-family: var(--font-display, inherit);
		font-size: 1.5rem;
		font-weight: 500;
		color: var(--text);
	}

	.crash-copy {
		margin: 0;
		color: var(--text-muted);
		line-height: 1.45;
	}

	.crash-message {
		margin: 0;
		padding: 0.75rem 0.9rem;
		border: 1px solid color-mix(in srgb, var(--error, #c97a7a) 45%, transparent);
		border-radius: 6px;
		background: color-mix(in srgb, var(--error, #c97a7a) 12%, transparent);
		color: var(--error, #c97a7a);
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.85rem;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.crash-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin-top: 0.35rem;
	}
</style>
