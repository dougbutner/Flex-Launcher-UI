const MAX_BYTES = 1_048_576;
const ALLOWED = new Set(["image/png", "image/svg+xml"]);

export async function onRequestPost({ request, env }) {
  const jwt = String(env.PINATA_JWT || "").trim();
  if (!jwt) {
    return Response.json({ error: "PINATA_JWT is not set on the server." }, { status: 503 });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) {
    return Response.json({ error: 'Missing multipart field "file".' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File too large (max 1 MB)." }, { status: 400 });
  }
  const type = String(file.type || "").toLowerCase();
  if (!ALLOWED.has(type)) {
    return Response.json({ error: "Use a square PNG or SVG." }, { status: 400 });
  }
  const pinForm = new FormData();
  pinForm.append("file", file, file.name || "logo.png");
  const pin = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: pinForm,
  });
  const json = await pin.json();
  if (!pin.ok || !json.IpfsHash) {
    const err = json.error;
    const msg = (typeof err === "object" && err?.details) || (typeof err === "string" && err) || `Pinata ${pin.status}`;
    return Response.json({ error: String(msg) }, { status: 502 });
  }
  const host = String(env.PINATA_GATEWAY || "gateway.pinata.cloud").replace(/^https?:\/\//, "").replace(/\/$/, "");
  return Response.json({ cid: json.IpfsHash, url: `https://${host}/ipfs/${json.IpfsHash}` });
}
