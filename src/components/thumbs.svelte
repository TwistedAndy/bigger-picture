<script>
	export let items;
	export let position;
	export let setPosition;

	// Label of a thumbnail without alt text or a caption, followed by its number
	export let label;

	let thumbsWidth;
	let thumbsPanel;
	let thumbsPanelWidth;
	let initialTranslate = 0;
	// Translate of the strip, a CSS transition animates it
	let thumbsTranslate = 0;

	let isPointerDown, pointerDownX, hasDragged;

	let dragPositions = [];

	const scrollToButton = (button) => {

		const activeBtn = button || thumbsPanel?.querySelector('.active');

		if (!activeBtn) {
			return;
		}
		// The button shows in full, 3px from the edge
		let { left, right, width } = activeBtn.getBoundingClientRect();
		if (right > thumbsPanelWidth) {
			thumbsTranslate = boundTranslate(thumbsPanelWidth - activeBtn.offsetLeft - width - 3);
		} else if (left < 0) {
			thumbsTranslate = boundTranslate(3 - activeBtn.offsetLeft);
		}

		initialTranslate = thumbsTranslate;

	};

	const boundTranslate = (int) => Math.min(0, Math.max(int, thumbsPanelWidth - thumbsWidth - 1));

	const pointerDown = function (e) {
		if (thumbsWidth >= thumbsPanelWidth) {
			isPointerDown = true;
			pointerDownX = e.clientX;
			// Stop the transition where it is, the drag moves the strip without one
			thumbsTranslate = initialTranslate = new DOMMatrix(getComputedStyle(this).transform).m41;
		}
	};

	const pointerMove = (e) => {
		if (!isPointerDown) {
			return;
		}
		// A release outside the strip sends no pointerup to it, so a move without a pressed button ends the drag, with no
		// inertia
		if (!e.buttons) {
			dragPositions = [];
			return pointerUp();
		}
		const dragAmount = e.clientX - pointerDownX;
		if (hasDragged) {
			thumbsTranslate = boundTranslate(initialTranslate + dragAmount);
			dragPositions.push(e.clientX);
		} else {
			hasDragged = Math.abs(dragAmount) > 5;
		}
	};

	const pointerUp = () => {
		// The speed of the last moves, NaN with no moves, such as after a tap
		const xDiff = dragPositions.slice(-3)[0] - dragPositions.pop();
		if (Math.abs(xDiff) > 5) {
			thumbsTranslate = boundTranslate(thumbsTranslate - xDiff * 5);
		}
		dragPositions = [];
		isPointerDown = false;
		// The click of a drag that ends on the thumbnail it started on comes after the pointerup, so it still sees the drag
		setTimeout(() => (hasDragged = false));
		initialTranslate = thumbsTranslate;
	};

	// Scroll to the active thumbnail when the position changes
	$: position, setTimeout(scrollToButton);

	// Measure the panel and the strip in it, also on resize
	const thumbsActions = (node) => {

		thumbsPanel = node;

		const strip = node.querySelector('.bp-thumbs-inner'),
			resizeObserver = new ResizeObserver((entries) => {
				for (const { target, contentRect } of entries) {
					if (target === strip) {
						thumbsWidth = contentRect.width;
					} else {
						thumbsPanelWidth = contentRect.width;
					}
				}
			});

		resizeObserver.observe(node);
		resizeObserver.observe(strip);

		return {
			destroy() {
				resizeObserver.disconnect();
			}
		};

	};

</script>

<div
	use:thumbsActions
	role="none"
	on:pointermove={pointerMove}
	on:pointerup={pointerUp}
	on:pointercancel={pointerUp}
	class="bp-thumbs"
>
	<div
		class="bp-thumbs-outer"
		class:bp-drag={isPointerDown}
		role="none"
		style:transform="translateX({thumbsTranslate}px)"
		on:pointerdown={pointerDown}
	>
		<div class="bp-thumbs-inner">
			{#each items as item}
				<button
					type="button"
					title={item.caption}
					aria-label={item.alt || item.caption || `${label} ${item.i + 1}`}
					data-type={item.thumb ? null : item.type}
					class:active={item.i === position}
					on:focus={(e) => scrollToButton(e.target)}
					on:click={() => !hasDragged && setPosition(item.i)}
				>
					<img src={item.thumb?.src} alt="" loading="lazy" />
				</button>
			{/each}
		</div>
	</div>
</div>