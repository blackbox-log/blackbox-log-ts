declare const pointee: unique symbol;
export type RawPointer<T> = number & { [pointee]: T };

const registry = new FinalizationRegistry<RegistryValue<unknown>>(dealloc);

type RegistryValue<T> = { ptr: RawPointer<T>; free(ptr: RawPointer<T>): void };
function dealloc<T>({ ptr, free }: RegistryValue<T>) {
	free(ptr);
}

export class ManagedPointer<T> {
	#ptr: RawPointer<T> | undefined;
	readonly #free;

	constructor(ptr: RawPointer<T>, free: (ptr: RawPointer<T>) => void) {
		this.#ptr = ptr;
		this.#free = free;
		registry.register(this, { ptr, free }, this);
	}

	free() {
		if (this.#ptr !== undefined) {
			this.#free(this.#ptr);
			registry.unregister(this);
			this.#ptr = undefined;
		}
	}

	get isAlive(): boolean {
		return this.#ptr !== undefined;
	}

	get ptr(): RawPointer<T> {
		if (this.#ptr === undefined) {
			throw new Error('backing WebAssembly object has been freed');
		}

		return this.#ptr;
	}
}
