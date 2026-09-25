"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ONGLETS = [
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/menu", label: "Menu & QR" },
];

export function AdminOnglets() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1">
      {ONGLETS.map(({ href, label }) => {
        const actif = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`whitespace-nowrap rounded-full border-[1.5px] px-4 py-2 text-[13px] font-semibold transition ${
              actif
                ? "bg-c2b-green border-c2b-green text-white"
                : "bg-white border-c2b-green/15 text-c2b-green hover:border-c2b-gold/60"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
