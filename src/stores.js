export const getThumbBackground = (activeItem) => activeItem.thumb ? `url(${activeItem.thumb.src})` : null;

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