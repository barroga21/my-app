import { supabase } from "@/lib/supabaseClient";

export const MEDIA_BUCKET = "hibi-media";
const STORAGE_REF_PREFIX = "sb://";

function extFromMime(type) {
  if (type?.includes("png")) return "png";
  if (type?.includes("webp")) return "webp";
  return "jpg";
}

export async function uploadImageToSupabase(fileOrBlob, userId, folder = "journal") {
  if (!supabase || !userId || !fileOrBlob) {
    return null;
  }

  const extension = extFromMime(fileOrBlob.type);
  const fileName = `${folder}/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;

  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(fileName, fileOrBlob, { upsert: false, cacheControl: "3600", contentType: fileOrBlob.type || "image/jpeg" });

  if (error) return null;
  return `${STORAGE_REF_PREFIX}${MEDIA_BUCKET}/${fileName}`;
}

export function isStorageRef(value) {
  return typeof value === "string" && value.startsWith(STORAGE_REF_PREFIX);
}

function parseStorageRef(value) {
  if (!isStorageRef(value)) return null;
  const withoutPrefix = value.slice(STORAGE_REF_PREFIX.length);
  const slashIndex = withoutPrefix.indexOf("/");
  if (slashIndex < 0) return null;
  return {
    bucket: withoutPrefix.slice(0, slashIndex),
    path: withoutPrefix.slice(slashIndex + 1),
  };
}

export async function getSignedMediaUrl(value, expiresIn = 60 * 60) {
  if (!supabase || !value) return value || null;
  if (!isStorageRef(value)) return value;
  const parsed = parseStorageRef(value);
  if (!parsed) return value;

  const { data, error } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, expiresIn);
  if (error) return null;
  return data?.signedUrl || null;
}
