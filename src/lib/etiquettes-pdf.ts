// Étiquettes des box (Brother QL, rouleau prédécoupé DK-11209 : 62 × 29 mm).
// Un PDF, une page par box, dans l'ordre de la fiche cuisine. Collée au
// centre du bandeau Chef2Box : nom du plat, prénom, macros de sa portion.
import type { jsPDF as JsPDF } from "jspdf";
import type { Palier } from "@/lib/types";

export const LARGEUR = 62; // mm
export const HAUTEUR = 29; // mm

export interface Macros {
  proteines: number | null;
  glucides: number | null;
  lipides: number | null;
  kcal: number | null;
}

export interface Etiquette {
  prenom: string;
  palier: Palier | null;
  macros: Macros | null;
}

export interface Polices {
  serif: string; // Cormorant Garamond Bold (base64)
  leger: string; // DM Sans Light
  moyen: string; // DM Sans Medium
}

// « Houda Ghezouani » → « Houda G. » (prénom + initiale, pour les homonymes).
export function prenomEtiquette(nom: string) {
  const mots = nom.trim().split(/\s+/).filter((m) => !/^\d+$/.test(m));
  if (!mots.length) return nom.trim();
  const prenom = mots[0].charAt(0).toUpperCase() + mots[0].slice(1);
  return mots.length > 1 ? `${prenom} ${mots[1].charAt(0).toUpperCase()}.` : prenom;
}

const nombre = (v: number | null, unite: string) =>
  v == null ? "—" : `${Math.round(v * 10) / 10}`.replace(".", ",") + (unite ? ` ${unite}` : "");

export function genererEtiquettesPdf(JsPdf: typeof JsPDF, polices: Polices, plat: string, etiquettes: Etiquette[]): Blob {
  const doc = new JsPdf({ unit: "mm", format: [LARGEUR, HAUTEUR], orientation: "landscape", compress: true });
  doc.addFileToVFS("serif.ttf", polices.serif);
  doc.addFont("serif.ttf", "serif", "bold");
  doc.addFileToVFS("leger.ttf", polices.leger);
  doc.addFont("leger.ttf", "dm", "light");
  doc.addFileToVFS("moyen.ttf", polices.moyen);
  doc.addFont("moyen.ttf", "dm", "medium");
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.12);

  const marge = 2.8; // l'imprimante n'imprime pas au ras du bord
  const utile = LARGEUR - 2 * marge;
  const milieu = LARGEUR / 2;
  const titre = plat.trim() || "Chef2Box";

  etiquettes.forEach((e, i) => {
    if (i > 0) doc.addPage([LARGEUR, HAUTEUR], "landscape");

    // Nom du plat : serif, réduit si trop long (une ligne).
    doc.setFont("serif", "bold");
    let taille = 12.5;
    doc.setFontSize(taille);
    while (doc.getTextWidth(titre) > utile && taille > 7.5) doc.setFontSize((taille -= 0.25));
    doc.text(titre, milieu, 6.6, { align: "center", maxWidth: utile });

    // Prénom, puis « Tes macros · pour 1 portion · P2 ».
    doc.setFont("dm", "medium");
    doc.setFontSize(7.4);
    doc.text(e.prenom, milieu, 10.3, { align: "center" });
    doc.setFont("dm", "light");
    doc.setFontSize(4.6);
    doc.setCharSpace(0.18);
    const sous = `TES MACROS · POUR 1 PORTION${e.palier ? ` · ${e.palier}` : ""}`;
    doc.text(sous, milieu, 12.9, { align: "center" });
    doc.setCharSpace(0);

    // Quatre cases : protéines, glucides, lipides, calories.
    const cases: [string, number | null, string][] = [
      ["PROTÉINES", e.macros?.proteines ?? null, "g"],
      ["GLUCIDES", e.macros?.glucides ?? null, "g"],
      ["LIPIDES", e.macros?.lipides ?? null, "g"],
      ["CALORIES", e.macros?.kcal ?? null, "kcal"],
    ];
    const ecart = 1.2;
    const l = (utile - ecart * 3) / 4;
    const haut = 14.6;
    const h = 10.4;
    cases.forEach(([libelle, valeur, unite], k) => {
      const x = marge + k * (l + ecart);
      doc.roundedRect(x, haut, l, h, 1.2, 1.2, "S");
      doc.setFont("dm", "light");
      doc.setFontSize(4.3);
      doc.setCharSpace(0.12);
      doc.text(libelle, x + l / 2, haut + 3.6, { align: "center" });
      doc.setCharSpace(0);
      // Chiffre en DM Sans (chiffres droits), unité plus petite à côté.
      const chiffre = nombre(valeur, "");
      let t = 9.5;
      const largeurs = () => {
        doc.setFont("dm", "medium");
        doc.setFontSize(t);
        const a = doc.getTextWidth(chiffre);
        doc.setFont("dm", "light");
        doc.setFontSize(t * 0.6);
        const b = valeur == null ? 0 : doc.getTextWidth(` ${unite}`);
        return [a, b];
      };
      let [a, b] = largeurs();
      while (a + b > l - 1.4 && t > 6) {
        t -= 0.25;
        [a, b] = largeurs();
      }
      const depart = x + (l - a - b) / 2;
      doc.setFont("dm", "medium");
      doc.setFontSize(t);
      doc.text(chiffre, depart, haut + 8.2);
      if (valeur != null) {
        doc.setFont("dm", "light");
        doc.setFontSize(t * 0.6);
        doc.text(` ${unite}`, depart + a, haut + 8.2);
      }
    });
  });
  return doc.output("blob");
}
