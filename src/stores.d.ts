/** If user prefers reduced motion  */
export const prefersReducedMotion: boolean
export function defaultTweenOptions(duration: number): {
	easing: typeof cubicOut
	duration: number
}
export function getThumbBackground(activeItem: any): string | true
/** Adds attributes to the given node based on the provided object  */
export function addAttributes(
	node: HTMLElement,
	obj: Record<string, string | boolean> | string
): void
import { cubicOut } from 'svelte/easing'
