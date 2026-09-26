"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChefHat, House, LineChart, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import { Logo } from "@/components/Logo";

// racine : partie de l'adresse qui allume l'onglet (Admin couvre /admin/...).
const LIENS_CLIENT = [
  { href: "/dashboard", racine: "/dashboard", label: "Aujourd'hui", icon: House },
  { href: "/assistant", racine: "/assistant", label: "Assistant", icon: ChefHat },
  { href: "/history", racine: "/history", label: "Progrès", icon: LineChart },
  { href: "/messages", racine: "/messages", label: "Messages", icon: MessageCircle },
];

function estActif(pathname: string, racine: string) {
  return pathname === racine || pathname.startsWith(`${racine}/`);
}

export function Nav({
  estAdmin,
  pastilles = { messages: 0, admin: 0 },
  assistantActif = true,
}: {
  estAdmin: boolean;
  // Nombre d'éléments en attente affiché sur l'onglet (messages non lus, etc.).
  pastilles?: { messages: number; admin: number };
  assistantActif?: boolean;
}) {
  const pathname = usePathname();
  // Onglet touché : il s'allume tout de suite, sans attendre la fin du chargement.
  // Oublié dès que la page change.
  const [touche, setTouche] = useState<{ href: string; depuis: string } | null>(null);
  const cible = touche?.depuis === pathname ? touche.href : null;
  const setCible = (href: string) => setTouche({ href, depuis: pathname });

  const liensClient = LIENS_CLIENT.filter((l) => assistantActif || l.href !== "/assistant");
  const liens = estAdmin
    ? [{ href: "/admin/clients", racine: "/admin", label: "Admin", icon: ShieldCheck }, ...liensClient]
    : liensClient;
  const pastille = (href: string) =>
    href === "/messages" ? pastilles.messages : href === "/admin/clients" ? pastilles.admin : 0;

  // Planche d'étiquettes à imprimer : pas de barres.
  if (pathname.includes("/etiquettes")) return null;

  const actifSur = (href: string, racine: string) => (cible ? cible === href : estActif(pathname, racine));

  return (
    <>
      <header className="print:hidden fixed top-0 inset-x-0 z-20 h-[68px] md:h-20 bg-white/90 backdrop-blur-xl border-b border-c2b-cream-2">
        <div className="max-w-3xl mx-auto h-full px-4 md:px-6 flex items-center justify-between">
          <Link href="/" aria-label="Accueil">
            <Logo className="h-11 md:h-[52px] w-auto" />
          </Link>
          <nav className="hidden md:flex items-center gap-7">
            {liens.map(({ href, racine, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setCible(href)}
                className={`text-[13px] font-medium transition ${
                  actifSur(href, racine) ? "text-c2b-green font-bold" : "text-[#555] hover:text-c2b-green"
                }`}
              >
                {label}
                {pastille(href) > 0 && (
                  <span className="ml-1.5 rounded-full bg-c2b-gold px-1.5 py-0.5 text-[10px] font-bold text-c2b-green">
                    {pastille(href)}
                  </span>
                )}
              </Link>
            ))}
            <Link
              href="/profil"
              onClick={() => setCible("/profil")}
              className={`text-[13px] font-medium transition ${
                actifSur("/profil", "/profil") ? "text-c2b-green font-bold" : "text-[#555] hover:text-c2b-green"
              }`}
            >
              Mon profil
            </Link>
          </nav>
          <Link
            href="/profil"
            onClick={() => setCible("/profil")}
            className={`md:hidden w-10 h-10 -mr-1.5 rounded-full flex items-center justify-center transition ${
              actifSur("/profil", "/profil") ? "bg-c2b-green text-white" : "bg-c2b-cream text-c2b-green"
            }`}
            aria-label="Mon profil"
          >
            <UserRound size={20} />
          </Link>
        </div>
      </header>

      <nav className="print:hidden md:hidden fixed bottom-0 inset-x-0 z-20 bg-white/90 backdrop-blur-xl border-t border-c2b-cream-2 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch justify-around px-2">
          {liens.map(({ href, racine, label, icon: Icon }) => {
            const actif = actifSur(href, racine);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setCible(href)}
                className={`flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] transition-colors active:scale-95 [-webkit-tap-highlight-color:transparent] ${
                  actif ? "font-semibold text-c2b-green" : "font-medium text-[#9aa39c]"
                }`}
              >
                <span
                  className={`relative flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                    actif ? "bg-c2b-green/[0.09]" : ""
                  }`}
                >
                  <Icon size={21} strokeWidth={actif ? 2.2 : 1.8} />
                  {pastille(href) > 0 && (
                    <span
                      className="absolute -top-1 right-1.5 min-w-[17px] h-[17px] rounded-full bg-c2b-lip px-1 text-[10px] font-bold leading-[17px] text-white text-center ring-2 ring-white"
                      aria-label={`${pastille(href)} en attente`}
                    >
                      {pastille(href) > 9 ? "9+" : pastille(href)}
                    </span>
                  )}
                </span>
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
