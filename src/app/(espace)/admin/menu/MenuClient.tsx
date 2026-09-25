"use client";

import { useState } from "react";
import Link from "next/link";
import { Camera, Plus, Printer, Pencil, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AdminOnglets } from "@/app/(espace)/admin/AdminOnglets";
import { QrCode } from "@/components/QrCode";
import { genererCodePlat, lienPlat } from "@/lib/qr";
import { reduirePhoto } from "@/lib/image";
import type { Plat } from "@/lib/types";

type Brouillon = {
  id?: string;
  nom: string;
  description: string;
  ingredients: string;
  recette: string;
  photo_url: string | null;
  calories: string;
  proteines: string;
  glucides: string;
  lipides: string;
  actif: boolean;
};

const VIDE: Brouillon = { nom: "", description: "", ingredients: "", recette: "", photo_url: null, calories: "", proteines: "", glucides: "", lipides: "", actif: true };

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
  const [envoiPhoto, setEnvoiPhoto] = useState(false);
  const origine = typeof window !== "undefined" ? window.location.origin : "";

  function editer(p: Plat) {
    setErreur("");
    setBrouillon({
      id: p.id,
      nom: p.nom,
      description: p.description ?? "",
      ingredients: p.ingredients ?? "",
      recette: p.recette ?? "",
      photo_url: p.photo_url,
      calories: String(p.calories),
      proteines: String(p.proteines),
      glucides: String(p.glucides),
      lipides: String(p.lipides),
      actif: p.actif,
    });
  }

  async function choisirPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier || !brouillon) return;
    setEnvoiPhoto(true);
    setErreur("");
    try {
      const image = await reduirePhoto(fichier);
      const chemin = `${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from("application-plats-photos")
        .upload(chemin, image, { contentType: "image/jpeg" });
      if (error) throw error;
      const { data } = supabase.storage.from("application-plats-photos").getPublicUrl(chemin);
      setBrouillon((b) => (b ? { ...b, photo_url: data.publicUrl } : b));
    } catch {
      setErreur("Photo impossible à envoyer, essayez une autre image.");
    }
    setEnvoiPhoto(false);
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
      ingredients: brouillon.ingredients.trim() || null,
      recette: brouillon.recette.trim() || null,
      photo_url: brouillon.photo_url,
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
              <div className="flex-shrink-0 space-y-2">
                <QrCode valeur={lienPlat(origine, p.qr_code)} className="w-20 h-20" />
                {p.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photo_url} alt="" className="w-20 h-20 rounded-xl object-cover" />
                )}
              </div>
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
              <div>
                <span className="block text-[11px] font-bold uppercase tracking-wider text-c2b-muted mb-1.5">
                  Photo du plat
                </span>
                {brouillon.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brouillon.photo_url} alt="" className="w-full h-44 object-cover rounded-2xl mb-2" />
                )}
                <div className="flex items-center gap-3">
                  <label className="btn-secondary px-4 py-2.5 text-sm cursor-pointer">
                    <Camera size={16} />
                    {envoiPhoto ? "Envoi..." : brouillon.photo_url ? "Changer la photo" : "Ajouter une photo"}
                    <input type="file" accept="image/*" onChange={choisirPhoto} disabled={envoiPhoto} className="hidden" />
                  </label>
                  {brouillon.photo_url && !envoiPhoto && (
                    <button
                      type="button"
                      onClick={() => setBrouillon({ ...brouillon, photo_url: null })}
                      className="text-sm font-semibold text-c2b-muted"
                    >
                      Retirer
                    </button>
                  )}
                </div>
              </div>
              <Champ label="Description (optionnel)">
                <textarea
                  value={brouillon.description}
                  onChange={(e) => setBrouillon({ ...brouillon, description: e.target.value })}
                  rows={2}
                  placeholder="Ex : Poulet mariné aux épices, sauce tomate crémeuse"
                  className="champ resize-none"
                />
              </Champ>
              <Champ label="Ingrédients (un par ligne)">
                <textarea
                  value={brouillon.ingredients}
                  onChange={(e) => setBrouillon({ ...brouillon, ingredients: e.target.value })}
                  rows={4}
                  placeholder={"Blanc de poulet\nRiz basmati\nYaourt, citron, épices tikka"}
                  className="champ resize-none"
                />
              </Champ>
              <Champ label="Recette (optionnel)">
                <textarea
                  value={brouillon.recette}
                  onChange={(e) => setBrouillon({ ...brouillon, recette: e.target.value })}
                  rows={4}
                  placeholder="Les étapes, ou comment réchauffer la box"
                  className="champ resize-none"
                />
              </Champ>
              <p className="text-xs font-bold uppercase tracking-wider text-c2b-muted pt-1">Macros d'une box</p>
              <p className="text-xs text-c2b-muted -mt-1.5">
                Le client voit la photo, les ingrédients et la recette dans « Plats Chef2Box » quand il ajoute un repas.
              </p>
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
