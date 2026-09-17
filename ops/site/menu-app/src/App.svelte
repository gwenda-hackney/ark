<script lang="ts">
	import { onMount } from "svelte";
	import { ShellLayout } from "./shell";
	import type { NavRoute } from "./shell";
	import { Toaster } from "./ui";
	import { fade, fly } from "svelte/transition";
	import HomeOverview from "./features/home/HomeOverview.svelte";
	import MenuWorkbench from "./features/menu/MenuWorkbench.svelte";
	import InventoryWorkbench from "./features/inventory/InventoryWorkbench.svelte";
	import ConfigPage from "./features/config/ConfigPage.svelte";
	import SectionsPage from "./features/menu/SectionsPage.svelte";
	import UsersPage from "./features/users/UsersPage.svelte";
	import ToolFrame from "./features/tools/ToolFrame.svelte";
	import { shellPageKey } from "./lib/nav";
	import { toolFrameFor } from "./lib/mobile-nav";
	import { loadPourSettings } from "./lib/settings.svelte";
	import { easeOut, fadeMs, flyMs } from "./lib/motion";

	const routes: NavRoute[] = [
		{ id: "home", path: "/", name: "Dashboard", icon: "home" },
		{
			id: "stock",
			name: "Stock",
			icon: "stock",
			children: [
				{ id: "menu", path: "/menu", name: "Menu prices", icon: "menu" },
				{ id: "inventory", path: "/inventory", name: "Inventory", icon: "inventory" },
				{ id: "sections", path: "/sections", name: "Sections", icon: "list" },
				{ id: "config", path: "/config", name: "Configuration", icon: "settings" },
			],
		},
		{ id: "users", path: "/users", name: "Users", icon: "users" },
	];

	let path = $state("/");

	onMount(() => {
		void loadPourSettings();
	});

	function pageKey(current: string): string {
		return shellPageKey(current);
	}
</script>

<ShellLayout {routes} bind:path>
	{#snippet children({ path: current })}
		{@const key = pageKey(current)}
		{#key key}
			<div
				class="page"
				class:fill={key === "menu" || key === "inventory" || key === "tools"}
				in:fly={{ y: 10, duration: flyMs, easing: easeOut }}
				out:fade={{ duration: fadeMs, easing: easeOut }}
			>
				{#if key === "home"}
					<HomeOverview />
				{:else if key === "menu"}
					<MenuWorkbench path={current} />
				{:else if key === "inventory"}
					<InventoryWorkbench path={current} />
				{:else if key === "users"}
					<UsersPage />
				{:else if key === "sections"}
					<SectionsPage />
				{:else if key === "config"}
					<ConfigPage />
				{:else if key === "tools"}
					{@const tool = toolFrameFor(current)}
					{#key tool.src}
						<ToolFrame src={tool.src} title={tool.title} />
					{/key}
				{:else}
					<HomeOverview />
				{/if}
			</div>
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
	.page.fill :global(.frame) {
		flex: 1;
		min-height: 0;
	}
</style>
