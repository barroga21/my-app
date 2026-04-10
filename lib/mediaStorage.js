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

/**
 * Upload the user's avatar to Supabase Storage and store the path in the profiles table.
 * The avatar is stored at avatars/{userId}/avatar.jpg and always upserted.
 */
export async function uploadAvatar(dataUrl, userId) {
  if (!supabase || !userId || !dataUrl) return null;
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const path = `avatars/${userId}/avatar.jpg`;

    const { error: uploadErr } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, blob, { upsert: true, cacheControl: "3600", contentType: "image/jpeg" });
    if (uploadErr) return null;

    // Persist path in profiles table for cross-device retrieval
    await supabase.from("profiles").upsert(
      { id: userId, avatar_url: `${STORAGE_REF_PREFIX}${MEDIA_BUCKET}/${path}`, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
    return path;
  } catch {
    return null;
  }
}

/**
 * Download the user's avatar from Supabase Storage.
 * Returns { url: signedUrl } or null if no avatar exists.
 */
export async function downloadAvatar(userId) {
  if (!supabase || !userId) return null;
  try {
    // First check the profiles table for the stored path
    const { data: profile } = await supabase.from("profiles").select("avatar_url").eq("id", userId).single();
    if (profile?.avatar_url) {
      const url = await getSignedMediaUrl(profile.avatar_url, 60 * 60);
      if (url) return { url };
    }
    // Fallback: try the default path directly
    const path = `avatars/${userId}/avatar.jpg`;
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 60 * 60);
    if (error || !data?.signedUrl) return null;
    return { url: data.signedUrl };
  } catch {
    return null;
  }
}
