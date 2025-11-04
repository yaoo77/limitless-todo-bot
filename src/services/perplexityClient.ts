import { fetch, Response } from 'undici';

export interface PerplexitySearchResult {
  content: string;
  citations: string[];
}

export class PerplexityClient {
  private readonly apiKey: string;
  private readonly apiUrl = 'https://api.perplexity.ai/chat/completions';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string): Promise<PerplexitySearchResult> {
    const response = (await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'system',
            content: 'Be precise and concise. Provide sources when available.',
          },
          {
            role: 'user',
            content: query,
          },
        ],
        temperature: 0.2,
        max_tokens: 1000,
      }),
    })) as Response;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Perplexity search failed (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
      citations?: string[];
    };

    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];

    return {
      content,
      citations,
    };
  }

  /**
   * タスクが検索を必要とするか判定
   */
  static needsSearch(task: string): boolean {
    const searchKeywords = [
      '調べ',
      '検索',
      '情報',
      '最新',
      'について',
      'とは',
      '確認',
      'リサーチ',
      '調査',
      '探し',
    ];

    return searchKeywords.some((keyword) => task.includes(keyword));
  }
}
