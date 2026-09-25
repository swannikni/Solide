import { redirect } from "next/navigation";

// Lien imprimé dans le QR des étiquettes : ouvre l'accueil avec le plat pré-rempli.
export default async function LienPlat({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/dashboard?plat=${encodeURIComponent(decodeURIComponent(code))}`);
}
