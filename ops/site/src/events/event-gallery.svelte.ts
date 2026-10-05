import { deleteGalleryPhoto, uploadGalleryPhoto, type OpsEvent, type OpsGalleryPhoto } from "../app/api";
import { toast } from "../ui/toast.svelte";

/** One photo as the Images tab shows it. */
export type GalleryTile = { key: string; name: string; thumb: string; full: string };

/**
 * An event's gallery, or one night's (`date`). The photos come with the event
 * and live in Sanity (#183). The page keeps one for the editor, so an upload
 * carries on in the background while switching tabs.
 */
export class EventGallery {
	photos = $state<OpsGalleryPhoto[]>([]);
	/** The event's Drive folder, where the Drive copy puts "website images" for collaborators. */
	folderUrl = $state("");
	uploading = $state(false);
	error = $state("");
	/** The night shown, or "" for the series. */
	date = $state("");

	/** Called with the event after a photo is added or removed. */
	constructor(private readonly onChange: (event: OpsEvent) => void = () => {}) {}

	tiles = $derived<GalleryTile[]>(
		this.photos.map((photo) => ({
			key: photo.key,
			name: photo.date ? `Photo from ${photo.date}` : "Photo",
			thumb: `${photo.url}?w=400&h=400&fit=crop&auto=format`,
			full: photo.url,
		})),
	);

	/** Shows an event's photos. */
	show(photos: OpsGalleryPhoto[], driveUrl = "", date = "") {
		this.photos = photos;
		this.folderUrl = driveUrl;
		this.date = date;
		this.error = "";
	}

	/** Uploads the images among `fileList`, one by one; other files are ignored. */
	async upload(eventId: string, fileList: File[]) {
		const files = fileList.filter((file) => file.type.startsWith("image/"));
		if (!files.length) return;
		if (!eventId) {
			toast.error("Save the event before adding images.");
			return;
		}
		this.uploading = true;
		this.error = "";
		try {
			let event: OpsEvent | null = null;
			for (const file of files) {
				event = (await uploadGalleryPhoto(eventId, file, this.date)).event;
				this.photos = event.gallery || [];
			}
			if (event) this.onChange(event);
			toast.ok(files.length === 1 ? "Image uploaded." : `${files.length} images uploaded.`);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not upload the gallery image.";
			this.error = message;
			toast.error(message);
		} finally {
			this.uploading = false;
		}
	}

	/** Remove one photo; it leaves the website on Update website. */
	async remove(eventId: string, key: string) {
		const before = this.photos;
		this.photos = this.photos.filter((photo) => photo.key !== key);
		try {
			const { event } = await deleteGalleryPhoto(eventId, key);
			this.photos = event.gallery || [];
			this.onChange(event);
			toast.ok("Photo removed. It leaves the website when you press Update website.");
		} catch (err) {
			this.photos = before;
			toast.error(err instanceof Error ? err.message : "Could not remove the photo.");
		}
	}
}
