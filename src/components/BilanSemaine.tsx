"use client";

import { useEffect, useState } from "react";
import { Share2, X } from "lucide-react";

export interface StatsSemaine {
  // Lundi de la semaine résumée (sert aussi de clé pour « masquer »).
  lundi: string;
  dimanche: string;
  joursNotes: number;
  joursObjectif: number;
  joursProteines: number;
  moyenneKcal: number | null;
  variationPoids: number | null;
}

function phrase(s: StatsSemaine) {
  if (s.joursNotes === 7) return "Semaine parfaite 👑";
  if (s.joursNotes >= 5) return "Très belle semaine 💪";
  if (s.joursNotes >= 3) return "Bonne base : visez 5 jours cette semaine 🎯";
  return "Nouvelle semaine, nouveau départ 🔥";
}

const kg = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kg`;

// Bilan de la semaine passée, affiché en début de semaine sur Aujourd'hui.
export function BilanSemaine({ stats }: { stats: StatsSemaine }) {
  const cle = `c2b-bilan-${stats.lundi}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(localStorage.getItem(cle) !== "1");
    } catch {
      setVisible(true);
    }
  }, [cle]);

  function masquer() {
    try {
      localStorage.setItem(cle, "1");
    } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  const periode = `${new Date(`${stats.lundi}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })} – ${new Date(`${stats.dimanche}T12:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })}`;

  const texteWhatsApp = [
    `Ma semaine avec Chef2Box (${periode}) :`,
    `🔥 ${stats.joursNotes}/7 jours suivis`,
    `🎯 ${stats.joursObjectif}/7 jours dans mon objectif calories`,
    `💪 ${stats.joursProteines}/7 jours objectif protéines`,
    stats.variationPoids !== null ? `⚖️ ${kg(stats.variationPoids)}` : null,
    "",
    "Prêt. Sain. Maîtrisé. chef2box.com",
  ]
    .filter((l) => l !== null)
    .join("\n");

  return (
    <section className="relative rounded-[20px] bg-gradient-to-br from-c2b-gold/25 to-c2b-gold/5 border border-c2b-gold/30 p-5">
      <button onClick={masquer} className="absolute right-3 top-3 text-c2b-green/50" aria-label="Masquer le bilan">
        <X size={18} />
      </button>
      <span className="lbl mb-1">📊 Bilan de la semaine · {periode}</span>
      <p className="font-serif text-[24px] leading-tight text-c2b-green pr-6">{phrase(stats)}</p>

      <div className="grid grid-cols-2 gap-2 mt-4">
        <Case valeur={`${stats.joursNotes}/7`} libelle="jours suivis" />
        <Case valeur={`${stats.joursObjectif}/7`} libelle="jours dans l'objectif" />
        <Case valeur={`${stats.joursProteines}/7`} libelle="jours protéines OK" />
        {stats.variationPoids !== null ? (
          <Case valeur={kg(stats.variationPoids)} libelle="poids sur la semaine" />
        ) : (
          <Case
            valeur={stats.moyenneKcal !== null ? stats.moyenneKcal.toLocaleString("fr-FR") : "—"}
            libelle="kcal en moyenne / jour"
          />
        )}
      </div>

      <a
        href={`https://wa.me/?text=${encodeURIComponent(texteWhatsApp)}`}
        target="_blank"
        rel="noreferrer"
        className="btn-primary w-full py-3 mt-4 text-sm"
      >
        <Share2 size={16} /> Partager sur WhatsApp
      </a>
    </section>
  );
}

function Case({ valeur, libelle }: { valeur: string; libelle: string }) {
  return (
    <div className="rounded-2xl bg-white/80 px-3.5 py-3">
      <p className="text-[22px] font-semibold leading-none text-c2b-text">{valeur}</p>
      <p className="text-[11px] text-c2b-muted mt-1">{libelle}</p>
    </div>
  );
}
