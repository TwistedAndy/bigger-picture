<svelte:options accessors={true} />

<script>
	import { writable } from 'svelte/store';
	import Thumbs from './components/thumbs.svelte';
	import ImageItem from './components/image.svelte';
	import Iframe from './components/iframe.svelte';
	import Video from './components/video.svelte';

	// Items in the gallery
	export let items = undefined;

	// Element the gallery is mounted within (passed during initialization)
	export let target = undefined;

	// Usage of HTML dialog element and showModal method
	export let dialog = false;

	const html = document.documentElement;

	// Index of current active item
	let position = 0;

	// Options passed via open method
	let opts;

	// Bool tracks open state
	let isOpen;

	// Dom element to restore focus to on close
	let focusTrigger;

	// Bool true if container width < 769
	let smallScreen;

	// Bool value of inline option passed in open method
	let inline;

	// When position is set
	let movement;

	// Stores target on pointerdown (ref for overlay close)
	let clickedEl;

	// Slide of the active item
	let slide;

	// Texts of the controls, merged with the labels option
	let labels;

	// Gap around the stage, read on open and on resize instead of on every measure
	let gap = 0;

	let ruler;
	let container;
	let containerWidth;
	let containerHeight;

	// Active item object
	let activeItem = null;
	let activeDimensions;

	// True if the image is zoomed past its starting size
	const zoomed = writable(0);

	// True while this gallery runs its outro, other galleries on the page keep their own
	const closing = writable(0);

	// Update the active item and dimensions on position change
	$: if (items && items[position]) {
		activeItem = items[position];
		activeDimensions = calculateDimensions(activeItem);
	}

	// True while the gallery runs its outro animation
	let isClosing;

	// Options of an open call made while closing, applied once the gallery is removed
	let pendingOptions;

	// Receives options and opens gallery
	export const open = (options) => {
		if (isClosing) {
			pendingOptions = options;
			return;
		}

		// intro and noClose are the deprecated names of zoom: false and persistent
		opts = { zoom: !options.intro, persistent: options.noClose, ...options };
		labels = { close: 'Close', prev: 'Previous', next: 'Next', thumb: 'View image', gallery: 'Gallery', ...opts.labels };
		inline = opts.inline;

		// Update trigger element to restore focus
		focusTrigger = document.activeElement;

		if (target) {
			container = target;
			containerWidth = target.offsetWidth;
			containerHeight = target === document.body ? window.innerHeight : target.clientHeight;
			readGap();
		}

		position = 0;

		// Set the gallery items, el is the deprecated name of current
		const list = [],
			current = opts.current || opts.el;

		(opts.items instanceof HTMLElement ? [opts.items] : [...opts.items]).forEach((item, i) => {

			item = prepareItem(item);

			if (typeof item !== 'object') {
				return;
			}

			// Index in the filtered list, used for position and thumbnails
			item.i = list.length;

			// A set position wins, otherwise the item of current
			if (opts.position == null ? current && current === item.element : i === opts.position) {
				position = item.i;
			}

			list.push(item);

		});

		// Nothing to show, e.g. every item was filtered out
		if (!list.length) {
			return;
		}

		// Lock the scroll unless gallery is inline
		if (!inline && html.scrollHeight > html.clientHeight) {
			const style = getComputedStyle(html);
			const scrollbar = innerWidth - html.clientWidth;
			// Padding takes the place of the hidden scrollbar, toggling scrollbar-gutter instead restyles the whole page
			if (scrollbar && style.scrollbarGutter === 'auto') {
				html.style.paddingRight = parseFloat(style.paddingRight) + scrollbar + 'px';
			}
			html.classList.add('bp-lock');
		}

		items = list;

	};

	// Close the gallery
	export const close = () => {
		if (!items || isClosing) {
			return;
		}
		isClosing = true;
		opts.onClose?.(container, activeItem);
		closing.set(true);
		window.removeEventListener('keydown', onKeydown);
		// Closed without the back button, drop the history entry the gallery added
		if (opts.history && history.state?.bp) {
			history.back();
		}
		// No slide yet when closed in the same tick as opened
		slide && zoom(slide, 'bp-out');

		// Remove the gallery once the slide has finished its outro
		afterAnimations(slide, () => {
			items = null;
			focusTrigger?.focus({ preventScroll: true });
		});
	};

	// Run a callback once the animations of a node are finished, right away if it has none
	const afterAnimations = (node, callback) => Promise.all(node?.getAnimations().map((animation) => animation.finished) || []).finally(callback);

	// Switch to the previous item
	export const prev = () => setPosition(position - 1);

	// Switch to the next item
	export const next = () => setPosition(position + 1);

	// Jump to a specific position
	export const setPosition = (index) => {
		const nextPosition = getNextPosition(index);
		movement = index - position;
		if (nextPosition !== position) {
			position = nextPosition;
			opts.onUpdate?.(container, items[position]);
		}
	};

	// Get the next gallery position
	const getNextPosition = (index) => (index + items.length) % items.length;

	// Handle the keyboard events
	const onKeydown = (e) => {
		const {
			key,
			shiftKey
		} = e;
		if (key === 'Escape') {
			!opts.persistent && close();
		} else if (key === 'ArrowRight' && !$zoomed) {
			// The zoomed image pans with the arrows instead
			next();
		} else if (key === 'ArrowLeft' && !$zoomed) {
			prev();
		} else if (key === 'Tab') {
			// Trap the focus on tab press
			const { activeElement } = document;

			// Allow browser to handle tab into video controls only
			if (shiftKey || !activeElement.controls) {
				e.preventDefault();
				const { focusWrap = container } = opts;
				const tabbable = [...focusWrap.querySelectorAll('*')].filter((node) => node.tabIndex >= 0);
				let index = tabbable.indexOf(activeElement);
				// From the container itself, Tab goes to the first control and Shift+Tab to the last
				index = (index < 0 && shiftKey ? 0 : index) + tabbable.length + (shiftKey ? -1 : 1);
				tabbable[index % tabbable.length].focus();
			}
		}
	};

	// Normalize a gallery item
	const prepareItem = (item) => {

		// Work on a copy, the gallery adds its own fields and the caller's objects stay as they are
		item = item instanceof HTMLElement ? { element: item, ...item.dataset } : { ...item };

		// Data attributes pass these as JSON
		['sources', 'tracks', 'attr'].forEach(key => {
			if (typeof item[key] === 'string') {
				item[key] = JSON.parse(item[key]);
			}
		});

		// A copy too, the gallery writes the image src, srcset and sizes into it
		item.attr = { ...item.attr };

		// title is the deprecated name of alt
		item.alt = item.alt || item.title;

		let link = item.link = item.link || item.element?.href,
			type = item.type;

		if (item.sources) {
			item.type = type === 'audio' || /^audio/.test(item.sources[0]?.type) ? 'audio' : 'video';
		} else if (item.html != null) {
			item.type = 'html';
		} else if (!link) {
			return false;
		} else if (type === 'video' || type === 'audio') {
			// A set type shows the link as it is, without detection
			item.sources = [{ src: link }];
		} else if (type !== 'image' && type !== 'iframe' && !parseLink(link, item)) {
			return false;
		}

		return (!opts.types || opts.types.includes(item.type)) && parseThumbnail(item);

	};

	// Parse the link and detect the content type
	const parseLink = (link, item) => {

		// Also matches the first candidate of a srcset
		let match = link.match(/\.(?:jpe?g|png|gif|bmp|webp|avif|svg|tiff|ico)(?:[\?#]\S*)?(?:\s|$)/i);

		if (match) {
			item.type = 'image';
			return item;
		}

		// HTML5 video and audio, the first group holds a video extension
		match = link.match(/\.(?:(mp4|mpeg|mov|ogv|webm|avi|h264)|(mp3|wav|ogg|oga|m4a|aac|flac|opus|wma|weba|mid))([?#].*)?$/i);

		if (match) {
			const ext = (match[1] || match[2]).toLowerCase();
			const mimeMap = {
				ogv: 'ogg',
				mov: 'quicktime',
				avi: 'x-msvideo',
				mp3: 'mpeg',
				m4a: 'mp4',
				oga: 'ogg',
				opus: 'ogg',
				mid: 'midi',
				weba: 'webm'
			};
			item.type = match[1] ? 'video' : 'audio';
			item.sources = [{ src: link, type: item.type + '/' + (mimeMap[ext] || ext) }];
			return item;
		}

		// YouTube Video
		match = link.match(/(youtube\.com|youtu\.be)\/(?:watch\?(?:.*&)?v=|v\/|u\/|shorts\/|embed\/?)?(videoseries\?list=(?:.*)|[\w-]{11}|\?listType=(?:.*)&list=(?:.*))(?:.*)/i);

		if (match) {

			let videoID = encodeURIComponent(match[2]),
				sourceURL = new URL(link),
				targetURL = new URL('https://www.youtube.com/embed/' + videoID + '?autoplay=1&playsinline=1&controls=1&rel=0');

			sourceURL.searchParams.delete('v');

			for (let [key, value] of sourceURL.searchParams) {
				if (key === 't') {
					let timeMatch = value.match(/((\d*)m)?(\d*)s?/);
					if (timeMatch) {
						key = 'start';
						value = 60 * parseInt(timeMatch[2] || '0') + parseInt(timeMatch[3] || '0');
					}
				}
				targetURL.searchParams.set(key, value);
			}

			item.type = 'iframe';
			item.link = targetURL.toString();
			item.thumb = item.thumb || 'https://i.ytimg.com/vi/' + videoID + '/mqdefault.jpg';

			return item;

		}

		// Vimeo Video
		match = link.match(/^.+vimeo.com\/(?:\/)?(video\/)?([\d]+)((\/|\?h=)([a-z0-9]+))?(.*)?/);

		if (match) {

			let videoID = encodeURIComponent(match[2]),
				sourceURL = new URL(link),
				targetURL = new URL('https://player.vimeo.com/video/' + videoID + '?autoplay=1&playsinline=1');

			for (let [key, value] of sourceURL.searchParams) {
				targetURL.searchParams.set(key, value);
			}

			if (match[5]) {
				targetURL.searchParams.set('h', match[5]);
			} else {
				item.thumb = item.thumb || 'https://vumbnail.com/' + videoID + '.jpg';
			}

			if (sourceURL.hash && sourceURL.hash.startsWith('#t=')) {
				targetURL.hash = sourceURL.hash;
			}

			item.type = 'iframe';
			item.link = targetURL.toString();

			return item;

		}

		// SoundCloud Widget
		match = link.match(/^(https?:\/\/)?(www\.)?(m\.)?soundcloud\.com\/([a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+.*)$/);

		if (match) {

			let targetURL = new URL('https://w.soundcloud.com/player/?auto_play=1&visual=1&hide_related=1&show_comments=0');

			targetURL.searchParams.set('url', link);

			item.type = 'iframe';
			item.link = targetURL.toString();

			return item;

		}

		// Google Drive, Dropbox, and PDF files
		match = link.match(/(drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+))|(dropbox\.com\/s\/)|(\.pdf($|\?|#))/i);

		if (match) {

			if (match[1] && match[2]) {
				// Google Drive
				item.link = `https://drive.google.com/file/d/${match[2]}/preview`;
			} else if (match[3]) {
				// Dropbox
				const url = new URL(link);
				url.searchParams.set('raw', '1');
				url.searchParams.delete('dl');
				item.link = url.toString();
			}

			if (!item.width || !item.height) {
				item.width = containerWidth;
				item.height = containerHeight;
			}

			item.type = 'iframe';

			return item;

		}

		return false;

	};

	// Parse a thumbnail, update dimensions, and the fit option
	const parseThumbnail = (item) => {

		let thumbLink = '',
			thumbElement = false;

		if (item.element) {
			thumbElement = item.element.querySelector('img');
		}

		// A link without a thumbnail shows the full image in the strip, otherwise the gallery loads it when shown
		if (item.type === 'image' && opts.thumbs) {
			thumbLink = item.element?.href || '';
		}

		if (item.thumb instanceof HTMLImageElement) {
			thumbElement = item.thumb;
		} else if (item.thumb) {
			thumbLink = item.thumb;
		}

		item.source = item.element;
		item.thumb = false;

		if (thumbElement) {
			item.thumb = thumbElement;
			item.source = item.thumb;
			setDimensions(item, thumbElement);

			if (!item.fit) {
				item.fit = window.getComputedStyle(thumbElement).objectFit;
			}
		} else if (thumbLink) {
			thumbElement = new Image();
			thumbElement.src = thumbLink;
			thumbElement.onload = () => {
				setDimensions(item, thumbElement);
			};
			item.thumb = thumbElement;
		}

		return item;

	};

	// Set item dimensions based on a thumbnail image if not already specified
	const setDimensions = (item, thumb) => {

		if (!item.width || !item.height) {

			let dimensions = calculateDimensions({
				width: thumb.naturalWidth,
				height: thumb.naturalHeight
			});

			item.width = dimensions[0];
			item.height = dimensions[1];
			item.scaled = 1;

			activeDimensions = dimensions;

		}

	};

	const readGap = () => (gap = parseInt(getComputedStyle(container).getPropertyValue('--bp-stage-gap')) || 0);

	// Calculate width and height to fit inside a container
	const calculateDimensions = ({
		width = 1920,
		height = 1080
	}) => {
		const { scale = 1 } = opts;
		const ratio = Math.min(((containerWidth - 2 * gap) / width) * scale, ((containerHeight - 2 * gap) / height) * scale);
		// Round number so we don't use a float as the sizes attribute
		return [Math.round(width * ratio), Math.round(height * ratio)];
	};

	// Preloads images for previous and next items in gallery
	const preloadNext = () => {
		if (items) {
			const nextItem = items[getNextPosition(position + 1)];
			const prevItem = items[getNextPosition(position - 1)];
			!nextItem.preload && loadImage(nextItem);
			!prevItem.preload && loadImage(prevItem);
		}
	};

	// Load and decode the image for an item
	const loadImage = (item) => {

		if (item.type === 'image') {

			let image = document.createElement('img'),
				src = decodeURIComponent(item.link),
				srcset = '';

			if (/\s+\d+[wx]/.test(src)) {

				const parts = Array.from(src.matchAll(/(\S+)\s+(\d+)([wx])/gi), match => ({
					url: match[1],
					value: parseInt(match[2]),
					type: match[3]
				}));

				srcset = src;

				// The first candidate wide enough for the container or the screen density, the largest otherwise
				parts.sort((a, b) => a.value - b.value);
				const match = parts.find(c => c.value >= (c.type === 'w' ? containerWidth : window.devicePixelRatio || 1)) || parts[parts.length - 1];

				image.src = match.url;
				item.attr.src = match.url;

				image.sizes = item.sizes || opts.sizes || `${calculateDimensions(item)[0]}px`;
				item.attr.sizes = image.sizes;
				item.attr.srcset = srcset;

			} else {
				image.src = src;
				item.attr.src = src;
			}

			item.preload = true;

			return image.decode().then(() => {

				// The size from a thumbnail is only a ratio, and an item without one takes it from the image
				if ((item.scaled || !item.width || !item.height) && image.naturalWidth) {
					item.width = image.naturalWidth;
					item.height = image.naturalHeight;
					if (item === activeItem) {
						activeDimensions = calculateDimensions(item);
					}
				}

				// It's important to set srcset after we read the image dimensions
				if (srcset) {
					image.srcset = srcset;
				}

			}).catch((error) => {
			});

		}
	};

	// Set the state a slide animates from or to, the CSS animations of the classes do the rest
	const animate = (node, className, transform, css = '--bp-opacity:0') => {
		node.className = 'bp-slide ' + className;
		node.style.cssText = `--bp-transform:${transform};${css}`;
	};

	// Zoom the slide out of the thumbnail on open and back into it on close, or fade it up with zoom: false
	const zoom = (node, className) => {
		if (!opts.zoom) {
			return animate(node, className, `translateY(${className ? -10 : 10}px)`);
		}

		let dimensions;

		// Update the container dimensions before triggering an animation
		if (ruler) {
			containerWidth = ruler.clientWidth;
			containerHeight = ruler.clientHeight;
		}

		if (activeItem.type === 'html') {
			const bpItem = node.firstElementChild.firstElementChild;
			dimensions = [bpItem.clientWidth, bpItem.clientHeight];
		} else {
			dimensions = activeDimensions;
		}

		// Rect is the content box of the trigger element, the image is drawn inside its padding and border
		const source = activeItem.source || focusTrigger;
		const style = window.getComputedStyle(source);
		const edge = (side) => parseFloat(style['padding' + side]) + parseFloat(style['border' + side + 'Width']);
		const bounds = source.getBoundingClientRect();
		const rect = {
			left: bounds.left + edge('Left'),
			top: bounds.top + edge('Top'),
			width: bounds.width - edge('Left') - edge('Right'),
			height: bounds.height - edge('Top') - edge('Bottom')
		};
		const leftOffset = rect.left - (containerWidth - rect.width) / 2;
		const centerTop = rect.top - (containerHeight - rect.height) / 2;
		let scaleWidth = rect.width / dimensions[0];
		let scaleHeight = rect.height / dimensions[1];
		let css = '--bp-opacity:1';

		if (activeItem.fit === 'cover') {
			scaleWidth = scaleHeight = Math.max(scaleHeight, scaleWidth);
			// Crop the item like the thumbnail
			css += `;--bp-clip-y:${Math.max((dimensions[1] - rect.height / scaleHeight) / 2, 0)}px;--bp-clip-x:${Math.max((dimensions[0] - rect.width / scaleWidth) / 2, 0)}px`;
			className += ' bp-clip';
		} else if (activeItem.fit === 'contain') {
			scaleWidth = scaleHeight = Math.min(scaleHeight, scaleWidth);
		}

		animate(node, className, `translate(${leftOffset}px,${centerTop}px) scale(${scaleWidth},${scaleHeight})`, css);
	};

	// Animate the slides, the first one zooms in, the next ones slide in and out
	const slideActions = (node) => {
		slide = node;

		if (isOpen) {
			animate(node, 'bp-nav', `translate(${movement > 0 ? 20 : -20}px)`);
		} else {
			isOpen = true;
			// Deferred so the item is measured after the container action has shown the dialog and called onOpen
			queueMicrotask(() => zoom(node, ''));
		}

		return {
			destroy() {
				// The items are removed on close, the slide leaves with the gallery then
				if (items) {
					// Svelte has removed the previous slide, put it back under the new one until it slides out
					animate(node, 'bp-nav bp-out', `translate(${movement > 0 ? -20 : 20}px)`);
					ruler.parentNode.prepend(node);
					afterAnimations(node, () => node.remove());
				}
			}
		};
	};

	// Provides object w/ needed funcs / data to child components
	const getChildProps = () => ({
		calculateDimensions,
		closing,
		preloadNext,
		activeItem,
		loadImage,
		container,
		zoomed,
		close,
		opts,
		prev,
		next
	});

	// Name a control, the labels stay the same while the gallery is open
	const label = (node, key) => {
		node.title = labels[key];
		node.setAttribute('aria-label', labels[key]);
	};

	// Process the gallery mount and destroy
	const containerActions = (node) => {
		container = node;

		// Set here, attributes on svelte:element compile to a much larger spread
		node.tabIndex = -1;
		node.setAttribute('role', inline ? 'region' : 'dialog');
		node.setAttribute('aria-modal', !inline);
		node.setAttribute('aria-label', labels.gallery);

		// Use the top layer API for proper modal behavior
		if (dialog) {
			// Keep the dialog open on Escape, the keydown handler closes it with the outro animation
			node.oncancel = (e) => e.preventDefault();
			if (!inline) {
				node.showModal();
			} else {
				node.show();
			}
		}

		opts.onOpen?.(container, activeItem);

		// Don't use keyboard events for inline galleries
		if (!inline) {
			window.addEventListener('keydown', onKeydown);
			// Keyboard and screen reader users start inside the gallery
			node.focus({ preventScroll: true });
			// The back button closes the gallery instead of leaving the page
			if (opts.history) {
				history.pushState({ bp: 1 }, '');
				window.addEventListener('popstate', close);
			}
		}

		return {
			destroy() {
				// Close the dialog properly to remove it from top layer
				if (node.open) {
					node.close();
				}
				window.removeEventListener('keydown', onKeydown);
				window.removeEventListener('popstate', close);
				closing.set(false);
				isOpen = false;
				isClosing = false;
				// Remove class hiding scroll
				html.classList.remove('bp-lock');
				html.style.paddingRight = '';
				opts.onClosed?.(container, activeItem);
				if (pendingOptions) {
					open(pendingOptions);
					pendingOptions = null;
				}
			}
		};
	};

	$: smallScreen = containerWidth < 769;

	// Ruler is required to get accurate dimensions and handle container resize
	const rulerActions = (node) => {

		ruler = node;

		const rulerObserver = new ResizeObserver((entries) => {

			const rect = entries[0].contentRect;

			if (rect.width !== containerWidth || rect.height !== containerHeight) {
				containerWidth = rect.width;
				containerHeight = rect.height;
				readGap();
				activeDimensions = calculateDimensions(activeItem);
			}

			// Run the user-defined resize function
			opts.onResize?.(container, activeItem);

		});

		rulerObserver.observe(node);

		return {
			destroy() {
				rulerObserver.disconnect();
			}
		};

	};

</script>

{#if items}
	<svelte:element
		this={dialog ? 'dialog' : 'div'}
		use:containerActions
		class="bp-wrap"
		class:bp-zoomed={$zoomed}
		class:bp-inline={inline}
		class:bp-small={smallScreen}
		class:bp-noclose={opts.persistent}
		class:bp-closing={$closing}
	>
		{#if !dialog}
			<div class="bp-overlay"></div>
		{/if}
		<div class="bp-stage">
			<div class="bp-inner">
				{#key activeItem.i}
					<div
						class="bp-slide"
						role="none"
						use:slideActions
						on:pointerdown={(e) => (clickedEl = e.target)}
						on:pointerup={function (e) {
						// Only close if left click on self and not dragged
						if (e.button !== 2 && e.target === this && clickedEl === this) {
							!opts.persistent && close()
						}
					}}
					>
						{#if containerWidth > 0 && containerHeight > 0}
							{#if activeItem.type === 'image'}
								<ImageItem props={getChildProps()} {smallScreen} {containerWidth} {containerHeight} {activeDimensions} />
							{:else if activeItem.sources}
								<Video props={getChildProps()} {activeDimensions} />
							{:else if activeItem.type === 'iframe'}
								<Iframe props={getChildProps()} {activeDimensions} />
							{:else}
								<div class="bp-html">
									{@html activeItem.html}
								</div>
							{/if}
						{/if}
					</div>
				{/key}
				<div class="bp-ruler" use:rulerActions></div>
			</div>
			{#if activeItem.caption}
				<div class="bp-caption">
					{@html activeItem.caption}
				</div>
			{/if}
		</div>
		<div class="bp-controls">
			<!-- Close button -->
			<button class="bp-x" use:label={'close'} on:click={close}></button>

			{#if items.length > 1}
				<!-- Counter -->
				<div class="bp-count">
					{position + 1} / {items.length}
				</div>
				<!-- Forward / back buttons -->
				<button
					class="bp-prev"
					use:label={'prev'}
					on:click={prev}
				></button>
				<button
					class="bp-next"
					use:label={'next'}
					on:click={next}
				></button>
			{/if}
		</div>
		{#if opts.thumbs && items.length > 1}
			<Thumbs {position} {setPosition} {items} label={labels.thumb} />
		{/if}
	</svelte:element>
{/if}