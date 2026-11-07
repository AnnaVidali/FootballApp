#!/usr/bin/env node
/**
 * Run SQL against the project database using the direct connection string
 * in .env.local (SUPABASE_DB_URL).
 *
 * Usage:
 *   node scripts/db-query.mjs "select 1"
 *   node scripts/db-query.mjs --file path/to/query.sql
 *
 * Prints every result set, so it also replaces the old `runall.js`: a
 * file with several statements is executed in one call and each result
 * is printed in order.
 *
 * The connection string in .env.local is the session pooler, which this
 * project reached without TLS. The client still retries with TLS if the
 * first attempt fails, so a project that requires it works too.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

const ROOT = resolve(import.meta.dirname, "..");

function loadEnv() {
    const raw = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
        if (match && process.env[match[1]] === undefined) {
            process.env[match[1]] = match[2].trim();
        }
    }
}

function printResults(result) {
    const sets = Array.isArray(result) ? result : [result];
    sets.forEach((set, index) => {
        if (Array.isArray(result)) {
            console.log(`-- result ${index + 1}`);
        }
        if (set.rows?.length) {
            console.table(set.rows);
        } else {
            console.log(`${set.rowCount ?? 0} row(s)`);
        }
    });
}

async function connect(url) {
    try {
        const client = new Client({ connectionString: url, ssl: false });
        await client.connect();
        return client;
    } catch (error) {
        if (!/SSL|TLS/i.test(error.message)) throw error;
        const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
        await client.connect();
        return client;
    }
}

const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
const sql = fileIndex === -1
    ? args.join(" ")
    : readFileSync(resolve(process.cwd(), args[fileIndex + 1]), "utf8");

if (!sql.trim()) {
    console.error('Usage: node scripts/db-query.mjs "select 1" | --file <path.sql>');
    process.exit(2);
}

loadEnv();
if (!process.env.SUPABASE_DB_URL) {
    console.error("SUPABASE_DB_URL is missing from .env.local");
    process.exit(2);
}

const client = await connect(process.env.SUPABASE_DB_URL);
try {
    printResults(await client.query(sql));
} finally {
    await client.end();
}
