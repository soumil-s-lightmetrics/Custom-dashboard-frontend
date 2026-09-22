import "../../custom-dashboard/styles.css";

export const metadata = {
  title: "Custom Dashboard",
};

// The dashboard's CSS sizes everything off #root at 100% height, as it did as a
// standalone app.
export default function CustomDashboardLayout({ children }) {
  return <div id="root">{children}</div>;
}
