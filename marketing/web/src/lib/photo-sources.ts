/**
 * Where the gallery's photos come from: files in src/assets/images/, listed
 * in src/data/photos.json (add one with `npm run gallery:add`). The only
 * module that knows; when photos move to ops (uploaded there, published like
 * What's on), this is the file that changes.
 */
import type { ImageMetadata } from "astro";
import list from "../data/photos.json";
import { listPhotos } from "./photos.js";

const modules = import.meta.glob<{ default: ImageMetadata }>(
  "../assets/images/**/*.{jpg,jpeg,png,webp}",
  { eager: true },
);

const files: Record<string, ImageMetadata> = Object.fromEntries(
  Object.entries(modules).map(([path, module]) => [
    path.replace("../assets/images/", ""),
    module.default,
  ]),
);

export type GalleryPhoto = {
  file: string;
  alt: string;
  link: string;
  image: ImageMetadata;
  ratio: number;
};

/** Every gallery photo, newest first. */
export function galleryPhotos(): GalleryPhoto[] {
  return listPhotos(list, files) as GalleryPhoto[];
}
