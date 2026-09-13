# Appwrite Schema

This project now uses **Appwrite** (TablesDB) instead of Supabase/Postgres.
There is no `.sql` file to run — the schema is created automatically by:

```bash
npm run setup:appwrite
```

That script (`server/appwrite-setup.js`) creates, in your Appwrite database:

| Table               | Purpose                                              |
|---------------------|-------------------------------------------------------|
| `leads`             | Consultation requests + client accounts               |
| `progress_entries`  | Client weight/photo progress logs                      |
| `payments`          | Payment records per client                             |
| `chat_messages`     | Live chat history                                      |
| `settings`          | Key/value app settings (slots, admin PIN, etc.)        |

It also seeds the default `settings` rows (batch name, slot counts, admin PIN,
contact info) that used to live in `supabase_schema.sql`'s `insert into settings ...`
statement.

The script is safe to re-run — every step skips resources that already exist.
See `DEPLOYMENT.md` for the full setup flow.
