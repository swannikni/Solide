import { Crown, MessageCircle } from "lucide-react";
import type { Palier } from "@/lib/types";

// Fonction réservée aux clients Chef2Box (Premium) : encart pour les
// utilisateurs gratuits, avec un lien WhatsApp pour commander une box.
const WHATSAPP = "212660831640";

export function lienCommande(palier?: Palier | null) {
  const texte = `Bonjour Chef2Box ! J'utilise l'appli et j'aimerais découvrir vos box${palier ? ` (mon palier : ${palier})` : ""}.`;
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texte)}`;
}

export function OffrePremium({
  titre,
  texte,
  palier,
  compact = false,
}: {
  titre: string;
  texte: string;
  palier?: Palier | null;
  compact?: boolean;
}) {
  return (
    <div className={`carte border-c2b-gold/50 bg-gradient-to-br from-white to-c2b-gold/[0.08] ${compact ? "p-4" : "p-5"}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-c2b-gold">
        <Crown size={14} /> Réservé aux clients Chef2Box
      </p>
      <p className={`mt-1.5 font-bold text-c2b-green ${compact ? "text-sm" : "text-base"}`}>{titre}</p>
      <p className="mt-1 text-sm text-c2b-muted">{texte}</p>
      <a
        href={lienCommande(palier)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-c2b-green px-4 py-2.5 text-sm font-bold text-c2b-cream"
      >
        <MessageCircle size={15} /> Découvrir les box Chef2Box
      </a>
    </div>
  );
}

// Petit badge « Membre Chef2Box » des clients Premium.
export function BadgePremium() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-c2b-gold/15 px-2.5 py-1 text-[11px] font-bold text-c2b-gold">
      <Crown size={12} /> Membre Chef2Box
    </span>
  );
}
