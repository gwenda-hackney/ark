/** Occasions' calls to ops' API (#353): functions/api/occasions. */
import { request } from "../app/api";

export type OccasionState = "showing" | "coming" | "over";
export type WebsiteState = "live" | "preview" | "behind" | "none" | "unknown";

export type Occasion = {
	id: number;
	name: string;
	line: string;
	included: string;
	covers: string;
	showFrom: string;
	showUntil: string;
	image: { asset: string; alt: string } | null;
	imageUrl: string;
	state: OccasionState;
	updatedAt?: string;
	updatedBy?: string;
};

export type OccasionFields = Pick<Occasion, "name" | "line" | "included" | "covers" | "showFrom" | "showUntil">;

type Saved = { occasion: Occasion; website: WebsiteState; published: boolean; warnings: string[] };

export function listOccasions() {
	return request<{ occasions: Occasion[]; website: WebsiteState }>("/api/occasions");
}

export function getOccasion(id: number | string) {
	return request<{ occasion: Occasion }>(`/api/occasions/${encodeURIComponent(String(id))}`);
}

export function createOccasion(occasion: OccasionFields) {
	return request<Saved>("/api/occasions", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ occasion }),
	});
}

export function updateOccasion(id: number, occasion: OccasionFields) {
	return request<Saved>(`/api/occasions/${id}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ occasion }),
	});
}

export function deleteOccasion(id: number) {
	return request<{ ok: true; warnings: string[] }>(`/api/occasions/${id}`, { method: "DELETE" });
}

export function uploadOccasionImage(id: number, file: File, alt: string) {
	const body = new FormData();
	body.set("file", file);
	body.set("alt", alt);
	return request<Saved>(`/api/occasions/${id}/image`, { method: "POST", body });
}

export function clearOccasionImage(id: number) {
	return request<Saved>(`/api/occasions/${id}/image`, { method: "DELETE" });
}
