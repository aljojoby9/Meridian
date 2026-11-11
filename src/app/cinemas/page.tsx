import Link from "next/link";
import { prisma } from "@/lib/db";

export default async function CinemasPage() {
  const cinemas = await prisma.cinema.findMany({ include: { _count: { select: { halls: true } } }, orderBy: { name: "asc" } });
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Cinemas</h1>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {cinemas.map((c) => (
          <Link key={c.id} href={`/cinemas/${c.id}`} className="rounded-2xl border border-border bg-panel p-5 hover:border-gold/30">
            <h2 className="font-semibold">{c.name}</h2>
            <p className="text-sm text-muted">{c.city}{c.address ? ` · ${c.address}` : ""}</p>
            <p className="mt-2 text-xs text-muted">{c._count.halls} hall(s)</p>
          </Link>
        ))}
      </div>
      <div className="mt-6"><Link href="/" className="text-sm text-gold hover:underline">Back to home</Link></div>
    </main>
  );
}
