<script context="module">
	// Playback positions by the first source, a video opened again resumes from there
	const positions = {};
</script>

<script>
	// Svelte:element and each blocks would be cleaner for video / audio and sources / tracks,
	// but they make the vanilla bundle larger, so the elements are made here by hand

	import Loading from './loading.svelte';
	import { addAttributes, getThumbBackground } from '../stores';

	export let props;
	export let activeDimensions;

	let loaded = false;

	const { activeItem, opts, closing, container } = props;

	// Create audio / video element
	const onMount = (node) => {

		const mediaElement = document.createElement(activeItem.type);

		addAttributes(mediaElement, {
			controls: true, autoplay: true, playsinline: true, tabindex: '0'
		});
		// The alt text names the player for screen readers
		if (activeItem.alt) {
			mediaElement.setAttribute('aria-label', activeItem.alt);
		}
		addAttributes(mediaElement, activeItem.attr);

		// Takes supplied object and creates elements in video
		const appendToVideo = (tag, list) => {
			for (let item of list) {
				// Add sources / tracks to media element
				let el = document.createElement(tag);
				addAttributes(el, item);
				if (tag === 'source') {
					el.onerror = (error) => opts.onError?.(container, activeItem, error);
				}
				mediaElement.append(el);
			}
		};

		appendToVideo('source', activeItem.sources);

		if (activeItem.tracks) {
			appendToVideo('track', activeItem.tracks);
		}

		mediaElement.oncanplay = () => (loaded = true);

		// Before the metadata loads, this sets the position the playback starts from
		const key = activeItem.sources[0].src;
		mediaElement.currentTime = positions[key] || 0;

		node.append(mediaElement);

		return {
			destroy() {
				// A finished video starts over next time
				positions[key] = mediaElement.ended ? 0 : mediaElement.currentTime;
			}
		};

	};
</script>

<div
	class="bp-video"
	use:onMount
	style:width="{activeDimensions[0]}px"
	style:height="{activeDimensions[1]}px"
	style:background-image={getThumbBackground(activeItem)}
>
	<Loading {activeItem} {loaded} {closing} />
</div>
