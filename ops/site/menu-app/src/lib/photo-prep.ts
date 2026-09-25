/**
 * Phone photos can be larger than the upload limit, or HEIC, which the site
 * cannot show. Re-encode those as JPEG in the browser. Anything the server
 * already accepts goes up untouched.
 */

const UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
/** Server limit is 6 MB; leave headroom for the form wrapper. */
const UPLOAD_MAX_BYTES = 5.5 * 1024 * 1024;
const EDGES = [3200, 2400, 1800];

export function photoNeedsPrep(file: Pick<File, "type" | "size">): boolean {
	return !UPLOAD_TYPES.has(file.type) || file.size > UPLOAD_MAX_BYTES;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
	return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function preparePhoto(file: File): Promise<File> {
	if (!photoNeedsPrep(file)) return file;
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
	} catch {
		// This browser cannot read it; let the server explain.
		return file;
	}
	try {
		const name = `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`;
		for (const edge of EDGES) {
			const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
			const canvas = document.createElement("canvas");
			canvas.width = Math.round(bitmap.width * scale);
			canvas.height = Math.round(bitmap.height * scale);
			canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			const blob = await toJpeg(canvas, 0.86);
			if (blob && blob.size <= UPLOAD_MAX_BYTES) {
				return new File([blob], name, { type: "image/jpeg" });
			}
		}
		return file;
	} finally {
		bitmap.close();
	}
}
