"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// QR en SVG (net à l'impression). Le SVG est produit par la librairie,
// il ne contient que des tracés : pas de texte injecté.
export function QrCode({ valeur, className }: { valeur: string; className?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let annule = false;
    QRCode.toString(valeur, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#1c2e1e", light: "#ffffff00" } })
      .then((s) => !annule && setSvg(s))
      .catch(() => !annule && setSvg(""));
    return () => {
      annule = true;
    };
  }, [valeur]);
  return <div className={`[&>svg]:w-full [&>svg]:h-full ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
