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

  /**
   * GitHubリポジトリにファイルを直接作成・更新
   */
  async createOrUpdateFile(params: {
    path: string;
    content: string;
    message: string;
    branch?: string;
  }): Promise<void> {
    const branch = params.branch || this.config.githubBranch || 'main';
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${params.path}`;

    // まず既存ファイルのSHAを取得（更新時に必要）
    let sha: string | undefined;
    try {
      const getResponse = await fetch(`${url}?ref=${branch}`, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (getResponse.ok) {
        const existingFile = (await getResponse.json()) as { sha: string };
        sha = existingFile.sha;
        console.log(`[github] File exists, updating with SHA: ${sha}`);
      }
    } catch (error) {
      console.log(`[github] File does not exist, creating new file`);
    }

    // Base64エンコード
    const contentBase64 = Buffer.from(params.content, 'utf-8').toString('base64');

    // ファイル作成・更新
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        message: params.message,
        content: contentBase64,
        branch,
        ...(sha && { sha }), // 既存ファイルの場合はSHAを含める
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create/update file on GitHub: ${response.status} ${errorText}`);
    }

    console.log(`[github] File saved: ${params.path}`);
  }

  /**
   * OCR結果をGitHubに保存（Issue経由）
   */
  async createOcrIssue(params: {
    fileName: string;
    summary: string;
    ocrText: string;
    metadata: {
      channelName?: string;
      userName?: string;
      timestamp?: string;
      imageUrl?: string;
    };
  }): Promise<number> {
    const issueBody = `## OCR Result

**File**: \`${params.fileName}\`
**Channel**: ${params.metadata.channelName || 'N/A'}
**User**: ${params.metadata.userName || 'N/A'}
**Timestamp**: ${params.metadata.timestamp || 'N/A'}

### Summary
${params.summary}

### Extracted Text
\`\`\`
${params.ocrText}
\`\`\`

${params.metadata.imageUrl ? `**Original Image**: ${params.metadata.imageUrl}` : ''}
`;

    return this.createIssue({
      title: `OCR: ${params.fileName}`,
      body: issueBody,
      labels: ['ocr-result'],
    });
  }
}
