// QR des étiquettes Chef2Box : ils contiennent l'adresse <site>/p/<code>,
// pour que l'appareil photo du téléphone ouvre directement l'appli.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O ni 1/I

export function genererCodePlat(): string {
  const octets = crypto.getRandomValues(new Uint8Array(6));
  return "C2B-" + Array.from(octets, (o) => ALPHABET[o % ALPHABET.length]).join("");
}

export function lienPlat(origine: string, code: string): string {
  return `${origine}/p/${encodeURIComponent(code)}`;
}

// Accepte aussi bien le lien complet que le code seul (anciennes étiquettes).
export function codeDepuisScan(texte: string): string {
  const brut = texte.trim();
  const lien = brut.match(/\/p\/([^/?#\s]+)/);
  return lien ? decodeURIComponent(lien[1]) : brut;
}
