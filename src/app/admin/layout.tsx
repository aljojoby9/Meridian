import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guards";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Operator</p>
          <h1 className="text-xl font-semibold">Meridian Admin</h1>
        </div>
        <nav className="flex gap-3 text-sm text-muted">
          <Link href="/admin" className="hover:text-text">Dashboard</Link>
          <Link href="/admin/halls" className="hover:text-text">Halls</Link>
          <Link href="/admin/shows" className="hover:text-text">Shows</Link>
          <Link href="/admin/bookings" className="hover:text-text">Bookings</Link>
          <Link href="/" className="hover:text-text">Public site</Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
