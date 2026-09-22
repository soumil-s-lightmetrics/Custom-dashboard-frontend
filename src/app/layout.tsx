import type { Metadata } from "next";

// Minimal root layout: the dashboard's own layout (src/app/custom-dashboard)
// brings the stylesheet and the #root wrapper its CSS sizes everything off.
export const metadata: Metadata = {
  title: "Custom Dashboard",
  description: "Ask questions in plain language and pin the answers as charts.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
