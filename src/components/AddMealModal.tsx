"use client";

import { useState } from "react";
import { X, QrCode, Barcode, PenLine, Camera, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Scanner } from "@/components/Scanner";
import { chercherProduitParCodeBarres } from "@/lib/openfoodfacts";
import { ALIMENTS_POPULAIRES } from "@/lib/aliments-populaires";
import { REPAS_TYPE_LABELS } from "@/lib/macros";
import type { RepasType, SourceRepas } from "@/lib/types";

type Etape = "choix" | "scan_chef2box" | "scan_barcode" | "manuel" | "confirmation" | "erreur";

interface Trouve {
  nom: string;
  calories: number;
  proteines: number;
  glucides: number;
  lipides: number;
  source: SourceRepas;
  plat_id?: string;
  quantiteParDefaut: number;
  paGrammes?: boolean; // true si quantite = grammes / 100 (produit du commerce)
}

export function AddMealModal({
  clientId,
  repasTypeParDefaut = "dejeuner",
  prefillTrouve,
  commandeId,
  onClose,
  onAjoute,
}: {
  clientId: string;
  repasTypeParDefaut?: RepasType;
  prefillTrouve?: Trouve;
  commandeId?: string;
  onClose: () => void;
  onAjoute: () => void;
}) {
  const supabase = createClient();
  const [etape, setEtape] = useState<Etape>(prefillTrouve ? "confirmation" : "choix");
  const [messageErreur, setMessageErreur] = useState("");
  const [trouve, setTrouve] = useState<Trouve | null>(prefillTrouve ?? null);
  const [repasType, setRepasType] = useState<RepasType>(repasTypeParDefaut);
  const [quantite, setQuantite] = useState(1);
  const [grammes, setGrammes] = useState(100);
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [rechercheManuelle, setRechercheManuelle] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);

  // Saisie 100% manuelle (aliment absent de la base)
  const [nomLibre, setNomLibre] = useState("");
  const [caloriesLibre, setCaloriesLibre] = useState("");
  const [proteinesLibre, setProteinesLibre] = useState("");
  const [glucidesLibre, setGlucidesLibre] = useState("");
  const [lipidesLibre, setLipidesLibre] = useState("");

  async function onScanChef2Box(qrCode: string) {
    const { data, error } = await supabase
      .from("application_plats")
      .select("*")
      .eq("qr_code", qrCode)
      .eq("actif", true)
      .maybeSingle();

    if (error || !data) {
      setMessageErreur("Ce code n'est reconnu dans aucun plat Chef2Box.");
      setEtape("erreur");
      return;
    }

    setTrouve({
      nom: data.nom,
      calories: data.calories,
      proteines: data.proteines,
      glucides: data.glucides,
      lipides: data.lipides,
      source: "chef2box",
      plat_id: data.id,
      quantiteParDefaut: 1,
    });
    setQuantite(1);
    setEtape("confirmation");
  }

  async function onScanBarcode(code: string) {
    const produit = await chercherProduitParCodeBarres(code);
    if (!produit) {
      setMessageErreur("Produit introuvable dans la base Open Food Facts. Essayez la saisie manuelle.");
      setEtape("erreur");
      return;
    }

    setTrouve({
      nom: produit.nom,
      calories: produit.calories,
      proteines: produit.proteines,
      glucides: produit.glucides,
      lipides: produit.lipides,
      source: "code_barres",
      quantiteParDefaut: 1,
      paGrammes: true,
    });
    setGrammes(100);
    setEtape("confirmation");
  }

  function choisirAlimentPopulaire(nom: string, cal: number, prot: number, gluc: number, lip: number) {
    setTrouve({
      nom,
      calories: cal,
      proteines: prot,
      glucides: gluc,
      lipides: lip,
      source: "manuel",
      quantiteParDefaut: 1,
    });
    setQuantite(1);
    setEtape("confirmation");
  }

  function validerSaisieLibre() {
    if (!nomLibre || !caloriesLibre) return;
    setTrouve({
      nom: nomLibre,
      calories: Number(caloriesLibre) || 0,
      proteines: Number(proteinesLibre) || 0,
      glucides: Number(glucidesLibre) || 0,
      lipides: Number(lipidesLibre) || 0,
      source: "manuel",
      quantiteParDefaut: 1,
    });
    setQuantite(1);
    setEtape("confirmation");
  }

  function surChangementPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setPhoto(fichier);
    setPreviewPhoto(URL.createObjectURL(fichier));
  }

  async function enregistrerRepas() {
    if (!trouve) return;
    setEnregistrement(true);

    let photoUrl: string | null = null;
    if (photo) {
      const chemin = `${clientId}/${Date.now()}-${photo.name}`;
      const { data, error } = await supabase.storage.from("application-repas-photos").upload(chemin, photo);
      if (!error && data) {
        photoUrl = supabase.storage.from("application-repas-photos").getPublicUrl(data.path).data.publicUrl;
      }
    }

    const quantiteFinale = trouve.paGrammes ? grammes / 100 : quantite;

    const { error } = await supabase.from("application_repas_journal").insert({
      client_id: clientId,
      repas_type: repasType,
      source: trouve.source,
      nom: trouve.nom,
      quantite: quantiteFinale,
      calories: trouve.calories,
      proteines: trouve.proteines,
      glucides: trouve.glucides,
      lipides: trouve.lipides,
      photo_url: photoUrl,
      plat_id: trouve.plat_id ?? null,
      commande_id: commandeId ?? null,
      cree_par: "client",
    });

    setEnregistrement(false);
    if (!error) {
      onAjoute();
      onClose();
    } else {
      setMessageErreur("Erreur lors de l'enregistrement, réessayez.");
      setEtape("erreur");
    }
  }

  const alimentsFiltres = ALIMENTS_POPULAIRES.filter((a) =>
    a.nom.toLowerCase().includes(rechercheManuelle.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-30 flex items-end md:items-center justify-center">
      <div className="bg-c2b-cream w-full md:max-w-md md:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-c2b-green/10 sticky top-0 bg-c2b-cream">
          <h2 className="font-medium text-c2b-green">Ajouter un repas</h2>
          <button onClick={onClose} className="text-c2b-green/60">
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          {etape === "choix" && (
            <div className="space-y-3">
              <button
                onClick={() => setEtape("scan_chef2box")}
                className="w-full flex items-center gap-3 bg-white rounded-xl border border-c2b-gold/40 p-4 text-left"
              >
                <QrCode className="text-c2b-gold" />
                <div>
                  <p className="font-medium text-c2b-green">Scanner une étiquette Chef2Box</p>
                  <p className="text-xs text-c2b-green/60">Macros exactes, ajout instantané</p>
                </div>
              </button>

              <button
                onClick={() => setEtape("scan_barcode")}
                className="w-full flex items-center gap-3 bg-white rounded-xl border border-c2b-green/10 p-4 text-left"
              >
                <Barcode className="text-c2b-green" />
                <div>
                  <p className="font-medium text-c2b-green">Scanner un code-barres</p>
                  <p className="text-xs text-c2b-green/60">Produit du commerce</p>
                </div>
              </button>

              <button
                onClick={() => setEtape("manuel")}
                className="w-full flex items-center gap-3 bg-white rounded-xl border border-c2b-green/10 p-4 text-left"
              >
                <PenLine className="text-c2b-green" />
                <div>
                  <p className="font-medium text-c2b-green">Saisie manuelle</p>
                  <p className="text-xs text-c2b-green/60">Aliments populaires ou personnalisé</p>
                </div>
              </button>
            </div>
          )}

          {etape === "scan_chef2box" && <Scanner onResult={onScanChef2Box} onClose={() => setEtape("choix")} />}
          {etape === "scan_barcode" && <Scanner onResult={onScanBarcode} onClose={() => setEtape("choix")} />}

          {etape === "erreur" && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-red-700">{messageErreur}</p>
              <button
                onClick={() => setEtape("choix")}
                className="w-full rounded-lg bg-c2b-green text-c2b-cream py-2 text-sm"
              >
                Retour
              </button>
            </div>
          )}

          {etape === "manuel" && (
            <div className="space-y-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-2.5 text-c2b-green/40" />
                <input
                  value={rechercheManuelle}
                  onChange={(e) => setRechercheManuelle(e.target.value)}
                  placeholder="Rechercher un aliment..."
                  className="w-full rounded-lg border border-c2b-green/20 pl-9 pr-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {alimentsFiltres.map((a) => (
                  <button
                    key={a.nom}
                    onClick={() => choisirAlimentPopulaire(a.nom, a.calories, a.proteines, a.glucides, a.lipides)}
                    className="bg-white rounded-lg border border-c2b-green/10 p-2.5 text-left"
                  >
                    <p className="text-sm font-medium text-c2b-green">{a.nom}</p>
                    <p className="text-[11px] text-c2b-green/50">{a.portion} · {a.calories} kcal</p>
                  </button>
                ))}
              </div>

              <details className="bg-white rounded-lg border border-c2b-green/10 p-3">
                <summary className="text-sm font-medium text-c2b-green cursor-pointer">
                  Aliment introuvable ? Saisir manuellement
                </summary>
                <div className="mt-3 space-y-2">
                  <input
                    value={nomLibre}
                    onChange={(e) => setNomLibre(e.target.value)}
                    placeholder="Nom de l'aliment"
                    className="w-full rounded-lg border border-c2b-green/20 px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-4 gap-2">
                    <input
                      value={caloriesLibre}
                      onChange={(e) => setCaloriesLibre(e.target.value)}
                      placeholder="kcal"
                      type="number"
                      className="rounded-lg border border-c2b-green/20 px-2 py-2 text-sm"
                    />
                    <input
                      value={proteinesLibre}
                      onChange={(e) => setProteinesLibre(e.target.value)}
                      placeholder="P (g)"
                      type="number"
                      className="rounded-lg border border-c2b-green/20 px-2 py-2 text-sm"
                    />
                    <input
                      value={glucidesLibre}
                      onChange={(e) => setGlucidesLibre(e.target.value)}
                      placeholder="G (g)"
                      type="number"
                      className="rounded-lg border border-c2b-green/20 px-2 py-2 text-sm"
                    />
                    <input
                      value={lipidesLibre}
                      onChange={(e) => setLipidesLibre(e.target.value)}
                      placeholder="L (g)"
                      type="number"
                      className="rounded-lg border border-c2b-green/20 px-2 py-2 text-sm"
                    />
                  </div>
                  <button
                    onClick={validerSaisieLibre}
                    className="w-full rounded-lg bg-c2b-green text-c2b-cream py-2 text-sm"
                  >
                    Continuer
                  </button>
                </div>
              </details>
            </div>
          )}

          {etape === "confirmation" && trouve && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-c2b-green/10 p-3">
                <p className="font-medium text-c2b-green">{trouve.nom}</p>
                <p className="text-xs text-c2b-green/60">
                  {trouve.calories} kcal · {trouve.proteines}g P · {trouve.glucides}g G · {trouve.lipides}g L
                  {trouve.paGrammes ? " (pour 100g)" : " (par portion)"}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-c2b-green mb-1">Repas</label>
                <select
                  value={repasType}
                  onChange={(e) => setRepasType(e.target.value as RepasType)}
                  className="w-full rounded-lg border border-c2b-green/20 px-3 py-2 text-sm"
                >
                  {Object.entries(REPAS_TYPE_LABELS).map(([valeur, label]) => (
                    <option key={valeur} value={valeur}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-c2b-green mb-1">
                  {trouve.paGrammes ? "Quantité (grammes)" : "Quantité (portions)"}
                </label>
                <input
                  type="number"
                  min={0}
                  step={trouve.paGrammes ? 10 : 0.5}
                  value={trouve.paGrammes ? grammes : quantite}
                  onChange={(e) =>
                    trouve.paGrammes
                      ? setGrammes(Number(e.target.value))
                      : setQuantite(Number(e.target.value))
                  }
                  className="w-full rounded-lg border border-c2b-green/20 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-c2b-green mb-1">
                  Photo du repas (optionnel)
                </label>
                <label className="flex items-center gap-2 justify-center border border-dashed border-c2b-green/30 rounded-lg py-3 cursor-pointer text-sm text-c2b-green/70">
                  <Camera size={18} />
                  {previewPhoto ? "Changer la photo" : "Prendre une photo"}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={surChangementPhoto}
                  />
                </label>
                {previewPhoto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewPhoto} alt="Aperçu" className="mt-2 w-full h-32 object-cover rounded-lg" />
                )}
              </div>

              <button
                onClick={enregistrerRepas}
                disabled={enregistrement}
                className="w-full rounded-lg bg-c2b-green text-c2b-cream py-2.5 font-medium disabled:opacity-60"
              >
                {enregistrement ? "Enregistrement..." : "Ajouter au journal"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
