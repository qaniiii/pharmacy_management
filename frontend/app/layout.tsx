import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Pharmacy & Welfare Platform",
    template: "%s · Pharmacy & Welfare Platform",
  },
  description:
    "Medication ordering and stock management for welfare homes and pharmacies.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
