import {
	deleteEventDriveImage,
	deleteGalleryPhoto,
	eventDriveFileUrl,
	getEventDrive,
	uploadEventDriveImage,
	uploadGalleryPhoto,
	type EventDriveFile,
	type OpsEvent,
	type OpsGalleryPhoto,
} from "../app/api";
import { toast } from "../ui/toast.svelte";

/** One photo as the Images tab shows it, wherever it is kept. */
export type GalleryTile = { key: string; name: string; thumb: string; full: string };

/**
 * An event's gallery, or one night's (`date`). The page keeps one for the
 * editor, so switching tabs doesn't reload it and an upload carries on in
 * the background.
 *
 * A series keeps its gallery in ops (#183): the photos come with the event
 * (`photos`) and live in Sanity. A series from before keeps it in Drive until
 * the backfill moves it; that is the `files` path.
 */
export class EventGallery {
	/** The gallery kept in ops, or null while it's still in Drive. */
	photos = $state<OpsGalleryPhoto[] | null>(null);
	files = $state<EventDriveFile[]>([]);
	folderUrl = $state("");
	/** Images in the event folder but outside the gallery (not shown). */
	outsideGallery = $state(0);
	loading = $state(false);
	uploading = $state(false);
	error = $state("");
	/** The night shown, or "" for the series. */
	date = $state("");
	private eventId = $state("");
	private loadedFor = "";

	/** Called with the event after a photo is added or removed in ops. */
	constructor(private readonly onChange: (event: OpsEvent) => void = () => {}) {}

	tiles = $derived<GalleryTile[]>(
		this.photos
			? this.photos.map((photo) => ({
					key: photo.key,
					name: photo.date ? `Photo from ${photo.date}` : "Photo",
					thumb: `${photo.url}?w=400&h=400&fit=crop&auto=format`,
					full: photo.url,
				}))
			: this.files.map((file) => ({
					key: file.id,
					name: file.name,
					thumb: eventDriveFileUrl(this.eventId, file.id),
					full: file.url || eventDriveFileUrl(this.eventId, file.id),
				})),
	);

	/**
	 * Shows the event's gallery. Kept in ops (`photos`), there is nothing to
	 * fetch. In Drive, loads once per event (again after an error, or when
	 * `force`) and returns the event folder, when Drive reports it.
	 */
	async load(
		eventId: string,
		force = false,
		date = "",
		photos: OpsGalleryPhoto[] | null = null,
	): Promise<{ id: string; url?: string } | null> {
		this.eventId = eventId;
		if (!eventId) {
			this.photos = null;
			this.files = [];
			this.folderUrl = "";
			this.outsideGallery = 0;
			this.error = "";
			this.loadedFor = "";
			return null;
		}
		this.date = date;
		if (photos) {
			this.photos = photos;
			this.files = [];
			this.folderUrl = "";
			this.outsideGallery = 0;
			this.error = "";
			this.loadedFor = "";
			return null;
		}
		this.photos = null;
		const key = `${eventId}:${date}`;
		if (!force && this.loadedFor === key && !this.error) return null;
		this.loading = true;
		this.error = "";
		try {
			const data = await getEventDrive(eventId, date);
			this.files = data.files || [];
			this.folderUrl = data.gallery?.url || "";
			this.outsideGallery = data.outsideGallery || 0;
			this.loadedFor = key;
			return data.folder?.id ? data.folder : null;
		} catch (err) {
			this.error = err instanceof Error ? err.message : "Could not load gallery images.";
			this.files = [];
			this.outsideGallery = 0;
			return null;
		} finally {
			this.loading = false;
		}
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
			if (this.photos) {
				let event: OpsEvent | null = null;
				for (const file of files) {
					event = (await uploadGalleryPhoto(eventId, file, this.date)).event;
					this.photos = event.gallery || [];
				}
				if (event) this.onChange(event);
			} else {
				let latest = this.files;
				let outside = this.outsideGallery;
				for (const file of files) {
					const data = await uploadEventDriveImage(eventId, file, this.date);
					latest = data.files || [];
					this.folderUrl = data.gallery?.url || this.folderUrl;
					outside = data.outsideGallery || outside;
				}
				this.files = latest;
				this.outsideGallery = outside;
				this.loadedFor = `${eventId}:${this.date}`;
			}
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
		if (this.photos) {
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
			return;
		}
		const before = this.files;
		this.files = this.files.filter((file) => file.id !== key);
		try {
			await deleteEventDriveImage(eventId, key);
			toast.ok("Photo removed. It leaves the website when you press Update website.");
		} catch (err) {
			this.files = before;
			toast.error(err instanceof Error ? err.message : "Could not remove the photo.");
		}
	}
}
