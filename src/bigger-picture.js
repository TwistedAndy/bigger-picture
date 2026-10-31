import * as svelte from 'svelte'
import BiggerPicture from './bigger-picture.svelte'

/**
 * Initializes BiggerPicture and assigns provided options to a props property
 *
 * @param {{target: HTMLElement}} options
 * @returns BiggerPicture instance
 */
export default function (options) {
	if (typeof options !== 'object') {
		options = {
			target: document.body
		};
	}
	options = {
		...options,
		props: options,
	}
	// Svelte 5 apps compiling the source mount components with a function, Svelte 4 uses classes
	return svelte.mount ? svelte.mount(BiggerPicture, options) : new BiggerPicture(options)
}
