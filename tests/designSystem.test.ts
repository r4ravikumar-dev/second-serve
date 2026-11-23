import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// D30: every screen stays on the DNA design system. Only dna-tokens.css may hold
// raw values. Browser-chrome colours that can't read CSS vars are allow-listed.
const ROOT = path.resolve(__dirname, "..", "src");
const ALLOW = new Set([path.join(ROOT, "styles", "dna-tokens.css"), path.join(ROOT, "app", "layout.tsx")]);

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.(css|tsx)$/.test(e.name) ? [p] : [];
  });
}

describe("DNA design system lint", () => {
  const targets = files(ROOT).filter((f) => !ALLOW.has(f));
  it.each(targets.map((f) => [path.relative(ROOT, f), f]))("%s has no raw colours, px font sizes or primitives", (_rel, file) => {
    const src = fs.readFileSync(file, "utf8");
    expect(src.match(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g) ?? []).toEqual([]);
    expect(src.match(/\brgba?\(/g) ?? []).toEqual([]);
    expect(src.match(/font-size\s*:\s*\d/g) ?? []).toEqual([]);
    expect(src.match(/fontSize\s*:/g) ?? []).toEqual([]);
    expect(src.match(/var\(--color-[a-z]/g) ?? []).toEqual([]);
  });
});
