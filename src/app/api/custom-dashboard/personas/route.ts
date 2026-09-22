import { route } from "@/custom-dashboard/server/http";
import { catalog } from "@/custom-dashboard/server/personas";

export const dynamic = "force-dynamic";

export const GET = route(async () => ({ personas: catalog() }));
