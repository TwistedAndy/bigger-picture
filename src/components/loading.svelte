<script>
	import { getThumbBackground } from '../stores';

	export let activeItem;
	export let loaded;

	// Closing store of the gallery
	export let closing;

	// True once the loader has faded out
	let hidden;
</script>

{#if !hidden}
	<div
		class="bp-load"
		class:bp-loaded={loaded}
		on:animationend={(e) => (hidden = e.animationName === 'bp-fade-out')}
		style:background-image={getThumbBackground(activeItem)}
	>
		<span class="bp-bar"></span>
		<span class="bp-o"></span>
	</div>
{/if}

{#if $closing}
	<div
		class="bp-load"
		style:background-image={getThumbBackground(activeItem)}
	></div>
{/if}
