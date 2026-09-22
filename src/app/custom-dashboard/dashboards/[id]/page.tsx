import DashboardApp from "@/custom-dashboard/ui/DashboardApp";

// Step 3: build one dashboard.
export default async function DashboardBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DashboardApp screen="builder" dashboardId={id} />;
}
