import { AuthError } from "next-auth";
import { auth, signIn } from "@/server/auth";
import { Button } from "@/shared/ui/button";
import { redirect } from "next/navigation";

/** Only same-site paths: an absolute or protocol-relative callbackUrl would be an open redirect. */
function safeCallbackUrl(value: string | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const session = await auth();
  const sp = await searchParams;
  const callbackUrl = safeCallbackUrl(sp.callbackUrl);
  if (session?.user) redirect(callbackUrl);

  async function action(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirectTo: callbackUrl,
      });
    } catch (e) {
      // Wrong credentials surface as an AuthError (CredentialsSignin). Show the
      // inline message instead of an error page. The success redirect is not
      // an AuthError, so it is rethrown and still happens.
      if (e instanceof AuthError) {
        redirect(`/signin?${new URLSearchParams({ error: e.type, callbackUrl })}`);
      }
      throw e;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <div className="w-full rounded-2xl border border-border bg-panel p-6 shadow-glow">
        <h1 className="text-2xl font-semibold">Sign in to Meridian</h1>
        <p className="mt-1 text-sm text-muted">Use your seeded demo account or create users in the database for local testing.</p>
        {sp.error ? <p className="mt-3 text-sm text-[#ffb4a8]">Sign-in failed. Check your credentials.</p> : null}
        <form action={action} className="mt-5 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Email</span>
            <input name="email" type="email" required className="w-full rounded-xl border border-border bg-panel2 px-3 py-2 outline-none focus:ring-2 focus:ring-gold/40" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Password</span>
            <input name="password" type="password" required minLength={8} className="w-full rounded-xl border border-border bg-panel2 px-3 py-2 outline-none focus:ring-2 focus:ring-gold/40" />
          </label>
          <Button type="submit" className="w-full">Continue</Button>
        </form>
      </div>
    </main>
  );
}
