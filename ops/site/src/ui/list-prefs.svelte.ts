/**
 * Reactive wrappers over view-prefs: read once, write on every change.
 * Call from a component so the phone query's effect is owned.
 */
import {
	densityKey,
	readDensity,
	readListView,
	viewKey,
	writePref,
	type Density,
	type ListView,
} from "./view-prefs";

export function densityPref(page: string) {
	let value = $state<Density>(readDensity(page));
	return {
		get value() {
			return value;
		},
		set value(next: Density) {
			value = next;
			writePref(densityKey(page), next);
		},
	};
}

/** Table or cards. Phones and desks remember separately; `phone` is read live. */
export function listViewPref(page: string, phone: { readonly matches: boolean }) {
	let desk = $state<ListView>(readListView(page, false));
	let hand = $state<ListView>(readListView(page, true));
	return {
		get value(): ListView {
			return phone.matches ? hand : desk;
		},
		set value(next: ListView) {
			if (phone.matches) hand = next;
			else desk = next;
			writePref(viewKey(page, phone.matches), next);
		},
	};
}
