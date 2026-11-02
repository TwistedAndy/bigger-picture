<div align="center">

<a href="https://twistedandy.github.io/bigger-picture/"><img src="demo/assets/bp.svg" alt="Bigger Picture" width="560" /></a>

<p>A small, fast JavaScript lightbox for images, video, audio, embeds and HTML.<br />Smooth zoom from the thumbnail and back, deep zoom with responsive images, and no dependencies.</p>

[![Release](https://flat.badgen.net/github/release/TwistedAndy/bigger-picture?color=blue)](https://github.com/TwistedAndy/bigger-picture/releases)
[![Gzip size](https://flat.badgen.net/static/gzip/12.9%20kB/green)](dist/bigger-picture.min.js)
[![MIT license](https://flat.badgen.net/github/license/TwistedAndy/bigger-picture?color=purple)](license)

**[Documentation and live examples](https://twistedandy.github.io/bigger-picture/)** · [Releases](https://github.com/TwistedAndy/bigger-picture/releases) · [Issues](https://github.com/TwistedAndy/bigger-picture/issues)

</div>

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
  href="https://cdn.jsdelivr.net/gh/TwistedAndy/bigger-picture@v1.3.4/dist/bigger-picture.css"
  integrity="sha384-tEI3UHzAQ0rIC5S48cnLZacTs0uVGj5eRQgiqxCk65LatYhug69UZBoQtzuokT/O"
  crossorigin="anonymous"
/>
<script
  src="https://cdn.jsdelivr.net/gh/TwistedAndy/bigger-picture@v1.3.4/dist/bigger-picture.umd.js"
  integrity="sha384-rjOvWQd85rKO0H/cHCHLq7sQj1mWjadJQJ4nQNpWpkdAdAp7xWkT6xgxS0aWYwB9"
  crossorigin="anonymous"
></script>
```

Or install it from npm and import it with a bundler:

```sh
npm install @twistedandy/bigger-picture
```

```js
import BiggerPicture from '@twistedandy/bigger-picture'
import '@twistedandy/bigger-picture/css'
```

The styles are also available as [SCSS](dist/bigger-picture.scss) (`@twistedandy/bigger-picture/scss`) and can be themed with CSS variables.

The bundled builds include Svelte 4 and work in any project. Svelte 4 and Svelte 5 apps can import the source with `@twistedandy/bigger-picture/svelte` instead, so the gallery shares the app's Svelte runtime. Svelte 5 compiles it in legacy mode, so keep `runes` unset for this package.

## Quick start

Create one instance and open it on click. Passing the clicked element as `current` starts the gallery at that item and zooms out of it.

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
    current: link,
    items: link.closest('.gallery').querySelectorAll('a'),
    thumbs: true,
  })
})
```

The image inside each link is used as the thumbnail. See the [documentation](https://twistedandy.github.io/bigger-picture/) for more examples: video with subtitles, embeds, captions, inline galleries, HTML content, filtering, dialog mode and theming.

## Frameworks

The gallery works the same way in any framework: create one instance once the component is mounted, and call `open` from a click handler. It mounts in `document.body`, outside the component tree, so the framework doesn't render or update it.

### React

```jsx
'use client' // Next.js only

import { useEffect, useRef } from 'react'
import BiggerPicture from '@twistedandy/bigger-picture'
import '@twistedandy/bigger-picture/css'

export function Gallery({ images }) {
  const bp = useRef(null)
  const list = useRef(null)

  useEffect(() => {
    bp.current = BiggerPicture()
    return () => bp.current.close()
  }, [])

  const open = (event) => {
    event.preventDefault()
    bp.current.open({
      items: list.current.querySelectorAll('a'),
      current: event.currentTarget,
    })
  }

  return (
    <div ref={list}>
      {images.map((image) => (
        <a key={image.src} href={image.src} onClick={open}>
          <img src={image.thumb} alt={image.alt} />
        </a>
      ))}
    </div>
  )
}
```

### Vue

```vue
<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import BiggerPicture from '@twistedandy/bigger-picture'
import '@twistedandy/bigger-picture/css'

defineProps(['images'])

const list = ref(null)
let bp

onMounted(() => (bp = BiggerPicture()))
onBeforeUnmount(() => bp.close())

const open = (event) => {
  bp.open({
    items: list.value.querySelectorAll('a'),
    current: event.currentTarget,
  })
}
</script>

<template>
  <div ref="list">
    <a v-for="image in images" :key="image.src" :href="image.src" @click.prevent="open">
      <img :src="image.thumb" :alt="image.alt" />
    </a>
  </div>
</template>
```

### Svelte

Import the source from `@twistedandy/bigger-picture/svelte`, so the gallery uses the app's own Svelte runtime instead of bundling a second one.

```svelte
<script>
  import { onMount } from 'svelte'
  import BiggerPicture from '@twistedandy/bigger-picture/svelte'
  import '@twistedandy/bigger-picture/css'

  let { images } = $props()
  let list
  let bp

  onMount(() => {
    bp = BiggerPicture()
    return () => bp.close()
  })

  const open = (event) => {
    event.preventDefault()
    bp.open({
      items: list.querySelectorAll('a'),
      current: event.currentTarget,
    })
  }
</script>

<div bind:this={list}>
  {#each images as image (image.src)}
    <a href={image.src} onclick={open}>
      <img src={image.thumb} alt={image.alt} />
    </a>
  {/each}
</div>
```

This is Svelte 5. In Svelte 4, use `export let images` and `on:click={open}`.

### Things to know

- **Server rendering:** `BiggerPicture()` needs `document`, so create it after mount (`useEffect`, `onMounted`, `onMount`), never during the render on the server.
- **One instance:** create it once per app or layout and pass it down, or keep it in a module, rather than one per gallery.
- **Items from data:** instead of links, pass objects such as `{ link, thumb, alt, width, height, element }`. The `element` is the DOM node the gallery zooms from.
- **Components in the gallery:** an [`html`](#html) item takes a string. To show a framework component, pass `html: ''` and mount the component in [`onOpen`](#onopen) into `container.querySelector('.bp-html')`.
- **State:** the gallery reports back through the callbacks, for example [`onUpdate`](#onupdate) for the shown item and [`onClosed`](#onclosed) when it's gone.

## Initialization

`BiggerPicture(options)` creates an instance. Without options it mounts in `document.body`. You only need one instance, unless you want galleries in different targets.

| Option   | Type          | Description                                                                                                        |
| -------- | ------------- | ------------------------------------------------------------------------------------------------------------------ |
| `target` | `HTMLElement` | Element the gallery is mounted in, `document.body` by default.                                                     |
| `dialog` | `boolean`     | Renders the gallery as a `<dialog>` opened with `showModal()`, so it appears in the top layer above other modals. |

```js
const bp = BiggerPicture({ dialog: true })
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
| [`current`](#current)          | `Node`                             |             | Item to start at, and to zoom from and back into.       |
| [`position`](#position)        | `number`                           | `0`         | Item to start at, counted from zero.                    |
| [`types`](#types)              | `string` or `string[]`             | all         | Item types to include.                                  |
| [`scale`](#scale)              | `number`                           | `1`         | Size of the item relative to the gallery.               |
| [`thumbs`](#thumbs)            | `boolean`                          | `false`     | Shows a strip of thumbnails.                            |
| [`sizes`](#sizes)              | `string`                           |             | `sizes` attribute for every `srcset` image.             |
| [`zoom`](#zoom)                | `boolean`                          | `true`      | Zooms from `current` and back, or fades with `false`.   |
| [`inline`](#inline)            | `boolean`                          | `false`     | Inline gallery that leaves scroll and Tab to the page.  |
| [`persistent`](#persistent)    | `boolean`                          | `false`     | Hides the close button and ignores Esc.                 |
| [`noPinch`](#nopinch)          | `boolean` or `function`            | `false`     | Disables pinch zoom.                                    |
| [`focusWrap`](#focuswrap)      | `Node`                             |             | Element to trap focus in.                               |
| [`maxZoom`](#maxzoom)          | `number`                           | `10`        | Maximum zoom relative to the starting size.             |
| [`history`](#history)          | `boolean`                          | `false`     | The back button closes the gallery.                     |
| [`download`](#download)        | `boolean`                          | `false`     | Shows a download link next to the close button.         |
| [`labels`](#labels)            | `object`                           |             | Texts of the controls, for translations.                |
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

### current

`Node`

If the node matches one of the `items` (or the `element` of an item object), the gallery starts at that item and zooms out of it. Use it in a click handler with the clicked link. A set [`position`](#position) wins over it.

`el` is the deprecated name of this option and still works.

### position

`number` · default `0`

The item to start at, counted from zero: the third item is `2`. Without it, the gallery starts at the item of [`current`](#current), or the first one.

### types

`string` or `string[]`

Only items of these types are included: `image`, `video`, `audio`, `iframe` and `html`.

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

### zoom

`boolean` · default `true`

Zooms the item out of its element on open and back into it on close. With `false` it fades up and down instead, which suits inline galleries.

`intro: 'fadeup'` is the deprecated name of `zoom: false` and still works.

### inline

`boolean` · default `false`

Mounts the gallery inline. It doesn't lock the page scroll or trap Tab, and leaves the keyboard to the page.

> [!TIP]
> Give the container of an inline gallery `position: relative`.

### persistent

`boolean` · default `false`

Hides the close button and keeps the gallery open until [`close`](#close) is called. Useful for inline galleries.

`noClose` is the deprecated name of this option and still works.

### noPinch

`boolean` or `function` · default `false`

Disables pinch zoom. A function runs when the pinch starts, receives `container`, the gallery element, and disables it by returning a truthy value.

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

### history

`boolean` · default `false`

Adds a history entry when the gallery opens, so the back button, or the back swipe on phones, closes the gallery instead of leaving the page. Closing the gallery otherwise removes the entry. Inline galleries ignore it.

### download

`boolean` · default `false`

Shows a download link next to the close button. It downloads the image, the largest one of a `srcset`, or the first video or audio source. Iframes and HTML show it only with their own [`download`](#download-1) URL, which also replaces the default one, for example with the original file.

```js
bp.open({ items, download: true })
```

> [!NOTE]
> Browsers download only files of the same origin. A file on another origin, for example a CDN, opens in a new tab instead, unless the server sends it with `Content-Disposition: attachment`.

### labels

`object`

Texts of the controls, read by screen readers and shown as tooltips. Pass only the ones to change.

```js
bp.open({
  items,
  labels: {
    close: 'Fermer',
    download: 'Télécharger',
    prev: 'Précédent',
    next: 'Suivant',
    thumb: 'Image', // followed by the number on thumbnails without alt or caption
    gallery: 'Galerie',
  },
})
```

The defaults are `Close`, `Download`, `Previous`, `Next`, `View image` and `Gallery`.

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

`function(container, activeItem)`

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

Pass them as data attributes (`data-link`, `data-max-zoom`) on elements, or as properties on objects.

| Property                 | Type                                   | Description                                                |
| ------------------------ | -------------------------------------- | ---------------------------------------------------------- |
| [`link`](#link)          | `string`                               | The URL to show, its type is detected. Defaults to `href`. |
| [`type`](#type)          | `string`                               | Shows `link` as this type without detection.               |
| [`sources`](#sources)    | `Array` or `string`                    | Video or audio sources.                                    |
| [`html`](#html)          | `string`                               | HTML content.                                              |
| [`thumb`](#thumb)        | `string` or `HTMLImageElement`         | Thumbnail shown while the item loads.                      |
| [`fit`](#fit)            | `string`                               | How the item zooms out of its thumbnail.                   |
| [`width`](#width)        | `number`                               | Full width in pixels, `1920` by default.                   |
| [`height`](#height)      | `number`                               | Full height in pixels, `1080` by default.                  |
| [`alt`](#alt)            | `string`                               | Alternative text, also names iframes and players.          |
| [`caption`](#caption)    | `string`                               | Caption below the item.                                    |
| [`tracks`](#tracks)      | `Array` or `string`                    | Video text tracks.                                         |
| [`attr`](#attr)          | `object` or `string`                   | Extra attributes for the media element.                    |
| [`sizes`](#sizes-1)      | `string`                               | `sizes` attribute for a `srcset` image.                    |
| [`maxZoom`](#maxzoom-1)  | `number`                               | Maximum zoom for this item.                                |
| [`download`](#download-1) | `string` or `boolean`                 | Download URL, or `false` to hide the link.                 |
| `element`                | `Node`                                 | Element to zoom from and back into, for objects.           |

### link

`string`

The URL of the item, for elements their `href` by default. The type is detected from it: images, video, audio, PDF, YouTube, Vimeo, SoundCloud, Google Drive and Dropbox links. A `srcset` value is an image too, and then the `sizes` value updates automatically as the image is zoomed. Override it with [`sizes`](#sizes).

<!-- prettier-ignore -->
```html
<a href="photo.jpg" data-link="photo-1200.jpg 1200w, photo.jpg 2400w">
```

Links of other types are skipped, unless [`type`](#type) says how to show them.

### type

`string`

Shows [`link`](#link) as `image`, `video`, `audio` or `iframe` as it is, without detection. Use it for a web page, or a media URL without a file extension.

```html
<a href="https://example.com" data-type="iframe" data-width="1200" data-height="800">Example</a>
```

In callbacks, `activeItem.type` is the resolved type: `image`, `video`, `audio`, `iframe` or `html`, and `activeItem.link` the URL shown, such as the embed URL of a YouTube link.

### sources

`Array` or `string`

For native video and audio, an array of objects with [`src`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/source#src) (required) and [`type`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/source#type). A string is parsed as JSON. Each object creates a `<source>` element with its keys as attributes. The item is `audio` when the first source's `type` starts with `audio/`, or [`type`](#type) is `audio`, and `video` otherwise.

A video or audio opened again resumes from where it was closed, until the page reloads. The position is stored by the first `src`, and a finished one starts over.

<!-- prettier-ignore -->
```html
<a href="video.webm" data-sources='[{"src": "video.webm", "type": "video/webm"}, {"src": "video.mp4", "type": "video/mp4"}]'>
```

### html

`string`

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

`string` or `HTMLImageElement`

The thumbnail shown before the item loads. Defaults to the first image inside the element. An image element is also used to detect [`fit`](#fit).

### fit

`string`

How the item zooms out of its thumbnail and back: `cover` (keeps the crop), `contain` (keeps the letterboxing) or `fill`. By default it is read from the thumbnail's `object-fit`.

### width

`number` or `string` · default `1920`

The largest width of the item in pixels. Not needed for HTML.

### height

`number` or `string` · default `1080`

The largest height of the item in pixels. Not needed for HTML.

### alt

`string`

Alternative text of the image. Iframes use it as their `title`, and video and audio players as their `aria-label`.

`title` is the deprecated name of this property and still works.

### caption

`string`

Text shown in the built-in caption. It may contain HTML, and can be styled with CSS.

### tracks

`Array` or `string`

Text tracks for videos, such as subtitles in several languages. A string is parsed as JSON. See [the track element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/track) on MDN.

<!-- prettier-ignore -->
```html
<a href="video.webm" data-tracks='[{"label": "English", "kind": "captions", "srclang": "en", "src": "en.vtt", "default": "true"}, {"label": "Español", "kind": "captions", "srclang": "es", "src": "es.vtt"}]'>
```

### attr

`object` or `string`

Adds or overrides attributes of the `<img>`, `<iframe>`, `<video>` or `<audio>` element. Items can share one object.

<!-- prettier-ignore -->
```html
<a href="https://example.com" data-type="iframe" data-attr='{"credentialless": true, "referrerpolicy": "no-referrer"}'>
```

### sizes

`string`

Sets the `sizes` attribute of an image with a `srcset`, overriding the [`sizes`](#sizes) option.

### maxZoom

`number` · default `10`

The maximum zoom of this item, overriding the [`maxZoom`](#maxzoom) option. The attribute is `data-max-zoom`.

### download

`string` or `boolean`

The URL of the [download](#download) link, for example the original file of a smaller image. `false` hides the link for this item, and `true` or an empty `data-download` attribute shows it even without the `download` option.

<!-- prettier-ignore -->
```html
<a href="photo-1200.jpg" data-download="photo-original.jpg">
```

## Passing items as objects

Use objects when the data doesn't live in the page. Add an `element` to zoom from it and back into it.

The gallery works on copies and leaves your objects unchanged. `activeItem` in callbacks is such a copy, so compare it by `activeItem.i` or `activeItem.element`.

```js
bp.open({
  items: [
    {
      link: 'photo.jpg',
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
| <kbd>Esc</kbd>                | Close, unless `persistent` is set                |
| <kbd>←</kbd> <kbd>→</kbd>     | Previous and next item                           |
| <kbd>+</kbd> <kbd>-</kbd>     | Zoom an image in and out                         |
| Arrow keys while zoomed       | Move the zoomed image                            |
| <kbd>Tab</kbd>                | Moves focus between the gallery controls only    |
| Click or tap an image         | Zoom in to full size, click again to zoom out    |
| Mouse wheel, pinch            | Zoom in and out around the pointer               |
| Drag                          | Move a zoomed image                              |
| Swipe left or right           | Previous and next item                           |
| Swipe up, click the backdrop  | Close                                            |

The gallery takes the focus when it opens and gives it back to the element that had it on close. Inline galleries handle the mouse and touch, but leave the keyboard to the page.

## Page scroll

While open, the gallery adds `.bp-lock` to `<html>` to stop the page scroll and pads it for the hidden scrollbar. Full-width `position: fixed` elements still move by the scrollbar width. To keep them in place, reserve the scrollbar space in your CSS, and the gallery skips the padding:

```css
html {
	scrollbar-gutter: stable;
}
```

## Upgrading from 1.2

- `img` and `iframe` are now [`link`](#link): `data-img` becomes `data-link`, and `data-iframe="url"` becomes `data-link="url" data-type="iframe"`. A `srcset` value is detected as an image.
- [`type`](#type) shows the link as that type even when it is detected as another one, and also accepts `video` and `audio`.
- Item properties no longer accept functions. Compute the values before calling `open`.
- Audio is its own `audio` type, in [`types`](#types) and in `activeItem.type`.
- `activeItem.link` is the URL shown, and `activeItem.img` and `activeItem.iframe` are gone.

## Development

```sh
npm install
npm start       # watch the library and the docs page, serve it locally
npm run build   # build dist/ and demo/demo.css
```

The docs page is [`index.html`](index.html), with its scripts and styles in [`demo/`](demo). It is published to GitHub Pages on every push to `main`.

## License

[MIT](license)
