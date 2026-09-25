// Réduit une photo avant de l'envoyer à l'IA : ~1024 px de côté suffisent
// pour lire une étiquette ou reconnaître un plat, et une image plus petite
// coûte moins cher à analyser (et part plus vite en 4G).
export async function reduirePhoto(fichier: File, cote = 1024, qualite = 0.8): Promise<string> {
  const source = await chargerImage(fichier);
  const echelle = Math.min(1, cote / Math.max(source.width, source.height));
  const largeur = Math.round(source.width * echelle);
  const hauteur = Math.round(source.height * echelle);
  const canvas = document.createElement("canvas");
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponible");
  ctx.drawImage(source.image, 0, 0, largeur, hauteur);
  if ("close" in source.image) source.image.close();
  return canvas.toDataURL("image/jpeg", qualite);
}

async function chargerImage(fichier: File): Promise<{ image: ImageBitmap | HTMLImageElement; width: number; height: number }> {
  // createImageBitmap applique l'orientation EXIF (photos d'iPhone en portrait).
  if (typeof createImageBitmap === "function") {
    try {
      const image = await createImageBitmap(fichier, { imageOrientation: "from-image" });
      return { image, width: image.width, height: image.height };
    } catch {
      // Format non géré (HEIC sur certains navigateurs) : on essaie via <img>.
    }
  }
  const url = URL.createObjectURL(fichier);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}
