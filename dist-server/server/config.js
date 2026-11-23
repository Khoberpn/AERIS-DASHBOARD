import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
    DATABASE_URL: z.url().refine(value => value.startsWith('postgresql://') || value.startsWith('postgres://'), 'Must be a PostgreSQL URL'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4100),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    WEB_ORIGIN: z.url().default('http://127.0.0.1:5173'),
    INGEST_TOKEN: z.string().min(32),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    throw new Error(`Invalid server environment: ${parsed.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
}
export const config = parsed.data;
