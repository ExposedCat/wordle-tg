import 'dotenv/config';

export const BOT_TOKEN = process.env.BOT_TOKEN ?? '';
export const DB_PATH = process.env.DB_PATH ?? 'telewordle.db';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY ?? '';
export const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? process.env.AI_API_BASE_URL;
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? process.env.AI_MODEL ?? 'gpt-4.1-mini';

export function assertConfig(): void {
  if (!BOT_TOKEN) {
    console.error('Missing BOT_TOKEN. Copy .env.example to .env and paste the token from @BotFather.');
    process.exit(1);
  }
}
