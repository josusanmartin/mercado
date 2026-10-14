import type { Metadata } from "next";
import { SendScreen } from "@/components/transfer/send-screen";

export const metadata: Metadata = { title: "Send money" };

export default function SendPage() {
  return <SendScreen />;
}
