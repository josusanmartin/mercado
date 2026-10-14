import { redirect } from "next/navigation";

// Old route: Tiempo Aire and bill payments now live in Mercado Remesas (Recargar Tiempo Aire). Unpaid orders and their recovery are keyed by idempotency key, so nothing is lost.
export default function Page() {
  redirect("/remesas?screen=aire");
}
