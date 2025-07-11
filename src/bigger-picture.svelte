<svelte:options accessors={true} immutable={true} />

<script>
	import { closing, defaultTweenOptions } from './stores';
	import { writable } from 'svelte/store'
	import { fly } from 'svelte/transition'
	import Thumbs from './components/thumbs.svelte'
	import ImageItem from './components/image.svelte'
	import Iframe from './components/iframe.svelte'
	import Video from './components/video.svelte'

	/** items currently displayed in gallery */
	export let items = undefined

	/** element the gallery is mounted within (passed during initialization)*/
	export let target = undefined

	const html = document.documentElement

	/** index of current active item */
	let position

	/** options passed via open method */
	let opts

	/** bool tracks open state */
	let isOpen

	/** dom element to restore focus to on close */
	let focusTrigger

	/** bool true if container width < 769 */
	let smallScreen

	/** bool value of inline option passed in open method */
	let inline

	/** when position is set */
	let movement

	/** stores target on pointerdown (ref for overlay close) */
	let clickedEl

	let hasThumbs

	let ruler
	let container
	let containerWidth;
	let containerHeight;

	/** active item object */
	let activeItem

	/** returns true if `activeItem` is html */
	const activeItemIsHtml = () => !activeItem.img && !activeItem.sources && !activeItem.iframe

	/** function set by child component to run when container resized */
	let resizeFunc

	/** used by child components to set resize function */
	const setResizeFunc = (fn) => (resizeFunc = fn)

	// /** true if image is currently zoomed past starting size */
	const zoomed = writable(0)

	$: if (items) {
		// update active item when position changes
		activeItem = items[position]
		if (isOpen) {
			// run onUpdate when items updated
			opts.onUpdate?.(container, activeItem)
		}
	}

	/** receives options and opens gallery */
	export const open = (options) => {
		opts = options
		inline = opts.inline
		// add class to hide scroll if not inline gallery
		if (!inline && html.scrollHeight > html.clientHeight) {
			html.classList.add('bp-lock')
		}

		hasThumbs = opts.thumbs && opts.items?.length > 1

		// update trigger element to restore focus
		focusTrigger = document.activeElement

		if (target) {
			container = target;
			containerWidth = target.offsetWidth
			containerHeight = target === document.body ? window.innerHeight : target.clientHeight
		}

		position = opts.position || 0
		// set items
		items = []
		for (let i = 0; i < (opts.items.length || 1); i++) {
			let item = opts.items[i] || opts.items
			if ('dataset' in item) {
				items.push({ element: item, i, ...item.dataset })
			} else {
				item.i = i
				items.push(item)
				// set item to element for position check below
				item = item.element
			}
			// override gallery position if needed
			if (opts.el && opts.el === item) {
				position = i
			}
		}

		items.forEach(normalizeItem);

	}

	/** closes gallery */
	export const close = () => {
		opts.onClose?.(container, activeItem)
		closing.set(true)
		items = null
		// restore focus to trigger element
		focusTrigger?.focus({ preventScroll: true })
	}

	/** previous gallery item */
	export const prev = () => setPosition(position - 1)

	/** next gallery item */
	export const next = () => setPosition(position + 1)

	/**
	 * go to specific item in gallery
	 * @param {number} index
	 */
	export const setPosition = (index) => {
		movement = index - position
		position = getNextPosition(index)
	}

	/**
	 * returns next gallery position (looped if neccessary)
	 * @param {number} index
	 */
	const getNextPosition = (index) => (index + items.length) % items.length

	const onKeydown = (e) => {
		const { key, shiftKey } = e
		if (key === 'Escape') {
			!opts.noClose && close()
		} else if (key === 'ArrowRight') {
			next()
		} else if (key === 'ArrowLeft') {
			prev()
		} else if (key === 'Tab') {
			// trap focus on tab press
			const { activeElement } = document
			// allow browser to handle tab into video controls only
			if (shiftKey || !activeElement.controls) {
				e.preventDefault()
				const { focusWrap = container } = opts
				const tabbable = [...focusWrap.querySelectorAll('*')].filter(
					(node) => node.tabIndex >= 0
				)
				let index = tabbable.indexOf(activeElement)
				index += tabbable.length + (shiftKey ? -1 : 1)
				tabbable[index % tabbable.length].focus()
			}
		}
	}

	/**
	 * Normalize a gallery item
	 *
	 * @param {Object} item
	 */
	const normalizeItem = (item) => {

		if (item.thumb instanceof HTMLImageElement) {

			setDimensions(item, item.thumb);

			item.fit = window.getComputedStyle(item.thumb).objectFit;
			item.thumb = item.thumb.src;

		} else {

			let thumbElement;

			if (item.element) {
				thumbElement = item.element.querySelector('img');
			}

			if (thumbElement && !item.fit) {
				item.fit = window.getComputedStyle(thumbElement).objectFit;
			}

			if (thumbElement && (!item.thumb || item.thumb === thumbElement.src)) {
				setDimensions(item, thumbElement);
				item.thumb = thumbElement.src;
			} else if (item.thumb) {
				thumbElement = new Image();
				thumbElement.src = item.thumb;
				thumbElement.onload = () => {
					setDimensions(item, thumbElement);
				};
			}

		}

	}

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
				height: thumb.naturalHeight,
			});

			item.width = dimensions[0];
			item.height = dimensions[1];
			item.scaled = 1;

		}

	};

	/**
	 * Calculate width and height to fit inside a container
	 *
	 * @param {object} item object with height / width properties
	 * @returns {Array} [width: number, height: number]
	 */
	const calculateDimensions = ({ width = 1920, height = 1080 }) => {
		const { scale = 1 } = opts
		const ratio = Math.min(
			(containerWidth / width) * scale,
			(containerHeight / height) * scale
		)
		// round number so we don't use a float as the sizes attribute
		return [Math.round(width * ratio), Math.round(height * ratio)]
	}

	/** preloads images for previous and next items in gallery */
	const preloadNext = () => {
		if (items) {
			const nextItem = items[getNextPosition(position + 1)]
			const prevItem = items[getNextPosition(position - 1)]
			!nextItem.preload && loadImage(nextItem)
			!prevItem.preload && loadImage(prevItem)
		}
	}

	/**
	 * Load and decode the image for an item
	 *
	 * @param {Object} item
	 */
	const loadImage = (item) => {

		if (item.img) {

			const image = document.createElement('img')
			const src = decodeURIComponent(item.img);

			if (/\s+\d+[wx]/.test(src)) {
				image.sizes = opts.sizes || `${calculateDimensions(item)[0]}px`
				image.srcset = src
				item.attr = {
					sizes: image.sizes,
					srcset: image.srcset,
					...item.attr
				}
			} else {
				image.src = src;
				item.attr = {
					src: src,
					...item.attr
				}
			}

			image.preload = true

			return image.decode().then(() => {
				if (item.scaled && image.naturalWidth > 0 && image.naturalHeight > 0) {
					item.width = image.naturalWidth;
					item.height = image.naturalHeight;
				}
			}).catch((error) => {})

		}
	}

	/** svelte transition to control opening / changing */
	const mediaTransition = (node, isEntering) => {
		if (!isOpen || !items) {
			// entrance / exit transition
			isOpen = isEntering
			return opts.intro
				? fly(node, { y: isEntering ? 10 : -10 })
				: scaleIn(node)
		}
		// forward / backward transition
		return fly(node, {
			...defaultTweenOptions(250),
			x: (movement > 0 ? 20 : -20) * (isEntering ? 1 : -1)
		})
	}

	/** custom svelte transition for entrance zoom */
	const scaleIn = (node) => {
		let dimensions
		let css

		/**
		 * Update the container dimensions before triggering an animation
		 */
		if (ruler) {
			containerWidth = ruler.clientWidth;
			containerHeight = ruler.clientHeight;
		}

		let gap = container ? parseInt(window.getComputedStyle(container).getPropertyValue('--bp-stage-gap')) : 0;

		if (isNaN(gap)) {
			gap = 0;
		}

		if (activeItemIsHtml()) {
			const bpItem = node.firstChild.firstChild
			dimensions = [bpItem.clientWidth, bpItem.clientHeight]
		} else {
			dimensions = calculateDimensions(activeItem)
		}

		// rect is bounding rect of trigger element
		const rect = (activeItem.element || focusTrigger).getBoundingClientRect()
		const leftOffset = rect.left - gap - (containerWidth - rect.width) / 2
		const centerTop = rect.top - gap - (containerHeight - rect.height) / 2
		const scaleWidth = rect.width / dimensions[0]
		const scaleHeight = rect.height / dimensions[1]

		if (activeItem.fit === 'cover') {
			const scale = Math.max(scaleHeight, scaleWidth),
				offsetVertical = Math.max((dimensions[1] - rect.height / scale) / 2, 0),
				offsetHorizontal = Math.max((dimensions[0] - rect.width / scale) / 2, 0);
			css = (t, u) => {
				return `transform: translate3d(${leftOffset * u}px, ${centerTop * u}px, 0) scale3d(${scale + t * (1 - scale)}, ${scale + t * (1 - scale)}, 1);
				--bp-clip-y: ${offsetVertical * u}px;
				--bp-clip-x: ${offsetHorizontal * u}px;`
			}
		} else if (activeItem.fit === 'contain') {
			const scale = Math.min(scaleHeight, scaleWidth);
			css = (t, u) => {
				return `transform: translate3d(${leftOffset * u}px, ${centerTop * u}px, 0) scale3d(${scale + t * (1 - scale)}, ${scale + t * (1 - scale)}, 1);`
			}
		} else {
			css = (t, u) => {
				return `transform: translate3d(${leftOffset * u}px, ${centerTop * u}px, 0) scale3d(${scaleWidth + t * (1 - scaleWidth)}, ${scaleHeight + t * (1 - scaleHeight)}, 1);`
			};
		}

		return {
			...defaultTweenOptions(500),
			css: css
		}
	}

	/** provides object w/ needed funcs / data to child components  */
	const getChildProps = () => ({
		activeItem,
		calculateDimensions,
		loadImage,
		preloadNext,
		opts,
		prev,
		next,
		close,
		setResizeFunc,
		zoomed,
		container,
		containerWidth,
		containerHeight
	})

	/**
	 * Process the gallery mount and destroy
	 */
	const containerActions = (node) => {
		container = node
		opts.onOpen?.(container, activeItem)
		// don't use keyboard events for inline galleries
		if (!inline) {
			window.addEventListener('keydown', onKeydown)
		}
		containerObserver.observe(node)
		return {
			destroy() {
				containerObserver.disconnect()
				window.removeEventListener('keydown', onKeydown)
				closing.set(false)
				// remove class hiding scroll
				html.classList.remove('bp-lock')
				opts.onClosed?.()
			},
		}
	}

	$: smallScreen = containerWidth < 769

	/**
	 * Set up the resize observer for the container node
	 */
	const containerObserver = new ResizeObserver((entries) => {
		// run child component resize function
		if (!activeItemIsHtml()) {
			resizeFunc?.()
		}
		// run user defined onResize function
		opts.onResize?.(container, activeItem)
	})

	/**
	 * Ruler is required to measure available width and height
	 */
	const rulerActions = (node) => {

		ruler = node

		const rulerObserver = new ResizeObserver((entries) => {
			containerWidth = entries[0].contentRect.width
			containerHeight = entries[0].contentRect.height
		});

		rulerObserver.observe(node)

		return {
			destroy() {
				rulerObserver.disconnect()
			},
		}

	}

</script>

{#if items}
	<div
		use:containerActions
		class="bp-wrap"
		class:bp-zoomed={$zoomed}
		class:bp-inline={inline}
		class:bp-small={smallScreen}
		class:bp-noclose={opts.noClose}
	>
		<div class="bp-overlay" out:fly|local={defaultTweenOptions(500)} />
		<div class="bp-stage">
			{#key activeItem.i}
				<div class="bp-slide">
					<div
						class="bp-inner"
						in:mediaTransition|global={true}
						out:mediaTransition|global={false}
						on:pointerdown={(e) => (clickedEl = e.target)}
						on:pointerup={function (e) {
						// only close if left click on self and not dragged
						if (e.button !== 2 && e.target === this && clickedEl === this) {
							!opts.noClose && close()
						}
					}}
					>
						{#if containerWidth > 0 && containerHeight > 0}
							{#if activeItem.img}
								<ImageItem props={getChildProps()} {smallScreen} />
							{:else if activeItem.sources}
								<Video props={getChildProps()} />
							{:else if activeItem.iframe}
								<Iframe props={getChildProps()} />
							{:else}
								<div class="bp-html">
									{@html activeItem.html ?? activeItem.element.outerHTML}
								</div>
							{/if}
						{/if}
						<div class="bp-ruler" use:rulerActions></div>
					</div>
					{#if activeItem.caption}
						<div class="bp-cap" out:fly|global={defaultTweenOptions(250)}>
							{@html activeItem.caption}
						</div>
					{/if}
				</div>
			{/key}
		</div>
		<div class="bp-controls" out:fly|local>
			<!-- close button -->
			<button class="bp-x" title="Close" aria-label="Close" on:click={close} />

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
				/>
				<button
					class="bp-next"
					title="Next"
					aria-label="Next"
					on:click={next}
				/>
			{/if}
		</div>
		{#if hasThumbs}
			<Thumbs {position} {setPosition} {items} />
		{/if}
	</div>
{/if}