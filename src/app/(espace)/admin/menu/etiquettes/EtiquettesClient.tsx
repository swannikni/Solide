"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer, Minus, Plus } from "lucide-react";
import { Logo } from "@/components/Logo";
import { QrCode } from "@/components/QrCode";
import { lienPlat } from "@/lib/qr";
import type { Plat } from "@/lib/types";

// Planche A4 de 21 étiquettes 63,5 × 38,1 mm (format Avery L7160 et équivalents).
// Imprimable aussi sur papier normal, à découper.
export function EtiquettesClient({ plats }: { plats: Plat[] }) {
  const [copies, setCopies] = useState<Record<string, number>>(() =>
    Object.fromEntries(plats.map((p) => [p.id, 1]))
  );
  const [origine, setOrigine] = useState("");
  useEffect(() => setOrigine(window.location.origin), []);

  const etiquettes = plats.flatMap((p) => Array.from({ length: copies[p.id] ?? 0 }, () => p));

  const nbPages = Math.ceil(etiquettes.length / 21);

  function changer(id: string, delta: number) {
    setCopies((prev) => ({ ...prev, [id]: Math.max(0, Math.min(84, (prev[id] ?? 0) + delta)) }));
  }

  return (
    <div className="min-h-screen bg-c2b-cream print:bg-white">
      <style>{`@page { size: A4; margin: 0; } @media print { body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>

      <div className="print:hidden max-w-3xl mx-auto px-4 py-6 space-y-5">
        <Link href="/admin/menu" className="text-sm font-semibold text-c2b-gold">
          ← Retour au menu
        </Link>
        <div className="flex items-end justify-between gap-3">
          <h1 className="titre text-[34px]">
            Étiquettes <em>QR</em>
          </h1>
          <button onClick={() => window.print()} disabled={etiquettes.length === 0} className="btn-primary px-5 py-2.5 text-sm">
            <Printer size={16} /> Imprimer
          </button>
        </div>
        <p className="text-sm text-c2b-muted">
          Format planche A4 de 21 étiquettes (63,5 × 38,1 mm, type Avery L7160). Dans la fenêtre d&apos;impression,
          choisissez « Taille réelle / 100 % » et désactivez les en-têtes. Sur papier normal, il suffit de découper.
        </p>
        {plats.length === 0 ? (
          <p className="carte p-6 text-sm text-c2b-muted">Aucun plat sélectionné.</p>
        ) : (
          <div className="carte divide-y divide-black/5 overflow-hidden">
            {plats.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-medium text-c2b-green truncate">{p.nom}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => changer(p.id, -1)} className="w-8 h-8 rounded-full border border-c2b-green/15 flex items-center justify-center" aria-label="Moins">
                    <Minus size={14} />
                  </button>
                  <span className="w-7 text-center text-sm font-bold">{copies[p.id] ?? 0}</span>
                  <button onClick={() => changer(p.id, 1)} className="w-8 h-8 rounded-full border border-c2b-green/15 flex items-center justify-center" aria-label="Plus">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="lbl pt-2">
          Aperçu · {etiquettes.length} étiquette{etiquettes.length > 1 ? "s" : ""} · {Math.max(1, nbPages)} page
          {nbPages > 1 ? "s" : ""}
        </p>
      </div>

      <div className="print:block overflow-x-auto pb-10 print:pb-0">
        {Array.from({ length: nbPages }, (_, page) => (
          <div
            key={page}
            className="bg-white mx-auto mb-6 print:mb-0 shadow-md print:shadow-none overflow-hidden"
            style={{
              width: "210mm",
              height: "296mm",
              padding: "15.15mm 7.2mm 0",
              breakAfter: page < nbPages - 1 ? "page" : "auto",
              boxSizing: "border-box",
            }}
          >
            <div className="grid" style={{ gridTemplateColumns: "repeat(3, 63.5mm)", gridAutoRows: "38.1mm", columnGap: "2.5mm" }}>
              {etiquettes.slice(page * 21, page * 21 + 21).map((p, i) => (
                <Etiquette key={`${p.id}-${i}`} plat={p} lien={origine ? lienPlat(origine, p.qr_code) : ""} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Etiquette({ plat, lien }: { plat: Plat; lien: string }) {
  return (
    <div className="flex items-center gap-[2.5mm] overflow-hidden" style={{ padding: "2.5mm 3mm" }}>
      <div className="flex-shrink-0 flex flex-col items-center" style={{ width: "25mm" }}>
        {lien && <QrCode valeur={lien} className="w-[25mm] h-[25mm]" />}
        <span className="text-[6pt] font-bold tracking-wider text-c2b-green/70 mt-[1mm]">{plat.qr_code}</span>
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-[0.5mm]">
        <Logo className="h-[6mm] w-auto self-start" />
        <p className="font-serif text-c2b-green leading-[1.1] text-[9.5pt] line-clamp-3">{plat.nom}</p>
        <div>
          <p className="text-[7pt] font-bold text-c2b-green leading-tight">
            {plat.calories} kcal
          </p>
          <p className="text-[6.5pt] text-c2b-text leading-tight">
            P {Math.round(plat.proteines)} g · G {Math.round(plat.glucides)} g · L {Math.round(plat.lipides)} g
          </p>
          <p className="text-[5.5pt] font-bold uppercase tracking-[0.12em] text-c2b-gold mt-[0.6mm]">Prêt. Sain. Maîtrisé.</p>
        </div>
      </div>
    </div>
  );
}
