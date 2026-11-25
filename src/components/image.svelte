<script>
	import { addAttributes, getThumbBackground, isGalleryKey } from '../utils';

	import Loading from './loading.svelte';

	export let props;
	export let smallScreen;
	export let containerWidth;
	export let containerHeight;
	export let activeDimensions;

	// True while the gallery runs its outro
	export let closing;

	const { activeItem, opts, prev, next } = props;

	const maxZoom = activeItem.maxZoom || opts.maxZoom || 10;

	// The largest zoomed width, the sizes attribute is at least the shown width
	let sizes = 0;

	// Tracks load state of image, shown is true once the img is decoded, then the thumbnail under it goes, so it can't
	// show through a transparent image
	let loaded, showLoader, shown;
	const show = () => (shown = true);

	// Stores pinch info if multiple touch events active
	let pinchDetails;

	// Image html element (.bp-img)
	let bpImg;

	// Track distance for pinch events. Not zero during a pinch, which scales the image with no transition, as a drag moves it
	let prevDiff = 0;

	let pointerDown, hasDragged;

	// The pointerdown event and the translate of the image at the start of the drag
	let dragStart, dragStartTranslate;

	// If true, adds class to .bp-wrap to avoid image cropping
	let closingWhileZoomed;

	// Zero until the size is known, so a zoom before the load does nothing
	let naturalWidth = activeItem.width || 0;

	// Store positions for drag inertia
	const dragPositions = [];

	// Cache pointer events to handle pinch
	const pointerCache = new Map();

	// Zoom level of the image, 1 is the starting size, a CSS transition animates it
	let scale = 1;

	// Translate of the zoomed image, animated with the scale
	let translate = [0, 0];

	// Fit the zoom to a new stage size. Small screens keep the zoom, e.g. on a turn of the phone, and only bring the image
	// back into its bounds. A function, so the statement doesn't run again on each translate change. Before the zoomed
	// statement below, which must see the scale this sets
	const fitZoom = () => {
		if (opts.inline || !smallScreen) {
			reset();
		} else {
			translate = boundTranslateValues(translate);
		}
	};

	// Back to the starting size, in the center
	const reset = () => {
		scale = 1;
		translate = [0, 0];
	};

	$: activeDimensions, fitZoom();

	// True if the image is zoomed past its starting size, the gallery gets it too
	$: zoomed = activeDimensions[0] * (scale - 1) > 10;
	$: props.setZoomed(zoomed);

	// If zoomed while closing, zoom out image and add class
	// to change contain value on .bp-wrap to avoid cropping
	$: if (closing && scale !== 1 && opts.zoom) {
		reset();
		closingWhileZoomed = true;
	}

	// A value between -max and max, or 0 when the image is smaller than the stage on that axis
	const clamp = (value, max) => (max < 0 ? 0 : Math.max(-max, Math.min(value, max)));

	// Calculate translate position with bounds
	const boundTranslateValues = ([x, y], newScale = scale) => {
		const maxX = (activeDimensions[0] * newScale - containerWidth) / 2,
			edge = clamp(x, maxX);
		// On a small screen, a drag goes a little past the edge, and more than 20px past it goes to the previous or the next
		// item. Setting pointerDown to undefined stops pointermove from running again
		if (smallScreen && maxX >= 0 && x !== edge) {
			x = pointerDown ? edge + (x - edge) / 10 : edge;
			if (Math.abs(x - edge) > 20) {
				pointerDown = x > edge ? prev() : next();
			}
		} else {
			x = edge;
		}
		return [x, clamp(y, (activeDimensions[1] * newScale - containerHeight) / 2)];
	};

	// Updates zoom level in or out based on amt value
	function changeZoom(amt = maxZoom, e) {
		if (closing) {
			return;
		}

		let newScale = scale + scale * amt;

		if (amt > 0) {
			// Not larger than the max zoom and the natural size, and never smaller, an image that fills
			// the screen past its natural size stays at its scale
			newScale = Math.max(scale, Math.min(newScale, maxZoom, naturalWidth / activeDimensions[0]));
		} else if (newScale < 1) {
			// If requesting image smaller than starting size
			return reset();
		}

		let x = 0,
			y = 0;

		if (e) {
			// Distance clicked from center of image
			const { left, top, width, height } = bpImg.parentNode.getBoundingClientRect();
			x = e.clientX - left - width / 2 - translate[0];
			y = e.clientY - top - height / 2 - translate[1];
		}

		// Keep the clicked point in place
		const ratio = 1 - newScale / scale;

		// Update sizes property, the browser loads a larger source if there is one
		sizes = Math.round(Math.max(sizes, activeDimensions[0] * newScale));
		translate = boundTranslateValues([translate[0] + x * ratio, translate[1] + y * ratio], newScale);
		scale = newScale;
	}

	// Allow zoom to be read / set externally
	Object.defineProperty(activeItem, 'zoom', {
		configurable: true,
		get: () => zoomed,
		set: (bool) => changeZoom(bool ? maxZoom : -maxZoom),
	})

	// Zoom with + and -, and pan the zoomed image with the arrows, the gallery handles the other keys
	const onKeydown = (e) => {
		// Zoom out by the same factor, 1.5x in and 1 / 1.5x out
		const zoom = { '+': 0.5, '=': 0.5, '-': -1 / 3 }[e.key];
		const pan = { ArrowLeft: [100, 0], ArrowRight: [-100, 0], ArrowUp: [0, 100], ArrowDown: [0, -100] }[e.key];
		if (opts.inline || closing || !isGalleryKey(e, opts, props.container)) {
			return;
		}
		if (zoom) {
			changeZoom(zoom);
		} else if (pan && zoomed) {
			e.preventDefault();
			// Starts from the target, so held keys keep panning while the transition runs
			translate = boundTranslateValues([translate[0] + pan[0], translate[1] + pan[1]]);
		} else {
			return;
		}
		e.stopPropagation();
	};

	// The wheel scrolls the page past an inline image that is not zoomed. A wheel listener makes the browser wait for it
	// before it scrolls, so there is none then
	$: if (bpImg) bpImg.parentNode.onwheel = zoomed || !opts.inline ? onWheel : null;

	const onWheel = (e) => {
		// Zoom instead of scrolling the page
		e.preventDefault();
		changeZoom(e.deltaY / -300, e);
	};

	// On drag start, store initial position and image translate values
	const onPointerDown = (e) => {
		// Don't run if right click
		if (e.button !== 2) {
			e.preventDefault();
			if (e.isPrimary) {
				// A new gesture drops the state of the last one, which can end without a pointerup, e.g. under a context
				// menu, or with an early return in onPointerUp after a swipe or a pinch
				pointerCache.clear();
				pinchDetails = null;
				prevDiff = 0;
				hasDragged = false;
				dragPositions.length = 0;
			}
			if (zoomed) {
				// Stop the transition where it is, the drag moves the image without one
				const img = bpImg.getBoundingClientRect();
				const wrap = bpImg.parentNode.getBoundingClientRect();
				scale = img.width / activeDimensions[0];
				translate = [img.left + img.width / 2 - wrap.left - wrap.width / 2, img.top + img.height / 2 - wrap.top - wrap.height / 2];
			}
			pointerDown = true;
			pointerCache.set(e.pointerId, e);
			dragStart = e;
			dragStartTranslate = translate;
		}
	};

	// On drag, update image translate val
	const onPointerMove = (e) => {
		if (pointerCache.size > 1) {
			// Two pointers pinch
			pointerDown = false;
			const { noPinch } = opts;
			if (typeof noPinch == 'function' ? noPinch(props.container) : noPinch) {
				return;
			}

			// Update event in cache and get values
			const [p1, p2] = pointerCache.set(e.pointerId, e).values();

			// The distance between the two pointers
			const curDiff = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);

			// Cache the original pinch center
			pinchDetails = pinchDetails || {
				clientX: (p1.clientX + p2.clientX) / 2, clientY: (p1.clientY + p2.clientY) / 2
			};

			// Scale image
			changeZoom(((prevDiff || curDiff) - curDiff) / -35, pinchDetails);

			// Cache the distance for the next move event
			prevDiff = curDiff;
			return;
		}

		// A release outside the image, such as over a button, sends no pointerup here, so a move without a pressed button ends the drag
		if (!e.buttons) {
			pointerDown = false;
		}

		if (!pointerDown) {
			return;
		}

		let x = e.clientX;
		let y = e.clientY;

		// Store positions for drag inertia
		dragPositions.push({ x, y });
		// Overall drag diff from start location, a move of more than 5px is a drag
		x -= dragStart.clientX;
		y -= dragStart.clientY;
		hasDragged = hasDragged || Math.hypot(x, y) > 5;

		// Handle unzoomed left / right / up swipes
		if (!zoomed) {
			// Close if swipe up
			if (y < -90) {
				pointerDown = !opts.persistent && props.close();
			}
			// Only handle left / right if not swiping vertically
			if (Math.abs(y) < 30) {
				// Previous if swipe left
				if (x > 40) {
					// Setting pointerDown to undefined stops pointermove from running again
					pointerDown = prev();
				}
				// Next if swipe right
				if (x < -40) {
					// Setting pointerDown to undefined stops pointermove from running again
					pointerDown = next();
				}
			}
		}

		// Image drag when zoomed
		if (zoomed && hasDragged && !closing) {
			translate = boundTranslateValues([dragStartTranslate[0] + x, dragStartTranslate[1] + y]);
		}
	};

	// The browser took the pointer, such as for a system gesture, so the drag or the pinch ends without a tap
	const onPointerCancel = (e) => {
		pointerCache.delete(e.pointerId);
		pointerDown = prevDiff = 0;
	};

	const onPointerUp = function(e) {
		pointerCache.delete(e.pointerId);

		if (pinchDetails) {
			// Reset prevDiff and clear pointerDown to trigger return below, the next gesture clears pinchDetails
			pointerDown = prevDiff = 0;
		}

		// Make sure pointer events don't carry over to next image
		if (!pointerDown) {
			return;
		}

		pointerDown = false;

		// A tap on the space around the image closes the gallery in onClick
		if (e.target === this && !opts.persistent) {
			return;
		}

		// Add drag inertia / snap back to bounds
		if (hasDragged) {
			const [posOne, posTwo, posThree] = dragPositions.slice(-3);
			// A short flick may have fewer than three moves, it gets no inertia
			if (posThree && Math.hypot(posTwo.x - posThree.x, posTwo.y - posThree.y) > 5) {
				translate = boundTranslateValues([translate[0] - (posOne.x - posThree.x) * 5, translate[1] - (posOne.y - posThree.y) * 5]);
			}
		} else if (!opts.onImageClick?.(props.container, activeItem)) {
			if (zoomed) {
				const wrap = this.closest('.bp-wrap');
				wrap.addEventListener('click', dropClick, { capture: true, once: true });
				wrap.addEventListener('pointerdown', () => wrap.removeEventListener('click', dropClick, true), { capture: true, once: true });
			}
			changeZoom(zoomed ? -maxZoom : maxZoom, e);
		}
	};

	// The click of a tap comes after its pointerup. Once the tap zooms out, a small screen shows the controls it hides while
	// zoomed, and the click must not press the one under the finger. So the gallery drops the next click out of the image,
	// up to the next press
	const dropClick = (e) => {
		if (!bpImg.parentNode.contains(e.target)) {
			e.stopPropagation();
			e.preventDefault();
		}
	};

	// Close when the space around the image is clicked. On click, not on pointerup: a tap sends its click after the pointerup,
	// and without an outro, such as with reduced motion, the gallery is gone by then and the click opens the link under it
	const onClick = function (e) {
		if (e.target === this && !hasDragged && !opts.persistent) {
			props.close();
		}
	};

	const onMount = (node) => {
		bpImg = node;

		// Decode initial image before rendering. In a microtask: on open, the gallery measures its stage and reads its gap
		// after its items are made, and the choice of a srcset candidate needs the size the item fits in
		queueMicrotask(() => props.loadImage(activeItem).then(() => {
			naturalWidth = activeItem.width || 0;
			loaded = true;
			props.preloadNext();
		}));
		// Show loading indicator if needed
		setTimeout(() => {
			showLoader = !loaded;
		}, 250);
	};

</script>

<!-- In the capture phase, before the page, see onKeydown in bigger-picture.svelte -->
<svelte:window on:keydown|capture={onKeydown} />

<div
	class="bp-img-wrap"
	role="none"
	on:pointerdown={onPointerDown}
	on:pointermove={onPointerMove}
	on:pointerup={onPointerUp}
	on:pointercancel={onPointerCancel}
	on:click={onClick}
	class:bp-close={closingWhileZoomed}
>
	<div
		use:onMount
		class="bp-img"
		class:bp-drag={pointerDown || prevDiff}
		class:bp-canzoom={maxZoom > 1 && activeDimensions[0] * scale < naturalWidth}
		style:background-image={shown ? null : getThumbBackground(activeItem)}
		style:transform="translate3d({translate[0]}px, {translate[1]}px, 0) scale({scale})"
		style="
			width:{activeDimensions[0]}px;
			height:{activeDimensions[1]}px;
		"
	>
		{#if loaded}
			<img
				use:addAttributes={activeItem.attr}
				sizes={activeItem.sizes || opts.sizes || `${Math.max(sizes, activeDimensions[0])}px`}
				alt={activeItem.alt || ''}
				on:load={(e) => e.target.decode().then(show, show)}
				on:error={(error) => opts.onError?.(props.container, activeItem, error)}
			/>
		{/if}
		{#if showLoader}
			<Loading {activeItem} {loaded} {closing} />
		{/if}
	</div>
</div>
