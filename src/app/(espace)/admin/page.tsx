import { redirect } from "next/navigation";

// L'espace admin s'ouvre sur la cuisine (le planning du jour).
export default function AdminPage() {
  redirect("/admin/cuisine");
}
