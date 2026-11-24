import type { Metadata } from "next";
import "./globals.css";

/**
 * Every page is session- and database-driven (auth, live seat inventory,
 * bookings). Rendering on demand keeps the build independent of a running
 * database and guarantees visitors never see stale seat availability.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Meridian — Cinema Seat Preview & Booking",
  description: "Preview the exact view from any seat before you book.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-text antialiased">{children}</body>
    </html>
  );
}
