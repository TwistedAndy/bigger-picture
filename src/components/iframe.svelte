<script>
	import { addAttributes } from '../stores'
	import Loading from './loading.svelte'

	const { activeItem } = props

	export let activeDimensions;

	let loaded;

	const addSrc = (node) => {
		addAttributes(node, activeItem.attr)
		node.src = activeItem.iframe
	}
</script>

<div
	class="bp-iframe"
	style:width="{activeDimensions[0]}px"
	style:height="{activeDimensions[1]}px"
>
	<iframe
		use:addSrc
		allow="autoplay; fullscreen"
		title={activeItem.title}
		on:load={() => (loaded = true)}
	></iframe>
	<Loading {activeItem} {loaded} />
</div>
