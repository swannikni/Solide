// Noms de la table CIQUAL rendus lisibles : « Banane, pulpe, crue » → « Banane ».
// (« pulpe » = la chair du fruit, sans la peau ; « aliment moyen » = moyenne de
// plusieurs produits ; « prélevé à … » = échantillon de laboratoire.)
export function nomSimple(nom: string, groupe?: string | null): string {
  let n = nom
    .replace(/\s*\(aliment moyen\)/gi, "")
    .replace(/,\s*prélev[ée]e?s?\b.*$/i, "")
    .replace(/,\s*pulpe et peau\b/gi, "")
    .replace(/,\s*pulpe\b/gi, "");
  // Un fruit se mange cru : inutile de le préciser.
  if (groupe === "fruits") n = n.replace(/,\s*crue?s?\s*$/i, "");
  return n.replace(/\s{2,}/g, " ").trim();
}
