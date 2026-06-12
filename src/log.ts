import { createDebug } from "@grammyjs/debug";
import { IS_PROD } from "./config.ts";

type LogFn = ReturnType<typeof createDebug>;

export function createLogger(scope: string): {
	debug: LogFn;
	warn: LogFn;
	error: LogFn;
} {
	const debug = createDebug(`app:${scope}:debug`);
	const warn = createDebug(`app:${scope}:warn`);
	const error = createDebug(`app:${scope}:error`);
	if (IS_PROD) {
		debug.enabled = false;
		warn.enabled = true;
		error.enabled = true;
	}
	return {
		debug,
		warn,
		error,
	};
}
