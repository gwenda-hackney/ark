import { getEventDrive, uploadEventDriveImage, type EventDriveFile } from "../app/api";
import { toast } from "../ui/toast.svelte";

/**
 * An event's Drive gallery. The page keeps one for the editor, so switching
 * tabs doesn't reload it and an upload carries on in the background.
 */
export class EventGallery {
	files = $state<EventDriveFile[]>([]);
	folderUrl = $state("");
	/** Images in the event folder but outside the gallery (not shown). */
	outsideGallery = $state(0);
	loading = $state(false);
	uploading = $state(false);
	error = $state("");
	private loadedFor = "";

	/** Loads once per event (again after an error, or when `force`). Returns the event folder, when Drive reports it. */
	async load(eventId: string, force = false): Promise<{ id: string; url?: string } | null> {
		if (!eventId) {
			this.files = [];
			this.folderUrl = "";
			this.outsideGallery = 0;
			this.error = "";
			this.loadedFor = "";
			return null;
		}
		if (!force && this.loadedFor === eventId && !this.error) return null;
		this.loading = true;
		this.error = "";
		try {
			const data = await getEventDrive(eventId);
			this.files = data.files || [];
			this.folderUrl = data.gallery?.url || "";
			this.outsideGallery = data.outsideGallery || 0;
			this.loadedFor = eventId;
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
			let latest = this.files;
			let outside = this.outsideGallery;
			for (const file of files) {
				const data = await uploadEventDriveImage(eventId, file);
				latest = data.files || [];
				this.folderUrl = data.gallery?.url || this.folderUrl;
				outside = data.outsideGallery || outside;
			}
			this.files = latest;
			this.outsideGallery = outside;
			this.loadedFor = eventId;
			toast.ok(files.length === 1 ? "Image uploaded." : `${files.length} images uploaded.`);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Could not upload the gallery image.";
			this.error = message;
			toast.error(message);
		} finally {
			this.uploading = false;
		}
	}
}
