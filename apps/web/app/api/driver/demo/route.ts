import {
  DriverDemoQuerySchema,
  type DriverDemoResponse,
} from "@mercado/shared";
import { loadFixture } from "@/lib/server/credit";
import { jsonError } from "@/lib/server/http";

// GET /api/driver/demo?platform=uber|didi|rappi&profile=steady|irregular|new-driver → synthetic, labeled demo
// earnings ("Demo Uber Data" / "Demo DiDi Data" / "Demo Rappi Data"). Not affiliated with any platform.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = DriverDemoQuerySchema.safeParse({
    profile: url.searchParams.get("profile") ?? undefined,
    platform: url.searchParams.get("platform") ?? undefined,
  });
  if (!parsed.success)
    return jsonError(
      400,
      "profile must be steady|irregular|new-driver and platform uber|didi|rappi",
      "VALIDATION",
    );
  const f = loadFixture(parsed.data.profile, parsed.data.platform);
  const body: DriverDemoResponse = {
    demo: true,
    platform: f.platform,
    label: f.label,
    disclaimer: f.disclaimer,
    profile: f.profile,
    driver: f.driver,
    weeks: f.weeks,
    payments: f.payments,
  };
  return Response.json(body);
}
