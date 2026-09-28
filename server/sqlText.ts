export function sqlStatements(file: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const line of file.split(/\r?\n/)) {
    if (line.trim().startsWith("--")) continue;
    buf += `${line}\n`;
    if (line.trim().endsWith(";")) {
      const stmt = buf.trim().replace(/;\s*$/, "").trim();
      if (stmt) out.push(stmt);
      buf = "";
    }
  }
  const tail = buf.trim().replace(/;\s*$/, "").trim();
  if (tail) out.push(tail);
  return out;
}
