interface options {
	/** The data source for the displayed items. See [Item Properties](https://github.com/TwistedAndy/bigger-picture#item-properties) for details.
	 *
	 * If using NodeList or Node, the information is passed via data attributes. If using Array, the information is passed via object. */
	items: HTMLElement | HTMLCollection | NodeList | item[]
	/** The element of the item to start at, matched against the `items` elements (or the `element` of item objects). The gallery zooms out of it and back. Ignored when `position` is set.
	 *
	 * For example, pass the clicked link in a click handler. */
	current?: HTMLElement | EventTarget
	/** @deprecated Use `current` */
	el?: HTMLElement | EventTarget
	/** Defines which types should be included to the gallery. Supported values: 'image', 'video', 'audio', 'iframe' and 'html' */
	types?: string | string[]
	/** Start position of gallery (zero-indexed). Defaults to the item of `current`, or the first item. */
	position?: number
	/** Controls the size of the displayed item. Use `1` to fill item to screen edges. */
	scale?: number
	/** Shows a strip of thumbnails at the bottom of the gallery when it has more than one item. */
	thumbs?: boolean
	/** Sets the sizes attribute for all images using `srcset`. By default it is updated automatically when an image is zoomed. */
	sizes?: string
	/** Zooms the item out of its `element` on open and back into it on close. Set `false` to fade it up and down instead. Defaults to `true`. */
	zoom?: boolean
	/** @deprecated Use `zoom: false` */
	intro?: string
	/** Specifies that the lightbox is inline. Interaction events are modified to avoid hijacking scroll and tab press. */
	inline?: boolean
	/** Hides the close button and prevents the lightbox from closing unless the [`close`](https://github.com/TwistedAndy/bigger-picture#close) method is called. Recommended to use in combination with an inline gallery. */
	persistent?: boolean
	/** @deprecated Use `persistent` */
	noClose?: boolean
	/** Disables pinch zoom. A function runs at the time of the pinch and disables it when it returns a truthy value. Supplies `container` - the gallery's wrapper element.
	 *
	 * ```js
	 * bp.open({
	 *    noPinch: (container) => container.clientWidth < 800,
	 * })
	 * ```
	 */
	noPinch?: boolean | ((container: HTMLElement) => any)
	/** Specify wrapper element to trap focus within on tab press. Useful when mounting a gallery inside a custom layout. */
	focusWrap?: HTMLElement | EventTarget
	/** Restricts an image's maximum zoom level to `maxZoom` times the starting size, even if the item's `width` / `height` is larger. For example, a `maxZoom` of 2 on an image that is 800px wide when zoomed out would limit the image to a maximum zoom of 1600px width. */
	maxZoom?: number
	/** Executes just before intro animation. Supplies `container` - the gallery's wrapper element, and `activeItem` - an object containing the currently displayed item's data. */
	onOpen?: (container: HTMLElement, activeItem: activeItem) => void
	/** Executes just after the active item is updated. Supplies `container` and `activeItem`. */
	onUpdate?: (container?: HTMLElement, activeItem?: activeItem) => void
	/** Executes just before outro animation. Supplies `container` and `activeItem`. */
	onClose?: (container?: HTMLElement, activeItem?: activeItem) => void
	/** Executes just after the lightbox has been closed and removed from the page. Supplies `container` and `activeItem`. */
	onClosed?: (container?: HTMLElement, activeItem?: activeItem) => void
	/** Executes when the dimensions of the gallery (not the window) are changed. Supplies `container` and `activeItem`. */
	onResize?: (container?: HTMLElement, activeItem?: activeItem) => void
	/** Executes when an image is clicked. Return a truthy value to prevent zooming. Supplies `container` and `activeItem`. */
	onImageClick?: (container?: HTMLElement, activeItem?: activeItem) => any
	/** Executes when an error is thrown when loading an item (image, audio, video or iframe). */
	onError?: (
		container?: HTMLElement,
		activeItem?: activeItem,
		error?: Error
	) => void
}

interface item {
	[key: string]: any
	/** Largest possible width of media item in pixels. Not required for HTML, which can be sized via CSS. */
	width?: string | number
	/** Largest possible height of media item in pixels. Not required for HTML, which can be sized via CSS. */
	height?: string | number
	/** The URL to show, `href` by default for elements. Images (also a `srcset` value), video, audio, PDF, YouTube, Vimeo, SoundCloud, Google Drive and Dropbox links are detected. Links of other types are skipped unless `type` is set. */
	link?: string
	/** Shows `link` as this type without detection, e.g. `iframe` for a web page or `image` for an image URL without an extension. Attribute name is `data-type`. */
	type?: 'image' | 'video' | 'audio' | 'iframe'
	/** An image element, image URL or path to image used for thumbnail displayed before media loads. If an image element is provided, it will be used to detect the fit mode */
	thumb?: string | HTMLImageElement
	/** For native video and audio, an array of objects specifying [`src`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/source#attr-src) (required) and [`type`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/source#attr-type) (optional). A string may be used if it is JSON parsable. Each object will create a `source` element, and all key / value pairs in the object will be added as attributes. */
	sources?: object[] | string
	/** HTML that will be rendered in the container. When using HTML, please control dimensions with CSS. No need to pass `width` or `height`.
   * 
   * For advanced use, you can pass an empty string, then mount a component using the [`onOpen`](https://github.com/TwistedAndy/bigger-picture#onopen) method:
   * 
   * ```js
   * // mounting svelte component (firewatch example from demo site)
   * onOpen(container) {
   *    new Firewatch({
   *      target: container.querySelector('.bp-html'),
   *    })
   * },
  ``` */
	html?: string
	/** Alternative text of the image, also used as the iframe title and the `aria-label` of video and audio players. */
	alt?: string
	/** @deprecated Use `alt` */
	title?: string
	/** Text to be displayed using built in caption. You may pass html tags and styles can be overriden via CSS. */
	caption?: string
	/** Sets the sizes attribute if you're using `srcset`, overriding the `sizes` option. */
	sizes?: string
	/** Restricts an image's maximum zoom level to `maxZoom` times the starting size, even if the item's `width` / `height` is larger. For example, a `maxZoom` of 2 on an image that is 800px wide when zoomed out would limit the image to a maximum zoom of 1600px width.
	 *
	 * If `maxZoom` is set on an individual item it will override the value set in options. Attribute name is `data-max-zoom`. */
	maxZoom?: number
	/** Array of text track data to use with videos. String option is just a stringified array. See the [MDN page on track elements](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/track) for more information. */
	tracks?: string | object[]
	/** To control the default open / close animation, add a property `element` to each item that contains a node on the page. The active item's `element` will be where the animation opens from / closes to. If you're not using the default scale animation, this is not needed. */
	element?: HTMLElement | EventTarget
	/** Object of attributes to add to the `<img>`, `<iframe>`, `<video>`, `<audio>` elements. Items may share one object. */
	attr?: Record<string, string | boolean> | object
	/** Controls how images are sized during the open and close animations. Accepts: 'cover', 'contain', and 'fill'. Default: 'fill' */
	fit?: string
}

/** A normalized copy of the item, the objects passed to `open` stay unchanged. */
export interface activeItem extends Omit<item, 'type'> {
	/** Index of the item in the gallery */
	readonly i: number
	/** Detected type of the item */
	readonly type: 'image' | 'video' | 'audio' | 'iframe' | 'html'
	/** The URL shown, the embed URL for YouTube, Vimeo, SoundCloud, Google Drive and Dropbox links */
	readonly link?: string
	/** Read or set zoom state */
	zoom?: boolean
}

export interface BiggerPictureInstance {
	/** Opens the instance. */
	open: (options: options) => void
	/** Closes the lightbox. */
	close: () => void
	/** Changes to next item in gallery. */
	next: () => void
	/** Changes to previous item in gallery. */
	prev: () => void
	/** Changes to `position` item in gallery (zero-indexed). */
	setPosition: (position: number) => void
	/** Array of all items in currently active gallery */
	items: item[]
	/** Gallery target */
	target: HTMLElement
}

interface initObject {
	/** Specifies parent element inside which the gallery will be mounted. Call `BiggerPicture()` without options to mount it in `document.body`. */
	target: HTMLElement
	/** Renders the gallery as a `<dialog>` opened with `showModal()`, placing it in the browser's top layer above other modals. */
	dialog?: boolean
}

/** Initializes BiggerPicture instance */
declare function BiggerPicture(options?: initObject): BiggerPictureInstance

export default BiggerPicture
