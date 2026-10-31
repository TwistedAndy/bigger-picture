<div align="center">

<a href="https://twistedandy.github.io/bigger-picture/"><img src="demo/assets/bp.svg" alt="Bigger Picture" width="560" /></a>

<p>A small, fast JavaScript lightbox for images, video, audio, embeds and HTML.<br />Smooth zoom from the thumbnail and back, deep zoom with responsive images, and no dependencies.</p>

[![Release](https://flat.badgen.net/github/release/TwistedAndy/bigger-picture?color=blue)](https://github.com/TwistedAndy/bigger-picture/releases)
[![Gzip size](https://flat.badgen.net/static/gzip/12.9%20kB/green)](dist/bigger-picture.min.js)
[![MIT license](https://flat.badgen.net/github/license/TwistedAndy/bigger-picture?color=purple)](license)

**[Documentation and live examples](https://twistedandy.github.io/bigger-picture/)** · [Releases](https://github.com/TwistedAndy/bigger-picture/releases) · [Issues](https://github.com/TwistedAndy/bigger-picture/issues)

</div>

> [!NOTE]
> Originally created by [Hank Dollman](https://github.com/henrygd/bigger-picture). This fork is maintained by [Andrii Toniievych](https://github.com/TwistedAndy) and adds automatic link detection, built-in thumbnails, dialog (top layer) mode, type filtering and more.

## Features

- **Smooth transitions** - Zooms out of the thumbnail and back into it, keeping its crop, letterboxing and padding.
- **Everything in one gallery** - Images, video, audio, YouTube, Vimeo, SoundCloud, PDF, iframes and HTML, with no plugins.
- **Automatic link detection** - Pass plain links and the type is read from the URL.
- **Zoomable** - Click, wheel or pinch to zoom photos up to native resolution.
- **Responsive images** - Pass a `srcset` and the right file loads as you zoom.
- **Lightweight and fast** - 12.9 kB gzipped, smooth even with huge images.
- **Flexible** - Full screen, inline or in the browser's top layer, with built-in thumbnails, captions and an easy API.
- **Accessible** - Alt text, captions, subtitles, keyboard navigation, focus management and `prefers-reduced-motion`.

## Install

Load the UMD build and the stylesheet from jsDelivr. The script exposes a global `BiggerPicture` function.

```html
<link
  rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/TwistedAndy/bigger-picture@v1.2.1/dist/bigger-picture.css"
  integrity="sha384-Wi6gMclvFmcAz1fkN5w1e5df8wp+qSjUToYNwEuIB7udol0iHbzctL/7nOXhY2Wv"
  crossorigin="anonymous"
/>
<script
  src="https://cdn.jsdelivr.net/gh/TwistedAndy/bigger-picture@v1.2.1/dist/bigger-picture.umd.js"
  integrity="sha384-EbhpKN3BnO87tMzz4zcvzAHaYAYV/uSElMKORxTmT9wNO3bnPgXDx1M9ejv76gFn"
  crossorigin="anonymous"
></script>
```

Or install it from GitHub and import it with a bundler:

```sh
npm install github:TwistedAndy/bigger-picture#v1.2.1
```

```js
import BiggerPicture from 'bigger-picture'
import 'bigger-picture/css'
```

The styles are also available as [SCSS](dist/bigger-picture.scss) (`bigger-picture/scss`) and can be themed with CSS variables.

The bundled builds include Svelte 4 and work in any project. Svelte 4 and Svelte 5 apps can import the source with `bigger-picture/svelte` instead, so the gallery shares the app's Svelte runtime. Svelte 5 compiles it in legacy mode, so keep `runes` unset for this package.

## Quick start

Create one instance and open it on click. Passing the clicked element as `el` starts the gallery at that item and zooms out of it.

```html
<div class="gallery">
  <a href="photo-1.jpg" data-width="2500" data-height="1667">
    <img src="photo-1_thumb.jpg" alt="Antelope Canyon" />
  </a>
  <a href="https://www.youtube.com/watch?v=286jXjwdst0">
    <img src="video_thumb.jpg" alt="Video" />
  </a>
</div>
```

```js
const bp = BiggerPicture()

document.addEventListener('click', (event) => {
  const link = event.target.closest('.gallery a')
  if (!link) {
    return
  }
  event.preventDefault()
  bp.open({
    el: link,
    items: link.closest('.gallery').querySelectorAll('a'),
    thumbs: true,
  })
})
```

The image inside each link is used as the thumbnail. See the [documentation](https://twistedandy.github.io/bigger-picture/) for more examples: video with subtitles, embeds, captions, inline galleries, HTML content, filtering, dialog mode and theming.

## Initialization

`BiggerPicture(options)` creates an instance. Without options it mounts in `document.body`. You only need one instance, unless you want galleries in different targets.

| Option   | Type          | Description                                                                                                        |
| -------- | ------------- | ------------------------------------------------------------------------------------------------------------------ |
| `target` | `HTMLElement` | Element the gallery is mounted in.                                                                                 |
| `dialog` | `boolean`     | Renders the gallery as a `<dialog>` opened with `showModal()`, so it appears in the top layer above other modals. |

```js
const bp = BiggerPicture({ target: document.body, dialog: true })
```

## Methods

| Method                                              | Description                                            |
| --------------------------------------------------- | ------------------------------------------------------ |
| [`open(options)`](#openoptions)                     | Opens the gallery.                                     |
| [`close()`](#close)                                 | Closes the gallery.                                    |
| [`next()`](#next)                                   | Shows the next item.                                   |
| [`prev()`](#prev)                                   | Shows the previous item.                               |
| [`setPosition(position)`](#setpositionposition)     | Shows the item at `position`, counted from zero.       |

### open(options)

Opens the gallery with the given [options](#options).

### close

Closes the gallery with the outro animation.

### next

Shows the next item in the gallery.

### prev

Shows the previous item in the gallery.

### setPosition(position)

Shows the item at `position`, counted from zero.

## Options

Options passed to `open()`.

| Option                         | Type                               | Default     | Description                                             |
| ------------------------------ | ---------------------------------- | ----------- | ------------------------------------------------------- |
| [`items`](#items)              | `NodeList`, `Node` or `Array`      |             | Items to show.                                          |
| [`el`](#el)                    | `Node`                             |             | Item to start at, and to zoom from and back into.       |
| [`position`](#position)        | `number`                           | `0`         | Item to start at, counted from zero.                    |
| [`types`](#types)              | `string` or `string[]`             | all         | Item types to include.                                  |
| [`scale`](#scale)              | `number`                           | `1`         | Size of the item relative to the gallery.               |
| [`thumbs`](#thumbs)            | `boolean`                          | `false`     | Shows a strip of thumbnails.                            |
| [`sizes`](#sizes)              | `string`                           |             | `sizes` attribute for every `srcset` image.             |
| [`intro`](#intro)              | `string`                           |             | Alternative intro animation.                            |
| [`inline`](#inline)            | `boolean`                          | `false`     | Inline gallery that leaves scroll and Tab to the page.  |
| [`noClose`](#noclose)          | `boolean`                          | `false`     | Hides the close button and ignores Esc.                 |
| [`noPinch`](#nopinch)          | `function`                         |             | Disables pinch zoom when it returns a truthy value.     |
| [`focusWrap`](#focuswrap)      | `Node`                             |             | Element to trap focus in.                               |
| [`maxZoom`](#maxzoom)          | `number`                           | `10`        | Maximum zoom relative to the starting size.             |
| [`onOpen`](#onopen)            | `function`                         |             | Runs before the intro animation.                        |
| [`onUpdate`](#onupdate)        | `function`                         |             | Runs after the active item changes.                     |
| [`onClose`](#onclose)          | `function`                         |             | Runs before the outro animation.                        |
| [`onClosed`](#onclosed)        | `function`                         |             | Runs after the gallery is removed.                      |
| [`onResize`](#onresize)        | `function`                         |             | Runs when the gallery size changes.                     |
| [`onImageClick`](#onimageclick) | `function`                        |             | Runs when an image is clicked.                          |
| [`onError`](#onerror)          | `function`                         |             | Runs when an image, audio or video fails to load.       |

### items

`NodeList`, `Node` or `Array`

The items to show. Elements pass their data through `href` and data attributes, objects pass it as properties. See [Item properties](#item-properties).

### el

`Node`

If the node matches one of the `items` (or the `element` of an item object), the gallery starts at that item and zooms out of it. Use it in a click handler with the clicked link.

### position

`number` · default `0`

The item to start at, counted from zero: the third item is `2`. Ignored when `el` matches an item.

### types

`string` or `string[]`

Only items of these types are included: `image`, `video` (also used for audio), `iframe` and `html`.

```js
bp.open({ items, types: ['image', 'video'] })
```

### scale

`number` · default `1`

The size of the item relative to the gallery. `1` fills it up to the edges.

### thumbs

`boolean` · default `false`

Shows a strip of thumbnails at the bottom of the gallery when it has more than one item.

### sizes

`string`

Sets the `sizes` attribute of every image with a `srcset`. By default it updates automatically as an image is zoomed.

### intro

`string`

Replaces the default zoom intro. `fadeup` is the only alternative.

### inline

`boolean` · default `false`

Mounts the gallery inline. It doesn't lock the page scroll or trap Tab, and leaves the keyboard to the page.

> [!TIP]
> Give the container of an inline gallery `position: relative`.

### noClose

`boolean` · default `false`

Hides the close button and keeps the gallery open until [`close`](#close) is called. Useful for inline galleries.

### noPinch

`function`

Return a truthy value to disable pinch zoom. It runs when the pinch starts and receives `container`, the gallery element.

```js
bp.open({
  noPinch: (container) => container.clientWidth < 800,
})
```

### focusWrap

`Node`

The element to trap focus in on Tab. Useful when the gallery is mounted inside a custom layout.

### maxZoom

`number` · default `10`

Limits zoom to `maxZoom` times the starting size, even if the item's `width` and `height` are larger. With `2`, an image that starts 800px wide zooms up to 1600px. `1` disables zoom. An item's own `maxZoom` overrides this value.

### onOpen

`function(container, activeItem)`

Runs just before the intro animation. `container` is the gallery element and `activeItem` is the data of the shown item.

```js
bp.open({
  onOpen: (container) => container.classList.add('custom-class'),
})
```

### onUpdate

`function(container, activeItem)`

Runs after the active item changes.

```js
bp.open({
  onUpdate(container, activeItem) {
    console.log(activeItem.i, activeItem.type)
  },
})
```

### onClose

`function(container, activeItem)`

Runs just before the outro animation.

### onClosed

`function()`

Runs after the gallery is closed and removed from the page.

### onResize

`function(container, activeItem)`

Runs when the size of the gallery (not the window) changes.

### onImageClick

`function(container, activeItem)`

Runs when an image is clicked. Return a truthy value to prevent zooming, for example to open a full screen gallery from an inline one.

### onError

`function(container, activeItem, error)`

Runs when an image, audio or video fails to load.

## Item properties

Pass them as data attributes (`data-img`, `data-max-zoom`) on elements, or as properties on objects. Properties that accept a `function` call it with the item and use the returned value.

| Property                 | Type                                   | Description                                                |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------- |
| [`link`](#link)          | `string`                               | A URL to detect the type from. Defaults to `href`.         |
| [`img`](#img)            | `string`                               | Image URL or `srcset`.                                     |
| [`sources`](#sources)    | `Array` or `string`                    | Video or audio sources.                                    |
| [`iframe`](#iframe)      | `string`                               | Iframe URL.                                                |
| [`html`](#html)          | `string`                               | HTML content.                                              |
| [`thumb`](#thumb)        | `string` or `HTMLImageElement`         | Thumbnail shown while the item loads.                      |
| [`fit`](#fit)            | `string`                               | How the item zooms out of its thumbnail.                   |
| [`width`](#width)        | `number`                               | Full width in pixels, `1920` by default.                   |
| [`height`](#height)      | `number`                               | Full height in pixels, `1080` by default.                  |
| [`alt`](#alt)            | `string`                               | Image alternative text.                                    |
| [`caption`](#caption)    | `string`                               | Caption below the item.                                    |
| [`title`](#title)        | `string`                               | Iframe title.                                              |
| [`tracks`](#tracks)      | `Array` or `string`                    | Video text tracks.                                         |
| [`attr`](#attr)          | `object` or `string`                   | Extra attributes for the media element.                    |
| [`sizes`](#sizes-1)      | `string`                               | `sizes` attribute for a `srcset` image.                    |
| [`maxZoom`](#maxzoom-1)  | `number`                               | Maximum zoom for this item.                                |
| `element`                | `Node`                                 | Element to zoom from and back into, for objects.           |

### link

`string` or `function`

A link to an image, video, audio, PDF, YouTube, Vimeo, SoundCloud, Google Drive or Dropbox file. It is parsed and shown with the right player. For elements it defaults to their `href`.

### img

`string` or `function`

The URL of the full image. Can be a `srcset` value, then the `sizes` value updates automatically as the image is zoomed. Override it with [`sizes`](#sizes).

### sources

`Array`, `string` or `function`

For native video and audio, an array of objects with [`src`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/source#src) (required) and [`type`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/source#type). A string is parsed as JSON. Each object creates a `<source>` element with its keys as attributes.

<!-- prettier-ignore -->
```html
<a href="video.webm" data-sources='[{"src": "video.webm", "type": "video/webm"}, {"src": "video.mp4", "type": "video/mp4"}]'>
```

### iframe

`string` or `function`

The URL of the iframe.

### html

`string` or `function`

HTML rendered in the gallery. Size it with CSS, `width` and `height` are not used.

For advanced use, pass an empty string and mount your own content in [`onOpen`](#onopen):

```js
bp.open({
  items: [{ html: '' }],
  onOpen(container) {
    container.querySelector('.bp-html').append(createScene())
  },
})
```

### thumb

`string`, `HTMLImageElement` or `function`

The thumbnail shown before the item loads. Defaults to the first image inside the element. An image element is also used to detect [`fit`](#fit).

### fit

`string` or `function`

How the item zooms out of its thumbnail and back: `cover` (keeps the crop), `contain` (keeps the letterboxing) or `fill`. By default it is read from the thumbnail's `object-fit`.

### width

`number` or `string` · default `1920`

The largest width of the item in pixels. Not needed for HTML.

### height

`number` or `string` · default `1080`

The largest height of the item in pixels. Not needed for HTML.

### alt

`string` or `function`

Image alternative text.

### caption

`string` or `function`

Text shown in the built-in caption. It may contain HTML, and can be styled with CSS.

### title

`string`

The title attribute of an iframe.

### tracks

`Array` or `string`

Text tracks for videos, such as subtitles in several languages. A string is parsed as JSON. See [the track element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/track) on MDN.

<!-- prettier-ignore -->
```html
<a href="video.webm" data-tracks='[{"label": "English", "kind": "captions", "srclang": "en", "src": "en.vtt", "default": "true"}, {"label": "Español", "kind": "captions", "srclang": "es", "src": "es.vtt"}]'>
```

### attr

`object`, `string` or `function`

Adds or overrides attributes of the `<img>`, `<iframe>`, `<video>` or `<audio>` element.

<!-- prettier-ignore -->
```html
<a href="https://example.com" data-iframe="https://example.com" data-attr='{"credentialless": true, "referrerpolicy": "no-referrer"}'>
```

### sizes

`string`

Sets the `sizes` attribute of an image with a `srcset`.

### maxZoom

`number` · default `10`

The maximum zoom of this item, overriding the [`maxZoom`](#maxzoom) option. The attribute is `data-max-zoom`.

## Passing items as objects

Use objects when the data doesn't live in the page. Add an `element` to zoom from it and back into it.

```js
bp.open({
  items: [
    {
      img: 'photo.jpg',
      thumb: 'photo_thumb.jpg',
      alt: 'Example',
      width: 2500,
      height: 1667,
      element: document.querySelector('#photo'),
    },
  ],
})
```

## Keyboard, mouse and touch

| Input                         | Action                                           |
| ----------------------------- | ------------------------------------------------ |
| <kbd>Esc</kbd>                | Close, unless `noClose` is set                   |
| <kbd>←</kbd> <kbd>→</kbd>     | Previous and next item                           |
| <kbd>+</kbd> <kbd>-</kbd>     | Zoom an image in and out                         |
| Arrow keys while zoomed       | Move the zoomed image                            |
| <kbd>Tab</kbd>                | Moves focus between the gallery controls only    |
| Click or tap an image         | Zoom in to full size, click again to zoom out    |
| Mouse wheel, pinch            | Zoom in and out around the pointer               |
| Drag                          | Move a zoomed image                              |
| Swipe left or right           | Previous and next item                           |
| Swipe up, click the backdrop  | Close                                            |

Inline galleries handle the mouse and touch, but leave the keyboard to the page.

## Development

```sh
npm install
npm start       # watch the library and the docs page, serve it locally
npm run build   # build dist/ and demo/demo.css
```

The docs page is [`index.html`](index.html), with its scripts and styles in [`demo/`](demo). It is published to GitHub Pages on every push to `main`.

## License

[MIT](license)
