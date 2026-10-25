import { redirect } from "next/navigation";

// Ancienne adresse du planning : tout est maintenant sur /admin/cuisine.
export default async function SemainePage({ searchParams }: { searchParams: Promise<{ lundi?: string }> }) {
  const { lundi } = await searchParams;
  redirect(lundi ? `/admin/cuisine?lundi=${encodeURIComponent(lundi)}` : "/admin/cuisine");
}
