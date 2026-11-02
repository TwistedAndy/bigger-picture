<script>
	import { getThumbBackground } from '../stores.js';

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
		let { left, right, width } = activeBtn.getBoundingClientRect();
		let margin = 3;
		let { offsetLeft } = activeBtn;
		if (left + width > thumbsPanelWidth) {
			thumbsTranslate = boundTranslate(-offsetLeft - width + thumbsPanelWidth - margin);
		} else if (right - width < 0) {
			thumbsTranslate = boundTranslate(-offsetLeft + margin);
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
		if (isPointerDown) {
			let dragAmount = -(pointerDownX - e.clientX);
			if (hasDragged) {
				thumbsTranslate = boundTranslate(initialTranslate + dragAmount);
				dragPositions.push(e.clientX);
			} else {
				hasDragged = Math.abs(dragAmount) > 5;
			}
		}
	};

	const pointerUp = () => {
		if (hasDragged) {
			dragPositions = dragPositions.slice(-3);
			if (dragPositions.length > 1) {
				let xDiff = dragPositions[0] - dragPositions.pop();
				if (Math.abs(xDiff) > 5) {
					thumbsTranslate = boundTranslate(thumbsTranslate - xDiff * 5);
				}
			}
		}
		dragPositions = [];
		isPointerDown = hasDragged = false;
		initialTranslate = thumbsTranslate;
	};

	// Scroll to an active position on external change
	$: if (position !== undefined) {
		setTimeout(() => scrollToButton());
	}

	// Update dimensions on resize
	const thumbsActions = function(node) {

		thumbsPanel = node;

		const resizeObserver = new ResizeObserver(entries => {
			for (const entry of entries) {
				if (entry.target === thumbsPanel) {
					thumbsPanelWidth = entry.contentRect.width;
				} else {
					thumbsWidth = entry.contentRect.width;
				}
			}
		});

		resizeObserver.observe(node);

		return {
			destroy() {
				resizeObserver.unobserve(node);
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
		<div
			use:thumbsActions
			class="bp-thumbs-inner"
		>
			{#each items as item (item.i)}
				<button
					title={item.caption}
					aria-label={item.alt || item.caption || `${label} ${item.i + 1}`}
					style:background-image={getThumbBackground(item)}
					data-type={item.thumb ? null : item.type}
					class:active={item.i === position}
					on:focus={(e) => scrollToButton(e.target)}
					on:click={() => !hasDragged && setPosition(item.i)}
				></button>
			{/each}
		</div>
	</div>
</div>