// Renders sample boards to /tmp and prints the text-mode equivalent, so the
// visual output can be checked without a Telegram token.
import type { GameRow } from "../src/app/data.ts";
import {
	renderBoardImage,
	renderBoardSticker,
	renderKeyboardSticker,
} from "../src/game/board-image.ts";
import { textBoard } from "../src/game/text-board.ts";

const mk = (word: string, userId: number, userName: string) => ({
	word,
	userId,
	userName,
	ts: 0,
});

const game: GameRow = {
	id: 1,
	chat_id: 1,
	answer: "water",
	language: "en",
	status: "active",
	kind: "normal",
	guesses: [
		mk("sport", 1, "A"),
		mk("trace", 1, "A"),
		mk("react", 1, "A"),
		mk("water", 1, "A"),
	],
	started_at: 0,
	finished_at: null,
	tournament_id: null,
	duel_id: null,
	daily_date: null,
};

const pngOut = "/tmp/telewordle-sample.png";
const boardWebpOut = "/tmp/telewordle-board-sample.webp";
const keyboardWebpOut = "/tmp/telewordle-keyboard-sample.webp";
Deno.writeFileSync(pngOut, renderBoardImage(game));
Deno.writeFileSync(boardWebpOut, renderBoardSticker(game));
Deno.writeFileSync(keyboardWebpOut, renderKeyboardSticker(game));
console.log(`wrote ${pngOut}`);
console.log(`wrote ${boardWebpOut}`);
console.log(`wrote ${keyboardWebpOut}`);
console.log("--- text mode ---");
console.log(textBoard(game));
