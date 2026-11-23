// Quoted, a URL with parentheses, such as "photo (1).jpg", is invalid in a bare url()
export const getThumbBackground = (activeItem) => activeItem.thumb ? `url("${activeItem.thumb.src}")` : null;

// A key for the gallery: not a browser shortcut, such as Alt+Left for back or Ctrl+= for the page zoom, and not from an
// element outside the gallery, such as from a gallery opened over it. The body has the focus when the focused node is
// removed, and a script can send a key to the document or the window
export const isGalleryKey = ({ target, altKey, ctrlKey, metaKey }, wrap) => !altKey && !ctrlKey && !metaKey
	&& (target.nodeType != 1 || target === document.body || wrap.contains(target));

// Adds attributes to the given node based on the provided object
export const addAttributes = (node, attributes) => {
	if (!attributes) {
		return;
	}
	if (typeof attributes === 'string') {
		attributes = JSON.parse(attributes);
	}
	for (let key in attributes) {
		node.setAttribute(key, attributes[key]);
	}
};