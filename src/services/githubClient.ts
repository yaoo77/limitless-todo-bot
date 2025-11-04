import { fetch } from 'undici';

import type { AppConfig } from '../config.js';

export interface CreateIssueParams {
  title: string;
  body: string;
  labels?: string[];
}

export class GitHubClient {
  private readonly token: string;
  private readonly owner: string;
  private readonly repo: string;

  constructor(private readonly config: AppConfig) {
    if (!config.githubToken) {
      throw new Error('GITHUB_TOKEN is required for daily archive');
    }
    if (!config.githubOwner) {
      throw new Error('GITHUB_OWNER is required for daily archive');
    }
    if (!config.githubRepo) {
      throw new Error('GITHUB_REPO is required for daily archive');
    }

    this.token = config.githubToken;
    this.owner = config.githubOwner;
    this.repo = config.githubRepo;
  }

  /**
   * GitHub Issueを作成
   */
  async createIssue(params: CreateIssueParams): Promise<number> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/issues`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title: params.title,
        body: params.body,
        labels: params.labels || ['daily-archive'],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create GitHub issue: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { number: number };
    console.log(`[github] Created issue #${data.number}`);

    return data.number;
  }

  /**
   * 日次アーカイブ用のIssueを作成
   */
  async createDailyArchiveIssue(date: string, markdown: string): Promise<number> {
    return this.createIssue({
      title: `Archive ${date}`,
      body: markdown,
      labels: ['daily-archive'],
    });
  }
}
