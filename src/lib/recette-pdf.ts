import type { jsPDF as JsPDF } from "jspdf";
import type { Palier } from "@/lib/types";

// Fiche recette en PDF (A4), au style de la fiche cuisine du jour :
// en-tête avec logo, tuiles des effectifs, puis des sections à bandeau :
// À préparer (tableau cru / cuit), sauces et marinades, étapes de cuisine,
// montage par palier, allergènes. Construite d'un bloc, sans attente, pour
// ouvrir le partage du téléphone dans la foulée du toucher.

export interface FicheRecettePdf {
  nom: string;
  sousTitre: string;
  description: string;
  effectifs: Record<Palier, number>;
  total: number;
  aliments: { nom: string; note?: string; cru: string; cuit: string }[];
  preparations: { titre: string; total: string | null; ingredients: { nom: string; qte: string }[]; etapes: string[] }[];
  cuisine: string[];
  elements: { nom: string; portions: Record<Palier, number>; total: string }[];
  montage: string[];
  notes: string[];
  allergenes: string;
}

type Rvb = [number, number, number];
const VERT: Rvb = [28, 46, 30];
const OR: Rvb = [201, 151, 58];
const CREME: Rvb = [247, 243, 236];
const TEXTE: Rvb = [30, 30, 30];
const GRIS: Rvb = [115, 115, 115];
const ROUGE: Rvb = [185, 28, 28];
const ROUGE_FOND: Rvb = [253, 236, 236];
const ALTERNE: Rvb = [250, 248, 244];
const PALIERS: Palier[] = ["P1", "P2", "P3"];
const COULEUR_PALIER: Record<Palier, Rvb> = { P1: [79, 125, 74], P2: [201, 151, 58], P3: [62, 110, 150] };

// La police intégrée du PDF ne connaît pas certains signes : on les remplace.
const propre = (t: string) =>
  t
    .replace(/→/g, ">")
    .replace(/≈\s?/g, "env. ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/ | /g, " ")
    .replace(/⚠️|☀️|🌙/g, "");

function rendre(JsPdf: typeof JsPDF, f: FicheRecettePdf, logo: { data: string; ratio: number } | null | undefined, k: number) {
  const doc = new JsPdf({ unit: "mm", format: "a4" });
  const marge = 14;
  const largeur = 210 - marge * 2;
  const bas = 297 - 12;
  let y = 0;

  const police = (taille: number, style: "normal" | "bold" | "italic" = "normal", couleur: Rvb = TEXTE) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(taille);
    doc.setTextColor(...couleur);
  };
  const lignes = (t: string, l: number) => doc.splitTextToSize(propre(t), l) as string[];
  const place = (h: number) => {
    if (y + h > bas) {
      doc.addPage();
      y = marge;
      police(8.5 * k, "bold", GRIS);
      doc.text(`${propre(f.nom.toUpperCase())} (suite)`, marge, y + 2);
      y += 7;
    }
  };

  // Bandeau de section : fond vert, titre or.
  const section = (titre: string, droite?: string) => {
    place(16 * k);
    y += 3 * k;
    doc.setFillColor(...VERT);
    doc.roundedRect(marge, y, largeur, 8.5 * k, 1.5, 1.5, "F");
    police(10.5 * k, "bold", [255, 255, 255]);
    doc.text(propre(titre.toUpperCase()), marge + 4, y + 5.8 * k);
    if (droite) {
      police(9.5 * k, "bold", OR);
      doc.text(propre(droite), marge + largeur - 4, y + 5.8 * k, { align: "right" });
    }
    y += 11.5 * k;
  };

  // ---------- En-tête compact : logo, nom, allergènes ; effectifs à droite ----------
  const hEntete = 24 * k;
  doc.setFillColor(...CREME);
  doc.rect(0, 0, 210, hEntete, "F");
  doc.setFillColor(...OR);
  doc.rect(0, hEntete, 210, 0.8, "F");
  const hLogo = 16 * k;
  if (logo) doc.addImage(logo.data, "PNG", marge, 4 * k, hLogo * logo.ratio, hLogo, "logo", "FAST");
  const xT = logo ? marge + hLogo * logo.ratio + 5 : marge;
  // Effectifs : 4 petites tuiles sur une ligne, à droite.
  const lT = 15;
  const hT = 13 * k;
  const xTuiles = 210 - marge - lT * 4 - 2 * 3;
  const tuiles: { libelle: string; valeur: number; fond: Rvb; texte: Rvb; etiquette: Rvb }[] = [
    { libelle: "TOTAL", valeur: f.total, fond: VERT, texte: [255, 255, 255], etiquette: OR },
    ...PALIERS.map((p) => ({ libelle: p, valeur: f.effectifs[p] || 0, fond: [255, 255, 255] as Rvb, texte: VERT, etiquette: COULEUR_PALIER[p] })),
  ];
  tuiles.forEach((t, i) => {
    const x = xTuiles + i * (lT + 2);
    const yT = (hEntete - hT) / 2;
    doc.setFillColor(...t.fond);
    doc.roundedRect(x, yT, lT, hT, 1.5, 1.5, "F");
    police(6.5 * k, "bold", t.etiquette);
    doc.text(t.libelle, x + lT / 2, yT + 4.2 * k, { align: "center" });
    police(13 * k, "bold", t.texte);
    doc.text(String(t.valeur), x + lT / 2, yT + 10.5 * k, { align: "center" });
  });
  const lTitre = xTuiles - xT - 4;
  police(16 * k, "bold", VERT);
  const titre = lignes(f.nom, lTitre)[0];
  doc.text(titre, xT, 11 * k);
  police(10 * k, "normal", GRIS);
  doc.text(lignes(f.sousTitre, lTitre)[0], xT, 16 * k);
  police(7.5 * k, "bold", ROUGE);
  doc.text(lignes(`Allergènes : ${f.allergenes}`, lTitre)[0], xT, 20.5 * k);
  y = hEntete + 2 * k;

  // ---------- À préparer ----------
  section("À préparer", "cru / net  >  cuit");
  const col = { nom: marge + 3, cru: marge + 112, cuit: marge + 150 };
  police(8 * k, "bold", GRIS);
  doc.text("ALIMENT", col.nom, y);
  doc.text("CRU / NET", col.cru, y);
  doc.text("CUIT", col.cuit, y);
  y += 2.5 * k;
  f.aliments.forEach((a, i) => {
    const note = a.note ? lignes(a.note, 95) : [];
    const h = (7.5 + note.length * 3.6) * k;
    place(h);
    if (i % 2 === 0) {
      doc.setFillColor(...ALTERNE);
      doc.rect(marge, y, largeur, h, "F");
    }
    police(10.5 * k, "bold", VERT);
    doc.text(propre(a.nom), col.nom, y + 5.2 * k);
    police(11 * k, "bold", TEXTE);
    doc.text(propre(a.cru), col.cru, y + 5.2 * k);
    police(10.5 * k, "normal", TEXTE);
    doc.text(propre(a.cuit), col.cuit, y + 5.2 * k);
    if (note.length) {
      police(8 * k, "italic", GRIS);
      doc.text(note, col.nom, y + 8.8 * k);
    }
    y += h;
  });

  // ---------- Sauces, marinades ----------
  for (const p of f.preparations) {
    section(p.titre, p.total ? `env. ${p.total}` : undefined);
    const moitie = Math.ceil(p.ingredients.length / 2);
    const colonnes = [p.ingredients.slice(0, moitie), p.ingredients.slice(moitie)];
    const lC = (largeur - 6) / 2;
    const hLigne = 7 * k;
    place(moitie * hLigne);
    const y0 = y;
    colonnes.forEach((c, colonne) => {
      const x = marge + colonne * (lC + 6);
      c.forEach((ing, i) => {
        const yy = y0 + i * hLigne;
        if (i % 2 === 0) {
          doc.setFillColor(...ALTERNE);
          doc.rect(x, yy, lC, hLigne, "F");
        }
        police(10 * k, "normal", TEXTE);
        doc.text(propre(ing.nom), x + 3, yy + 4.8 * k);
        police(10.5 * k, "bold", VERT);
        doc.text(propre(ing.qte), x + lC - 3, yy + 4.8 * k, { align: "right" });
      });
    });
    y = y0 + moitie * hLigne + 2 * k;
    police(9.5 * k, "italic", GRIS);
    const le = lignes(p.etapes.join(" "), largeur - 6);
    place(le.length * 4.4 * k);
    doc.text(le, marge + 3, y + 3.5 * k);
    y += le.length * 4.4 * k;
  }

  // ---------- Cuisine ----------
  section("Cuisine");
  f.cuisine.forEach((e, i) => {
    const l = lignes(e, largeur - 14);
    const h = (l.length * 4.8 + 2.5) * k;
    place(h);
    doc.setFillColor(...OR);
    doc.circle(marge + 4, y + 2.6 * k, 2.6 * k, "F");
    police(8.5 * k, "bold", [255, 255, 255]);
    doc.text(String(i + 1), marge + 4, y + 3.6 * k, { align: "center" });
    police(10.5 * k, "normal", TEXTE);
    doc.text(l, marge + 10, y + 3.8 * k);
    y += h;
  });

  // ---------- Montage ----------
  section("Montage", "poids cuits par box");
  const cm = { nom: marge + 3, P1: marge + 108, P2: marge + 128, P3: marge + 148, total: marge + largeur - 3 };
  police(8 * k, "bold", GRIS);
  doc.text("DANS LA BOX", cm.nom, y);
  for (const p of PALIERS) {
    police(8.5 * k, "bold", COULEUR_PALIER[p]);
    doc.text(p, cm[p] + 8, y, { align: "right" });
  }
  police(8 * k, "bold", GRIS);
  doc.text("TOTAL", cm.total, y, { align: "right" });
  y += 2.5;
  f.elements.forEach((e, i) => {
    const l = lignes(e.nom, 90);
    const h = (3.5 + l.length * 4.4) * k;
    place(h);
    if (i % 2 === 0) {
      doc.setFillColor(...ALTERNE);
      doc.rect(marge, y, largeur, h, "F");
    }
    police(10.5 * k, "bold", VERT);
    doc.text(l, cm.nom, y + 5 * k);
    police(10.5 * k, "normal", TEXTE);
    for (const p of PALIERS) doc.text(`${e.portions[p]} g`, cm[p] + 8, y + 5 * k, { align: "right" });
    police(10.5 * k, "bold", VERT);
    doc.text(propre(e.total), cm.total, y + 5 * k, { align: "right" });
    y += h;
  });
  y += 2;
  for (const m of f.montage) {
    const l = lignes(`> ${m}`, largeur - 6);
    place(l.length * 4.8 * k);
    police(10.5 * k, "bold", VERT);
    doc.text(l, marge + 3, y + 3.8 * k);
    y += l.length * 4.8 * k;
  }
  police(9.5 * k, "italic", GRIS);
  const ln = lignes(f.notes.join(" "), largeur - 6);
  place(ln.length * 4.4 * k);
  doc.text(ln, marge + 3, y + 3.8 * k);
  y += ln.length * 4.4 * k;

  // ---------- Pied de page ----------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    police(8 * k, "normal", GRIS);
    doc.text(`CHEF2BOX · ${propre(f.nom)} · ${f.total} box · poids crus indicatifs, à ajuster selon le rendement`, marge, 292);
    doc.text(`${i} / ${pages}`, 210 - marge, 292, { align: "right" });
  }
  return doc;
}

// Une seule page : on part d'un texte plus grand et on réduit jusqu'à ce que
// toute la fiche tienne sur une A4 (sans descendre sous un minimum lisible).
export function genererRecettePdf(JsPdf: typeof JsPDF, f: FicheRecettePdf, logo?: { data: string; ratio: number } | null): Blob {
  let doc = rendre(JsPdf, f, logo, 1.25);
  for (let k = 1.2; doc.getNumberOfPages() > 1 && k >= 0.7; k -= 0.05) doc = rendre(JsPdf, f, logo, k);
  return doc.output("blob");
}
