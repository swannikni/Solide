import type { jsPDF as JsPDF } from "jspdf";
import type { Palier } from "@/lib/types";

// Fiche cuisine en PDF (A4) à envoyer aux chefs :
//   en-tête avec logo, totaux du jour, alerte allergies ;
//   MIDI (plat) puis SOIR : un bloc coloré par palier avec son total, et un
//   tableau lisible (case à cocher, nom, allergies / refus / consigne).
// Construite d'un bloc (sans attente) pour pouvoir ouvrir le partage du
// téléphone dans la foulée du toucher.

export interface LigneFiche {
  cle: string;
  nom: string;
  palier: Palier | null;
  allergies: string | null;
  refus: string | null;
  note: string | null;
  ajout?: boolean; // ajouté à la main sur la fiche (retirable à l'écran)
}

export interface ServiceFiche {
  court: string; // « MIDI », « SOIR »
  plat: string;
  total: number;
  paliers: { palier: Palier | null; lignes: LigneFiche[] }[];
}

export const libellePalier = (p: Palier | null) => (p ? `Palier ${p.slice(1)}` : "Sans palier");

type Rvb = [number, number, number];
const VERT: Rvb = [28, 46, 30];
const OR: Rvb = [201, 151, 58];
const CREME: Rvb = [247, 243, 236];
const TEXTE: Rvb = [30, 30, 30];
const GRIS: Rvb = [115, 115, 115];
const ROUGE: Rvb = [185, 28, 28];
const ROUGE_FOND: Rvb = [253, 236, 236];
const LIGNE_ALTERNEE: Rvb = [250, 248, 244];

// Une couleur par palier : fond clair du bandeau et trait vif à gauche.
const COULEURS_PALIER: Record<string, { fond: Rvb; trait: Rvb }> = {
  P1: { fond: [232, 241, 228], trait: [79, 125, 74] },
  P2: { fond: [252, 242, 217], trait: [201, 151, 58] },
  P3: { fond: [227, 237, 246], trait: [62, 110, 150] },
  P4: { fond: [248, 229, 221], trait: [181, 96, 63] },
  P5: { fond: [237, 231, 245], trait: [109, 90, 150] },
  P6: { fond: [233, 236, 232], trait: [95, 110, 100] },
  aucun: { fond: [238, 238, 238], trait: [140, 140, 140] },
};

export function genererFichePdf(
  JsPdf: typeof JsPDF,
  {
    titreDate,
    services,
    logo,
  }: { titreDate: string; services: ServiceFiche[]; logo?: { data: string; ratio: number } | null }
): Blob {
  const doc = new JsPdf({ unit: "mm", format: "a4" });
  const marge = 14;
  const largeur = 210 - marge * 2;
  const bas = 297 - 16; // place gardée pour le pied de page
  const date = titreDate.charAt(0).toUpperCase() + titreDate.slice(1);
  let y = 0;

  const police = (taille: number, style: "normal" | "bold" | "italic" | "bolditalic" = "normal", couleur: Rvb = TEXTE) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(taille);
    doc.setTextColor(...couleur);
  };
  const hauteurLigne = (taille: number) => taille * 0.42;

  // Bandeau d'un palier : fond clair, trait vif à gauche, total à droite.
  const bandeauPalier = (g: ServiceFiche["paliers"][number], suite = false) => {
    const couleurs = COULEURS_PALIER[g.palier ?? "aucun"];
    doc.setFillColor(...couleurs.fond);
    doc.rect(marge, y, largeur, 9, "F");
    doc.setFillColor(...couleurs.trait);
    doc.rect(marge, y, 2.2, 9, "F");
    police(11.5, "bold", VERT);
    doc.text(`${libellePalier(g.palier).toUpperCase()}${suite ? " (suite)" : ""}`, marge + 6, y + 6.1);
    police(10, "bold", couleurs.trait);
    doc.text(`Total : ${g.lignes.length} repas`, marge + largeur - 4, y + 6.1, { align: "right" });
    y += 9;
  };

  // Service et palier en cours : rappelés en haut d'une nouvelle page.
  let serviceEnCours: ServiceFiche | null = null;
  let palierEnCours: ServiceFiche["paliers"][number] | null = null;
  const nouvellePage = () => {
    doc.addPage();
    y = marge;
    if (serviceEnCours) {
      police(9, "bold", GRIS);
      doc.text(`${serviceEnCours.court}${serviceEnCours.plat ? ` — ${serviceEnCours.plat}` : ""} (suite)`, marge, y + 3);
      y += 7;
    }
    if (palierEnCours) bandeauPalier(palierEnCours, true);
  };
  const place = (hauteur: number) => {
    if (y + hauteur > bas) nouvellePage();
  };

  // ---------- En-tête ----------
  doc.setFillColor(...CREME);
  doc.rect(0, 0, 210, 42, "F");
  doc.setFillColor(...OR);
  doc.rect(0, 42, 210, 1.2, "F");
  const hauteurLogo = 26;
  if (logo) doc.addImage(logo.data, "PNG", marge, 8, hauteurLogo * logo.ratio, hauteurLogo, "logo", "FAST");
  const xTitre = logo ? marge + hauteurLogo * logo.ratio + 8 : marge;
  police(9, "bold", OR);
  doc.text("FICHE CUISINE", xTitre, 17);
  police(20, "bold", VERT);
  doc.text(date, xTitre, 26);
  police(9, "normal", GRIS);
  doc.text("Préparation des boîtes · à cocher au fur et à mesure", xTitre, 32.5);
  y = 50;

  // ---------- Totaux du jour ----------
  const total = services.reduce((t, s) => t + s.total, 0);
  const tuiles = [{ libelle: "TOTAL DU JOUR", valeur: total, fond: VERT, texte: [255, 255, 255] as Rvb }].concat(
    services.map((s) => ({ libelle: s.court, valeur: s.total, fond: CREME, texte: VERT }))
  );
  const ecart = 4;
  const largeurTuile = (largeur - ecart * (tuiles.length - 1)) / tuiles.length;
  tuiles.forEach((t, i) => {
    const x = marge + i * (largeurTuile + ecart);
    doc.setFillColor(...t.fond);
    doc.roundedRect(x, y, largeurTuile, 18, 3, 3, "F");
    police(8, "bold", t.fond === VERT ? OR : GRIS);
    doc.text(t.libelle, x + 5, y + 6.5);
    police(16, "bold", t.texte);
    doc.text(`${t.valeur} repas`, x + 5, y + 14.5);
  });
  y += 24;

  const nbAllergies = services.reduce(
    (t, s) => t + s.paliers.reduce((u, g) => u + g.lignes.filter((l) => l.allergies).length, 0),
    0
  );
  if (nbAllergies > 0) {
    doc.setFillColor(...ROUGE_FOND);
    doc.setDrawColor(...ROUGE);
    doc.setLineWidth(0.4);
    doc.roundedRect(marge, y, largeur, 10, 2, 2, "FD");
    police(10.5, "bold", ROUGE);
    doc.text(`ATTENTION : ${nbAllergies} repas avec allergie. Vérifier chaque boîte avant de la fermer.`, marge + 4, y + 6.4);
    y += 15;
  }

  // ---------- Services ----------
  const colNom = marge + 11; // après la case à cocher
  const colDetails = marge + 64;
  const largeurDetails = marge + largeur - colDetails - 3;

  for (const s of services) {
    serviceEnCours = null;
    place(30);
    // Bandeau du service
    doc.setFillColor(...VERT);
    doc.roundedRect(marge, y, largeur, 13, 2.5, 2.5, "F");
    police(14, "bold", [255, 255, 255]);
    doc.text(s.court, marge + 5, y + 8.6);
    const largeurCourt = doc.getTextWidth(s.court);
    if (s.plat) {
      police(12, "normal", [235, 230, 218]);
      const plat = doc.splitTextToSize(s.plat, largeur - largeurCourt - 50)[0] as string;
      doc.text(`—  ${plat}`, marge + 5 + largeurCourt + 4, y + 8.6);
    }
    // Pastille dorée : nombre de repas du service
    const pastille = `${s.total} repas`;
    police(11, "bold", VERT);
    const lp = doc.getTextWidth(pastille) + 8;
    doc.setFillColor(...OR);
    doc.roundedRect(marge + largeur - lp - 3, y + 2.5, lp, 8, 4, 4, "F");
    doc.text(pastille, marge + largeur - 3 - lp / 2, y + 7.9, { align: "center" });
    y += 17;
    serviceEnCours = s;

    if (s.total === 0) {
      police(10, "italic", GRIS);
      doc.text("Aucun repas pour ce service.", marge + 2, y + 3);
      y += 10;
      continue;
    }

    for (const g of s.paliers) {
      palierEnCours = null;
      place(20); // bandeau + au moins une ligne
      bandeauPalier(g);
      palierEnCours = g;

      g.lignes.forEach((l, i) => {
        // Détails à droite : allergie (rouge), refus, consigne.
        const details: { texte: string; style: "bold" | "normal" | "italic"; couleur: Rvb }[] = [];
        if (l.allergies) details.push({ texte: `ALLERGIE : ${l.allergies}`, style: "bold", couleur: ROUGE });
        if (l.refus) details.push({ texte: `Sans : ${l.refus}`, style: "normal", couleur: TEXTE });
        if (l.note) details.push({ texte: `Consigne : ${l.note}`, style: "italic", couleur: GRIS });

        const taille = 10;
        const hl = hauteurLigne(taille);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        const lignesNom = doc.splitTextToSize(l.nom, colDetails - colNom - 3) as string[];
        const blocs = details.map((d) => {
          doc.setFont("helvetica", d.style);
          doc.setFontSize(taille);
          return { ...d, lignes: doc.splitTextToSize(d.texte, largeurDetails) as string[] };
        });
        const nbLignesDetails = blocs.reduce((t, b) => t + b.lignes.length, 0);
        const hauteur = Math.max(lignesNom.length * hauteurLigne(11), nbLignesDetails * hl) + 4.4;

        place(hauteur);
        if (i % 2 === 1) {
          doc.setFillColor(...LIGNE_ALTERNEE);
          doc.rect(marge, y, largeur, hauteur, "F");
        }
        if (l.allergies) {
          doc.setFillColor(...ROUGE);
          doc.rect(marge, y, 1.2, hauteur, "F");
        }
        // Case à cocher
        doc.setDrawColor(...GRIS);
        doc.setLineWidth(0.3);
        doc.roundedRect(marge + 4, y + 2.2, 3.6, 3.6, 0.6, 0.6, "S");
        // Nom
        police(11, "bold", VERT);
        lignesNom.forEach((t, k) => doc.text(t, colNom, y + 5.2 + k * hauteurLigne(11)));
        // Détails
        let yd = y + 5;
        if (blocs.length === 0) {
          police(9, "normal", [190, 190, 190]);
          doc.text("—", colDetails, yd);
        }
        for (const b of blocs) {
          police(taille, b.style, b.couleur);
          for (const t of b.lignes) {
            doc.text(t, colDetails, yd);
            yd += hl;
          }
        }
        // Séparation fine
        doc.setDrawColor(230, 226, 218);
        doc.setLineWidth(0.2);
        doc.line(marge, y + hauteur, marge + largeur, y + hauteur);
        y += hauteur;
      });
      palierEnCours = null;
      y += 5;
    }
    y += 4;
  }

  // ---------- Pied de page ----------
  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    doc.setDrawColor(225, 220, 210);
    doc.setLineWidth(0.3);
    doc.line(marge, 297 - 11, marge + largeur, 297 - 11);
    police(8, "normal", GRIS);
    doc.text(`Chef2Box · Fiche cuisine du ${titreDate}`, marge, 297 - 6.5);
    doc.text(`Page ${n}/${pages}`, marge + largeur, 297 - 6.5, { align: "right" });
  }

  return doc.output("blob");
}
