import { cubicOut } from 'svelte/easing';

// Default options for tweens, the CSS animations take theirs from --bp-duration and --bp-easing
export const defaultTweenOptions = (duration) => ({
	easing: cubicOut,
	duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : duration
});

export const getThumbBackground = (activeItem) => activeItem.thumb ? `url(${activeItem.thumb.src})` : null;

// Adds attributes to the given node based on the provided object
export const addAttributes = (node, attributes) => {
	if (!attributes) {
		return;
	}
	if (typeof attributes === 'string') {
		attributes = JSON.parse(attributes);
	}
	for (let key in attributes) {
		node.setAttribute(key, attributes[key]);
	}
};