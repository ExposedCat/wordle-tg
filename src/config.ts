import 'dotenv/config';

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export const BOT_TOKEN = env('BOT_TOKEN') ?? '';
export const DB_PATH = env('DB_PATH') ?? 'telewordle.db';
export const OPENAI_API_KEY = env('OPENAI_API_KEY') ?? env('AI_API_KEY') ?? '';
export const OPENAI_BASE_URL = env('OPENAI_BASE_URL') ?? env('AI_API_BASE_URL');
export const OPENAI_MODEL = env('OPENAI_MODEL') ?? env('AI_MODEL') ?? 'gpt-4.1-mini';

export function assertConfig(): void {
  if (!BOT_TOKEN) {
    console.error('Missing BOT_TOKEN. Copy .env.example to .env and paste the token from @BotFather.');
    process.exit(1);
  }
}
