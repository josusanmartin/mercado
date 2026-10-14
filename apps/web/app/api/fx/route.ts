import { getFx } from "@/lib/server/fx";

// GET /api/fx → USD/MXN from the on-chain admin mock oracle, or a labeled config fallback before deploy.
export async function GET() {
  return Response.json(await getFx(), { headers: { "Cache-Control": "no-store" } });
}
