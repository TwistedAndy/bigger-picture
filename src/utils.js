// Quoted, a URL with parentheses, such as "photo (1).jpg", is invalid in a bare url()
export const getThumbBackground = (activeItem) => activeItem.thumb ? `url("${activeItem.thumb.src}")` : null;

// The upper modal gallery, the last one on the page
export const getUpperGallery = () => [...document.querySelectorAll('.bp-wrap:not(.bp-inline)')].pop();

// A key for the gallery: not a browser shortcut, such as Alt+Left for back or Ctrl+= for the page zoom, and not from an
// element outside the gallery, such as from a gallery opened over it. The body has the focus when the focused node is
// removed, and a script can send a key to the document or the window. These keys go to the upper gallery, the last one
export const isGalleryKey = ({ target, altKey, ctrlKey, metaKey }, { focusWrap }, container) => !altKey && !ctrlKey && !metaKey
	&& (target.nodeType != 1 || target === document.body ? getUpperGallery() === container : (focusWrap || container).contains(target));

// Adds the attributes of the item to the media element, the item has an attr object always
export const addAttributes = (node, attributes) => {
	for (const key in attributes) {
		node.setAttribute(key, attributes[key]);
	}
};