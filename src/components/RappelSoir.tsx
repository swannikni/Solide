"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Clé publique VAPID (la clé privée est dans le coffre Supabase).
const CLE_PUBLIQUE = "BERVdC2DTpDso3w5ZyCbNv0ROVplIPb5Rs4Q2qtkcDr52gJlNoBSMA3tThLgKEFHuvofA9DVaA59bgl-_cJ2c6A";
const CLE_MASQUE = "c2b-rappel-masque";

type Etat = "chargement" | "non_supporte" | "installer_ios" | "refuse" | "actif" | "inactif";

function versOctets(base64: string) {
  const b64 = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const brut = atob(b64);
  return Uint8Array.from(brut, (c) => c.charCodeAt(0));
}

// Rappel du soir : à 20 h, une notification si rien n'a été noté dans la journée.
// « compact » : encart sur Aujourd'hui, affiché seulement tant que le rappel est éteint.
export function RappelSoir({ clientId, compact = false }: { clientId: string; compact?: boolean }) {
  const supabase = createClient();
  const [etat, setEtat] = useState<Etat>("chargement");
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState("");
  const [masque, setMasque] = useState(false);
  const [installee, setInstallee] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setMasque(localStorage.getItem(CLE_MASQUE) === "1");
      } catch {}
      const ua = navigator.userAgent;
      const estIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      const installee =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setInstallee(installee);
      const supporte = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supporte) return setEtat(estIos && !installee ? "installer_ios" : "non_supporte");
      if (Notification.permission === "denied") return setEtat("refuse");
      const reg = await navigator.serviceWorker.getRegistration();
      const abonnement = await reg?.pushManager.getSubscription();
      setEtat(abonnement && Notification.permission === "granted" ? "actif" : "inactif");
    })().catch(() => setEtat("non_supporte"));
  }, []);

  async function activer() {
    setEnCours(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setEtat(permission === "denied" ? "refuse" : "inactif");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const abonnement =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versOctets(CLE_PUBLIQUE) }));
      const json = abonnement.toJSON();
      const { error } = await supabase.from("application_push_abonnements").upsert(
        { client_id: clientId, endpoint: abonnement.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        { onConflict: "endpoint" }
      );
      if (error) throw error;
      setEtat("actif");
      // Notification d'essai tout de suite, pour voir que ça marche.
      await supabase.functions.invoke("rappels", { body: { type: "test" } }).catch(() => null);
      setMessage("Activé ✓ Une notification d'essai arrive.");
    } catch {
      setMessage("Activation impossible sur ce téléphone, réessayez.");
    } finally {
      setEnCours(false);
    }
  }

  async function desactiver() {
    setEnCours(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const abonnement = await reg?.pushManager.getSubscription();
      if (abonnement) {
        await supabase.from("application_push_abonnements").delete().eq("endpoint", abonnement.endpoint);
        await abonnement.unsubscribe();
      }
      setEtat("inactif");
      setMessage("");
    } finally {
      setEnCours(false);
    }
  }

  function masquer() {
    try {
      localStorage.setItem(CLE_MASQUE, "1");
    } catch {}
    setMasque(true);
  }

  if (compact) {
    // Sur Aujourd'hui : proposé une fois l'appli installée (avant, c'est l'encart d'installation qui s'affiche).
    if (etat !== "inactif" || masque || !installee) return message ? <p className="text-sm font-semibold text-c2b-green">{message}</p> : null;
    return (
      <div className="carte flex items-center gap-3 p-4 border-c2b-gold/30">
        <Bell size={22} className="text-c2b-gold flex-shrink-0" />
        <div className="flex-1 text-sm text-c2b-green">
          <p className="font-bold">Rappel du soir</p>
          <p className="text-xs text-c2b-muted">À 20 h, si vous n&apos;avez rien noté. Pour ne pas casser votre série 🔥</p>
        </div>
        <button onClick={activer} disabled={enCours} className="btn-primary px-4 py-2 text-[13px] flex-shrink-0">
          {enCours ? "..." : "Activer"}
        </button>
        <button onClick={masquer} className="text-c2b-muted/60 flex-shrink-0" aria-label="Masquer">
          <X size={16} />
        </button>
      </div>
    );
  }

  if (etat === "chargement") return null;

  return (
    <section className="carte p-5">
      <div className="flex items-start gap-3">
        {etat === "actif" ? (
          <Bell size={22} className="text-c2b-gold flex-shrink-0 mt-0.5" />
        ) : (
          <BellOff size={22} className="text-c2b-muted flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1">
          <h2 className="font-serif text-xl text-c2b-green">Rappel du soir</h2>
          <p className="text-sm text-c2b-muted mt-0.5">
            {etat === "actif"
              ? "Activé : à 20 h, une notification si vous n'avez rien noté dans la journée."
              : etat === "installer_ios"
                ? "Sur iPhone, ajoutez d'abord l'appli à l'écran d'accueil (bouton Partager → « Sur l'écran d'accueil »), puis ouvrez-la depuis l'icône pour activer le rappel."
                : etat === "refuse"
                  ? "Les notifications sont bloquées. Autorisez-les dans les réglages du téléphone (Notifications → Chef2Box), puis revenez ici."
                  : etat === "non_supporte"
                    ? "Ce navigateur ne permet pas les notifications."
                    : "Une notification à 20 h si vous n'avez rien noté dans la journée, pour garder votre série 🔥"}
          </p>
          {etat === "inactif" && (
            <button onClick={activer} disabled={enCours} className="btn-primary px-5 py-2.5 text-sm mt-3">
              {enCours ? "Activation..." : "Activer le rappel"}
            </button>
          )}
          {etat === "actif" && (
            <button onClick={desactiver} disabled={enCours} className="text-sm font-semibold text-c2b-muted mt-2">
              Désactiver
            </button>
          )}
          {message && <p className="text-sm font-semibold text-c2b-green mt-2">{message}</p>}
        </div>
      </div>
    </section>
  );
}
