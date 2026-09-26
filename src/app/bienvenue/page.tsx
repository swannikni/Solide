"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";

// Première connexion (ou code provisoire renvoyé par l'admin) :
// le client choisit son propre mot de passe.
export default function BienvenuePage() {
  const router = useRouter();
  const supabase = createClient();
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [visibleConfirmation, setVisibleConfirmation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (motDePasse.length < 8) return setErreur("8 caractères minimum.");
    if (motDePasse !== confirmation) return setErreur("Les deux mots de passe ne sont pas identiques.");

    setEnCours(true);
    const { error } = await supabase.auth.updateUser({ password: motDePasse, data: { doit_choisir_mdp: false } });
    setEnCours(false);
    if (error) {
      setErreur(
        /same|different/i.test(error.message)
          ? "Choisissez un mot de passe différent du code provisoire."
          : /weak|pwned|leaked/i.test(error.message)
            ? "Mot de passe trop facile à deviner, choisissez-en un autre."
            : "Impossible d'enregistrer, réessayez."
      );
      return;
    }
    // Nouveau jeton : l'ancien indique encore « doit choisir son mot de passe ».
    await supabase.auth.refreshSession();
    const suite = new URLSearchParams(window.location.search).get("suite");
    router.replace(suite && /^\/(?![\/\\])/.test(suite) ? suite : "/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-c2b-cream px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <Logo className="h-20 w-auto mb-6" />
          <h1 className="titre text-[38px]">
            Bienvenue <em className="block">chez Chef2Box</em>
          </h1>
          <p className="text-sm text-c2b-muted mt-3">
            Choisissez votre mot de passe personnel. C&apos;est lui que vous utiliserez pour vous connecter.
          </p>
        </div>

        <form onSubmit={valider} className="carte p-6 space-y-4">
          <div>
            <label htmlFor="mdp" className="block text-xs font-bold text-c2b-muted mb-2">
              Nouveau mot de passe
            </label>
            <div className="relative">
              <input
                id="mdp"
                type={visible ? "text" : "password"}
                autoComplete="new-password"
                required
                value={motDePasse}
                onChange={(e) => { setMotDePasse(e.target.value); setErreur(null); }}
                className="champ pr-12"
                placeholder="8 caractères minimum"
              />
              <button
                type="button"
                onClick={() => setVisible(!visible)}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-c2b-muted"
                aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {visible ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="confirmation" className="block text-xs font-bold text-c2b-muted mb-2">
              Confirmer
            </label>
            <div className="relative">
              <input
                id="confirmation"
                type={visibleConfirmation ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirmation}
                onChange={(e) => { setConfirmation(e.target.value); setErreur(null); }}
                className="champ pr-12"
              />
              <button
                type="button"
                onClick={() => setVisibleConfirmation(!visibleConfirmation)}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-c2b-muted"
                aria-label={visibleConfirmation ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              >
                {visibleConfirmation ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          {erreur && <p className="text-sm font-semibold text-red-600">{erreur}</p>}
          <button type="submit" disabled={enCours} className="btn-primary w-full py-4">
            {enCours ? "Enregistrement..." : "Valider mon mot de passe"}
          </button>
        </form>
      </div>
    </div>
  );
}
