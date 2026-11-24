import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Enforces the hexagonal layering in ARCHITECTURE.md by reading every import
 * in src/. A failure names the file and the import that broke the rule.
 */

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

/** Which other feature modules each module may import. `shared` is always allowed. */
const ALLOWED_MODULE_DEPS: Record<string, string[]> = {
  identity: [],
  catalog: [],
  seating: [],
  "seat-preview": [],
  booking: ["seating", "seat-preview"],
  admin: ["catalog"],
  "show-experience": ["seating", "seat-preview", "booking", "catalog"],
};

interface ImportRef {
  file: string; // repo-relative, forward slashes
  spec: string; // the import specifier as written
  target: string | null; // repo-relative resolved path for @/ and relative imports
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");

function collectImports(): ImportRef[] {
  const refs: ImportRef[] = [];
  const pattern = /(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const file of walk(SRC)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(pattern)) {
      const spec = (match[1] ?? match[2])!;
      let target: string | null = null;
      if (spec.startsWith("@/")) target = rel(path.join(SRC, spec.slice(2)));
      else if (spec.startsWith(".")) target = rel(path.resolve(path.dirname(file), spec));
      refs.push({ file: rel(file), spec, target });
    }
  }
  return refs;
}

const imports = collectImports();

function violations(applies: (r: ImportRef) => boolean, forbidden: (r: ImportRef) => boolean) {
  return imports.filter((r) => applies(r) && forbidden(r)).map((r) => `${r.file} -> ${r.spec}`);
}

type Layer = "domain" | "application" | "infrastructure" | "browser" | "contract";

/** The hexagonal layer a module file belongs to, or null outside src/modules. */
function layerOf(p: string | null): Layer | null {
  const m = p?.match(/^src\/modules\/([^/]+)\/(.+)$/);
  if (!m) return null;
  const [, mod, rest] = m;
  const folder = rest!.split("/")[0];
  if (folder === "domain" || folder === "application" || folder === "infrastructure") return folder;
  if (folder === "ui" || folder === "client" || folder === "hooks" || mod === "show-experience") return "browser";
  return "contract"; // schemas.ts: request validation shared by routes
}

const moduleOf = (p: string | null) => p?.match(/^src\/modules\/([^/]+)\//)?.[1] ?? null;
const startsWith = (prefix: string) => (r: ImportRef) => r.target?.startsWith(prefix) ?? false;
const isPackage = (pattern: RegExp) => (r: ImportRef) => pattern.test(r.spec);
const inLayer = (...layers: Layer[]) => (r: ImportRef) => layers.includes(layerOf(r.file) as Layer);
const targetsLayer = (...layers: Layer[]) => (r: ImportRef) => layers.includes(layerOf(r.target) as Layer);
const any = (...preds: Array<(r: ImportRef) => boolean>) => (r: ImportRef) => preds.some((p) => p(r));

const FRAMEWORKS = /^(react|react-dom|next|next-auth|@auth\/.*|@prisma\/client|three|stripe|bcryptjs|qrcode)(\/|$)/;
const NODE_IO = /^(crypto|fs|path|node:.*)$/;

describe("hexagonal architecture", () => {
  it("finds the source files", () => {
    expect(imports.length).toBeGreaterThan(80);
  });

  it("domain is pure: no frameworks, I/O, validation libraries, or outer layers", () => {
    const bad = violations(
      inLayer("domain"),
      any(isPackage(FRAMEWORKS), isPackage(NODE_IO), isPackage(/^zod$/), targetsLayer("application", "infrastructure", "browser"), startsWith("src/shared/server"), startsWith("src/server")),
    );
    expect(bad).toEqual([]);
  });

  it("application depends only on domain and ports, never on adapters or frameworks", () => {
    const bad = violations(
      inLayer("application"),
      any(isPackage(FRAMEWORKS), isPackage(NODE_IO), targetsLayer("infrastructure", "browser"), startsWith("src/shared/server"), startsWith("src/server")),
    );
    expect(bad).toEqual([]);
  });

  it("infrastructure never reaches up into the UI, the routes, or the composition root", () => {
    const bad = violations(inLayer("infrastructure"), any(targetsLayer("browser"), startsWith("src/app/"), startsWith("src/server")));
    expect(bad).toEqual([]);
  });

  it("browser code never imports use cases, adapters, or server-only packages", () => {
    const bad = violations(
      inLayer("browser"),
      any(targetsLayer("application", "infrastructure"), startsWith("src/shared/server"), startsWith("src/server"), isPackage(/^(@prisma\/client|stripe|bcryptjs|qrcode)$/)),
    );
    expect(bad).toEqual([]);
  });

  it("only adapters and the composition root talk to the database", () => {
    const bad = violations(
      (r) => layerOf(r.file) !== "infrastructure" && !r.file.startsWith("src/server/"),
      (r) => r.target === "src/shared/server/db",
    );
    expect(bad).toEqual([]);
  });

  it("routes reach adapters only through the composition root", () => {
    const bad = violations((r) => r.file.startsWith("src/app/"), any(targetsLayer("infrastructure"), (r) => r.target === "src/shared/server/db"));
    expect(bad).toEqual([]);
  });

  it("only routes and middleware use the composition root", () => {
    const bad = violations(
      (r) => !r.file.startsWith("src/app/") && !r.file.startsWith("src/server/") && r.file !== "src/middleware.ts",
      startsWith("src/server/"),
    );
    expect(bad).toEqual([]);
  });

  it("shared code knows nothing about features, routes, or wiring", () => {
    const bad = violations((r) => r.file.startsWith("src/shared/"), any(startsWith("src/modules/"), startsWith("src/app/"), startsWith("src/server/")));
    expect(bad).toEqual([]);
  });

  it("nothing imports from the routing layer", () => {
    const bad = violations((r) => !r.file.startsWith("src/app/"), startsWith("src/app/"));
    expect(bad).toEqual([]);
  });

  it("modules follow the dependency graph and share only domain, client, and UI code", () => {
    const bad = imports
      .filter((r) => {
        const from = moduleOf(r.file);
        const to = moduleOf(r.target);
        if (!from || !to || from === to) return false;
        const allowed = (ALLOWED_MODULE_DEPS[from] ?? []).includes(to);
        const publicLayer = ["domain", "browser"].includes(layerOf(r.target) ?? "");
        return !allowed || !publicLayer;
      })
      .map((r) => `${r.file} -> ${r.spec}`);
    expect(bad).toEqual([]);
  });

  it("declares every module in the dependency graph", () => {
    const modules = readdirSync(path.join(SRC, "modules")).sort();
    expect(modules).toEqual(Object.keys(ALLOWED_MODULE_DEPS).sort());
  });
});
