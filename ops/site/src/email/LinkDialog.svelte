<script lang="ts">
	/**
	 * Where a link goes (#348): the words stay selected in the email
	 * meanwhile. A web address gets its https:// added; an email address
	 * becomes a mail link (copy-dom.ts linkAddress).
	 */
	import { Button, Dialog, Field, TextField } from "../ui";
	import { linkAddress } from "./copy-dom";

	let { open, onclose, onadd }: { open: boolean; onclose: () => void; onadd: (address: string) => void } = $props();

	let address = $state("");
	let problem = $state("");
	let field = $state<HTMLInputElement | undefined>();

	$effect(() => {
		if (!open) return;
		address = "";
		problem = "";
		queueMicrotask(() => field?.focus());
	});

	function add() {
		const link = linkAddress(address);
		if (!link) {
			problem = "That isn't a web address or an email address.";
			return;
		}
		onadd(link);
	}
</script>

<Dialog {open} title="Make it a link" {onclose}>
	<form
		class="link"
		onsubmit={(event) => {
			event.preventDefault();
			add();
		}}
	>
		<Field label="Where it goes" for="link-address" hint="A web page like gwenda.co.uk/whats-on, or an email address." error={problem || undefined}>
			<TextField id="link-address" bind:element={field} bind:value={address} placeholder="gwenda.co.uk/whats-on" autocomplete="off" />
		</Field>
		<div class="actions">
			<Button variant="ghost" onclick={onclose}>Cancel</Button>
			<Button type="submit">Add link</Button>
		</div>
	</form>
</Dialog>

<style>
	.link {
		display: grid;
		gap: var(--space-3);
	}
	.actions {
		display: flex;
		justify-content: end;
		gap: var(--space-2);
	}
</style>
