import { redirect } from "next/navigation";

// Send money moved into Mercado Remesas (crew/DESIGN-ECOSYSTEM.md).
export default function SendPage() {
  redirect("/remesas?screen=enviar");
}
