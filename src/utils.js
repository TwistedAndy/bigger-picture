// Playback positions by a key: the first source of a video, or the link of a YouTube or Vimeo player. A video or a player
// opened again resumes from there
export const positions = {};

// Quoted, a URL with parentheses, such as "photo (1).jpg", is invalid in a bare url(). Escaped, a quote in a data URL, such
// as of an SVG, doesn't end the string
export const getThumbBackground = (activeItem) => activeItem.thumb ? `url("${CSS.escape(activeItem.thumb.src)}")` : null;

// The upper modal gallery, the last one on the page
export const getUpperGallery = () => [...document.querySelectorAll('.bp-wrap:not(.bp-inline)')].pop();

// A key for the gallery: not a browser shortcut, such as Alt+Left for back or Ctrl+= for the page zoom, and not from an
// element outside the gallery, such as from a gallery opened over it. The body has the focus when the focused node is
// removed, and a script can send a key to the document or the window. These keys go to the upper gallery, the last one
export const isGalleryKey = ({ target, altKey, ctrlKey, metaKey }, { focusWrap }, container) => !altKey && !ctrlKey && !metaKey
	&& (target.nodeType != 1 || target === document.body ? getUpperGallery() === container : (focusWrap || container).contains(target));

// Adds the attributes of the item to the media element, the item has an attr object always. False removes an attribute,
// such as a default one: a boolean attribute is on with any value, also "false". Not === false, the booleans_as_integers
// option of terser compiles it to == 0, which is also true for "0" and ""
export const addAttributes = (node, attributes) => {
	for (const key in attributes) {
		const value = attributes[key];
		!value && typeof value == 'boolean' ? node.removeAttribute(key) : node.setAttribute(key, value);
	}
};