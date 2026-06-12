import { describeWordMeaning } from "../llm.ts";
import { createLogger } from "../log.ts";
import type { WordLanguage } from "./language.ts";

const log = createLogger("game:meaning");

export async function wordMeaning(
	word: string,
	language: WordLanguage,
): Promise<string | undefined> {
	try {
		return await describeWordMeaning(word, language);
	} catch (error) {
		log.error("Failed to generate word meaning", { error });
		return undefined;
	}
}
