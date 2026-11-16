import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import es from "../messages/es.json";

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
    return Object.entries(obj).flatMap(([key, value]) => {
        const full = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) {
            return flatten(value as Record<string, unknown>, full);
        }
        return [full];
    });
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) sourceFiles(full, acc);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) acc.push(full);
    }
    return acc;
}

/** Every `t("some.key")` literal in the app's own source, with its location. */
function literalKeys(): Map<string, string> {
    const keys = new Map<string, string>();
    const re = /\bt\(\s*["']([^"']+)["']/g;
    for (const file of sourceFiles(ROOT)) {
        const lines = readFileSync(file, "utf8").split(/\r?\n/);
        lines.forEach((line, index) => {
            let match: RegExpExecArray | null;
            while ((match = re.exec(line))) {
                if (!keys.has(match[1])) {
                    keys.set(match[1], `${path.relative(ROOT, file)}:${index + 1}`);
                }
            }
        });
    }
    return keys;
}

const enKeys = flatten(en as Record<string, unknown>);
const esKeys = flatten(es as Record<string, unknown>);

describe("translations", () => {
    it("has the same keys in every locale", () => {
        expect([...esKeys].sort()).toEqual([...enKeys].sort());
    });

    it("resolves every key used in the source", () => {
        const enSet = new Set(enKeys);
        const esSet = new Set(esKeys);
        const missing = [...literalKeys().entries()]
            .filter(([key]) => !enSet.has(key) || !esSet.has(key))
            .map(([key, where]) => `${key} (${where})`);
        expect(missing).toEqual([]);
    });
});
