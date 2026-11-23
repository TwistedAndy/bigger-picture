export function getThumbBackground(activeItem: any): string | null
/** Adds attributes to the given node based on the provided object  */
export function addAttributes(
	node: HTMLElement,
	obj: Record<string, string | boolean> | string
): void
/** Whether the gallery handles the key: not a browser shortcut, and not from an element outside the gallery */
export function isGalleryKey(e: KeyboardEvent, wrap: Node): boolean
