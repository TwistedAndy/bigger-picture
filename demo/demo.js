/* global BiggerPicture, Prism */
;(() => {
	'use strict'

	const $ = (selector, root = document) => root.querySelector(selector)
	const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]

	/**
	 * One full screen instance serves every example, the same way most sites use it
	 */
	const bp = BiggerPicture()

	/**
	 * Open a gallery when a matching element inside the container is clicked.
	 * Passing the clicked element as `el` makes the gallery zoom out of it and back.
	 */
	const delegate = (container, selector, getOptions, instance = bp) => {
		container?.addEventListener('click', (event) => {
			const element = event.target.closest(selector)
			if (!element || !container.contains(element)) {
				return
			}
			event.preventDefault()
			const options = getOptions(element)
			if (options) {
				instance.open({ el: element, ...options })
			}
		})
	}

	/**
	 * Read the items of a data attribute gallery as objects
	 */
	const datasetItems = (selector) => $$(selector).map((link) => ({ ...link.dataset }))

	// Hero, quick start and the main image gallery

	delegate($('#hero_gallery'), 'a', () => ({ items: $$('#hero_gallery a'), thumbs: true }))

	delegate($('#quick_start'), 'a', () => ({ items: $$('#quick_start a') }))

	delegate($('#image_gallery'), 'a', () => ({ items: $$('#image_gallery a'), thumbs: true }))

	// Automatic link detection

	const linkSelector = [
		'a[href$=".jpg"]',
		'a[href$=".png"]',
		'a[href$=".webp"]',
		'a[href$=".webm"]',
		'a[href$=".mp4"]',
		'a[href$=".mp3"]',
		'a[href$=".pdf"]',
		'a[href*="youtube.com"]',
		'a[href*="youtu.be"]',
		'a[href*="vimeo.com"]',
		'a[href*="soundcloud.com"]',
	].join(', ')

	const article = $('#link_article')

	delegate(article, linkSelector, () => ({
		items: $$(linkSelector, article),
		thumbs: true,
	}))

	// Items from JavaScript objects

	const objectButtons = $$('#object_items button')

	const objectItems = objectButtons.map((button) => {
		const thumb = $('img', button)
		const width = thumb.getAttribute('width')
		const height = thumb.getAttribute('height')
		return {
			link: thumb.src.replace('_thumb', ''),
			thumb: thumb.src,
			alt: thumb.alt,
			width,
			height,
			element: button,
			caption: `${thumb.alt}, ${width} × ${height}`,
		}
	})

	delegate($('#object_items'), 'button', () => ({ items: objectItems, thumbs: true }))

	// Video, audio and embeds open on their own

	delegate($('#media'), 'a', (link) => ({ items: link }))

	delegate($('#embeds_grid'), 'a', (link) => ({ items: link }))

	delegate($('#responsive_map')?.parentElement, 'a', (link) => ({ items: link }))

	// Cropped and letterboxed thumbnails, captions

	for (const id of ['#fit_cover', '#fit_contain', '#captions_gallery']) {
		delegate($(id), 'a', () => ({ items: $$(`${id} a`) }))
	}

	// HTML content

	delegate($('#html_grid'), '#html_dialog', (button) => ({
		items: [{ html: $('#dialog_template').innerHTML, element: button }],
		onOpen(container) {
			for (const action of $$('.message_box .button', container)) {
				action.addEventListener('click', bp.close)
			}
		},
	}))

	const slides = [
		['01', 'Mix any content', 'HTML items sit next to images and videos in the same gallery.'],
		['02', 'Style with CSS', 'Size and lay out HTML items with your own styles; width and height are not used.'],
		['03', 'Navigate as usual', 'Arrow keys, swipes and the counter work the same as for images.'],
	]

	// every slide zooms from the same button, so start at the first one instead of matching `el`
	delegate($('#html_grid'), '#html_slides', (button) => ({
		el: null,
		items: slides.map(([number, title, text]) => ({
			html: `<div class="message_box is_slide"><span class="caption">${number}</span><h3>${title}</h3><p class="text">${text}</p></div>`,
			element: button,
		})),
	}))

	delegate($('#html_grid'), '#html_firewatch', (button) => {
		let parallax
		return {
			items: [{ html: '', element: button }],
			onOpen(container) {
				parallax = mountParallax($('.bp-html', container))
			},
			onClose() {
				parallax.classList.add('is_closing')
			},
		}
	})

	/**
	 * Parallax scene from the Firewatch website, built when the gallery opens
	 */
	function mountParallax(target) {
		const scene = document.createElement('div')
		scene.className = 'parallax_box'
		scene.innerHTML =
			'<div class="images">' +
			Array.from(
				{ length: 9 },
				(_, i) => `<img src="https://assets.henrygd.me/bp/images/firewatch/parallax${i}.png" alt="" decoding="async" />`
			).join('') +
			'</div><span class="caption">Scroll down</span>' +
			'<div class="wrapper"><div class="content">You have scrolled <b>0</b> pixels</div></div>' +
			'<img class="cover" src="https://assets.henrygd.me/bp/images/firewatch-2.png" alt="" decoding="async" />'

		const layers = $$('.images img', scene)
		const hint = $('.caption', scene)
		const counter = $('.content b', scene)
		let frame

		$('.wrapper', scene).addEventListener('scroll', (event) => {
			const y = event.target.scrollTop
			cancelAnimationFrame(frame)
			frame = requestAnimationFrame(() => {
				layers.forEach((layer, i) => {
					layer.style.transform = `translate3d(0, ${(-y * i) / (layers.length - 1)}px, 0)`
				})
				hint.style.opacity = Math.max(0, 1 - y / 50)
				counter.textContent = Math.round(y)
			})
		})

		target.append(scene)
		return scene
	}

	// Inline gallery that opens full screen on click

	const inlineWrap = $('#inline_gallery')

	const openInline = () => {
		const inline = BiggerPicture({ target: inlineWrap })
		const items = datasetItems('#image_gallery a')
		const lastImage = (container) => $$('.bp-img', container).pop()

		inline.open({
			items,
			position: 2,
			intro: 'fadeup',
			inline: true,
			noClose: true,
			thumbs: true,
			onImageClick(container, activeItem) {
				bp.open({
					items: items.map((item) => ({ ...item, element: lastImage(container) })),
					position: activeItem.i,
					onUpdate(_, item) {
						inline.setPosition(item.i)
						// close back into the image the inline gallery shows now
						requestAnimationFrame(() => (item.element = lastImage(container)))
					},
				})
				return true
			},
		})
	}

	// Gallery controlled through the API, with a log of the callbacks

	const apiWrap = $('#api_gallery')
	const apiLog = $('#api_log')
	const apiToggle = $('[data-api="toggle"]')

	let apiInstance
	let apiItem

	const log = (name, detail = '') => {
		const entry = document.createElement('li')
		const time = new Date().toLocaleTimeString([], { hour12: false })
		entry.innerHTML = `<time>${time}</time><b>${name}</b><span>${detail}</span>`
		apiLog.prepend(entry)
		while (apiLog.children.length > 12) {
			apiLog.lastChild.remove()
		}
	}

	const describe = (item) => `item ${item.i + 1}, ${item.type}`

	const openApi = () => {
		apiInstance ??= BiggerPicture({ target: apiWrap })
		apiInstance.open({
			items: datasetItems('#image_gallery a').slice(0, 6),
			intro: 'fadeup',
			inline: true,
			noClose: true,
			onOpen(container, item) {
				apiItem = item
				log('onOpen', describe(item))
			},
			onUpdate(container, item) {
				apiItem = item
				log('onUpdate', describe(item))
			},
			onResize(container) {
				log('onResize', `${container.clientWidth} × ${container.clientHeight}`)
			},
			onImageClick(container, item) {
				log('onImageClick', `zoom ${item.zoom ? 'out' : 'in'}`)
			},
			onClose(container, item) {
				log('onClose', describe(item))
			},
			onClosed() {
				apiItem = null
				log('onClosed')
				apiToggle.textContent = 'open()'
			},
		})
		apiToggle.textContent = 'close()'
	}

	const apiActions = {
		prev: () => apiInstance.prev(),
		next: () => apiInstance.next(),
		position: () => apiInstance.setPosition(0),
		zoom() {
			if (apiItem?.type === 'image') {
				apiItem.zoom = !apiItem.zoom
			}
		},
		toggle: () => (apiItem ? apiInstance.close() : openApi()),
	}

	apiWrap?.parentElement.addEventListener('click', (event) => {
		const action = event.target.closest('[data-api]')?.dataset.api
		if (action && (apiItem || action === 'toggle')) {
			apiActions[action]()
		}
	})

	// Open the inline galleries when they scroll into view

	const lazyObserver = new IntersectionObserver((entries) => {
		for (const entry of entries) {
			if (entry.isIntersecting) {
				lazyObserver.unobserve(entry.target)
				entry.target === inlineWrap ? openInline() : openApi()
			}
		}
	})

	for (const wrap of [inlineWrap, apiWrap]) {
		wrap && lazyObserver.observe(wrap)
	}

	// Filtering by type

	const filterGrid = $('#filter_grid')
	let filterTypes

	$('#type_filter')?.addEventListener('change', (event) => {
		filterTypes = event.target.value ? event.target.value.split(',') : undefined
		for (const link of $$('a', filterGrid)) {
			link.classList.toggle('disabled', !!filterTypes && !filterTypes.includes(link.dataset.kind))
		}
	})

	delegate(filterGrid, 'a', (link) =>
		link.classList.contains('disabled') ? null : { items: $$('a', filterGrid), types: filterTypes, thumbs: true }
	)

	// Dialog mode

	const dialogBp = BiggerPicture({ target: document.body, dialog: true })
	const useDialog = $('#use_dialog')

	document.addEventListener('click', (event) => {
		const button = event.target.closest('[data-modal]')
		if (button) {
			document.getElementById(button.dataset.modal).showModal()
		}
	})

	$('#modal_grid')?.addEventListener('click', (event) => {
		const link = event.target.closest('a')
		if (link) {
			event.preventDefault()
			// a regular gallery is drawn under the modal, because the modal is in the top layer
			const instance = useDialog.checked ? dialogBp : bp
			instance.open({ items: $$('#modal_grid a'), el: link })
		}
	})

	// Theming

	delegate($('#theme_grid'), 'a', () => ({
		items: $$('#theme_grid a'),
		thumbs: true,
		onOpen: (container) => container.classList.add('is_light'),
	}))

	// Table of contents: highlight the section in view

	const toc = $('.wrapper_box .sidebar')
	const tocLinks = new Map($$('a', toc).map((link) => [link.hash.slice(1), link]))

	const tocObserver = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const active = entry.isIntersecting && tocLinks.get(entry.target.id)
				if (!active) {
					continue
				}
				for (const link of tocLinks.values()) {
					link.parentElement.classList.toggle('active', link === active)
				}
				// keep the active link visible without scrolling the page
				const { offsetTop, offsetHeight } = active
				if (offsetTop < toc.scrollTop || offsetTop + offsetHeight > toc.scrollTop + toc.clientHeight) {
					toc.scrollTo({ top: offsetTop - toc.clientHeight / 2, behavior: 'smooth' })
				}
			}
		},
		{ rootMargin: '-80px 0px -65% 0px' }
	)

	for (const section of $$('.wrapper_box .section')) {
		tocObserver.observe(section)
	}

	// Copy buttons on code samples

	document.addEventListener('click', (event) => {
		const button = event.target.closest('[data-copy]')
		if (!button) {
			return
		}
		const text = $('code', button.closest('.code')).textContent
		navigator.clipboard?.writeText(text).then(() => {
			button.textContent = 'Copied'
			setTimeout(() => (button.textContent = 'Copy'), 1500)
		})
	})

	window.Prism?.highlightAll()
})()
