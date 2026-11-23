import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './client.js';
const migrationsDir = fileURLToPath(new URL('./migrations', import.meta.url));
const client = await pool.connect();
try {
    await client.query('BEGIN');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const files = (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
        const migrationName = file.replace(/\.sql$/, '');
        const done = await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [migrationName]);
        if (!done.rowCount) {
            const sqlContent = await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8');
            await client.query(sqlContent);
            await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [migrationName]);
            console.log(`Migration ${migrationName} applied`);
        }
        else {
            console.log(`Migration ${migrationName} already applied`);
        }
    }
    await client.query('COMMIT');
}
catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
}
finally {
    client.release();
    await pool.end();
}
