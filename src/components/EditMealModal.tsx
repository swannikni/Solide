"use client";

import { useState } from "react";
import { X, Trash2, Star, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Pastille } from "@/components/Pastille";
import { Portail } from "@/components/Portail";
import { GRAMMES_RAPIDES } from "@/components/AddMealModal";
import { estLiquide, portionsUsuelles } from "@/lib/portions";
import { ORDRE_REPAS, REPAS_TYPE_LABELS } from "@/lib/macros";
import type { RepasJournal, RepasType } from "@/lib/types";

// Modifier un aliment déjà ajouté : quantité, repas, nom, valeurs nutritionnelles ;
// le dupliquer ou le supprimer.
export function EditMealModal({
  repas,
  estFavori,
  onClose,
  onModifie,
}: {
  repas: RepasJournal;
  estFavori: boolean;
  onClose: () => void;
  onModifie: () => void;
}) {
  const supabase = createClient();
  const enGrammes = repas.unite === "g";
  const valeurInitiale = enGrammes ? Math.round(repas.quantite * 100) : repas.quantite;

  const [nom, setNom] = useState(repas.nom);
  const [repasType, setRepasType] = useState<RepasType>(repas.repas_type);
  const [valeur, setValeur] = useState<number>(valeurInitiale);
  const [saisie, setSaisie] = useState<string | null>(null);
  const [favori, setFavori] = useState(estFavori);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  // Valeurs pour 100 g ou pour 1 portion, modifiables.
  const [macros, setMacros] = useState({
    calories: String(Math.round(Number(repas.calories))),
    proteines: String(Number(repas.proteines)),
    glucides: String(Number(repas.glucides)),
    lipides: String(Number(repas.lipides)),
  });

  const facteur = enGrammes ? valeur / 100 : valeur;
  const unite = estLiquide(repas.nom) ? "ml" : "g";
  const portions = enGrammes ? portionsUsuelles(repas.nom) : [];
  const lire = (t: string) => {
    const n = parseFloat(t.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const valeurs = {
    calories: Math.round(lire(macros.calories)),
    proteines: lire(macros.proteines),
    glucides: lire(macros.glucides),
    lipides: lire(macros.lipides),
  };

  // Même aliment ajouté une deuxième fois, avec les réglages affichés.
  async function dupliquer() {
    setEnCours(true);
    const { error } = await supabase.from("application_repas_journal").insert({
      client_id: repas.client_id,
      date: repas.date,
      repas_type: repasType,
      source: repas.source,
      nom: nom.trim() || repas.nom,
      quantite: facteur,
      unite: repas.unite,
      ...valeurs,
      plat_id: repas.plat_id,
      cree_par: "client",
    });
    setEnCours(false);
    if (error) {
      setErreur("Copie impossible, réessayez.");
      return;
    }
    onModifie();
    onClose();
  }

  async function enregistrer() {
    setEnCours(true);
    const { error } = await supabase
      .from("application_repas_journal")
      .update({ nom: nom.trim() || repas.nom, repas_type: repasType, quantite: facteur, ...valeurs })
      .eq("id", repas.id);
    setEnCours(false);
    if (error) {
      setErreur("Erreur lors de l'enregistrement, réessayez.");
      return;
    }
    onModifie();
    onClose();
  }

  async function supprimer() {
    setEnCours(true);
    const { error } = await supabase.from("application_repas_journal").delete().eq("id", repas.id);
    setEnCours(false);
    if (error) {
      setErreur("Suppression impossible, réessayez.");
      return;
    }
    onModifie();
    onClose();
  }

  async function basculerFavori() {
    const nomFavori = nom.trim() || repas.nom;
    if (favori) {
      await supabase.from("application_favoris").delete().eq("client_id", repas.client_id).eq("nom", nomFavori);
      setFavori(false);
    } else {
      const { error } = await supabase.from("application_favoris").upsert(
        {
          client_id: repas.client_id,
          nom: nomFavori,
          ...valeurs,
          unite: enGrammes ? "g" : "portion",
          quantite: facteur > 0 ? facteur : 1,
          source: repas.source,
          plat_id: repas.plat_id,
        },
        { onConflict: "client_id,nom" }
      );
      if (!error) setFavori(true);
    }
    onModifie();
  }

  return (
    <Portail>
    <div className="fixed inset-0 !mt-0 bg-c2b-green/60 backdrop-blur-sm z-30 flex items-stretch md:items-center justify-center">
      <div className="bg-c2b-cream w-full h-[100dvh] md:h-auto md:max-w-md md:rounded-[24px] md:max-h-[90vh] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 sticky top-0 z-10 bg-c2b-cream">
          <h2 className="titre text-2xl">
            Modifier l&apos;<em>aliment</em>
          </h2>
          <button onClick={onClose} className="text-c2b-green/60" aria-label="Fermer">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-c2b-muted mb-2">Nom</label>
            <div className="flex gap-2">
              <input value={nom} onChange={(e) => setNom(e.target.value)} className="champ font-semibold" />
              <button
                onClick={basculerFavori}
                className={`flex-shrink-0 w-12 rounded-xl border flex items-center justify-center ${
                  favori ? "bg-c2b-gold/15 border-c2b-gold text-c2b-gold" : "bg-white border-c2b-cream-2 text-c2b-muted"
                }`}
                aria-label={favori ? "Retirer des favoris" : "Ajouter aux favoris"}
              >
                <Star size={20} fill={favori ? "currentColor" : "none"} />
              </button>
            </div>
            <details className="mt-1.5 group">
              <summary className="cursor-pointer list-none text-xs text-c2b-muted">
                {valeurs.calories} kcal · {valeurs.proteines}g P · {valeurs.glucides}g G · {valeurs.lipides}g L
                {enGrammes ? ` pour 100 ${unite}` : " par portion"} ·{" "}
                <span className="font-semibold text-c2b-gold group-open:hidden">Modifier</span>
              </summary>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {(
                  [
                    ["calories", "kcal"],
                    ["proteines", "P (g)"],
                    ["glucides", "G (g)"],
                    ["lipides", "L (g)"],
                  ] as const
                ).map(([cle, label]) => (
                  <label key={cle} className="block">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-c2b-muted mb-1">{label}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={macros[cle]}
                      onChange={(e) => setMacros({ ...macros, [cle]: e.target.value.replace(/[^0-9.,]/g, "") })}
                      className="champ px-2.5"
                    />
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-c2b-muted mt-1">Valeurs {enGrammes ? `pour 100 ${unite}` : "pour 1 portion"}.</p>
            </details>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-c2b-muted mb-2">Repas</label>
            <div className="grid grid-cols-2 gap-2">
              {ORDRE_REPAS.map((r) => (
                <Pastille key={r} active={repasType === r} onClick={() => setRepasType(r)} large>
                  {REPAS_TYPE_LABELS[r]}
                </Pastille>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-c2b-muted mb-2">
              {enGrammes ? (unite === "ml" ? "Quantité (ml)" : "Quantité (grammes)") : "Quantité (portions)"}
            </label>
            <input
              type="text"
              inputMode="decimal"
              onFocus={(e) => e.target.select()}
              value={saisie ?? String(Math.round(valeur * 100) / 100)}
              onChange={(e) => {
                const texte = e.target.value.replace(/[^0-9.,]/g, "");
                setSaisie(texte);
                const nombre = parseFloat(texte.replace(",", "."));
                setValeur(Number.isFinite(nombre) ? nombre : 0);
              }}
              onBlur={() => setSaisie(null)}
              className="champ"
            />
            {portions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {portions.map((pu) => (
                  <button
                    key={pu.libelle}
                    onClick={() => {
                      setValeur(pu.grammes);
                      setSaisie(null);
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      valeur === pu.grammes ? "bg-c2b-gold text-c2b-green" : "bg-c2b-gold/[0.12] text-c2b-green"
                    }`}
                  >
                    {pu.libelle} · {pu.grammes} {unite}
                  </button>
                ))}
              </div>
            )}
            {enGrammes ? (
              <div className="flex gap-1.5 mt-2">
                {GRAMMES_RAPIDES.map((g) => (
                  <button
                    key={g}
                    onClick={() => {
                      setValeur(g);
                      setSaisie(null);
                    }}
                    className={`flex-1 rounded-full py-1.5 text-xs font-bold ${
                      valeur === g ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-green"
                    }`}
                  >
                    {g} {unite}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex gap-1.5 mt-2">
                {[0.5, 1, 1.5, 2].map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setValeur(p);
                      setSaisie(null);
                    }}
                    className={`flex-1 rounded-full py-1.5 text-xs font-bold ${
                      valeur === p ? "bg-c2b-green text-c2b-cream" : "bg-white border border-c2b-green/15 text-c2b-green"
                    }`}
                  >
                    {String(p).replace(".", ",")}
                  </button>
                ))}
              </div>
            )}
            <p className="text-sm text-c2b-green mt-2 font-medium">
              = {Math.round(valeurs.calories * facteur)} kcal · {Math.round(valeurs.proteines * facteur)}g P ·{" "}
              {Math.round(valeurs.glucides * facteur)}g G · {Math.round(valeurs.lipides * facteur)}g L
            </p>
          </div>

          {erreur && <p className="text-sm font-semibold text-red-600">{erreur}</p>}

          <button onClick={enregistrer} disabled={enCours || facteur <= 0} className="btn-primary w-full py-4">
            {enCours ? "Enregistrement..." : "Enregistrer"}
          </button>
          <button
            onClick={dupliquer}
            disabled={enCours || facteur <= 0}
            className="btn-secondary w-full py-3"
          >
            <Copy size={16} /> Dupliquer (l&apos;ajouter une 2e fois)
          </button>
          <button
            onClick={supprimer}
            disabled={enCours}
            className="w-full inline-flex items-center justify-center gap-2 py-2 text-sm font-semibold text-red-600/80 hover:text-red-600"
          >
            <Trash2 size={16} /> Supprimer cet aliment
          </button>
        </div>
      </div>
    </div>
    </Portail>
  );
}
