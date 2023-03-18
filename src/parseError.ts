export class ParseError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);

		// Maintain V8 stack trace
		// @ts-expect-error Only present on V8 and is missing from typedef
		Error.captureStackTrace?.(this, ParseError); // eslint-disable-line @typescript-eslint/no-unsafe-call

		this.name = 'ParseError';
	}
}
