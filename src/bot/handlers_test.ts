import type { GameStatus } from "../app/schema.ts";
import { boardMessageIdsForCleanup } from "./handlers.ts";

function assertMessageIds(status: GameStatus, expected: number[]): void {
	const actual = boardMessageIdsForCleanup({ status }, [10, 11, 12]);
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(
			`Expected ${status} cleanup IDs to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
		);
	}
}

Deno.test("boardMessageIdsForCleanup only tracks active boards", () => {
	assertMessageIds("active", [10, 11, 12]);
	assertMessageIds("solved", []);
	assertMessageIds("lost", []);
	assertMessageIds("paused", []);
});
