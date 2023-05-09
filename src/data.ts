export type ParserEvent =
	| { kind: ParserEventKind.Event; data: undefined }
	| { kind: ParserEventKind.MainFrame; data: MainFrame }
	| { kind: ParserEventKind.SlowFrame; data: SlowFrame }
	| { kind: ParserEventKind.GpsFrame; data: GpsFrame };

export enum ParserEventKind {
	Event = 'event',
	MainFrame = 'main',
	SlowFrame = 'slow',
	GpsFrame = 'gps',
}

export type FrameFields = ReadonlyMap<string, number>;

export type MainFrame = {
	/** Frame time in fractional seconds */
	time: number;
	fields: FrameFields;
};

export type SlowFrame = {
	fields: FrameFields;
};

export type GpsFrame = {
	/** Frame time in fractional seconds */
	time: number;
	fields: FrameFields;
};

export type Stats = {
	/** The number of valid frames found of each type */
	counts: {
		event: number;
		main: number;
		slow: number;
		gps: number;
		gpsHome: number;
	};
	/** The approximate percentage of the log data parsed so far as a number in the range `[0,1]`. */
	progress: number;
};
