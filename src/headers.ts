import type { Unit } from './units';

export type FrameDef = ReadonlyMap<string, { unit: Unit }>;
export type InternalFrameDef = ReadonlyMap<string, { unit: Unit; signed: boolean }>;

export enum FirmwareKind {
	Betaflight = 'Betaflight',
	Inav = 'INAV',
}

export class Version {
	constructor(public major: number, public minor: number, public patch: number) {}

	toString(): string {
		return `${this.major}.${this.minor}.${this.patch}`;
	}
}
