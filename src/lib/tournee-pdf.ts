import type { jsPDF as JsPDF } from "jspdf";

// Feuille de route d'un livreur en PDF (A4) : en-tête avec logo, départ et
// fin estimée, puis chaque arrêt dans l'ordre avec l'heure, le téléphone
// (lien d'appel), l'adresse, le complément (bât., porte…), les consignes et
// des liens Google Maps et Waze. Liens cliquables depuis le téléphone.
// Construite d'un bloc (sans attente) pour ouvrir le partage dans la foulée.

export interface ArretFeuille {
  heure: string;
  nom: string;
  boites: string; // « 2 boîtes (midi + soir) »
  telephone: string | null;
  adresse: string | null;
  complement: string | null;
  consignes: string[];
  google: string;
  waze: string;
}

export interface FeuilleDeRoute {
  titreDate: string; // « lundi 28 septembre »
  livreur: string;
  depart: string; // « 11:30 »
  fin: string;
  dureeTexte: string;
  distanceKm: number;
  totalBoites: number;
  remuneration: string | null; // « 4 × 20 DH = 80 DH »
  itineraires: string[];
  arrets: ArretFeuille[];
}

type Rvb = [number, number, number];
const VERT: Rvb = [28, 46, 30];
const OR: Rvb = [201, 151, 58];
const CREME: Rvb = [247, 243, 236];
const TEXTE: Rvb = [30, 30, 30];
const GRIS: Rvb = [115, 115, 115];
const BLEU_LIEN: Rvb = [37, 99, 235];
const WAZE: Rvb = [20, 150, 200];
const ALTERNEE: Rvb = [250, 248, 244];

// Les polices intégrées du PDF ne connaissent que l'alphabet latin :
// on remplace les signes typographiques courants.
const propre = (t: string) =>
  t
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[→➜]/g, "->")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, "");

export function genererFeuillePdf(JsPdf: typeof JsPDF, f: FeuilleDeRoute, logo?: { data: string; ratio: number } | null): Blob {
  const doc = new JsPdf({ unit: "mm", format: "a4" });
  const marge = 14;
  const largeur = 210 - marge * 2;
  const bas = 297 - 16;
  const date = f.titreDate.charAt(0).toUpperCase() + f.titreDate.slice(1);
  let y = 0;

  const police = (taille: number, style: "normal" | "bold" | "italic" = "normal", couleur: Rvb = TEXTE) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(taille);
    doc.setTextColor(...couleur);
  };
  const lien = (texte: string, x: number, yy: number, url: string, couleur: Rvb = BLEU_LIEN) => {
    police(10, "bold", couleur);
    doc.textWithLink(texte, x, yy, { url });
    const l = doc.getTextWidth(texte);
    doc.setDrawColor(...couleur);
    doc.setLineWidth(0.25);
    doc.line(x, yy + 0.8, x + l, yy + 0.8);
    return l;
  };

  // ---------- En-tête ----------
  doc.setFillColor(...CREME);
  doc.rect(0, 0, 210, 40, "F");
  doc.setFillColor(...OR);
  doc.rect(0, 40, 210, 1.2, "F");
  const hauteurLogo = 24;
  if (logo) doc.addImage(logo.data, "PNG", marge, 8, hauteurLogo * logo.ratio, hauteurLogo, "logo", "FAST");
  const xTitre = logo ? marge + hauteurLogo * logo.ratio + 8 : marge;
  police(9, "bold", OR);
  doc.text("FEUILLE DE ROUTE", xTitre, 16);
  police(19, "bold", VERT);
  doc.text(propre(f.livreur), xTitre, 25);
  police(10, "normal", GRIS);
  doc.text(`${date} · tournée du midi`, xTitre, 31.5);
  y = 48;

  // ---------- Tuiles ----------
  const tuiles = [
    { libelle: "DÉPART", valeur: f.depart },
    { libelle: "FIN VERS", valeur: f.fin },
    { libelle: "LIVRAISONS", valeur: String(f.arrets.length) },
    { libelle: "BOÎTES", valeur: String(f.totalBoites) },
  ];
  const ecart = 4;
  const lt = (largeur - ecart * (tuiles.length - 1)) / tuiles.length;
  tuiles.forEach((t, i) => {
    const x = marge + i * (lt + ecart);
    doc.setFillColor(...(i === 0 ? VERT : CREME));
    doc.roundedRect(x, y, lt, 17, 3, 3, "F");
    police(7.5, "bold", i === 0 ? OR : GRIS);
    doc.text(t.libelle, x + 4, y + 6);
    police(15, "bold", i === 0 ? [255, 255, 255] : VERT);
    doc.text(t.valeur, x + 4, y + 13.5);
  });
  y += 23;
  police(9.5, "normal", GRIS);
  doc.text(`Environ ${f.dureeTexte} · ${f.distanceKm.toFixed(1)} km (estimation sans bouchons)`, marge, y);
  if (f.remuneration) {
    police(10, "bold", VERT);
    doc.text(propre(`Rémunération : ${f.remuneration}`), marge + largeur, y, { align: "right" });
  }
  y += 6;
  if (f.itineraires.length) {
    police(10, "bold", VERT);
    doc.text("Itinéraire complet :", marge, y + 1);
    let x = marge + doc.getTextWidth("Itinéraire complet :") + 3;
    f.itineraires.forEach((u, k) => {
      const texte = f.itineraires.length > 1 ? `Google Maps partie ${k + 1}` : "Ouvrir dans Google Maps";
      x += lien(texte, x, y + 1, u) + 5;
    });
    y += 7;
  }
  y += 2;

  // ---------- Arrêts ----------
  const colTexte = marge + 22;
  const largeurTexte = marge + largeur - colTexte - 4;
  f.arrets.forEach((a, i) => {
    // Hauteur du bloc : nom, téléphone, adresse, complément, consignes, liens.
    police(10, "normal");
    const lignesAdresse = a.adresse ? (doc.splitTextToSize(propre(a.adresse), largeurTexte) as string[]) : [];
    police(11, "bold");
    const lignesComplement = a.complement ? (doc.splitTextToSize(propre(a.complement), largeurTexte) as string[]) : [];
    police(10, "italic");
    const lignesConsignes = a.consignes.flatMap((c) => doc.splitTextToSize(propre(`-> ${c}`), largeurTexte) as string[]);
    const hauteur =
      8 + // nom
      (a.telephone ? 5.5 : 0) +
      lignesAdresse.length * 4.4 +
      lignesComplement.length * 5 +
      lignesConsignes.length * 4.4 +
      8 + // liens
      2;
    if (y + hauteur > bas) {
      doc.addPage();
      y = marge;
      police(9, "bold", GRIS);
      doc.text(propre(`${f.livreur} · ${date} (suite)`), marge, y + 3);
      y += 7;
    }
    if (i % 2 === 1) {
      doc.setFillColor(...ALTERNEE);
      doc.rect(marge, y, largeur, hauteur, "F");
    }
    doc.setFillColor(...OR);
    doc.rect(marge, y, 1.2, hauteur, "F");
    // Numéro et heure
    doc.setFillColor(...VERT);
    doc.circle(marge + 9, y + 6.5, 4.2, "F");
    police(11, "bold", [255, 255, 255]);
    doc.text(String(i + 1), marge + 9, y + 8.1, { align: "center" });
    police(9, "bold", VERT);
    doc.text(a.heure, marge + 9, y + 15.5, { align: "center" });

    let yy = y + 7;
    police(13, "bold", VERT);
    const nom = propre(a.nom);
    doc.text(nom, colTexte, yy);
    const largeurNom = doc.getTextWidth(nom);
    police(9.5, "bold", OR);
    doc.text(propre(a.boites), colTexte + largeurNom + 3, yy);
    yy += 1;
    if (a.telephone) {
      yy += 5;
      police(10, "normal", GRIS);
      doc.text("Tél. :", colTexte, yy);
      lien(propre(a.telephone), colTexte + 10, yy, `tel:${a.telephone.replace(/[^\d+]/g, "")}`);
    }
    if (lignesAdresse.length) {
      yy += 1;
      police(10, "normal", TEXTE);
      for (const l of lignesAdresse) {
        yy += 4.4;
        doc.text(l, colTexte, yy);
      }
    }
    if (lignesComplement.length) {
      yy += 0.6;
      police(11, "bold", VERT);
      for (const l of lignesComplement) {
        yy += 5;
        doc.text(l, colTexte, yy);
      }
    }
    if (lignesConsignes.length) {
      police(10, "italic", GRIS);
      for (const l of lignesConsignes) {
        yy += 4.4;
        doc.text(l, colTexte, yy);
      }
    }
    yy += 6.5;
    let x = colTexte;
    x += lien("Google Maps", x, yy, a.google) + 8;
    lien("Waze", x, yy, a.waze, WAZE);

    y += hauteur;
    doc.setDrawColor(230, 226, 218);
    doc.setLineWidth(0.2);
    doc.line(marge, y, marge + largeur, y);
  });

  // ---------- Pied de page ----------
  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    doc.setDrawColor(225, 220, 210);
    doc.setLineWidth(0.3);
    doc.line(marge, 297 - 11, marge + largeur, 297 - 11);
    police(8, "normal", GRIS);
    doc.text(propre(`Chef2Box · Feuille de route de ${f.livreur} · ${f.titreDate}`), marge, 297 - 6.5);
    doc.text(`Page ${n}/${pages}`, marge + largeur, 297 - 6.5, { align: "right" });
  }
  return doc.output("blob");
}
