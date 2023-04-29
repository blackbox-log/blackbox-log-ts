export function unreachable(_: never): never {
	throw new Error('reached unreachable');
}

const noopDelete = () => false;
const noopClear = () => undefined; // eslint-disable-line unicorn/no-useless-undefined
export function freezeSet<T>(set: Set<T>): ReadonlySet<T> {
	set.add = () => set;
	set.delete = noopDelete;
	set.clear = noopClear;
	return Object.freeze(set);
}

export function freezeMap<K, V>(map: Map<K, V>): ReadonlyMap<K, V> {
	map.set = () => map;
	map.delete = noopDelete;
	map.clear = noopClear;
	return Object.freeze(map);
}

export type Values<T> = T[keyof T];
