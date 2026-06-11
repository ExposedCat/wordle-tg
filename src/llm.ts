import OpenAI from 'openai';
import { OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, OPENAI_TEMPERATURE } from './config.js';

let client: OpenAI | null = null;

function openaiClient(): OpenAI | null {
  if (!OPENAI_API_KEY) return null;
  client ??= new OpenAI({
    apiKey: OPENAI_API_KEY,
    baseURL: OPENAI_BASE_URL,
  });
  return client;
}

function normalizeMeaning(text: string): string | undefined {
  const normalized = text
    .replaceAll(/\s+/g, ' ')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim();

  return normalized.length > 0 ? normalized : undefined;
}

export async function describeWordMeaning(word: string): Promise<string | undefined> {
  const openai = openaiClient();
  if (!openai) return undefined;

  const prompt = `Write a single-sentence complete and concise meaning(s) of the word "${word}"`;
  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    temperature: OPENAI_TEMPERATURE,
    instructions: 'Return only the requested sentence. Do not use markdown, labels, examples, or extra commentary.',
    input: prompt,
    max_output_tokens: 80,
  });

  return normalizeMeaning(response.output_text);
}
