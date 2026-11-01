<svelte:options accessors={true} />

<script>
	import { writable } from 'svelte/store';
	import Thumbs from './components/thumbs.svelte';
	import ImageItem from './components/image.svelte';
	import Iframe from './components/iframe.svelte';
	import Video from './components/video.svelte';

	/**
	 * Items in the gallery
	 */
	export let items = undefined;

	/** element the gallery is mounted within (passed during initialization)*/
	export let target = undefined;

	/** usage of HTML dialog element and showModal method */
	export let dialog = false;

	const html = document.documentElement;

	/** index of current active item */
	let position = 0;

	/** options passed via open method */
	let opts;

	/** bool tracks open state */
	let isOpen;

	/** dom element to restore focus to on close */
	let focusTrigger;

	/** bool true if container width < 769 */
	let smallScreen;

	/** bool value of inline option passed in open method */
	let inline;

	/** when position is set */
	let movement;

	/** stores target on pointerdown (ref for overlay close) */
	let clickedEl;

	/** slide of the active item */
	let slide;

	let ruler;
	let container;
	let containerWidth;
	let containerHeight;

	/** active item object */
	let activeItem = null;
	let activeDimensions;

	// /** true if image is currently zoomed past starting size */
	const zoomed = writable(0);

	/** true while this gallery runs its outro, other galleries on the page keep their own */
	const closing = writable(0);

	/**
	 * Update the active item and dimensions on position change
	 */
	$: if (items && items[position]) {
		activeItem = items[position];
		activeDimensions = calculateDimensions(activeItem);
	}

	/** true while the gallery runs its outro animation */
	let isClosing;

	/** options of an open call made while closing, applied once the gallery is removed */
	let pendingOptions;

	/** receives options and opens gallery */
	export const open = (options) => {
		if (isClosing) {
			pendingOptions = options;
			return;
		}

		opts = options;
		inline = opts.inline;

		/**
		 * Update trigger element to restore focus
		 */
		focusTrigger = document.activeElement;

		if (target) {
			container = target;
			containerWidth = target.offsetWidth;
			containerHeight = target === document.body ? window.innerHeight : target.clientHeight;
		}

		position = 0;

		/**
		 * Set the gallery items
		 */
		const list = [];

		if (opts.items instanceof HTMLElement) {
			opts.items = [opts.items];
		} else {
			opts.items = Array.from(opts.items);
		}

		opts.items.forEach((item, i) => {

			item = prepareItem(item);

			if (typeof item !== 'object') {
				return;
			}

			// index in the filtered list, used for position and thumbnails
			item.i = list.length;

			if (opts.el ? opts.el === item.element : i === opts.position) {
				position = item.i;
			}

			list.push(item);

		});

		// nothing to show, e.g. every item was filtered out
		if (!list.length) {
			return;
		}

		/**
		 * Lock the scroll unless gallery is inline
		 */
		if (!inline && html.scrollHeight > html.clientHeight) {
			const style = getComputedStyle(html);
			const scrollbar = innerWidth - html.clientWidth;
			// padding takes the place of the hidden scrollbar, toggling scrollbar-gutter instead restyles the whole page
			if (scrollbar && style.scrollbarGutter === 'auto') {
				html.style.paddingRight = parseFloat(style.paddingRight) + scrollbar + 'px';
			}
			html.classList.add('bp-lock');
		}

		items = list;

	};

	/**
	 * Close the gallery
	 */
	export const close = () => {
		if (!items || isClosing) {
			return;
		}
		isClosing = true;
		opts.onClose?.(container, activeItem);
		closing.set(true);
		window.removeEventListener('keydown', onKeydown);
		// no slide yet when closed in the same tick as opened
		slide && zoom(slide, 'bp-out');

		// remove the gallery once the slide has finished its outro
		afterAnimations(slide, () => {
			items = null;
			focusTrigger?.focus({ preventScroll: true });
		});
	};

	/**
	 * Run a callback once the animations of a node are finished, right away if it has none
	 *
	 * @param {HTMLElement} node
	 * @param {Function} callback
	 */
	const afterAnimations = (node, callback) => Promise.all(node?.getAnimations().map((animation) => animation.finished) || []).finally(callback);

	/**
	 * Switch to the previous item
	 */
	export const prev = () => setPosition(position - 1);

	/**
	 * Switch to the next item
	 */
	export const next = () => setPosition(position + 1);

	/**
	 * Jump to a specific position
	 *
	 * @param {number} index
	 */
	export const setPosition = (index) => {
		const nextPosition = getNextPosition(index);
		movement = index - position;
		if (nextPosition !== position) {
			position = nextPosition;
			opts.onUpdate?.(container, items[position]);
		}
	};

	/**
	 * Get the next gallery position
	 *
	 * @param {number} index
	 */
	const getNextPosition = (index) => (index + items.length) % items.length;

	/**
	 * Handle the keyboard events
	 *
	 * @param e
	 *
	 * @returns {Object|false}
	 */
	const onKeydown = (e) => {
		const {
			key,
			shiftKey
		} = e;
		if (key === 'Escape') {
			!opts.noClose && close();
		} else if (key === 'ArrowRight' && !$zoomed) {
			// the zoomed image pans with the arrows instead
			next();
		} else if (key === 'ArrowLeft' && !$zoomed) {
			prev();
		} else if (key === 'Tab') {
			/**
			 * Trap the focus on tab press
			 */
			const { activeElement } = document;

			/**
			 * Allow browser to handle tab into video controls only
			 */
			if (shiftKey || !activeElement.controls) {
				e.preventDefault();
				const { focusWrap = container } = opts;
				const tabbable = [...focusWrap.querySelectorAll('*')].filter((node) => node.tabIndex >= 0);
				let index = tabbable.indexOf(activeElement);
				index += tabbable.length + (shiftKey ? -1 : 1);
				tabbable[index % tabbable.length].focus();
			}
		}
	};

	/**
	 * Normalize a gallery item
	 *
	 * @param {Object} item
	 */
	const prepareItem = (item) => {

		// work on a copy, the gallery adds its own fields and the caller's objects stay as they are
		item = item instanceof HTMLElement ? { element: item, ...item.dataset } : { ...item };

		// data attributes pass these as JSON
		['sources', 'tracks', 'attr'].forEach(key => {
			if (typeof item[key] === 'string') {
				item[key] = JSON.parse(item[key]);
			}
		});

		// a copy too, the gallery writes the image src, srcset and sizes into it
		item.attr = { ...item.attr };

		let link = item.link = item.link || item.element?.href,
			type = item.type;

		if (item.sources) {
			item.type = type === 'audio' || /^audio/.test(item.sources[0]?.type) ? 'audio' : 'video';
		} else if (item.html != null) {
			item.type = 'html';
		} else if (!link) {
			return false;
		} else if (type === 'video' || type === 'audio') {
			// a set type shows the link as it is, without detection
			item.sources = [{ src: link }];
		} else if (type !== 'image' && type !== 'iframe' && !parseLink(link, item)) {
			return false;
		}

		if (opts.types && opts.types.indexOf(item.type) === -1) {
			return false;
		} else {
			return parseThumbnail(item);
		}

	};

	/**
	 * Parse the link and detect the content type
	 *
	 * @param {string} link
	 * @param {Object} item
	 *
	 * @returns {Object|false} the item, or false for a link of an unknown type
	 */
	const parseLink = (link, item) => {

		// also matches the first candidate of a srcset
		let match = link.match(/\.(?:jpe?g|png|gif|bmp|webp|avif|svg|tiff|ico)(?:[\?#]\S*)?(?:\s|$)/i);

		if (match) {
			item.type = 'image';
			return item;
		}

		/**
		 * HTML5 Video
		 */
		match = link.match(/\.(mp4|mpeg|mov|ogv|webm|avi|h264)((\?|#).*)?$/i);

		if (match) {

			item.type = 'video';

			let ext = match[1].toLowerCase();
			let mimeMap = {
				ogv: 'ogg',
				mov: 'quicktime',
				avi: 'x-msvideo'
			};

			item.sources = [
				{
					'src': link,
					'type': 'video/' + (mimeMap[ext] || ext)
				}
			];

			return item;

		}

		/**
		 * HTML5 Audio
		 */
		match = link.match(/\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|wma|weba|mid)((\?|#).*)?$/i);

		if (match) {
			let ext = match[1].toLowerCase();
			let mimeMap = {
				mp3: 'mpeg',
				m4a: 'mp4',
				oga: 'ogg',
				opus: 'ogg',
				mid: 'midi',
				weba: 'webm'
			};
			item.type = 'audio';
			item.sources = [
				{
					src: link,
					type: 'audio/' + (mimeMap[ext] || ext)
				}
			];
			return item;
		}

		/**
		 * YouTube Video
		 */
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
			item.preview = 'https://i.ytimg.com/vi/' + videoID + '/mqdefault.jpg';

			return item;

		}

		/**
		 * Vimeo Video
		 */
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
				item.preview = 'https://vumbnail.com/' + videoID + '.jpg';
			}

			if (sourceURL.hash && sourceURL.hash.startsWith('#t=')) {
				targetURL.hash = sourceURL.hash;
			}

			item.type = 'iframe';
			item.link = targetURL.toString();

			return item;

		}

		/**
		 * SoundCloud Widget
		 */
		match = link.match(/^(https?:\/\/)?(www\.)?(m\.)?soundcloud\.com\/([a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+.*)$/);

		if (match) {

			let targetURL = new URL('https://w.soundcloud.com/player/?auto_play=1&visual=1&hide_related=1&show_comments=0');

			targetURL.searchParams.set('url', link);

			item.type = 'iframe';
			item.link = targetURL.toString();

			return item;

		}

		/**
		 * Google Drive, Dropbox, and PDF files
		 */
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

	/**
	 * Parse a thumbnail, update dimensions, and the fit option
	 *
	 * @param {Object} item
	 */
	const parseThumbnail = (item) => {

		let thumbLink = '',
			thumbElement = false;

		if (item.element) {
			thumbElement = item.element.querySelector('img');
		}

		if (item.type === 'image') {
			thumbLink = item.element?.href || '';
		}

		if (item.thumb instanceof HTMLImageElement) {
			thumbElement = item.thumb;
		} else if (item.thumb) {
			thumbLink = item.thumb;
		} else if (item.preview) {
			thumbLink = item.preview;
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

	/**
	 * Set item dimensions based on a thumbnail image if not already specified
	 *
	 * @param {Object} item Gallery item object to check and update
	 * @param {HTMLImageElement} thumb Thumbnail image element to extract dimensions from
	 */
	const setDimensions = (item, thumb) => {

		if (thumb instanceof HTMLImageElement && (!item.width || !item.height)) {

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

	/**
	 * Calculate width and height to fit inside a container
	 *
	 * @param {object} item object with height / width properties
	 * @returns {Array} [width: number, height: number]
	 */
	const calculateDimensions = ({
		width = 1920,
		height = 1080
	}) => {
		const activeGap = container ? parseInt(window.getComputedStyle(container).getPropertyValue('--bp-stage-gap')) : 0;
		const { scale = 1 } = opts;
		const ratio = Math.min(((containerWidth - 2 * activeGap) / width) * scale, ((containerHeight - 2 * activeGap) / height) * scale);
		// round number so we don't use a float as the sizes attribute
		return [Math.round(width * ratio), Math.round(height * ratio)];
	};

	/** preloads images for previous and next items in gallery */
	const preloadNext = () => {
		if (items) {
			const nextItem = items[getNextPosition(position + 1)];
			const prevItem = items[getNextPosition(position - 1)];
			!nextItem.preload && loadImage(nextItem);
			!prevItem.preload && loadImage(prevItem);
		}
	};

	/**
	 * Load and decode the image for an item
	 *
	 * @param {Object} item
	 */
	const loadImage = (item) => {

		if (item.type === 'image') {

			let image = document.createElement('img'),
				src = decodeURIComponent(item.link),
				srcset = '';

			if (/\s+\d+[wx]/.test(src)) {

				let match = '',
					parts = Array.from(src.matchAll(/(\S+)\s+(\d+)([wx])/gi), match => ({
						url: match[1],
						value: parseInt(match[2]),
						type: match[3]
					}));

				srcset = src;

				if (parts.length > 1) {
					if (parts[0].type === 'w') {
						parts.sort((a, b) => a.value - b.value);
						match = parts.find(c => c.value >= containerWidth) || parts[parts.length - 1];
					} else {
						let dpr = window.devicePixelRatio || 1;
						match = parts.find(c => c.value >= dpr) || parts[parts.length - 1];
					}
				}

				if (!match && parts[0]) {
					match = parts[0];
				}

				if (match && match.url) {
					image.src = match.url;
					item.attr.src = match.url;
				} else {
					image.srcset = srcset;
				}

				image.sizes = item.sizes || opts.sizes || `${calculateDimensions(item)[0]}px`;
				item.attr.sizes = image.sizes;
				item.attr.srcset = srcset;

			} else {
				image.src = src;
				item.attr.src = src;
			}

			image.preload = true;

			return image.decode().then(() => {

				if (item.scaled && image.naturalWidth > 0 && image.naturalHeight > 0) {
					item.width = image.naturalWidth;
					item.height = image.naturalHeight;
				}

				/**
				 * It's important to set srcset after we read the image dimensions
				 */
				if (image.src && srcset) {
					image.srcset = srcset;
				}

			}).catch((error) => {
			});

		}
	};

	/**
	 * Set the state a slide animates from or to, the CSS animations of the classes do the rest
	 *
	 * @param {HTMLElement} node
	 * @param {string} className
	 * @param {string} transform
	 * @param {string} css
	 */
	const animate = (node, className, transform, css = '--bp-opacity:0') => {
		node.className = 'bp-slide ' + className;
		node.style.cssText = `--bp-transform:${transform};${css}`;
	};

	/**
	 * Zoom the slide out of the thumbnail on open and back into it on close,
	 * or fade it up with the intro option
	 *
	 * @param {HTMLElement} node
	 * @param {string} className bp-out for the outro
	 */
	const zoom = (node, className) => {
		if (opts.intro) {
			return animate(node, className, `translateY(${className ? -10 : 10}px)`);
		}

		let dimensions;

		/**
		 * Update the container dimensions before triggering an animation
		 */
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

		// rect is the content box of the trigger element, the image is drawn inside its padding and border
		const source = activeItem.source || activeItem.element || focusTrigger;
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
			// crop the item like the thumbnail
			css += `;--bp-clip-y:${Math.max((dimensions[1] - rect.height / scaleHeight) / 2, 0)}px;--bp-clip-x:${Math.max((dimensions[0] - rect.width / scaleWidth) / 2, 0)}px`;
			className += ' bp-clip';
		} else if (activeItem.fit === 'contain') {
			scaleWidth = scaleHeight = Math.min(scaleHeight, scaleWidth);
		}

		animate(node, className, `translate(${leftOffset}px,${centerTop}px) scale(${scaleWidth},${scaleHeight})`, css);
	};

	/**
	 * Animate the slides, the first one zooms in, the next ones slide in and out
	 */
	const slideActions = (node) => {
		slide = node;

		if (isOpen) {
			animate(node, 'bp-nav', `translate(${movement > 0 ? 20 : -20}px)`);
		} else {
			isOpen = true;
			// deferred so the item is measured after the container action has shown the dialog and called onOpen
			queueMicrotask(() => zoom(node, ''));
		}

		return {
			destroy() {
				// the items are removed on close, the slide leaves with the gallery then
				if (items) {
					// Svelte has removed the previous slide, put it back under the new one until it slides out
					animate(node, 'bp-nav bp-out', `translate(${movement > 0 ? -20 : 20}px)`);
					ruler.parentNode.prepend(node);
					afterAnimations(node, () => node.remove());
				}
			}
		};
	};

	/** provides object w/ needed funcs / data to child components  */
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

	/**
	 * Process the gallery mount and destroy
	 */
	const containerActions = (node) => {
		container = node;

		// Use the top layer API for proper modal behavior
		if (dialog) {
			// keep the dialog open on Escape, the keydown handler closes it with the outro animation
			node.oncancel = (e) => e.preventDefault();
			if (!inline) {
				node.showModal();
			} else {
				node.show();
			}
		}

		opts.onOpen?.(container, activeItem);

		// don't use keyboard events for inline galleries
		if (!inline) {
			window.addEventListener('keydown', onKeydown);
		}

		return {
			destroy() {
				// Close the dialog properly to remove it from top layer
				if (node.open) {
					node.close();
				}
				window.removeEventListener('keydown', onKeydown);
				closing.set(false);
				isOpen = false;
				isClosing = false;
				// remove class hiding scroll
				html.classList.remove('bp-lock');
				html.style.paddingRight = '';
				opts.onClosed?.();
				if (pendingOptions) {
					open(pendingOptions);
					pendingOptions = null;
				}
			}
		};
	};

	$: smallScreen = containerWidth < 769;

	/**
	 * Ruler is required to get accurate dimensions and handle container resize
	 */
	const rulerActions = (node) => {

		ruler = node;

		const rulerObserver = new ResizeObserver((entries) => {

			const rect = entries[0].contentRect;

			if (rect.width !== containerWidth || rect.height !== containerHeight) {
				containerWidth = rect.width;
				containerHeight = rect.height;
				activeDimensions = calculateDimensions(activeItem);
			}

			/**
			 * Run the user-defined resize function
			 */
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
		class:bp-noclose={opts.noClose}
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
						// only close if left click on self and not dragged
						if (e.button !== 2 && e.target === this && clickedEl === this) {
							!opts.noClose && close()
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
			<!-- close button -->
			<button class="bp-x" title="Close" aria-label="Close" on:click={close}></button>

			{#if items.length > 1}
				<!-- counter -->
				<div class="bp-count">
					{@html `${position + 1} / ${items.length}`}
				</div>
				<!-- forward / back buttons -->
				<button
					class="bp-prev"
					title="Previous"
					aria-label="Previous"
					on:click={prev}
				></button>
				<button
					class="bp-next"
					title="Next"
					aria-label="Next"
					on:click={next}
				></button>
			{/if}
		</div>
		{#if opts.thumbs && items.length > 1}
			<Thumbs {position} {setPosition} {items} />
		{/if}
	</svelte:element>
{/if}