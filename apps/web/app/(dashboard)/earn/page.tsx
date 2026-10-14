import { redirect } from "next/navigation";

// Old route: lending now lives in Mercado Crédito → Lenders (Demo mode switches to the Lender role).
export default function Page() {
  redirect("/credito?tab=lenders");
}
