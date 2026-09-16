/** Browser-only: draw the public icon to a 64x64 PNG for Alcor / airdrops PRs. */
export async function png64FromImageUrl(url: string): Promise<string> {
  const src = url.trim();
  if (!src) throw new Error("Need an icon URL before opening a listing pull request.");
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not load the logo image. Check the icon URL."));
    el.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.clearRect(0, 0, 64, 64);
  ctx.drawImage(img, 0, 0, 64, 64);
  const data = canvas.toDataURL("image/png");
  const b64 = data.split(",")[1];
  if (!b64) throw new Error("Could not encode a 64x64 PNG from that logo.");
  return b64;
}
