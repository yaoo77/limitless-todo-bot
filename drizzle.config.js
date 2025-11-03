import { defineConfig } from 'drizzle-kit';
export default defineConfig({
    schema: './src/db/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL ?? '',
    },
    // Ensure production builds use environment-provided URL.
    verbose: true,
    strict: true,
});
//# sourceMappingURL=drizzle.config.js.map