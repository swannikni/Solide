// Réduit une photo (souvent 4 à 8 Mo sur iPhone) en JPEG de 1200 px max
// avant l'envoi : plus rapide à charger pour les clients.
export async function reduirePhoto(fichier: File, tailleMax = 1200): Promise<Blob> {
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = ko;
      i.src = url;
    });
    const echelle = Math.min(1, tailleMax / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * echelle);
    canvas.height = Math.round(img.naturalHeight * echelle);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, ko) =>
      canvas.toBlob((b) => (b ? ok(b) : ko(new Error("conversion"))), "image/jpeg", 0.82)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
