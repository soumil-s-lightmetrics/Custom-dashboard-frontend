import { redirect } from "next/navigation";
import { ROOT } from "@/custom-dashboard/ui/lib/routes";

// The app keeps the /custom-dashboard URLs it had inside LM labs (see
// ui/lib/routes.js), so the site root just forwards there.
export default function Home() {
  redirect(ROOT);
}
