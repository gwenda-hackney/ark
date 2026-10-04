/**
 * The Suppliers page: the add/edit dialog's state and the card's small labels.
 * One dialog does both; `editingId` says which.
 */
import type { CatalogSupplier } from "./types";

export function supplierId(row: CatalogSupplier): string {
	return String(row.id || row._id || "");
}

/** "lwc-drinks.co.uk" from a full URL; the raw text when it is not one. */
export function hostLabel(url: string | undefined): string {
	if (!url) return "";
	try {
		return new URL(url).hostname.replace(/^www\./i, "");
	} catch {
		return url;
	}
}

export function usageLabel(count: number | undefined): string {
	const n = count || 0;
	return `${n} ${n === 1 ? "item" : "items"}`;
}

export function sortSuppliers(rows: CatalogSupplier[]): CatalogSupplier[] {
	return [...rows].sort((a, b) =>
		String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }),
	);
}

export class SupplierDialog {
	open = $state(false);
	editingId = $state("");
	name = $state("");
	website = $state("");
	notes = $state("");

	get title(): string {
		return this.editingId ? "Edit supplier" : "Add supplier";
	}

	get submitLabel(): string {
		return this.editingId ? "Save" : "Add supplier";
	}

	add(): void {
		this.editingId = "";
		this.name = "";
		this.website = "";
		this.notes = "";
		this.open = true;
	}

	edit(row: CatalogSupplier): void {
		this.editingId = supplierId(row);
		this.name = row.name || "";
		this.website = row.website || "";
		this.notes = row.notes || "";
		this.open = true;
	}

	close(): void {
		this.open = false;
	}

	/** Field errors keyed by input id; empty strings mean fine. */
	errors(): Record<string, string> {
		return { "supplier-name": this.name.trim() ? "" : "Add the supplier's name." };
	}

	body(): { name: string; website: string; notes: string } {
		return {
			name: this.name.trim(),
			website: this.website.trim(),
			notes: this.notes.trim(),
		};
	}
}
