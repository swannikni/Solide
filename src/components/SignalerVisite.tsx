"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Signale l'ouverture de l'appli (au plus une fois par heure) pour le suivi
// admin : dernière visite, appli installée sur l'écran d'accueil, iPhone ou Android.
export function SignalerVisite() {
  useEffect(() => {
    const CLE = "c2b-derniere-visite";
    try {
      const derniere = Number(localStorage.getItem(CLE) ?? 0);
      if (Date.now() - derniere < 3_600_000) return;
      localStorage.setItem(CLE, String(Date.now()));
    } catch {
      // Stockage indisponible (navigation privée) : on signale quand même.
    }
    const installee =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ua = navigator.userAgent;
    const plateforme = /iPhone|iPad|iPod/i.test(ua) ? "ios" : /Android/i.test(ua) ? "android" : "autre";
    createClient()
      .rpc("application_signaler_visite", { p_installee: installee, p_plateforme: plateforme })
      .then(() => {});
  }, []);
  return null;
}
