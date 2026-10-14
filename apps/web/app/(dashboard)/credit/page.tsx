import { redirect } from "next/navigation";

// Old route: driver advances now live in Mercado Crédito → Drivers.
export default function Page() {
  redirect("/credito?tab=drivers");
}
