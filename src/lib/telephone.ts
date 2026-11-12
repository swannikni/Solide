// Numéro WhatsApp complet ? Longueur vérifiée selon l'indicatif (comme le
// questionnaire du site) : +212 et +33 → 9 chiffres après l'indicatif, etc.
const LONGUEURS: [string, number[]][] = [
  ["212", [9]],
  ["971", [8, 9]],
  ["33", [9]],
  ["32", [8, 9]],
  ["41", [9]],
  ["34", [9]],
  ["44", [10]],
  ["1", [10]],
];

export function numeroValide(telephone: string | null | undefined): boolean {
  const brut = (telephone ?? "").trim();
  if (!brut) return false;
  let c = brut.replace(/\D/g, "").replace(/^00/, "");
  // Ancien format marocain sans indicatif (06…).
  if (!brut.startsWith("+") && !brut.startsWith("00") && /^0[5-7]\d{8}$/.test(c)) return true;
  if (!brut.startsWith("+") && !brut.startsWith("00") && c.startsWith("0")) return false;
  const connu = LONGUEURS.find(([ind]) => c.startsWith(ind));
  if (!connu) return c.length >= 10 && c.length <= 15;
  c = c.slice(connu[0].length).replace(/^0/, "");
  return connu[1].includes(c.length);
}
