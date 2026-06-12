export function normalizeSqlValue(value: unknown): unknown {
	return typeof value === "bigint" ? Number(value) : value;
}

export function normalizeSqlRow<T>(row: T): T {
	if (row === null || typeof row !== "object") return row;

	return Object.fromEntries(
		Object.entries(row as Record<string, unknown>).map(([key, value]) => [
			key,
			normalizeSqlValue(value),
		]),
	) as T;
}

export function normalizeSqlRows<T>(rows: T[]): T[] {
	return rows.map(normalizeSqlRow);
}
