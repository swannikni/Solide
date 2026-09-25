import { redirect } from "next/navigation";

// L'espace admin s'ouvre sur la liste des clients.
export default function AdminPage() {
  redirect("/admin/clients");
}
