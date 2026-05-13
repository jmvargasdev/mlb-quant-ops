# Journal Handoff For Claude

## Context

The project now has a live journal surface at `/journal` with reverse-chronological entries, a summary card, filters, refresh, and loading/error states.

The journal is meant to become the daily operational log for this project. It should hold concise work summaries, next steps, and an estimated completion date, so the system can show progress without requiring manual editing of the page.

## Current Contract

The journal API contract is:

```text
GET /api/journal/entries
POST /api/journal/entries
GET /api/journal/entries/:date
PATCH /api/journal/entries/:id
```

Reads are public.

Writes should require an `x-api-key` header backed by `JOURNAL_API_KEY`.

## Expected Entry Shape

```json
{
  "id": "string",
  "date": "YYYY-MM-DD",
  "title": "string",
  "summary": "string",
  "work_completed": ["string"],
  "next_steps": ["string"],
  "eta": "YYYY-MM-DD or null",
  "status": "planned|in_progress|done|blocked",
  "tags": ["string"],
  "references": [
    {
      "label": "string",
      "url": "string"
    }
  ],
  "created_at": "ISO string",
  "updated_at": "ISO string"
}
```

## Security Decision

Do not leave writes open in production.

The journal should treat `POST` and `PATCH` as authenticated write operations from the start. The expected behavior is:

- `GET` endpoints remain public
- `POST` and `PATCH` require `x-api-key`
- the API key is stored as `JOURNAL_API_KEY`

## Recommended Implementation Path

1. Add environment variables for the journal API base URL and key.
2. Create a script that generates a daily summary from the repo state.
3. Have that script POST the daily entry to the journal API.
4. If an entry for the same date already exists, PATCH it instead of duplicating it.
5. Include links to the relevant commit range or docs where useful.
6. Keep the payload short, factual, and date-bounded.

## Daily Summary Content

Each generated entry should include:

- what changed today
- what was committed
- what was validated
- what remains pending
- the next action
- an estimated completion date when one is defensible

The entry should not be marketing copy. It should read like an operational log.

## Suggested Next Step For Claude

Implement a small sync workflow that can run daily and push a journal entry to the Lovable journal API using the authenticated write path.

The workflow should be deterministic and should not depend on manual editing inside Lovable.
