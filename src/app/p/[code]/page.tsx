import { redirect } from "next/navigation";

// Lien imprimé dans le QR des étiquettes : ouvre l'accueil avec le plat pré-rempli.
export default function LienPlat({ params }: { params: { code: string } }) {
  redirect(`/dashboard?plat=${encodeURIComponent(decodeURIComponent(params.code))}`);
}
