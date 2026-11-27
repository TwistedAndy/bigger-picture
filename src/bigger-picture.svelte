<svelte:options accessors={true} />

<script context="module">
	// Inline right padding of the page before the scroll lock, null when the lock added none. All galleries share it, the
	// last one to close unlocks the page
	let pagePadding = null;
</script>

<script>
	import Thumbs from './components/thumbs.svelte';
	import ImageItem from './components/image.svelte';
	import Media from './components/media.svelte';
	import { getUpperGallery, isGalleryKey } from './utils';

	// Items in the gallery
	export let items = undefined;

	// Element the gallery is mounted within (passed during initialization)
	export let target = undefined;

	// Usage of HTML dialog element and showModal method
	export let dialog = false;

	const html = document.documentElement;

	// The tag of the gallery, a constant: Svelte has no code to switch the tag then. The dialog prop doesn't change
	const tag = dialog ? 'dialog' : 'div';

	// Index of current active item
	let position = 0;

	// Options passed via open method
	let opts;

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

	// Slide of the active item, none until the first one zooms in
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
	let activeItem;
	let activeDimensions;

	// True if the image is zoomed past its starting size, the image sets it
	let zoomed = 0;

	// True while this gallery runs its outro, other galleries on the page keep their own
	let closing = 0;

	// Update the active item and dimensions on position change
	$: if (items?.[position]) {
		activeItem = items[position];
		activeDimensions = calculateDimensions(activeItem);
		// Load the thumbnail URL once the item shows, see parseThumbnail
		activeItem.thumb?.load?.();
	}

	// Options of an open call made while closing, applied once the gallery is removed
	let pendingOptions;

	// Receives options and opens gallery
	export const open = (options) => {
		// A gallery that is open or closes closes first, the new one opens once it is removed
		if (items) {
			pendingOptions = options;
			close();
			return;
		}

		opts = { zoom: true, ...options };
		labels = { close: 'Close', download: 'Download', prev: 'Previous', next: 'Next', thumb: 'View image', gallery: 'Gallery', ...opts.labels };
		inline = opts.inline;

		// Update trigger element to restore focus
		focusTrigger = document.activeElement;

		// The size before the gallery mounts, for the items that take it, such as a PDF
		if (target) {
			containerWidth = target.offsetWidth;
			containerHeight = target === document.body ? window.innerHeight : target.clientHeight;
		}

		position = 0;

		// Set the gallery items
		const list = [],
			current = opts.current;

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

		// The entry that the last gallery kept for this one, see close. Not for a gallery with no items, inline or no history
		if (!list.length || inline || !opts.history) {
			dropEntry();
		}

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
				pagePadding = html.style.paddingRight;
				html.style.paddingRight = parseFloat(style.paddingRight) + scrollbar + 'px';
			}
		}

		items = list;

	};

	// URL and ID of the history entry that the gallery adds. Each gallery has its own ID, so the back button closes only the
	// upper one of two
	let historyUrl,
		historyId = 0;

	// The back button closes the gallery. A link to an anchor in an HTML item adds an entry with another URL, and the gallery
	// stays open
	const onPopstate = () => {
		if (history.state?.bp !== historyId && location.href === historyUrl) {
			// The entry is left, the next gallery of an open call made while closing adds its own
			historyId = 0;
			close();
		}
	};

	// Drop the history entry that the gallery added. Not when it is left already, such as for an anchor in an HTML item, or
	// an entry of another gallery is the current one
	const dropEntry = () => {
		history.state?.bp === historyId && history.back();
		historyId = 0;
	};

	// Close the gallery
	export const close = () => {
		if (!items || closing) {
			return;
		}
		closing = 1;
		opts.onClose?.(container, activeItem);
		window.removeEventListener('keydown', onKeydown, true);
		// Closed without the back button, drop the history entry. The gallery of an open call made while closing takes it
		// or drops it, the popstate of a history.back() now would close that gallery
		if (!pendingOptions) {
			dropEntry();
		}
		// No slide yet when closed in the same tick as opened
		slide && zoom(slide, 'bp-out');

		// Remove the gallery once the slide has finished its outro
		afterAnimations(slide, () => (items = null));
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
		// No items while closed, and the item stays during the outro
		if (!items || closing) {
			return;
		}
		const nextPosition = getNextPosition(index);
		movement = index - position;
		if (nextPosition !== position) {
			position = nextPosition;
			opts.onUpdate?.(container, items[position]);
		}
	};

	// Get the next gallery position
	const getNextPosition = (index) => ((index % items.length) + items.length) % items.length;

	// Handle the keyboard events
	const onKeydown = (e) => {
		const {
			key,
			shiftKey,
			target
		} = e;
		if (!isGalleryKey(e, opts, container)) {
			return;
		}
		// The zoomed image pans with the arrows instead, a text field in an HTML item moves its caret, and a focused video or
		// audio item seeks
		const arrows = !zoomed && !target.isContentEditable && !/^(INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/.test(target.tagName);
		if (key === 'Escape') {
			!opts.persistent && close();
		} else if (key === 'ArrowRight' && arrows) {
			next();
		} else if (key === 'ArrowLeft' && arrows) {
			prev();
		} else if (key === ' ' && target === container) {
			// Space zooms an image in and out as a click does, and plays or pauses a video or audio. A focused control, such as
			// a button or a player, keeps its own Space action. The last player is the one of the active item while it slides in
			if (activeItem.type === 'image') {
				activeItem.zoom = !activeItem.zoom;
			} else if (activeItem.sources) {
				const media = [...container.querySelectorAll('video,audio')].pop();
				media.paused ? media.play() : media.pause();
			}
		} else if (key === 'Tab') {
			// Trap the focus on tab press
			const { activeElement } = document;

			// Allow browser to handle tab into video controls only
			if (shiftKey || !activeElement.controls) {
				e.preventDefault();
				const tabbable = [...(opts.focusWrap || container).querySelectorAll('*')].filter((node) => node.tabIndex >= 0);
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

	// The focus stays in the upper gallery. Tab moves it out of the controls of a video or audio, as the keydown handler
	// lets the browser move it into them
	const onFocusin = ({ target }) =>
		!closing && getUpperGallery() === container && !(opts.focusWrap || container).contains(target) && container.focus({ preventScroll: true });

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

		// An empty list is no sources, the player reads the first one
		if (!item.sources?.[0]) {
			delete item.sources;
		}

		// Data attributes pass the size as a string, also with a unit, such as "800px"
		item.width = parseFloat(item.width) || undefined;
		item.height = parseFloat(item.height) || undefined;

		// A copy too, the gallery writes the image src, srcset and sizes into it
		item.attr = { ...item.attr };

		let link = item.link = item.link || item.element?.href,
			type = item.type;

		if (item.sources) {
			item.type = type === 'audio' || /^audio/.test(item.sources[0].type) ? 'audio' : 'video';
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
			for (const { url, value } of parseSrcset(decodeSrcset(link))) {
				if (value > max) {
					max = value;
					link = url;
				}
			}
			return link;
		}

		return sources?.[0].src || '';

	};

	// The href of a link encodes the spaces of a srcset. Only these, other escapes such as %23 are part of the URL
	const decodeSrcset = (link) => (/\s/.test(link) ? link : link.replace(/%20/g, ' '));

	// The candidates of a srcset, also with no space after a comma, and with a density such as 1.5x. A comma inside a URL
	// stays in it
	const parseSrcset = (srcset) => Array.from(srcset.matchAll(/(?:^|,)\s*(\S+)\s+(\d*\.?\d+)([wx])/g), ([, url, value, type]) => ({
		url,
		value: +value,
		type
	}));

	// Parse the link and detect the content type
	const parseLink = (link, item) => {

		// Also matches the first candidate of a srcset, and a data URL of an image
		let match = link.match(/^data:image\/|\.(?:jpe?g|jfif|png|gif|bmp|webp|avif|svg|tiff|ico)(?:[?#]\S*)?(?:\s|$)/i);

		if (match) {
			item.type = 'image';
			return item;
		}

		// HTML5 video and audio, the first group holds a video extension. The source has no type: with one source, a type
		// only makes the browser skip a file that it can play, such as an H.264 .mov in Chrome
		match = link.match(/\.(?:(mp4|m4v|mpeg|mov|ogv|webm|avi|h264)|(mp3|wav|ogg|oga|m4a|aac|flac|opus|wma|weba|mid))([?#].*)?$/i);

		if (match) {
			item.type = match[1] ? 'video' : 'audio';
			item.sources = [{ src: link }];
			return item;
		}

		// YouTube Video, the host is matched from the start, so a link with youtube.com in its path or query is not one
		// The path is the video ID, or videoseries or none for a playlist, and its list goes with the other parameters
		match = link.match(/^https?:\/\/([\w-]+\.)*(?:youtube(-nocookie)?\.com|youtu\.be)\/(?:watch\?(?:.*&)?v=|v\/|u\/|shorts\/|live\/|embed\/?)?(videoseries(?=\?(?:.*&)?list=)|(?=\?listType=.*&list=)|([\w-]{11}))/i);

		if (match) {

			// The privacy-enhanced mode stays on the youtube-nocookie.com host
			let sourceURL = new URL(link),
				targetURL = new URL('https://www.youtube' + (match[2] || '') + '.com/embed/' + match[3] + '?autoplay=1&playsinline=1&controls=1&rel=0&enablejsapi=1');

			// Shorts are portrait, 9:16
			if (!item.width && /\/shorts\//.test(link)) {
				item.width = 1080;
				item.height = 1920;
			}

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

			// A playlist has no thumbnail of its own
			item.thumb = item.thumb || (match[4] && 'https://i.ytimg.com/vi/' + match[4] + '/mqdefault.jpg');

			return iframe(item, targetURL);

		}

		// Vimeo Video, also in a channel or a group. The hash after the ID or in h is the one of a private video
		match = link.match(/^https?:\/\/([\w-]+\.)*vimeo\.com\/(?:[^?#]*?\/)?(\d+)(?:(?:\/|\?h=)([\da-f]+))?/i);

		if (match) {

			let videoID = match[2],
				sourceURL = new URL(link),
				targetURL = new URL('https://player.vimeo.com/video/' + videoID + '?autoplay=1&playsinline=1');

			for (let [key, value] of sourceURL.searchParams) {
				targetURL.searchParams.set(key, value);
			}

			if (match[3]) {
				targetURL.searchParams.set('h', match[3]);
			} else {
				item.thumb = item.thumb || 'https://vumbnail.com/' + videoID + '.jpg';
			}

			if (sourceURL.hash.startsWith('#t=')) {
				targetURL.hash = sourceURL.hash;
			}

			return iframe(item, targetURL);

		}

		// SoundCloud Widget
		match = link.match(/^(https?:\/\/)?(www\.)?(m\.)?soundcloud\.com\/([a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+.*)$/);

		if (match) {

			return iframe(item, 'https://w.soundcloud.com/player/?auto_play=1&visual=1&hide_related=1&show_comments=0&url=' + encodeURIComponent(link));

		}

		// Google Drive, Dropbox, and PDF files
		match = link.match(/(drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+))|(dropbox\.com\/s\/)|(\.pdf($|\?|#))/i);

		if (match) {

			if (match[2]) {
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

			return iframe(item, item.link);

		}

		return false;

	};

	// Show an item in an iframe, with the link as a string
	const iframe = (item, link) => {
		item.type = 'iframe';
		item.link = link + '';
		return item;
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
			item.thumb = item.source = thumbElement;
			item.alt = item.alt || thumbElement.alt;
			setDimensions(item, thumbElement);
		} else if (thumbLink) {
			// The open does not load the thumbnails of all items, each loads once its item shows. Its ratio is the size of an
			// item without one, and the loading screen shows the same file
			item.thumb = {
				src: thumbLink,
				load() {
					this.load = null;
					const image = new Image();
					image.onload = () => setDimensions(item, image);
					image.src = thumbLink;
				}
			};
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

			const dimensions = calculateDimensions({ width: thumb.naturalWidth, height: thumb.naturalHeight });

			[item.width, item.height] = dimensions;
			item.scaled = 1;

			// The thumbnails of the other items load too, only the shown item changes the size on the screen
			if (item === activeItem) {
				activeDimensions = dimensions;
			}

		}

	};

	const readGap = () => (gap = parseInt(getComputedStyle(container).getPropertyValue('--bp-stage-gap')) || 0);

	// The content box of an element, a thumbnail is drawn inside its padding and border, and the object-fit of the element
	const contentBox = (node) => {
		const style = getComputedStyle(node);
		const edge = (side) => parseFloat(style['padding' + side]) + parseFloat(style['border' + side + 'Width']);
		const bounds = node.getBoundingClientRect();
		return {
			left: bounds.left + edge('Left'),
			top: bounds.top + edge('Top'),
			width: bounds.width - edge('Left') - edge('Right'),
			height: bounds.height - edge('Top') - edge('Bottom'),
			fit: style.objectFit
		};
	};

	// Calculate width and height to fit inside a container
	const calculateDimensions = (item) => {
		const { width = 1920, height = 1080 } = item;
		const size = item.imageSize || opts.imageSize || 'natural';
		// The largest enlargement of the image, a number from a data attribute is a string. Not a number fills the gallery
		const upscale = { fit: Infinity, natural: 1, page: 1 }[size] || +size;
		let ratio = (opts.scale ?? 1) * Math.min((containerWidth - 2 * gap) / width, (containerHeight - 2 * gap) / height);

		// Only an image of a known size is limited. A size from a thumbnail or the default is only a ratio, and fills the gallery
		if (item.type === 'image' && item.width && !item.scaled && ratio > upscale) {
			let page = 0;
			// Not smaller than the thumbnail on the page. A hidden thumbnail has a zero size, a removed one a NaN size, and
			// neither sets a lower limit
			if (size === 'page' && item.source) {
				const box = contentBox(item.source);
				page = Math[(item.fit || box.fit) === 'cover' ? 'max' : 'min'](box.width / width, box.height / height) || 0;
			}
			ratio = Math.min(ratio, Math.max(upscale, page));
		}

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

		let image = new Image(),
			src = decodeSrcset(item.link),
			factor = 1;

		const parts = parseSrcset(src);

		if (parts.length) {

			const width = calculateDimensions(item)[0];

			parts.sort((a, b) => a.value - b.value);

			// The first candidate sharp enough for the shown size and the screen density, the same one the browser
			// picks from the srcset and sizes of the shown image, so the file is loaded once
			const largest = parts.at(-1);
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
				// The size is real now, the imageSize limit applies
				item.scaled = 0;
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
		if (opts.zoom) {
			// The slide is centered in the stage, not in the screen. Its size is known: the gallery measures it on mount, and
			// the ruler observer keeps it
			const stage = ruler.getBoundingClientRect();

			// No HTML is shown in a stage with no size
			const content = activeItem.type === 'html' && node.querySelector('.bp-html')?.firstElementChild;
			const dimensions = content ? [content.clientWidth, content.clientHeight] : activeDimensions;

			// The content box of the trigger element, and the object-fit of the thumbnail
			const rect = contentBox(activeItem.source || focusTrigger);
			const fit = activeItem.fit || rect.fit;

			// A hidden or removed thumbnail, or an item with no size, has no scale to zoom from, the slide fades instead. A
			// removed one has a NaN size. The comparison stays a > 0: the unsafe_comps option of terser compiles !(a > 0) to
			// a <= 0, which is false for NaN
			if (Math.min(rect.width, rect.height, ...dimensions) > 0) {
				let scaleWidth = rect.width / dimensions[0];
				let scaleHeight = rect.height / dimensions[1];
				let css = '--bp-opacity:1';
				let crop = '';

				if (fit === 'cover') {
					scaleWidth = scaleHeight = Math.max(scaleHeight, scaleWidth);
					// Crop the item like the thumbnail: the slide shifts by the crop and clips, the crop inside it shifts back
					// twice as far and clips, and its content returns in place. Translates stay on the compositor, an animated
					// clip-path repaints every frame. The percents follow the slide when the stage gap comes back after the zoom
					css += `;--bp-crop-x:calc(50% - ${rect.width / scaleWidth / 2}px);--bp-crop-y:calc(50% - ${rect.height / scaleHeight / 2}px)`;
					crop = ' translate(var(--bp-crop-x),var(--bp-crop-y))';
					className += ' bp-clip';
				} else if (fit === 'contain') {
					scaleWidth = scaleHeight = Math.min(scaleHeight, scaleWidth);
				}

				// From the center of the stage to the center of the thumbnail
				const x = rect.left - stage.left - (containerWidth - rect.width) / 2;
				const y = rect.top - stage.top - (containerHeight - rect.height) / 2;
				return animate(node, className, `translate(${x}px,${y}px) scale(${scaleWidth},${scaleHeight})` + crop, css);
			}
		}

		animate(node, className, `translateY(${className ? -10 : 10}px)`);
	};

	// Animate the slides, the first one zooms in, the next ones slide in and out
	const slideActions = (node) => {
		if (slide) {
			animate(node, 'bp-nav', `translate(${movement > 0 ? 20 : -20}px)`);
		} else {
			// Deferred so the item is measured after the container action has shown the dialog and called onOpen. Not when
			// onOpen has closed the gallery, the outro is set then
			queueMicrotask(() => closing || zoom(node, ''));
		}
		slide = node;

		return {
			destroy() {
				// The next item and the next open are not zoomed. The image sets the value itself, an item of another type
				// would keep the value, and the gallery would read the gap of a zoomed one on open
				zoomed = 0;
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
		preloadNext,
		setDimensions,
		activeItem,
		loadImage,
		// A getter, the first item is made before the gallery element mounts
		get container() {
			return container;
		},
		setZoomed: (value) => (zoomed = value),
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
		// Set here for the reason of the attributes below, and before the measure, as the class sizes the stage
		node.classList.add('bp-wrap');

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
			node[inline ? 'show' : 'showModal']();
		}

		opts.onOpen?.(container, activeItem);

		// Don't use keyboard events for inline galleries
		if (!inline) {
			// In the capture phase, so the gallery gets the keys before the page
			window.addEventListener('keydown', onKeydown, true);
			window.addEventListener('focusin', onFocusin);
			// Keyboard and screen reader users start inside the gallery
			node.focus({ preventScroll: true });
			// The back button closes the gallery instead of leaving the page. The gallery of an open call made while closing
			// keeps the entry of the last one. Not when closed in the same tick as opened, the close has already passed its
			// history.back()
			if (opts.history && !closing) {
				if (!historyId) {
					historyUrl = location.href;
					history.pushState({ bp: (historyId = Math.random()) }, '');
				}
				window.addEventListener('popstate', onPopstate);
			}
		}

		return {
			destroy() {
				// Close the dialog properly to remove it from top layer. Before the focus goes back, the page is inert while
				// the modal dialog is open
				if (node.open) {
					node.close();
				}
				window.removeEventListener('keydown', onKeydown, true);
				window.removeEventListener('focusin', onFocusin);
				window.removeEventListener('popstate', onPopstate);
				focusTrigger?.focus({ preventScroll: true });
				closing = 0;
				slide = null;
				// The page stays locked while another gallery is open, the node of this one is removed already
				if (!getUpperGallery()) {
					html.classList.remove('bp-lock');
					if (pagePadding != null) {
						html.style.paddingRight = pagePadding;
						pagePadding = null;
					}
				}
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

			// Fit the active item to the new stage size
			const { width, height } = entries[0].contentRect;
			if (width !== containerWidth || height !== containerHeight) {
				containerWidth = width;
				containerHeight = height;
				// A zoomed gallery has no gap, the item keeps the one it fits in once zoomed out
				zoomed || readGap();
				activeDimensions = calculateDimensions(activeItem);
			}

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
		this={tag}
		use:containerActions
		class:bp-zoomed={zoomed}
		class:bp-inline={inline}
		class:bp-small={smallScreen}
		class:bp-noclose={opts.persistent}
		class:bp-closing={closing}
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
									<ImageItem props={getChildProps()} {closing} {smallScreen} {containerWidth} {containerHeight} {activeDimensions} />
								{:else if activeItem.sources || activeItem.type === 'iframe'}
									<Media props={getChildProps()} {closing} {activeDimensions} />
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
				<!-- A footer or attached caption takes its own space below the item. An attached one moves up to the item -->
				<div
					class="bp-caption"
					class:bp-footer={opts.captionPosition === 'footer'}
					class:bp-attached={opts.captionPosition === 'attached'}
					style:transform={opts.captionPosition === 'attached' ? `translateY(${(activeDimensions[1] - containerHeight) / 2}px)` : null}
				>
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