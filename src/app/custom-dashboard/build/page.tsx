import { redirect } from "next/navigation";

// Old entry URL. Stands in for the standalone app's next.config redirect, so
// the labs next.config stays untouched.
export default function BuildRedirect() {
  redirect("/custom-dashboard/dashboards");
}
