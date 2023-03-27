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
	time: number;
	fields: FrameFields;
};

export type SlowFrame = {
	fields: FrameFields;
};

export type GpsFrame = {
	time: number;
	fields: FrameFields;
};

export type Stats = {
	counts: {
		event: number;
		main: number;
		slow: number;
		gps: number;
		gpsHome: number;
	};
};
