export type PinResult = { cid: string; url: string };

export async function pinLogoFile(file: File): Promise<PinResult> {
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await fetch("/api/ipfs/pin", { method: "POST", body: form });
  const data = (await res.json()) as PinResult & { error?: string };
  if (!res.ok || !data.cid || !data.url) throw new Error(data.error || "Pin failed.");
  return { cid: data.cid, url: data.url };
}
