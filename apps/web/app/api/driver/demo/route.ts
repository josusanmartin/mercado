import { DEMO_UBER_LABEL, DriverDemoQuerySchema, type DriverDemoResponse } from "@mercado/shared";
import { loadFixture } from "@/lib/server/credit";
import { jsonError } from "@/lib/server/http";

// GET /api/driver/demo?profile=steady|irregular|new-driver → synthetic "Demo Uber Data".
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = DriverDemoQuerySchema.safeParse({ profile: url.searchParams.get("profile") ?? undefined });
  if (!parsed.success) return jsonError(400, "profile must be steady, irregular or new-driver", "VALIDATION");
  const f = loadFixture(parsed.data.profile);
  const body: DriverDemoResponse = {
    demo: true,
    label: DEMO_UBER_LABEL,
    disclaimer: f.disclaimer,
    profile: f.profile,
    driver: f.driver,
    weeks: f.weeks,
    payments: f.payments,
  };
  return Response.json(body);
}
