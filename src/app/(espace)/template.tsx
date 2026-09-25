// Recréé à chaque changement d'onglet (contrairement au layout) : la page
// arrive en fondu léger au lieu d'apparaître d'un coup.
export default function Transition({ children }: { children: React.ReactNode }) {
  return <div className="animate-apparition">{children}</div>;
}
