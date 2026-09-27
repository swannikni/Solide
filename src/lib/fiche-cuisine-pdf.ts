import type { jsPDF as JsPDF } from "jspdf";
import type { Palier } from "@/lib/types";

// Fiche cuisine en PDF (A4) à envoyer aux chefs :
//   MIDI (plat) : n repas
//     Palier 1 : noms, allergies, aliments refusés, consigne — Total palier
//   SOIR : pareil.
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

const VERT: [number, number, number] = [28, 46, 30];
const ROUGE: [number, number, number] = [185, 28, 28];
const GRIS: [number, number, number] = [110, 110, 110];

export function genererFichePdf(
  JsPdf: typeof JsPDF,
  { titreDate, services }: { titreDate: string; services: ServiceFiche[] }
): Blob {
  const doc = new JsPdf({ unit: "mm", format: "a4" });
  const marge = 15;
  const largeur = 210 - marge * 2;
  const bas = 297 - 15;
  let y = marge;

  const place = (hauteur: number) => {
    if (y + hauteur > bas) {
      doc.addPage();
      y = marge;
    }
  };
  const texte = (
    contenu: string,
    { taille = 11, gras = false, italique = false, couleur = VERT, retrait = 0 } = {}
  ) => {
    doc.setFont("helvetica", gras && italique ? "bolditalic" : gras ? "bold" : italique ? "italic" : "normal");
    doc.setFontSize(taille);
    doc.setTextColor(...couleur);
    const lignes = doc.splitTextToSize(contenu, largeur - retrait) as string[];
    const hauteurLigne = taille * 0.45;
    for (const l of lignes) {
      place(hauteurLigne);
      doc.text(l, marge + retrait, y + hauteurLigne * 0.8);
      y += hauteurLigne;
    }
  };

  const total = services.reduce((t, s) => t + s.total, 0);
  texte("CHEF2BOX · FICHE CUISINE", { taille: 18, gras: true });
  y += 1;
  texte(titreDate.charAt(0).toUpperCase() + titreDate.slice(1), { taille: 13 });
  texte(`Total : ${total} repas (${services.map((s) => `${s.total} ${s.court.toLowerCase()}`).join(" · ")})`, {
    taille: 11,
    couleur: GRIS,
  });
  const nbAllergies = services.reduce((t, s) => t + s.paliers.reduce((u, g) => u + g.lignes.filter((l) => l.allergies).length, 0), 0);
  if (nbAllergies > 0) {
    y += 1;
    texte(`ATTENTION : ${nbAllergies} repas avec allergie, à vérifier avant de fermer les boîtes.`, {
      taille: 11,
      gras: true,
      couleur: ROUGE,
    });
  }
  y += 4;

  for (const s of services) {
    // Bandeau du service : « MIDI — Poulet tikka » … « 5 repas »
    place(14);
    doc.setFillColor(...VERT);
    doc.roundedRect(marge, y, largeur, 10, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    const titre = s.plat ? `${s.court} — ${s.plat}` : s.court;
    doc.text(doc.splitTextToSize(titre, largeur - 40)[0] as string, marge + 3, y + 6.8);
    doc.text(`${s.total} repas`, marge + largeur - 3, y + 6.8, { align: "right" });
    y += 14;

    if (s.total === 0) {
      texte("Aucun repas", { couleur: GRIS });
      y += 4;
      continue;
    }

    for (const g of s.paliers) {
      place(14);
      texte(libellePalier(g.palier), { taille: 12, gras: true });
      y += 0.5;
      for (const l of g.lignes) {
        place(6);
        texte(`•  ${l.nom}`, { taille: 11, gras: true, retrait: 2 });
        if (l.allergies) texte(`ALLERGIE : ${l.allergies}`, { taille: 10, gras: true, couleur: ROUGE, retrait: 7 });
        if (l.refus) texte(`Ne mange pas : ${l.refus}`, { taille: 10, retrait: 7 });
        if (l.note) texte(`Consigne : ${l.note}`, { taille: 10, italique: true, retrait: 7 });
        y += 1;
      }
      y += 1;
      place(7);
      doc.setDrawColor(200, 200, 200);
      doc.line(marge + 2, y, marge + largeur, y);
      y += 1;
      texte(`Total ${libellePalier(g.palier).toLowerCase()} : ${g.lignes.length} repas`, {
        taille: 10,
        gras: true,
        couleur: GRIS,
        retrait: 2,
      });
      y += 3;
    }
    y += 3;
  }

  return doc.output("blob");
}
