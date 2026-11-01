<script>
	import { addAttributes, closing, getThumbBackground } from '../stores';

	import Loading from './loading.svelte';

	export let props;
	export let smallScreen;
	export let containerWidth;
	export let containerHeight;
	export let activeDimensions;

	let { activeItem, opts, prev, next, zoomed, container } = props;

	let maxZoom = activeItem.maxZoom || opts.maxZoom || 10;

	/** value of sizes attribute */
	let sizes = activeDimensions[0];

	/** tracks load state of image */
	let loaded, showLoader;

	/** stores pinch info if multiple touch events active */
	let pinchDetails;

	/** image html element (.bp-img) */
	let bpImg;

	/** track distance for pinch events */
	let prevDiff = 0;

	let pointerDown, hasDragged;
	let dragStartX, dragStartY;

	/** translate values on start of drag */
	let dragStartTranslateX, dragStartTranslateY;

	/** if true, adds class to .bp-wrap to avoid image cropping */
	let closingWhileZoomed;

	let naturalWidth = +activeItem.width;

	/** store positions for drag inertia */
	const dragPositions = [];

	/** cache pointer events to handle pinch */
	const pointerCache = new Map();

	/** zoom level of the image, 1 is the starting size, a CSS transition animates it */
	let scale = 1;

	/** translate of the zoomed image, animated with the scale */
	let translate = [0, 0];

	$: zoomed.set(activeDimensions[0] * (scale - 1) > 10);

	// if zoomed while closing, zoom out image and add class
	// to change contain value on .bp-wrap to avoid cropping
	$: if ($closing && $zoomed && !opts.intro) {
		scale = 1;
		translate = [0, 0];
		closingWhileZoomed = true;
	}

	/** calculate translate position with bounds */
	const boundTranslateValues = ([x, y], newScale = scale) => {
		// image drag translate bounds
		let maxTranslateX = (activeDimensions[0] * newScale - containerWidth) / 2,
			maxTranslateY = (activeDimensions[1] * newScale - containerHeight) / 2;
		// x max drag
		if (maxTranslateX < 0) {
			x = 0;
		} else if (x > maxTranslateX) {
			if (smallScreen) {
				// bound to left side (allow slight over drag)
				x = pointerDown ? maxTranslateX + (x - maxTranslateX) / 10 : maxTranslateX;
				// previous item if dragged past threshold
				if (x > maxTranslateX + 20) {
					// pointerdown = undefined to stop pointermove from running again
					pointerDown = prev();
				}
			} else {
				x = maxTranslateX;
			}
		} else if (x < -maxTranslateX) {
			// bound to right side (allow slight over drag)
			if (smallScreen) {
				x = pointerDown ? -maxTranslateX - (-maxTranslateX - x) / 10 : -maxTranslateX;
				// next item if dragged past threshold
				if (x < -maxTranslateX - 20) {
					// pointerdown = undefined to stop pointermove from running again
					pointerDown = next();
				}
			} else {
				x = -maxTranslateX;
			}
		}
		// y max drag
		if (maxTranslateY < 0) {
			y = 0;
		} else if (y > maxTranslateY) {
			y = maxTranslateY;
		} else if (y < -maxTranslateY) {
			y = -maxTranslateY;
		}
		return [x, y];
	};

	/** updates zoom level in or out based on amt value */
	function changeZoom(amt = maxZoom, e) {
		if ($closing) {
			return;
		}

		let newScale = scale + scale * amt;

		if (amt > 0) {
			// not larger than the max zoom and the natural size
			newScale = Math.min(newScale, maxZoom, naturalWidth / activeDimensions[0]);
		} else if (newScale < 1) {
			// if requesting image smaller than starting size
			scale = 1;
			return (translate = [0, 0]);
		}

		let x = 0,
			y = 0;

		if (e) {
			// distance clicked from center of image
			const { left, top, width, height } = bpImg.parentNode.getBoundingClientRect();
			x = e.clientX - left - width / 2 - translate[0];
			y = e.clientY - top - height / 2 - translate[1];
		}

		// keep the clicked point in place
		const ratio = 1 - newScale / scale;

		// update sizes property, the browser loads a larger source if there is one
		sizes = Math.round(Math.max(sizes, activeDimensions[0] * newScale));
		translate = boundTranslateValues([translate[0] + x * ratio, translate[1] + y * ratio], newScale);
		scale = newScale;
	}

	// allow zoom to be read / set externally
	Object.defineProperty(activeItem, 'zoom', {
		configurable: true,
		get: () => $zoomed,
		set: (bool) => changeZoom(bool ? maxZoom : -maxZoom),
	})

	// zoom with + and -, and pan the zoomed image with the arrows, the gallery handles the other keys
	const onKeydown = (e) => {
		// zoom out by the same factor, 1.5x in and 1 / 1.5x out
		const zoom = { '+': 0.5, '=': 0.5, '-': -1 / 3 }[e.key];
		const pan = { ArrowLeft: [100, 0], ArrowRight: [-100, 0], ArrowUp: [0, 100], ArrowDown: [0, -100] }[e.key];
		if (opts.inline || $closing) {
			return;
		}
		if (zoom) {
			changeZoom(zoom);
		} else if (pan && $zoomed) {
			e.preventDefault();
			// starts from the target, so held keys keep panning while the transition runs
			translate = boundTranslateValues([translate[0] + pan[0], translate[1] + pan[1]]);
		}
	};

	const onWheel = (e) => {
		// return if scrolling past inline gallery w/ wheel
		if (opts.inline && !$zoomed) {
			return;
		}
		// preventDefault to stop scrolling on zoomed inline image
		e.preventDefault();
		// change zoom on wheel
		changeZoom(e.deltaY / -300, e);
	};

	/** on drag start, store initial position and image translate values */
	const onPointerDown = (e) => {
		// don't run if right click
		if (e.button !== 2) {
			e.preventDefault();
			if ($zoomed) {
				// stop the transition where it is, the drag moves the image without one
				const img = bpImg.getBoundingClientRect();
				const wrap = bpImg.parentNode.getBoundingClientRect();
				scale = img.width / activeDimensions[0];
				translate = [img.left + img.width / 2 - wrap.left - wrap.width / 2, img.top + img.height / 2 - wrap.top - wrap.height / 2];
			}
			pointerDown = true;
			pointerCache.set(e.pointerId, e);
			dragStartX = e.clientX;
			dragStartY = e.clientY;
			dragStartTranslateX = translate[0];
			dragStartTranslateY = translate[1];
		}
	};

	/** on drag, update image translate val */
	const onPointerMove = (e) => {
		if (pointerCache.size > 1) {
			// if multiple pointer events, pass to handlePinch function
			pointerDown = false;
			return opts.noPinch?.(container) || handlePinch(e);
		}

		if (!pointerDown) {
			return;
		}

		let x = e.clientX;
		let y = e.clientY;

		// store positions for drag inertia, flag drag by distance
		dragPositions.push({ x, y });
		hasDragged = hasDragged || Math.hypot(x - dragStartX, y - dragStartY) > 5;

		// overall drag diff from start location
		x = x - dragStartX;
		y = y - dragStartY;

		// handle unzoomed left / right / up swipes
		if (!$zoomed) {
			// close if swipe up
			if (y < -90) {
				pointerDown = !opts.noClose && props.close();
			}
			// only handle left / right if not swiping vertically
			if (Math.abs(y) < 30) {
				// previous if swipe left
				if (x > 40) {
					// pointerdown = undefined to stop pointermove from running again
					pointerDown = prev();
				}
				// next if swipe right
				if (x < -40) {
					// pointerdown = undefined to stop pointermove from running again
					pointerDown = next();
				}
			}
		}

		// image drag when zoomed
		if ($zoomed && hasDragged && !$closing) {
			translate = boundTranslateValues([dragStartTranslateX + x, dragStartTranslateY + y]);
		}
	};

	const handlePinch = (e) => {
		// update event in cache and get values
		const [p1, p2] = pointerCache.set(e.pointerId, e).values();

		// Calculate the distance between the two pointers
		const dx = p1.clientX - p2.clientX;
		const dy = p1.clientY - p2.clientY;
		const curDiff = Math.hypot(dx, dy);

		// cache the original pinch center
		pinchDetails = pinchDetails || {
			clientX: (p1.clientX + p2.clientX) / 2, clientY: (p1.clientY + p2.clientY) / 2
		};

		// scale image
		changeZoom(((prevDiff || curDiff) - curDiff) / -35, pinchDetails);

		// Cache the distance for the next move event
		prevDiff = curDiff;
	};

	/** remove event from pointer event cache */
	const removeEventFromCache = (e) => pointerCache.delete(e.pointerId);

	const onPointerUp = function(e) {
		removeEventFromCache(e);

		if (pinchDetails) {
			// reset prevDiff and clear pointerDown to trigger return below
			pointerDown = prevDiff = 0;
			// set pinchDetails to null after last finger lifts
			pinchDetails = pointerCache.size ? pinchDetails : null;
		}

		// make sure pointer events don't carry over to next image
		if (!pointerDown) {
			return;
		}

		pointerDown = false;

		// close if overlay is clicked
		if (e.target === this && !opts.noClose) {
			return props.close();
		}

		// add drag inertia / snap back to bounds
		if (hasDragged) {
			const [posOne, posTwo, posThree] = dragPositions.slice(-3);
			const xDiff = posTwo.x - posThree.x;
			const yDiff = posTwo.y - posThree.y;
			if (Math.hypot(xDiff, yDiff) > 5) {
				translate = boundTranslateValues([translate[0] - (posOne.x - posThree.x) * 5, translate[1] - (posOne.y - posThree.y) * 5]);
			}
		} else if (!opts.onImageClick?.(container, activeItem)) {
			changeZoom($zoomed ? -maxZoom : maxZoom, e);
		}

		// reset pointer states
		hasDragged = false;
		// reset dragPositions
		dragPositions.length = 0;
	};

	const onMount = (node) => {
		bpImg = node;

		// decode initial image before rendering
		props.loadImage(activeItem).then(() => {
			naturalWidth = +activeItem.width;
			loaded = true;
			props.preloadNext();
		});
		// show loading indicator if needed
		setTimeout(() => {
			showLoader = !loaded;
		}, 250);
	};

	const addSrc = (node) => {
		addAttributes(node, activeItem.attr);
	};

	$: if (activeDimensions && (opts.inline || !smallScreen)) {
		scale = 1;
		translate = [0, 0];
	}

</script>

<svelte:window on:keydown={onKeydown} />

<div
	class="bp-img-wrap"
	role="none"
	on:wheel={onWheel}
	on:pointerdown={onPointerDown}
	on:pointermove={onPointerMove}
	on:pointerup={onPointerUp}
	on:pointercancel={removeEventFromCache}
	class:bp-close={closingWhileZoomed}
>
	<div
		use:onMount
		class="bp-img"
		class:bp-drag={pointerDown}
		class:bp-canzoom={maxZoom > 1 && activeDimensions[0] * scale < naturalWidth}
		style:background-image={getThumbBackground(activeItem)}
		style:transform="translate3d({translate[0]}px, {translate[1]}px, 0) scale({scale})"
		style="
			width:{activeDimensions[0]}px;
			height:{activeDimensions[1]}px;
		"
	>
		{#if loaded}
			<img
				use:addSrc
				sizes={activeItem.sizes || opts.sizes || `${sizes}px`}
				alt={activeItem.alt}
				on:error={(error) => opts.onError?.(container, activeItem, error)}
			/>
		{/if}
		{#if showLoader}
			<Loading {activeItem} {loaded} />
		{/if}
	</div>
</div>
