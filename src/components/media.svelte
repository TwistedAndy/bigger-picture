<script>
	// Video, audio and iframe items in one component, as each component adds to the bundle. Svelte:element and each blocks
	// would be cleaner for the media element and its sources and tracks, but they make the bundle larger, so the elements
	// are made here by hand

	import Loading from './loading.svelte';
	import { addAttributes, getThumbBackground, positions } from '../utils';

	export let props;
	export let activeDimensions;

	// True while the gallery runs its outro
	export let closing;

	let loaded;

	const { activeItem, opts } = props;
	const { sources, link, alt } = activeItem;

	// Create the video, audio or iframe element
	const onMount = (node) => {

		const media = document.createElement(sources ? activeItem.type : 'iframe'),
			// Playback positions by the first source of a video, or by the link of a YouTube or Vimeo player
			key = sources ? sources[0].src : link,
			youtube = /youtube(-nocookie)?\.com\/embed/.test(link),
			post = (message) => media.contentWindow.postMessage(JSON.stringify(message), '*');

		// The YouTube and Vimeo players send their playback time, and a player opened again resumes from there
		const onMessage = ({ source, data }) => {
			if (source === media.contentWindow) {
				// The players send JSON strings. A message that is not one, or is null, stops here
				try {
					const { event, info = {}, data: { seconds } = {} } = JSON.parse(data);
					// YouTube sends the time in info and the playerState 0 at the end, Vimeo sends it in data and finish at the end
					positions[key] = info.playerState === 0 || event === 'finish' ? 0 : info.currentTime ?? seconds ?? positions[key];
					// Vimeo sends events only when it is ready and the page asks for them
					if (event === 'ready') {
						['timeupdate', 'ended'].map((value) => post({ method: 'addEventListener', value }));
					}
				} catch {}
			}
		};

		addAttributes(media, sources ? { controls: true, autoplay: true, playsinline: true, tabindex: '0' } : { allow: 'autoplay; fullscreen' });
		// The alt text names the player or the frame for screen readers
		if (alt) {
			media.setAttribute(sources ? 'aria-label' : 'title', alt);
		}
		addAttributes(media, activeItem.attr);

		if (sources) {

			// Takes supplied object and creates elements in video
			const appendToVideo = (tag, list) => {
				for (let item of list) {
					// Add sources / tracks to media element
					let el = document.createElement(tag);
					addAttributes(el, item);
					if (tag === 'source') {
						el.onerror = (error) => {
							// The loader goes when the last source fails too, the browser tries them in order
							loaded ||= item === list.at(-1);
							opts.onError?.(props.container, activeItem, error);
						};
					}
					media.append(el);
				}
			};

			appendToVideo('source', sources);
			appendToVideo('track', activeItem.tracks || []);

			media.oncanplay = () => (loaded = true);

			// A video with no size given, and no thumbnail to take it from, takes the size of the file, such as a portrait one
			media.onloadedmetadata = () => props.setDimensions(activeItem, {
				naturalWidth: media.videoWidth,
				naturalHeight: media.videoHeight
			});

			// Before the metadata loads, this sets the position the playback starts from
			media.currentTime = positions[key] || 0;

		} else {

			const time = positions[key] | 0;
			let url = link;

			if (time) {
				url = new URL(link);
				youtube ? url.searchParams.set('start', time) : (url.hash = 't=' + time + 's');
			}

			media.src = url;

			media.onload = () => {
				loaded = true;
				if (youtube) {
					// YouTube sends its state only to a page that listens
					post({ event: 'listening' });
					// YouTube ignores autoplay on some pages, so send a play command through the player API
					if (/[?&]autoplay=1/.test(link)) {
						post({ event: 'command', func: 'playVideo' });
					}
				}
			};

			if (youtube || /player\.vimeo\.com/.test(link)) {
				addEventListener('message', onMessage);
			}

		}

		node.append(media);

		return {
			destroy() {
				// A finished video starts over next time
				if (sources) {
					positions[key] = media.ended ? 0 : media.currentTime;
				}
				removeEventListener('message', onMessage);
			}
		};

	};
</script>

<div
	class={sources ? 'bp-video' : 'bp-iframe'}
	use:onMount
	style:width="{activeDimensions[0]}px"
	style:height="{activeDimensions[1]}px"
	style:background-image={sources && getThumbBackground(activeItem)}
>
	<Loading {activeItem} {loaded} {closing} />
</div>
