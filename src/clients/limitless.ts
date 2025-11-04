import { fetch, Response } from 'undici';
import { z } from 'zod';

const lifelogContentSchema = z.object({
  content: z.string(),
  endTime: z.string(),
  startTime: z.string().optional(),
});

const lifelogSchema = z.object({
  id: z.string(),
  title: z.string().default(''),
  startTime: z.string(),
  endTime: z.string(),
  contents: z.array(lifelogContentSchema).default([]),
});

const lifelogResponseSchema = z.object({
  data: z.object({
    lifelogs: z.array(lifelogSchema),
  }),
});

export type Lifelog = z.infer<typeof lifelogSchema>;

export interface FetchLifelogsOptions {
  limit?: number;
  includeContents?: boolean;
  includeMarkdown?: boolean;
  includeHeadings?: boolean;
  timezone?: string;
  startTime?: string;
}

export async function fetchLifelogs({
  limit = 5,
  includeContents = true,
  includeMarkdown = false,
  includeHeadings = false,
  timezone = 'UTC',
  startTime,
  apiKey,
}: FetchLifelogsOptions & { apiKey: string }): Promise<Lifelog[]> {
  const url = new URL('https://api.limitless.ai/v1/lifelogs');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('includeContents', String(includeContents));
  url.searchParams.set('includeMarkdown', String(includeMarkdown));
  url.searchParams.set('includeHeadings', String(includeHeadings));
  url.searchParams.set('timezone', timezone);
  if (startTime) {
    url.searchParams.set('start', startTime);
  }

  const res = (await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
  })) as Response;

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Limitless API error (${res.status}): ${errorText}`);
  }

  const json = (await res.json()) as unknown;
  const parsed = lifelogResponseSchema.parse(json);
  return parsed.data.lifelogs;
}
