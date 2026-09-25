"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Affiche une fenêtre (ajout, modification...) directement dans <body>, au-dessus
// de tout : ni la barre du haut ni une animation de page ne peuvent la recouvrir.
export function Portail({ children }: { children: React.ReactNode }) {
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  return monte ? createPortal(children, document.body) : null;
}
