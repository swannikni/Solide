export function Pastille({
  active,
  onClick,
  large = false,
  children,
}: {
  active: boolean;
  onClick: () => void;
  large?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border-[1.5px] font-semibold transition ${
        large ? "py-2.5 text-sm" : "px-3.5 py-1.5 text-[13px]"
      } ${
        active
          ? "bg-c2b-green border-c2b-green text-white"
          : "bg-white border-c2b-green/15 text-c2b-green hover:border-c2b-gold/60"
      }`}
    >
      {children}
    </button>
  );
}
