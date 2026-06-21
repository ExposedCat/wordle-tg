import { hardModeViolation } from "./hardmode.ts";

function assertViolation(
	actual: ReturnType<typeof hardModeViolation>,
	message: string,
): asserts actual {
	if (!actual) throw new Error(message);
}

Deno.test("mega hard rejects reusing a previous yellow position", () => {
	const violation = hardModeViolation("cigar", ["rxxxx"], "rzzzz", true, true);

	assertViolation(violation, "Expected R in the same yellow position to fail");
	if (violation.misplaced.map((hint) => hint.letter).join("") !== "R") {
		throw new Error(
			`Expected misplaced R, got ${JSON.stringify(violation.misplaced)}`,
		);
	}
	if (violation.required.length !== 0) {
		throw new Error(
			`Expected no missing required hints, got ${JSON.stringify(violation.required)}`,
		);
	}
});

Deno.test("super hard allows reusing a previous yellow position", () => {
	const violation = hardModeViolation("cigar", ["rxxxx"], "rzzzz", true);

	if (violation) {
		throw new Error(`Expected no violation, got ${JSON.stringify(violation)}`);
	}
});

Deno.test("mega hard allows moving previous yellow letters", () => {
	const violation = hardModeViolation("cigar", ["rxxxx"], "arzzz", true, true);

	if (violation) {
		throw new Error(`Expected no violation, got ${JSON.stringify(violation)}`);
	}
});
