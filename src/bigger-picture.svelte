<svelte:options accessors={true} />

<script>
	import { writable } from 'svelte/store';
	import Thumbs from './components/thumbs.svelte';
	import ImageItem from './components/image.svelte';
	import Iframe from './components/iframe.svelte';
	import Video from './components/video.svelte';
	import { isGalleryKey } from './stores';

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

	// Gap around the stage, read from the gallery on open and on resize instead of on every measure
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
		labels = { close: 'Close', download: 'Download', prev: 'Previous', next: 'Next', thumb: 'View image', gallery: 'Gallery', ...opts.labels };
		inline = opts.inline;

		// Update trigger element to restore focus
		focusTrigger = document.activeElement;

		if (target) {
			container = target;
			containerWidth = target.offsetWidth;
			containerHeight = target === document.body ? window.innerHeight : target.clientHeight;
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
			// The width the lock frees is the real scrollbar, innerWidth isn't, it follows the zoom
			// and the overflow on mobile, where overlay scrollbars free nothing
			const style = getComputedStyle(html);
			const width = html.clientWidth;
			html.classList.add('bp-lock');
			const scrollbar = html.clientWidth - width;
			// Padding takes the place of the hidden scrollbar, toggling scrollbar-gutter instead restyles the whole page,
			// a stable gutter keeps the space, though clientWidth changes with it
			if (scrollbar && style.scrollbarGutter === 'auto') {
				html.style.paddingRight = parseFloat(style.paddingRight) + scrollbar + 'px';
			}
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
		window.removeEventListener('keydown', onKeydown, true);
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
	// A cancelled animation, such as of a slide that a change removes during the close, runs it too
	const afterAnimations = (node, callback) => Promise.all(node?.getAnimations().map((animation) => animation.finished) || []).then(callback, callback);

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
			shiftKey,
			target
		} = e;
		if (!isGalleryKey(e, opts.focusWrap || container)) {
			return;
		}
		// The zoomed image pans with the arrows instead, and a text field in an HTML item moves its caret
		const arrows = !$zoomed && !target.isContentEditable && !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
		if (key === 'Escape') {
			!opts.persistent && close();
		} else if (key === 'ArrowRight' && arrows) {
			next();
		} else if (key === 'ArrowLeft' && arrows) {
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
				index = (index < 0 && shiftKey ? 0 : index) + tabbable.length;
				// Hidden and disabled nodes have a tabIndex too, but can't take the focus, so the next one is tried
				for (let step = 1; step <= tabbable.length && document.activeElement === activeElement; step++) {
					tabbable[(index + (shiftKey ? -step : step)) % tabbable.length].focus();
				}
			}
		} else {
			return;
		}
		// The page doesn't get the keys the gallery uses, such as the arrows of a slider under it
		e.stopPropagation();
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

		item.download = parseDownload(item);

		return (!opts.types || opts.types.includes(item.type)) && parseThumbnail(item);

	};

	// URL of the download link, a set URL or the largest image of a srcset or the first video or audio source
	const parseDownload = ({ download, link, type, sources }) => {

		// Data attributes pass true and false as strings
		if (download == null ? !opts.download : download + '' == 'false') {
			return '';
		}

		if (download && download + '' != 'true') {
			return download;
		}

		if (type === 'image') {
			let max = 0;
			for (const { url, value } of parseSrcset(link)) {
				if (value > max) {
					max = value;
					link = url;
				}
			}
			return link;
		}

		return sources?.[0]?.src || '';

	};

	// The candidates of a srcset, also with no space after a comma. A comma inside a URL stays in it
	const parseSrcset = (srcset) => Array.from(srcset.matchAll(/(?:^|,)\s*(\S+)\s+(\d+)([wx])/gi), ([, url, value, type]) => ({
		url,
		value: +value,
		type
	}));

	// Parse the link and detect the content type
	const parseLink = (link, item) => {

		// Also matches the first candidate of a srcset, and a data URL of an image
		let match = link.match(/^data:image\/|\.(?:jpe?g|png|gif|bmp|webp|avif|svg|tiff|ico)(?:[\?#]\S*)?(?:\s|$)/i);

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
				// The start time, such as 90, 90s, 1m30s or 1h2m3s
				const time = key === 't' && value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
				if (time) {
					key = 'start';
					value = 3600 * (time[1] | 0) + 60 * (time[2] | 0) + (time[3] | 0);
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

		// An image element wins over the element when it is an image, then the image inside it, then a thumbnail URL
		let thumbLink = item.thumb,
			element = item.element,
			thumbElement = thumbLink instanceof HTMLImageElement ? thumbLink : element?.matches('img') ? element : element?.querySelector('img');

		item.source = element;
		item.thumb = false;

		if (thumbElement) {
			item.thumb = thumbElement;
			item.source = item.thumb;
			item.alt = item.alt || thumbElement.alt;
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
		} else if (item.type === 'image' && opts.thumbs && element?.href) {
			// A link without a thumbnail shows the full image in the strip, loaded lazily
			item.thumb = { src: element.href };
		}

		return item;

	};

	// Set item dimensions based on a thumbnail image if not already specified
	const setDimensions = (item, thumb) => {

		// A thumbnail that is not loaded yet, such as a lazy one, has no size
		if ((!item.width || !item.height) && thumb.naturalWidth) {

			let dimensions = calculateDimensions({
				width: thumb.naturalWidth,
				height: thumb.naturalHeight
			});

			item.width = dimensions[0];
			item.height = dimensions[1];
			item.scaled = 1;

			// The thumbnails of the other items load too, only the shown item changes the size on the screen
			if (item === activeItem) {
				activeDimensions = dimensions;
			}

		}

	};

	const readGap = () => (gap = parseInt(getComputedStyle(container).getPropertyValue('--bp-stage-gap')) || 0);

	// Fit the active item to a new stage size
	const resize = (width, height) => {
		if (width !== containerWidth || height !== containerHeight) {
			containerWidth = width;
			containerHeight = height;
			// A zoomed gallery has no gap, the item keeps the one it fits in once zoomed out
			$zoomed || readGap();
			activeDimensions = calculateDimensions(activeItem);
		}
	};

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
			loadImage(items[getNextPosition(position + 1)]);
			loadImage(items[getNextPosition(position - 1)]);
		}
	};

	// Load and decode the image of an item once, the slide that shows a preloaded item gets the same promise
	const loadImage = (item) => {

		if (item.type !== 'image' || item.preload) {
			return item.preload;
		}

		let image = document.createElement('img'),
			src = item.link,
			factor = 1;

		// The href of a link encodes the spaces of a srcset. Only these, other escapes such as %23 are part of the URL
		if (!/\s/.test(src)) {
			src = src.replace(/%20/g, ' ');
		}

		const parts = parseSrcset(src);

		if (parts.length) {

			const width = calculateDimensions(item)[0];

			parts.sort((a, b) => a.value - b.value);

			// The first candidate sharp enough for the shown size and the screen density, the same one the browser
			// picks from the srcset and sizes of the shown image, so the file is loaded once
			const largest = parts[parts.length - 1];
			const match = parts.find(c => c.value >= (c.type === 'w' ? width : 1) * (window.devicePixelRatio || 1)) || largest;

			// The full size is the one of the largest candidate, so the zoom can reach it
			factor = largest.value / match.value;

			item.attr.srcset = src;
			item.attr.sizes = item.sizes || opts.sizes || width + 'px';
			src = match.url;

		}

		image.src = item.attr.src = src;

		return (item.preload = image.decode().then(() => {

			// The size from a thumbnail is only a ratio, and an item without one takes it from the image
			if ((item.scaled || !item.width || !item.height) && image.naturalWidth) {
				item.width = Math.round(image.naturalWidth * factor);
				item.height = Math.round(image.naturalHeight * factor);
				if (item === activeItem) {
					activeDimensions = calculateDimensions(item);
				}
			}

		}).catch(() => {
		}));

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

		// The slide is centered in the stage, not in the screen. Its size is known: the gallery measures it on mount, and the
		// ruler observer keeps it
		const stage = ruler.getBoundingClientRect();

		if (activeItem.type === 'html') {
			const bpItem = node.querySelector('.bp-html').firstElementChild;
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
		const leftOffset = rect.left - stage.left - (containerWidth - rect.width) / 2;
		const centerTop = rect.top - stage.top - (containerHeight - rect.height) / 2;
		let scaleWidth = rect.width / dimensions[0];
		let scaleHeight = rect.height / dimensions[1];
		let css = '--bp-opacity:1';
		let crop = '';

		if (activeItem.fit === 'cover') {
			scaleWidth = scaleHeight = Math.max(scaleHeight, scaleWidth);
			// Crop the item like the thumbnail: the slide shifts by the crop and clips, the crop inside it shifts back twice
			// as far and clips, and its content returns in place. Translates stay on the compositor, an animated clip-path
			// repaints every frame. The percents follow the slide when the stage gap comes back after the zoom
			css += `;--bp-crop-x:calc(50% - ${rect.width / scaleWidth / 2}px);--bp-crop-y:calc(50% - ${rect.height / scaleHeight / 2}px)`;
			crop = ' translate(var(--bp-crop-x),var(--bp-crop-y))';
			className += ' bp-clip';
		} else if (activeItem.fit === 'contain') {
			scaleWidth = scaleHeight = Math.min(scaleHeight, scaleWidth);
		}

		animate(node, className, `translate(${leftOffset}px,${centerTop}px) scale(${scaleWidth},${scaleHeight})` + crop, css);
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

		// Measure the stage, which the thumbnails, the offsets and the scroll lock make other than the target, and read the gap
		// of the gallery, which can set its own, such as none when inline. The image of the item loads after this, see onMount
		// in image.svelte, so it picks the srcset candidate the browser picks
		({ width: containerWidth, height: containerHeight } = ruler.getBoundingClientRect());
		readGap();
		activeDimensions = calculateDimensions(activeItem);

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
			// In the capture phase, so the gallery gets the keys before the page
			window.addEventListener('keydown', onKeydown, true);
			// Keyboard and screen reader users start inside the gallery
			node.focus({ preventScroll: true });
			// The back button closes the gallery instead of leaving the page
			// Not when closed in the same tick as opened, the close has already passed its history.back()
			if (opts.history && !isClosing) {
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
				window.removeEventListener('keydown', onKeydown, true);
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

			resize(rect.width, rect.height);

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
						on:click={function (e) {
						// Only close if pressed and released on self. On click, not on pointerup, see onClick in image.svelte
						if (e.target === this && clickedEl === this) {
							!opts.persistent && close()
						}
					}}
					>
						<!-- The crop and its content shift against the slide to crop the item like the thumbnail -->
						<div class="bp-crop"><div>
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
						</div></div>
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
			<div class="bp-actions">
				{#if activeItem.download}
					<!-- Download link, cross-origin files open in a new tab instead, the label action names it -->
					<!-- svelte-ignore a11y-missing-content -->
					<a class="bp-dl" href={activeItem.download} download target="_blank" use:label={'download'}></a>
				{/if}
				<!-- Close button -->
				<!-- Buttons of type button, so a gallery inside a form doesn't submit it -->
				<button type="button" class="bp-x" use:label={'close'} on:click={close}></button>
			</div>

			{#if items.length > 1}
				<!-- Counter -->
				<div class="bp-count">
					{position + 1} / {items.length}
				</div>
				<!-- Forward / back buttons -->
				<button
					type="button"
					class="bp-prev"
					use:label={'prev'}
					on:click={prev}
				></button>
				<button
					type="button"
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