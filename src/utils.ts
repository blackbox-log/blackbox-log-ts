export function unreachable(_: never): never {
	throw new Error('reached unreachable');
}

const setDelete = () => false;
const setClear = () => undefined;
export function freezeSet<T>(set: Set<T>): Set<T> {
	set.add = () => set;
	set.delete = setDelete;
	set.clear = setClear;
	return Object.freeze(set);
}
