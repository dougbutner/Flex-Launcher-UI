const MAX_BYTES = 1_048_576;
const MIN_PX = 256;
const MAX_PX = 512;

function rasterSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the image."));
    };
    img.src = url;
  });
}

export async function validateTokenLogo(file: File): Promise<string | null> {
  const type = file.type.toLowerCase();
  if (type !== "image/png" && type !== "image/svg+xml") return "Use a square PNG or SVG.";
  if (file.size > MAX_BYTES) return "Keep the image under 1 MB.";
  if (type === "image/svg+xml") return null;
  try {
    const { w, h } = await rasterSize(file);
    if (w !== h) return "Logo must be square.";
    if (w < MIN_PX || w > MAX_PX) return `PNG must be ${MIN_PX}-${MAX_PX}px.`;
  } catch (err) {
    return err instanceof Error ? err.message : "Invalid image.";
  }
  return null;
}

export function validImageUrl(value: string) {
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
