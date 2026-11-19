/** Seasons' calls to ops' API (#353): functions/api/seasons. */
import { request } from "../app/api";

export type SeasonState = "showing" | "coming" | "over";
export type WebsiteState = "live" | "preview" | "behind" | "none" | "unknown";

export type Season = {
	id: number;
	name: string;
	line: string;
	included: string;
	covers: string;
	showFrom: string;
	showUntil: string;
	image: { asset: string; alt: string } | null;
	imageUrl: string;
	state: SeasonState;
	updatedAt?: string;
	updatedBy?: string;
};

export type SeasonFields = Pick<Season, "name" | "line" | "included" | "covers" | "showFrom" | "showUntil">;

type Saved = { season: Season; website: WebsiteState; published: boolean; warnings: string[] };

export function listSeasons() {
	return request<{ seasons: Season[]; website: WebsiteState }>("/api/seasons");
}

export function getSeason(id: number | string) {
	return request<{ season: Season }>(`/api/seasons/${encodeURIComponent(String(id))}`);
}

export function createSeason(season: SeasonFields) {
	return request<Saved>("/api/seasons", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ season }),
	});
}

export function updateSeason(id: number, season: SeasonFields) {
	return request<Saved>(`/api/seasons/${id}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ season }),
	});
}

export function deleteSeason(id: number) {
	return request<{ ok: true; warnings: string[] }>(`/api/seasons/${id}`, { method: "DELETE" });
}

export function uploadSeasonImage(id: number, file: File, alt: string) {
	const body = new FormData();
	body.set("file", file);
	body.set("alt", alt);
	return request<Saved>(`/api/seasons/${id}/image`, { method: "POST", body });
}

export function clearSeasonImage(id: number) {
	return request<Saved>(`/api/seasons/${id}/image`, { method: "DELETE" });
}
