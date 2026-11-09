"use client";

import { Suspense, use, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  ChefHat,
  Gift,
  Globe,
  MessageCircle,
  QrCode,
  Receipt,
  Send,
  Truck,
  UserRound,
  Users,
  Wallet,
  X,
  Activity,
  MapPinned,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { LIVRAISON_ACTIVE } from "@/lib/livraison";

type Pastilles = { messages: number; admin: number };

// Tous les écrans de l'admin, rangés par usage.
const GROUPES = [
  {
    titre: "Chaque jour",
    liens: [
      { href: "/admin/cuisine", label: "Cuisine", sous: "Repas du jour, semaine, ajouts", icon: ChefHat },
      { href: "/admin/tournee", label: "Tournée", sous: "Lien du livreur, encaissements", icon: Truck },
      { href: "/admin/recettes", label: "Recettes", sous: "Quantités par palier, PDF", icon: BookOpen },
      ...(LIVRAISON_ACTIVE ? [{ href: "/admin/livraison", label: "Livraison", sous: "Carte des livraisons", icon: MapPinned }] : []),
    ],
  },
  {
    titre: "Clients",
    liens: [
      { href: "/admin/clients", label: "Clients", sous: "Prospects · Clients · Tous", icon: Users },
      { href: "/admin/envoi", label: "Envoi du menu", sous: "Photo + lien à tout le monde", icon: Send },
      { href: "/messages", label: "Messages", sous: "Messagerie de l'appli", icon: MessageCircle },
    ],
  },
  {
    titre: "Argent",
    liens: [
      { href: "/admin/paiements", label: "Paiements", sous: "Qui a payé cette semaine", icon: Wallet, exact: true },
      { href: "/admin/paiements/depenses", label: "Dépenses", sous: "Courses, livreur, emballages", icon: Receipt },
      { href: "/admin/paiements/bilan", label: "Bilan du mois", sous: "Recettes, dépenses, marge", icon: BarChart3 },
    ],
  },
  {
    titre: "Réglages",
    liens: [
      { href: "/admin/suivi", label: "Suivi de l'appli client", sous: "Qui utilise l'appli", icon: Activity },
      { href: "/admin/site", label: "Site", sous: "Textes et prix du site", icon: Globe },
      { href: "/admin/menu", label: "Menu & QR", sous: "Plats, QR codes, étiquettes", icon: QrCode },
      { href: "/admin/recompenses", label: "Récompenses", sous: "Points et cadeaux", icon: Gift },
      { href: "/profil", label: "Mon profil", sous: "Ton compte", icon: UserRound },
    ],
  },
];

function Nombre({ pastilles, href }: { pastilles: Promise<Pastilles> | Pastilles; href: string }) {
  const p = "then" in pastilles ? use(pastilles) : pastilles;
  const n = href === "/messages" ? p.messages : href === "/admin/clients" ? p.admin : 0;
  if (n <= 0) return null;
  return (
    <span className="ml-auto rounded-full bg-c2b-gold px-2 py-0.5 text-[11px] font-extrabold text-c2b-green">{n > 99 ? "99+" : n}</span>
  );
}

// Menu de l'admin qui s'ouvre à gauche (bouton ☰ de la barre du haut).
export function MenuAdmin({
  ouvert,
  fermer,
  pastilles,
}: {
  ouvert: boolean;
  fermer: () => void;
  pastilles: Promise<Pastilles> | Pastilles;
}) {
  const pathname = usePathname();

  // Fermé dès qu'on change de page ; Échap le ferme aussi.
  useEffect(() => {
    fermer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  useEffect(() => {
    if (!ouvert) return;
    const touche = (e: KeyboardEvent) => e.key === "Escape" && fermer();
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [ouvert, fermer]);

  const actif = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className={`print:hidden fixed inset-0 z-40 ${ouvert ? "" : "pointer-events-none"}`} aria-hidden={!ouvert}>
      <div
        onClick={fermer}
        className={`absolute inset-0 bg-c2b-green/50 transition-opacity duration-200 ${ouvert ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        className={`absolute inset-y-0 left-0 flex w-[84%] max-w-[330px] flex-col bg-c2b-green text-c2b-cream shadow-2xl transition-transform duration-200 ${
          ouvert ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Menu"
      >
        <div className="flex items-center justify-between px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))]">
          <span className="rounded-xl bg-c2b-cream px-2 py-1">
            <Logo className="h-9 w-auto" />
          </span>
          <button onClick={fermer} aria-label="Fermer le menu" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-[max(24px,env(safe-area-inset-bottom))]">
          {GROUPES.map((g) => (
            <div key={g.titre} className="mt-3">
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[2.5px] text-c2b-gold">{g.titre}</p>
              {g.liens.map(({ href, label, sous, icon: Icon, ...reste }) => {
                const on = actif(href, "exact" in reste ? reste.exact : false);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={fermer}
                    className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition ${on ? "bg-white/[0.12]" : "hover:bg-white/[0.07]"}`}
                  >
                    <Icon size={19} strokeWidth={on ? 2.4 : 1.8} className={on ? "text-c2b-gold" : "text-c2b-cream/80"} />
                    <span className="min-w-0">
                      <span className={`block text-[15px] ${on ? "font-extrabold" : "font-medium"}`}>{label}</span>
                      <span className="block truncate text-[11.5px] text-c2b-cream/55">{sous}</span>
                    </span>
                    <Suspense fallback={null}>
                      <Nombre pastilles={pastilles} href={href} />
                    </Suspense>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </div>
  );
}
