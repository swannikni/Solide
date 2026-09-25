"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Printer, Pencil, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AdminOnglets } from "@/app/admin/AdminOnglets";
import { QrCode } from "@/components/QrCode";
import { genererCodePlat, lienPlat } from "@/lib/qr";
import type { Plat } from "@/lib/types";

type Brouillon = {
  id?: string;
  nom: string;
  description: string;
  calories: string;
  proteines: string;
  glucides: string;
  lipides: string;
  actif: boolean;
};

const VIDE: Brouillon = { nom: "", description: "", calories: "", proteines: "", glucides: "", lipides: "", actif: true };

function nombre(texte: string) {
  const n = parseFloat(texte.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function MenuClient({ platsInitiaux }: { platsInitiaux: Plat[] }) {
  const supabase = createClient();
  const [plats, setPlats] = useState(platsInitiaux);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState("");
  const origine = typeof window !== "undefined" ? window.location.origin : "";

  function editer(p: Plat) {
    setErreur("");
    setBrouillon({
      id: p.id,
      nom: p.nom,
      description: p.description ?? "",
      calories: String(p.calories),
      proteines: String(p.proteines),
      glucides: String(p.glucides),
      lipides: String(p.lipides),
      actif: p.actif,
    });
  }

  async function enregistrer() {
    if (!brouillon || !brouillon.nom.trim() || !brouillon.calories) {
      setErreur("Le nom et les calories sont obligatoires.");
      return;
    }
    setEnregistrement(true);
    setErreur("");
    const valeurs = {
      nom: brouillon.nom.trim(),
      description: brouillon.description.trim() || null,
      calories: Math.round(nombre(brouillon.calories)),
      proteines: nombre(brouillon.proteines),
      glucides: nombre(brouillon.glucides),
      lipides: nombre(brouillon.lipides),
      actif: brouillon.actif,
    };
    const requete = brouillon.id
      ? supabase.from("application_plats").update(valeurs).eq("id", brouillon.id)
      : supabase.from("application_plats").insert({ ...valeurs, qr_code: genererCodePlat() });
    const { data, error } = await requete.select("*").single<Plat>();
    setEnregistrement(false);
    if (error || !data) {
      setErreur("Enregistrement impossible, réessayez.");
      return;
    }
    setPlats((prev) =>
      [...prev.filter((p) => p.id !== data.id), data].sort(
        (a, b) => Number(b.actif) - Number(a.actif) || a.nom.localeCompare(b.nom, "fr")
      )
    );
    setBrouillon(null);
  }

  function basculerSelection(id: string) {
    setSelection((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  }

  const actifs = plats.filter((p) => p.actif);
  const idsAImprimer = selection.size > 0 ? Array.from(selection) : actifs.map((p) => p.id);

  return (
    <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
      <AdminOnglets />
      <header className="flex items-end justify-between gap-3">
        <div>
          <span className="lbl mb-2">Espace admin</span>
          <h1 className="titre text-[34px]">
            Menu <em>&amp; QR</em>
          </h1>
        </div>
        <button onClick={() => setBrouillon({ ...VIDE })} className="btn-primary px-4 py-2.5 text-sm">
          <Plus size={16} /> Nouveau plat
        </button>
      </header>

      <p className="text-sm text-c2b-muted">
        Chaque plat reçoit son QR code. Collé sur la box, il suffit au client de le scanner avec l&apos;appareil photo
        de son téléphone : l&apos;appli s&apos;ouvre avec le plat et ses macros déjà remplis.
      </p>

      {plats.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/menu/etiquettes?ids=${idsAImprimer.join(",")}`}
            className={`btn-gold px-4 py-2.5 text-sm ${idsAImprimer.length === 0 ? "pointer-events-none opacity-50" : ""}`}
          >
            <Printer size={16} />
            {selection.size > 0
              ? `Imprimer ${selection.size} étiquette${selection.size > 1 ? "s" : ""}`
              : "Imprimer les étiquettes du menu"}
          </Link>
          {selection.size > 0 && (
            <button onClick={() => setSelection(new Set())} className="text-sm font-semibold text-c2b-muted">
              Tout désélectionner
            </button>
          )}
        </div>
      )}

      {plats.length === 0 ? (
        <div className="carte p-8 text-center text-sm text-c2b-muted">
          Aucun plat pour l&apos;instant. Touchez « Nouveau plat » pour créer le premier.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {plats.map((p) => (
            <div key={p.id} className={`carte p-4 flex gap-3.5 ${p.actif ? "" : "opacity-55"}`}>
              <QrCode valeur={lienPlat(origine, p.qr_code)} className="w-20 h-20 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-[15px] text-c2b-green leading-snug">{p.nom}</p>
                  <button onClick={() => editer(p)} className="text-c2b-muted hover:text-c2b-green" aria-label="Modifier">
                    <Pencil size={16} />
                  </button>
                </div>
                <p className="text-xs text-c2b-muted mt-1">
                  {p.calories} kcal · {p.proteines}g P · {p.glucides}g G · {p.lipides}g L
                </p>
                <p className="text-[11px] font-semibold tracking-wider text-c2b-gold mt-1">
                  {p.qr_code}
                  {!p.actif && " · retiré du menu"}
                </p>
                {p.actif && (
                  <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-c2b-green cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selection.has(p.id)}
                      onChange={() => basculerSelection(p.id)}
                      className="h-4 w-4 accent-c2b-green"
                    />
                    À imprimer
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {brouillon && (
        <div className="fixed inset-0 !mt-0 bg-c2b-green/60 backdrop-blur-sm z-30 flex items-stretch md:items-center justify-center">
          <div className="bg-c2b-cream w-full h-[100dvh] md:h-auto md:max-w-md md:rounded-[24px] md:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 sticky top-0 bg-c2b-cream">
              <h2 className="titre text-2xl">
                {brouillon.id ? "Modifier le " : "Nouveau "}
                <em>plat</em>
              </h2>
              <button onClick={() => setBrouillon(null)} className="text-c2b-green/60" aria-label="Fermer">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <Champ label="Nom du plat">
                <input
                  value={brouillon.nom}
                  onChange={(e) => setBrouillon({ ...brouillon, nom: e.target.value })}
                  placeholder="Ex : Poulet tikka, riz basmati"
                  className="champ"
                />
              </Champ>
              <Champ label="Description (optionnel)">
                <textarea
                  value={brouillon.description}
                  onChange={(e) => setBrouillon({ ...brouillon, description: e.target.value })}
                  rows={2}
                  className="champ resize-none"
                />
              </Champ>
              <p className="text-xs font-bold uppercase tracking-wider text-c2b-muted pt-1">Macros pour une box</p>
              <div className="grid grid-cols-2 gap-2.5">
                {(
                  [
                    ["calories", "Calories (kcal)"],
                    ["proteines", "Protéines (g)"],
                    ["glucides", "Glucides (g)"],
                    ["lipides", "Lipides (g)"],
                  ] as const
                ).map(([cle, label]) => (
                  <Champ key={cle} label={label}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={brouillon[cle]}
                      onChange={(e) => setBrouillon({ ...brouillon, [cle]: e.target.value.replace(/[^0-9.,]/g, "") })}
                      className="champ"
                    />
                  </Champ>
                ))}
              </div>
              {brouillon.id && (
                <label className="flex items-center gap-2.5 text-sm font-semibold text-c2b-green pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={brouillon.actif}
                    onChange={(e) => setBrouillon({ ...brouillon, actif: e.target.checked })}
                    className="h-4 w-4 accent-c2b-green"
                  />
                  Au menu (décocher pour le retirer sans perdre l&apos;historique)
                </label>
              )}
              {erreur && <p className="text-sm font-semibold text-red-600">{erreur}</p>}
              <button onClick={enregistrer} disabled={enregistrement} className="btn-primary w-full py-4">
                {enregistrement ? "Enregistrement..." : brouillon.id ? "Enregistrer" : "Créer le plat et son QR"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-c2b-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}
