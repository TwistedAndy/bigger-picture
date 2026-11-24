// Browser checks of the gallery. Run: npm run e2e
// A local server gives the test page, the library and generated images, so the checks need no web server and no network.
// The checks run in groups, and the groups run at the same time. Each group has its own Chrome, so that its page has the keyboard focus.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { crc32, deflateSync } from 'node:zlib';
import puppeteer from 'puppeteer-core';

const root = new URL('..', import.meta.url);
const chrome = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
// The built library to test. The mutation script sets other files.
const script = process.env.BP_SCRIPT || new URL('dist/bigger-picture.min.js', root);
const style = process.env.BP_STYLE || new URL('dist/bigger-picture.css', root);
// The number of Chromes at the same time. A Chrome needs about four CPU threads: with more Chromes, the frames come late and the motion checks fail.
const workers = +process.env.E2E_WORKERS || Math.max(1, Math.floor(availableParallelism() / 4));
// For the mutation script: E2E_FAILS is a file to write the names of the failed checks to. E2E_KNOWN is such a file
// from the run of the original code: its checks can fail, and the run stops at the first other failed check.
const known = new Set(process.env.E2E_KNOWN ? JSON.parse(await readFile(process.env.E2E_KNOWN, 'utf8')) : []),
	bail = !!process.env.E2E_KNOWN,
	failures = [];
// Run only the groups with these names, separated by commas
const only = process.env.E2E_GROUPS?.split(',');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Make a PNG of the given size with four colored quarters, so that the image has no transparent pixels.
 *
 * @param {number} width
 * @param {number} height
 * @returns {Buffer}
 */
function png(width, height) {
	const row = (left, right) => {
		const line = Buffer.alloc(1 + width * 3);
		for (let x = 0; x < width; x++) {
			(x < width / 2 ? left : right).forEach((value, index) => (line[1 + x * 3 + index] = value));
		}
		return line;
	};
	const top = row([200, 60, 60], [60, 160, 60]),
		bottom = row([60, 90, 200], [220, 200, 60]),
		raw = Buffer.concat(Array.from({ length: height }, (item, y) => (y < height / 2 ? top : bottom))),
		chunk = (type, data) => {
			const length = Buffer.alloc(4),
				sum = Buffer.alloc(4),
				body = Buffer.concat([Buffer.from(type), data]);
			length.writeUInt32BE(data.length);
			sum.writeUInt32BE(crc32(body));
			return Buffer.concat([length, body, sum]);
		},
		header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.set([8, 2, 0, 0, 0], 8);
	return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Make a WAV file with one second of a quiet tone.
 *
 * @returns {Buffer}
 */
function wav() {
	const rate = 8000,
		data = Buffer.alloc(rate),
		head = Buffer.alloc(44);
	for (let index = 0; index < rate; index++) {
		data[index] = 128 + Math.round(10 * Math.sin(index / 4));
	}
	head.write('RIFF', 0);
	head.writeUInt32LE(36 + rate, 4);
	head.write('WAVEfmt ', 8);
	head.writeUInt32LE(16, 16);
	head.writeUInt16LE(1, 20);
	head.writeUInt16LE(1, 22);
	head.writeUInt32LE(rate, 24);
	head.writeUInt32LE(rate, 28);
	head.writeUInt16LE(1, 32);
	head.writeUInt16LE(8, 34);
	head.write('data', 36);
	head.writeUInt32LE(rate, 40);
	return Buffer.concat([head, data]);
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tests</title>
<link rel="stylesheet" href="/lib.css">
<style>
body { margin: 0; font: 16px/1.4 sans-serif; min-height: 3000px; }
/* A scrollbar that takes space, as on a desktop, so that the checks see the padding of the scroll lock */
::-webkit-scrollbar { width: 15px; height: 15px; }
::-webkit-scrollbar-thumb { background: #999; }
#root { display: grid; grid-template-columns: repeat(4, 200px); gap: 10px; padding: 20px; }
#root a { display: block; height: 150px; }
#root img { display: block; width: 100%; height: 100%; object-fit: cover; }
#box { position: absolute; top: 1000px; left: 20px; width: 340px; height: 240px; }
</style>
</head>
<body><div id="root"></div><form id="box" action="/submitted"></form><script src="/lib.js"></script></body>
</html>`;

// The local server. served holds each request path, so that the checks can count the loads of a file.
const images = new Map(),
	served = [],
	server = createServer(async (request, response) => {
		const url = new URL(request.url, 'http://localhost'),
			delay = +url.searchParams.get('delay') || 0,
			size = url.pathname.match(/(\d+)x(\d+)\.png$/),
			send = (type, body, status = 200) => {
				response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'max-age=3600' });
				response.end(body);
			};
		served.push(url.pathname + url.search);
		await wait(delay);
		try {
			if (url.searchParams.has('status')) {
				send('text/plain', '', +url.searchParams.get('status'));
			} else if (size) {
				const key = size[1] + 'x' + size[2];
				images.has(key) || images.set(key, png(+size[1], +size[2]));
				send('image/png', images.get(key));
			} else if (url.pathname === '/favicon.ico') {
				send('image/x-icon', '', 204);
			} else if (url.pathname === '/') {
				send('text/html', page);
			} else if (url.pathname === '/lib.js') {
				send('text/javascript', await readFile(script));
			} else if (url.pathname === '/lib.css') {
				send('text/css', await readFile(style));
			} else if (url.pathname === '/tone.wav') {
				send('audio/wav', wav());
			} else if (url.pathname === '/frame.html') {
				send('text/html', '<!doctype html><title>Frame</title><p>Frame</p>');
			} else {
				send('text/plain', 'Not found', 404);
			}
		} catch (error) {
			send('text/plain', error.message, 500);
		}
	});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port + '/';

// The number of requests to the paths that contain a text
const requests = (part) => served.filter((path) => path.includes(part)).length;

/**
 * The helpers in the page, in window.t. They make the links, open the gallery, wait for the motions and measure the items.
 */
function helpers() {
	const $ = (selector, node = document) => node.querySelector(selector),
		$$ = (selector, node = document) => [...node.querySelectorAll(selector)],
		frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve())),
		wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		box = (rect) => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });

	const t = (window.t = {
		$,
		$$,
		frame,
		wait,
		log: [],
		options: {},

		// The URL of a generated image. The tag and the index make the URL unique, so that the checks can count its loads.
		image: (tag, width, height, delay) => '/img/' + tag + '/' + width + 'x' + height + '.png' + (delay ? '?delay=' + delay : ''),

		/**
		 * Make the links in #root. Each spec has the image size (w, h) and can have: tag, thumb [w, h] or false, fit, alt,
		 * caption, lazy, delay, style, data. A click on a link opens the gallery with t.options.
		 */
		grid(specs, css = '') {
			const list = $('#root');
			list.innerHTML = '';
			list.style.cssText = css;
			specs.forEach((spec, index) => {
				const link = document.createElement('a'),
					tag = (spec.tag || 'grid') + '/' + index,
					[width, height] = spec.thumb || [300, Math.round((300 * spec.h) / spec.w)];
				link.href = t.image(tag, spec.w, spec.h, spec.delay);
				Object.assign(link.dataset, spec.data);
				if (spec.thumb !== false) {
					const image = new Image();
					image.alt = spec.alt ?? 'Image ' + index;
					spec.style && (image.style.cssText = spec.style);
					spec.fit && (image.style.objectFit = spec.fit);
					spec.lazy && (image.loading = 'lazy');
					image.src = t.image(tag, width, height).replace('.png', '.png?thumb');
					link.append(image);
				}
				spec.caption && (link.dataset.caption = spec.caption);
				link.onclick = (event) => {
					event.preventDefault();
					window.bp.open({ items: $$('#root a'), current: link, ...t.options });
				};
				list.append(link);
			});
			return Promise.all($$('#root img').filter((image) => image.loading !== 'lazy').map((image) => image.decode().catch(() => {})));
		},

		// Make a new gallery, and log the callbacks as "name:index"
		make(init = {}, options = {}) {
			t.reset();
			window.bp = BiggerPicture(init);
			const note = (name) => (container, item) => t.log.push(name + ':' + item?.i);
			t.options = { onOpen: note('open'), onUpdate: note('update'), onClose: note('close'), onClosed: note('closed'), ...options };
			return window.bp;
		},

		// Open a new gallery with the links of #root, and wait for the end of the motions. With settle false, return before the first frame.
		async open(options = {}, init = {}, settle = true) {
			t.make(init, options);
			window.bp.open({ items: $$('#root a'), ...t.options });
			await wait(0);
			settle && (await t.idle());
		},

		// Remove the gallery at once. The motions end first: a removed node cancels its animations, and the gallery waits for them.
		reset() {
			document.getAnimations().forEach((animation) => isFinite(animation.effect.getComputedTiming().endTime) && animation.finish());
			window.bp?.$destroy();
			window.bp = null;
			t.log = [];
		},

		// Wait for the end of the motions and the image loads, two frames in a row, or for the limit
		async idle(limit = 4000) {
			const end = performance.now() + limit;
			for (let still = 0; still < 2 && performance.now() < end; ) {
				await frame();
				const motion = document.getAnimations().some((animation) => animation.playState === 'running' && isFinite(animation.effect.getComputedTiming().endTime)),
					image = $$('.bp-img').some((node) => !$('img', node)?.complete);
				still = motion || image ? 0 : still + 1;
			}
		},

		// The slide that shows the active item
		slide: () => $$('.bp-slide').at(-1),

		// The rect of the item that shows on the screen: the item, cut by the boxes that clip it
		visible(slide = t.slide()) {
			const item = slide && $('.bp-img, .bp-video, .bp-iframe, .bp-html > *', slide);
			if (!item) {
				return null;
			}
			// The boxes between the item and the slide that clip their content: overflow, or contain with paint
			const nodes = [item];
			for (let node = item.parentElement; node !== slide.parentElement; node = node.parentElement) {
				const css = getComputedStyle(node);
				(css.overflow !== 'visible' || /paint|strict|content/.test(css.contain)) && nodes.push(node);
			}
			let left = -1e9,
				top = -1e9,
				right = 1e9,
				bottom = 1e9;
			for (const node of nodes) {
				const rect = node.getBoundingClientRect();
				left = Math.max(left, rect.left);
				top = Math.max(top, rect.top);
				right = Math.min(right, rect.right);
				bottom = Math.min(bottom, rect.bottom);
			}
			return { left, top, width: right - left, height: bottom - top, opacity: +getComputedStyle(slide).opacity };
		},

		// The rect of the image, with its zoom
		img: () => box($('.bp-img', t.slide()).getBoundingClientRect()),

		// The stage, and its gap
		stage() {
			const rect = box($('.bp-ruler').getBoundingClientRect()),
				gap = parseInt(getComputedStyle($('.bp-wrap')).getPropertyValue('--bp-stage-gap')) || 0;
			return { ...rect, gap, right: rect.left + rect.width, bottom: rect.top + rect.height };
		},

		// The rect an item of the given size must fit in, centered in the stage
		fit(width, height, scale = 1) {
			const stage = t.stage(),
				ratio = Math.min((stage.width - 2 * stage.gap) / width, (stage.height - 2 * stage.gap) / height) * scale,
				w = Math.round(width * ratio),
				h = Math.round(height * ratio);
			return { left: stage.left + (stage.width - w) / 2, top: stage.top + (stage.height - h) / 2, width: w, height: h };
		},

		// The rect of the thumbnail of a link, or of the image in it with object-fit: contain
		thumb(index, contain) {
			const image = $$('#root img')[index],
				rect = box(image.getBoundingClientRect());
			if (contain) {
				const ratio = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight),
					width = image.naturalWidth * ratio,
					height = image.naturalHeight * ratio;
				return { left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height };
			}
			return rect;
		},

		// A point on the stage, out of the item, where a click closes the gallery
		space() {
			const stage = t.stage(),
				item = t.visible();
			return item.left - stage.left > 30
				? { x: (stage.left + stage.gap + item.left) / 2, y: item.top + item.height / 2 }
				: { x: item.left + item.width / 2, y: (stage.top + stage.gap + item.top) / 2 };
		},

		// The center of an element
		center(selector) {
			const rect = $(selector).getBoundingClientRect();
			return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
		},

		// Pause the finite animations of a node and its children at a fraction of their time
		seek(fraction, node = t.slide()) {
			for (const animation of node.getAnimations({ subtree: true })) {
				const end = animation.effect.getComputedTiming().endTime;
				if (isFinite(end)) {
					animation.pause();
					animation.currentTime = fraction * end;
				}
			}
		},

		// Play the paused animations
		play() {
			document.getAnimations().forEach((animation) => animation.playState === 'paused' && animation.play());
		},

		// Read a value on each frame until the returned function is called, which gives the list
		track(read = t.visible) {
			const list = [];
			let run = true;
			const tick = (now) => {
				if (run) {
					const value = read();
					value && list.push({ now, ...value });
					requestAnimationFrame(tick);
				}
			};
			requestAnimationFrame(tick);
			return () => {
				run = false;
				return list;
			};
		},

		// The counter text, such as "2 / 5"
		count: () => $('.bp-count')?.textContent.trim(),

		// The x translate of the thumbnail strip
		strip: () => new DOMMatrix(getComputedStyle($('.bp-thumbs-outer')).transform).m41
	});
}

// Two rects are the same within a tolerance in px
const near = (a, b, tolerance = 1) => !!a && !!b && ['left', 'top', 'width', 'height'].every((key) => Math.abs(a[key] - b[key]) <= tolerance);
const show = (value) => JSON.stringify(value, (key, item) => (typeof item === 'number' ? Math.round(item * 100) / 100 : item));

/**
 * The motion of rects from one rect to another, on each frame. The progress of an edge goes from 0 to 1 on the easing curve.
 * speed is the largest progress per frame time, scaled to the duration: the easing of the gallery has 3 at most.
 * back is the largest step back of the progress, and gap the longest time between two frames.
 *
 * @param {object[]} list The rects with the frame time in "now".
 * @param {object} from
 * @param {object} to
 * @param {number} duration The duration of the motion in ms.
 */
function motion(list, from, to, duration) {
	const keys = ['left', 'top', 'width', 'height'].filter((key) => Math.abs(to[key] - from[key]) > 20);
	let back = 0,
		speed = 0,
		gap = 0;
	for (let index = 1; index < list.length; index++) {
		const time = list[index].now - list[index - 1].now;
		gap = Math.max(gap, time);
		for (const key of keys) {
			const progress = (item) => (item[key] - from[key]) / (to[key] - from[key]),
				step = progress(list[index]) - progress(list[index - 1]);
			back = Math.max(back, -step);
			time > 0 && (speed = Math.max(speed, (step / time) * duration));
		}
	}
	return { frames: list.length, keys: keys.length, back: +back.toFixed(3), gap: Math.round(gap), speed: +speed.toFixed(2) };
}

// A smooth motion: enough frames, no step back, no jump faster than the easing, and no long frame
const smooth = (value, frames = 15) => value.frames >= frames && value.keys > 0 && value.back <= 0.01 && value.speed <= 3.6 && value.gap <= 100;

/**
 * Open the test page in a new Chrome, and make the helpers of a group.
 *
 * @param {string[]} list The results of the group.
 * @param {object} viewport
 */
async function open(list, viewport) {
	const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--autoplay-policy=no-user-gesture-required'], ignoreDefaultArgs: ['--hide-scrollbars'] }),
		page = await browser.newPage(),
		check = (name, ok, detail = '') => {
			list.push((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' (' + detail + ')' : ''));
			ok || failures.push(name);
			if (!ok && bail && !known.has(name)) {
				console.log(list.at(-1));
				process.exit(1);
			}
		};

	// The last check in the detail tells the step of the error
	page.on('pageerror', (error) => check('no page errors', false, error.message + ', after: ' + (list.at(-1)?.slice(5, 80) || 'the start')));
	// The loads of other sites and of the ?status URLs fail on purpose, see the content group
	page.on('console', (message) => message.type() === 'error' && !/^https:|[?&]status=/.test(message.location()?.url || '') && check('no console errors', false, message.text()));

	await page.evaluateOnNewDocument(helpers);
	await page.setViewport(viewport);
	await page.goto(base, { waitUntil: 'load' });

	// Move the mouse in steps of 16 ms. A drag ends with three moves on the same point, so that it has no inertia.
	const drag = async (from, dx, dy, steps = 10, still = true) => {
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		for (let step = 1; step <= steps; step++) {
			await page.mouse.move(from.x + (dx * step) / steps, from.y + (dy * step) / steps);
			await wait(16);
		}
		for (let step = 0; still && step < 3; step++) {
			await page.mouse.move(from.x + dx, from.y + dy);
			await wait(16);
		}
		await page.mouse.up();
	};

	// A touch swipe in steps of 16 ms
	const swipe = async (from, dx, dy, steps = 8) => {
		await page.touchscreen.touchStart(from.x, from.y);
		for (let step = 1; step <= steps; step++) {
			await page.touchscreen.touchMove(from.x + (dx * step) / steps, from.y + (dy * step) / steps);
			await wait(16);
		}
		await page.touchscreen.touchEnd();
	};

	const idle = () => page.evaluate(() => t.idle());

	return { browser, page, check, drag, swipe, idle };
}

// The image of most checks: 3000 x 2000, as a 300 x 200 thumbnail
const photo = { w: 3000, h: 2000 };

// The groups: [name, run, viewport]. The groups that take the longest come first, so that the workers stop at about the same time.
const groups = [
	['open and close', async ({ page, check, idle, drag }) => {
		const specs = [photo, { w: 2000, h: 3000 }, { w: 2400, h: 2400 }, { w: 4000, h: 1000 }, { w: 1600, h: 1600, fit: 'contain' }, { w: 1600, h: 1200, fit: 'fill', thumb: [300, 300] }, { w: 1500, h: 1000, style: 'padding: 10px; border: 5px solid #333; box-sizing: border-box' }];
		await page.evaluate((specs) => t.grid(specs), specs);

		// The first and the last frame of the open motion, with the thumbnail cropped by object-fit: cover
		for (const index of [0, 1, 3]) {
			const value = await page.evaluate(async (index, spec) => {
				await t.open({ position: index }, {}, false);
				t.seek(0);
				const start = t.visible(),
					thumb = t.thumb(index);
				t.play();
				await t.idle();
				return { start, thumb, end: t.visible(), fit: t.fit(spec.w, spec.h) };
			}, index, specs[index]);
			check('open of item ' + index + ': the first frame covers the thumbnail', near(value.start, value.thumb, 1.5) && value.start.opacity === 1, show({ start: value.start, thumb: value.thumb }));
			check('open of item ' + index + ': the last frame fits the item in the stage', near(value.end, value.fit), show({ end: value.end, fit: value.fit }));
		}

		// object-fit: contain and fill
		{
			const value = await page.evaluate(async () => {
				const result = {};
				for (const [index, contain] of [[4, true], [5, false]]) {
					await t.open({ position: index }, {}, false);
					t.seek(0);
					result[index] = { start: t.visible(), thumb: t.thumb(index, contain) };
					t.play();
				}
				await t.idle();
				return result;
			});
			check('open: the first frame of a thumbnail with object-fit: contain is the image in the thumbnail', near(value[4].start, value[4].thumb, 1.5), show(value[4]));
			check('open: the first frame of a stretched thumbnail is the thumbnail', near(value[5].start, value[5].thumb, 1.5), show(value[5]));
		}

		// A thumbnail with a padding and a border: the image is the content box
		{
			const value = await page.evaluate(async () => {
				const image = t.$$('#root img')[6];
				await t.open({ position: 6 }, {}, false);
				t.seek(0);
				const start = t.visible(),
					rect = image.getBoundingClientRect();
				t.play();
				await t.idle();
				return { start, content: { left: rect.left + 15, top: rect.top + 15, width: rect.width - 30, height: rect.height - 30 } };
			});
			check('open: the first frame of a thumbnail with a padding and a border is its content box', near(value.start, value.content, 1.5), show(value));
		}

		// The last frame of the close motion is the thumbnail, also on a scrolled page
		for (const scroll of [0, 120]) {
			const value = await page.evaluate(async (scroll) => {
				t.reset();
				scrollTo(0, scroll);
				const width = document.body.clientWidth,
					scrollbar = innerWidth - document.documentElement.clientWidth;
				await t.open({ position: 2 });
				const locked = { width: document.body.clientWidth, scroll: scrollY, lock: document.documentElement.classList.contains('bp-lock') };
				window.bp.close();
				await t.wait(0);
				t.seek(1);
				const end = t.visible(),
					thumb = t.thumb(2);
				t.play();
				await t.idle();
				return { end, thumb, width, scrollbar, locked, after: { width: document.body.clientWidth, scroll: scrollY, wrap: !!t.$('.bp-wrap'), lock: document.documentElement.classList.contains('bp-lock'), padding: document.documentElement.style.paddingRight } };
			}, scroll);
			check('close at scroll ' + scroll + ': the last frame is the thumbnail', near(value.end, value.thumb, 1.5), show({ end: value.end, thumb: value.thumb }));
			check('close at scroll ' + scroll + ': the scroll lock keeps the page width and the scroll', value.scrollbar === 15 && value.locked.lock && value.locked.width === value.width && value.locked.scroll === scroll, show(value));
			check('close at scroll ' + scroll + ': the gallery, the lock and the padding go', !value.after.wrap && !value.after.lock && !value.after.padding && value.after.width === value.width && value.after.scroll === scroll, show(value.after));
		}
		await page.evaluate(() => scrollTo(0, 0));

		// The motions on each frame
		{
			const value = await page.evaluate(async (spec) => {
				t.make();
				const stop = t.track();
				window.bp.open({ items: t.$$('#root a'), position: 0 });
				await t.idle();
				const open = stop(),
					fit = t.fit(spec.w, spec.h),
					close = t.track();
				window.bp.close();
				await t.idle();
				return { open, fit, close: close(), thumb: t.thumb(0) };
			}, specs[0]);
			const opening = motion(value.open, value.thumb, value.fit, 500),
				closing = motion(value.close, value.fit, value.thumb, 500);
			check('open: the item grows from the thumbnail on each frame with no jump', smooth(opening) && near(value.open.at(-1), value.fit), show(opening));
			check('close: the item shrinks into the thumbnail on each frame with no jump', smooth(closing, 10) && near(value.close.at(-1), value.thumb, 1.5), show(closing));
		}

		// The thumbnail shows until the image is decoded, on each frame
		{
			const value = await page.evaluate(async () => {
				await t.grid([{ w: 3000, h: 2000, delay: 900, tag: 'late' }]);
				t.make();
				const stop = t.track(() => {
					const node = t.$('.bp-img'),
						image = t.$('img', node);
					return node && { blank: !node.style.backgroundImage && !(image?.complete && image.naturalWidth), loader: !!t.$('.bp-load', node) };
				});
				window.bp.open({ items: t.$$('#root a') });
				await t.wait(1600);
				await t.idle();
				const list = stop();
				return { frames: list.length, blank: list.filter((item) => item.blank).length, loader: list.some((item) => item.loader), background: t.$('.bp-img').style.backgroundImage };
			});
			check('a slow image: the thumbnail shows on each frame until the image is decoded, and the loader shows', value.frames > 30 && value.blank === 0 && value.loader, show(value));
			check('a slow image: the thumbnail goes once the image shows', value.background === '', show(value));
		}

		// zoom: false fades the slide up from 10 px under its place
		{
			await page.evaluate((specs) => t.grid(specs), specs);
			const value = await page.evaluate(async (spec) => {
				// The first frame the page paints: the size of the stage is known by then
				await t.open({ zoom: false }, {}, false);
				await t.frame();
				await t.frame();
				t.seek(0);
				const start = t.visible();
				t.play();
				await t.idle();
				return { start, fit: t.fit(spec.w, spec.h) };
			}, specs[0]);
			check('zoom: false: the first frame is the item 10 px lower and transparent', near(value.start, { ...value.fit, top: value.fit.top + 10 }) && value.start.opacity === 0, show(value));
		}

		// A click on a link: the focus goes into the gallery, and back to the link after the close
		{
			await page.evaluate(() => t.make());
			await page.click('#root a:nth-child(2)');
			await idle();
			const inside = await page.evaluate(() => ({ focus: document.activeElement.className, role: t.$('.bp-wrap').getAttribute('role'), modal: t.$('.bp-wrap').getAttribute('aria-modal'), count: t.count() }));
			await page.keyboard.press('Escape');
			await idle();
			const after = await page.evaluate(() => ({ focus: document.activeElement === t.$$('#root a')[1], wrap: !!t.$('.bp-wrap') }));
			check('a click on a link opens its item, and the gallery takes the focus as a modal dialog', inside.focus.includes('bp-wrap') && inside.role === 'dialog' && inside.modal === 'true' && inside.count === '2 / 7', show(inside));
			check('Escape closes the gallery, and the focus goes back to the link', after.focus && !after.wrap, show(after));
		}

		// A click on the space around the item closes the gallery, a short drag from the image to the space does not
		{
			await page.evaluate(() => t.open());
			const space = await page.evaluate(() => t.space());
			await page.mouse.click(space.x, space.y);
			await idle();
			const closed = await page.evaluate(() => !t.$('.bp-wrap'));
			await page.evaluate(() => t.open({ position: 1 }));
			const edge = await page.evaluate(() => ({ x: t.img().left + 5, y: 450 }));
			await drag(edge, -30, 0);
			await idle();
			const kept = await page.evaluate(() => !!t.$('.bp-wrap'));
			check('a click on the space around the item closes the gallery', closed);
			check('a drag from the image to the space around it keeps the gallery', kept);
		}

		// The callbacks
		{
			const value = await page.evaluate(async () => {
				await t.open({ position: 1 });
				window.bp.next();
				await t.idle();
				window.bp.close();
				await t.idle();
				return t.log;
			});
			check('the callbacks: onOpen, onUpdate, onClose and onClosed with the item', show(value) === show(['open:1', 'update:2', 'close:2', 'closed:2']), show(value));
		}

		// next() and close() in one task: the close waits for the motion of a slide that the change removes
		{
			const value = await page.evaluate(async () => {
				const errors = [],
					listen = (event) => {
						errors.push(event.reason?.name);
						event.preventDefault();
					};
				addEventListener('unhandledrejection', listen);
				await t.open();
				window.bp.next();
				window.bp.close();
				await t.idle();
				await t.wait(100);
				removeEventListener('unhandledrejection', listen);
				return { errors, wrap: !!t.$('.bp-wrap') };
			});
			check('next() and close() in one task: the gallery closes with no error', !value.wrap && !value.errors.length, show(value));
		}

		// An open call during the close opens the gallery after it
		{
			const value = await page.evaluate(async () => {
				await t.open();
				window.bp.close();
				await t.wait(100);
				window.bp.open({ items: t.$$('#root a'), position: 3 });
				await t.wait(700);
				await t.idle();
				return { count: t.count(), wraps: t.$$('.bp-wrap').length, lock: document.documentElement.classList.contains('bp-lock') };
			});
			check('an open call during the close opens the gallery once the close ends', value.count === '4 / 7' && value.wraps === 1 && value.lock, show(value));
		}

		// next, prev and setPosition do nothing with no gallery, and during the close
		{
			const value = await page.evaluate(async () => {
				t.make();
				const errors = [];
				for (const call of ['next', 'prev', 'setPosition']) {
					try {
						window.bp[call](2);
					} catch (error) {
						errors.push(error.message);
					}
				}
				await t.open();
				window.bp.close();
				await t.wait(80);
				window.bp.next();
				const during = t.count();
				await t.idle();
				return { errors, during, log: t.log };
			});
			check('next, prev and setPosition with no gallery open do nothing', !value.errors.length, show(value.errors));
			check('next during the close does not change the item', value.during === '1 / 7' && !value.log.some((name) => name.startsWith('update')), show(value));
		}

		// An open call while the gallery is open closes it, and then opens the new items. The focus goes back to the first trigger.
		{
			const value = await page.evaluate(async () => {
				t.$$('#root a')[1].focus();
				await t.open({ history: true });
				window.bp.open({ items: [{ html: '<p id="other">other</p>' }, { html: '<p>two</p>' }], ...t.options, history: false });
				await t.wait(700);
				await t.idle();
				const open = { count: t.count(), other: !!t.$('#other'), wraps: t.$$('.bp-wrap').length, state: !!history.state?.bp, log: t.log.join() };
				window.bp.close();
				await t.wait(700);
				await t.idle();
				return { open, focus: document.activeElement === t.$$('#root a')[1], lock: document.documentElement.classList.contains('bp-lock') };
			});
			check('an open call while open closes the gallery, and then opens the new items', value.open.count === '1 / 2' && value.open.other && value.open.wraps === 1 && value.open.log === 'open:0,close:0,closed:0,open:0', show(value.open));
			check('an open call while open removes the history entry of the first gallery', !value.open.state, show(value.open));
			check('an open call while open: the close gives the focus back to the first trigger', value.focus && !value.lock, show(value));
		}

		// No valid items: no gallery and no lock
		{
			const value = await page.evaluate(async () => {
				t.make();
				window.bp.open({ items: [{ link: '/file.txt' }, { link: '' }] });
				await t.wait(50);
				return { wrap: !!t.$('.bp-wrap'), lock: document.documentElement.classList.contains('bp-lock') };
			});
			check('items with no type: the gallery does not open and the page is not locked', !value.wrap && !value.lock, show(value));
		}

		// With reduced motion, the gallery opens and closes at once, and the click that closes it does not reach the link under it
		{
			await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
			await page.evaluate(() => t.grid([{ w: 1500, h: 1000 }, { w: 1500, h: 1000 }], 'grid-template-columns: repeat(2, 600px)'));
			await page.evaluate(() => t.open());
			const point = await page.evaluate(() => {
				const link = t.$$('#root a')[0].getBoundingClientRect(),
					item = t.visible();
				return { x: link.left + 50, y: (link.top + item.top) / 2, under: document.elementsFromPoint(link.left + 50, (link.top + item.top) / 2).some((node) => node === t.$$('#root a')[0]), inSpace: (link.top + item.top) / 2 < item.top };
			});
			const before = page.url();
			await page.mouse.click(point.x, point.y);
			await wait(300);
			const value = await page.evaluate(() => ({ wrap: !!t.$('.bp-wrap') }));
			check('reduced motion: a click on the space closes the gallery and does not open the link under it', point.under && point.inSpace && !value.wrap && page.url() === before, show({ ...point, ...value, url: page.url() }));
			await page.emulateMediaFeatures([]);
		}
	}],

	['zoom and pan', async ({ page, check, drag, idle }) => {
		await page.evaluate((photo) => t.grid([photo, photo, { w: 600, h: 400 }]), photo);
		const zoomed = () => page.evaluate(() => ({ img: t.img(), stage: t.stage(), zoomed: t.$('.bp-wrap').classList.contains('bp-zoomed'), count: t.count() }));

		// A click zooms to the natural size, and keeps the point under the mouse in place
		{
			await page.evaluate(() => t.open());
			const before = await page.evaluate(() => t.img()),
				point = { x: before.left + before.width / 2 + 200, y: before.top + before.height / 2 + 100 };
			await page.mouse.click(point.x, point.y);
			await idle();
			const after = await zoomed(),
				u = (rect) => [(point.x - rect.left) / rect.width, (point.y - rect.top) / rect.height],
				[u1, v1] = u(before),
				[u2, v2] = u(after.img);
			check('a click zooms the image to its natural size', Math.abs(after.img.width - 3000) <= 1 && after.zoomed, show(after.img));
			check('a click keeps the clicked point of the image under the mouse', Math.abs(u1 - u2) < 0.003 && Math.abs(v1 - v2) < 0.003, show({ u1, u2, v1, v2 }));

			await page.mouse.click(point.x, point.y);
			await idle();
			const back = await zoomed();
			check('a second click zooms the image out to its fit size', near(back.img, before) && !back.zoomed, show(back.img));
		}

		// The zoom transition runs on each frame with no jump
		{
			const center = await page.evaluate(() => {
				window.from = t.img();
				window.untrack = t.track(t.img);
				return t.center('.bp-img');
			});
			await page.mouse.click(center.x, center.y);
			const value = await page.evaluate(async () => {
				await t.idle();
				const to = t.img(),
					list = window.untrack();
				window.bp.items[0].zoom = false;
				await t.idle();
				return { list, from: window.from, to };
			});
			const list = value.list.slice(0, value.list.findIndex((item) => near(item, value.to, 0.5)) + 1),
				result = motion(list, value.from, value.to, 500);
			check('zoom: the image grows on each frame with no jump', smooth(result), show(result));
		}

		// A press during the zoom transition stops the image where it is
		{
			await page.evaluate(() => t.open());
			const center = await page.evaluate(() => t.center('.bp-img'));
			await page.mouse.click(center.x, center.y);
			await wait(150);
			const value = await page.evaluate(async () => {
				const before = t.img(),
					options = { bubbles: true, isPrimary: true, clientX: 600, clientY: 450, button: 0 };
				t.$('.bp-img').dispatchEvent(new PointerEvent('pointerdown', options));
				await t.frame();
				await t.wait(100);
				const after = t.img();
				t.$('.bp-img').dispatchEvent(new PointerEvent('pointerup', options));
				return { before, after };
			});
			check('a press during the zoom transition stops the image where it is', value.before.width > 1300 && value.before.width < 2900 && near(value.before, value.after, 1.5), show(value));
		}

		// The wheel zooms in and out, and the page does not scroll
		{
			await page.evaluate(() => t.open());
			const center = await page.evaluate(() => t.center('.bp-img')),
				fit = await page.evaluate(() => t.img());
			await page.mouse.move(center.x, center.y);
			await page.mouse.wheel({ deltaY: -300 });
			await idle();
			const zoomIn = await zoomed();
			await page.mouse.wheel({ deltaY: 300 });
			await idle();
			const zoomOut = await zoomed(),
				scroll = await page.evaluate(() => scrollY);
			check('wheel up zooms the image in two times', Math.abs(zoomIn.img.width - fit.width * 2) <= 1 && zoomIn.zoomed, show({ fit: fit.width, zoom: zoomIn.img.width }));
			check('wheel down zooms the image out, and the page does not scroll', near(zoomOut.img, fit) && scroll === 0, show({ img: zoomOut.img, scroll }));
		}

		// The keys: + and - zoom, the arrows pan a zoomed image and go to the next item when not zoomed
		{
			await page.evaluate(() => t.open());
			const fit = await page.evaluate(() => t.img());
			await page.keyboard.press('+');
			await idle();
			const plus = await zoomed();
			await page.keyboard.press('ArrowRight');
			await idle();
			const pan = await zoomed();
			// 1.5 x 1.5, then two steps back
			await page.keyboard.press('+');
			await page.keyboard.press('-');
			await idle();
			const back = await zoomed();
			await page.keyboard.press('-');
			await idle();
			const minus = await zoomed();
			await page.keyboard.press('ArrowRight');
			await idle();
			const next = await zoomed();
			check('+ zooms the image in 1.5 times', Math.abs(plus.img.width - fit.width * 1.5) <= 1, show({ fit: fit.width, plus: plus.img.width }));
			check('ArrowRight pans a zoomed image 100 px and stays on the item', Math.abs(pan.img.left - plus.img.left + 100) <= 1 && pan.count === '1 / 3', show({ plus: plus.img.left, pan: pan.img.left, count: pan.count }));
			check('- zooms the image out 1.5 times', Math.abs(back.img.width - fit.width * 1.5) <= 1, show({ fit: fit.width, back: back.img.width }));
			check('- zooms the image out to its fit size', near(minus.img, fit), show(minus.img));
			check('ArrowRight goes to the next item when the image is not zoomed', next.count === '2 / 3', next.count);
		}

		// Space zooms an image in and out, as a click does
		{
			await page.evaluate(() => t.open());
			const fit = await page.evaluate(() => t.img());
			await page.keyboard.press(' ');
			await idle();
			const zoomIn = await zoomed();
			await page.keyboard.press(' ');
			await idle();
			const zoomOut = await zoomed();
			// Space on a link does nothing, and must not zoom the image
			await page.evaluate(() => t.open({ download: true }).then(() => t.$('.bp-dl').focus()));
			await page.keyboard.press(' ');
			await idle();
			const link = await zoomed();
			check('Space zooms the image in', zoomIn.zoomed && zoomIn.img.width > fit.width * 1.5, show({ fit: fit.width, zoom: zoomIn.img.width }));
			check('Space zooms the image out to its fit size', !zoomOut.zoomed && near(zoomOut.img, fit), show(zoomOut.img));
			check('Space on a focused control does not zoom the image', !link.zoomed, show(link));
		}

		// A drag pans a zoomed image, and stops at its edges
		{
			await page.evaluate(() => t.open());
			const center = await page.evaluate(() => t.center('.bp-img'));
			await page.mouse.click(center.x, center.y);
			await idle();
			const start = await zoomed();
			await drag(center, -150, -100);
			await idle();
			const moved = await zoomed();
			await drag({ x: 1150, y: 850 }, -1100, -800, 20);
			await idle();
			const edge = await zoomed();
			const img = edge.img,
				stage = edge.stage;
			check('a drag moves a zoomed image with the mouse', Math.abs(moved.img.left - start.img.left + 150) <= 2 && Math.abs(moved.img.top - start.img.top + 100) <= 2, show({ start: start.img, moved: moved.img }));
			check('a drag stops a zoomed image at its edges, with no empty space', Math.abs(img.left + img.width - stage.right) <= 1 && Math.abs(img.top + img.height - stage.bottom) <= 1, show({ img, stage }));
			check('a drag past the edge on a large screen stays on the item', edge.count === '1 / 3', edge.count);
		}

		// A fast drag of a zoomed image glides on after the release
		{
			await page.evaluate(() => t.open());
			const center = await page.evaluate(() => t.center('.bp-img'));
			await page.mouse.click(center.x, center.y);
			await idle();
			const start = await zoomed();
			await drag(center, -200, 0, 5, false);
			await idle();
			const glide = await zoomed();
			check('a flick of a zoomed image glides past the release point', start.img.left - glide.img.left > 300, show({ start: start.img.left, glide: glide.img.left }));
		}

		// maxZoom, a small image, the zoom property and a resize
		{
			const value = await page.evaluate(async () => {
				await t.open({ maxZoom: 1.5 });
				const fit = t.img();
				window.bp.items[0].zoom = true;
				await t.idle();
				const max = t.img();
				await t.open({ position: 2 });
				const small = { fit: t.img(), canzoom: t.$('.bp-img').classList.contains('bp-canzoom') };
				window.bp.items[2].zoom = true;
				await t.idle();
				small.zoom = t.img();
				small.zoomed = window.bp.items[2].zoom;
				return { fit, max, small };
			});
			check('maxZoom: 1.5 stops the zoom at 1.5 times', Math.abs(value.max.width - value.fit.width * 1.5) <= 1, show(value));
			check('an image smaller than the screen: no zoom cursor and no zoom', !value.small.canzoom && near(value.small.fit, value.small.zoom) && !value.small.zoomed, show(value.small));
		}
		{
			await page.evaluate(() => t.open());
			await page.evaluate(async () => {
				window.bp.items[0].zoom = true;
				await t.idle();
			});
			await page.setViewport({ width: 1000, height: 700 });
			await idle();
			const value = await page.evaluate(() => ({ img: t.img(), fit: t.fit(3000, 2000), zoomed: window.bp.items[0].zoom }));
			await page.setViewport({ width: 1200, height: 900 });
			check('a resize of a large screen fits the image to the new size', near(value.img, value.fit), show(value));
			check('a resize of a large screen ends the zoom', !value.zoomed, show(value));
		}

		// srcset of a new gallery: the item is 1180 px wide, so 1182w is the candidate. The page with its 15 px scrollbar and the 10 px gap
		// gives 1165 px, and 1170w. With no gap, the item is 1185 px or 1200 px, and that needs 3000w.
		{
			const set = [[1170, 780], [1182, 788], [3000, 2000]].map(([w, h]) => '/img/gap/' + w + 'x' + h + '.png ' + w + 'w').join(', ');
			await page.evaluate((set) => t.grid([{ w: 3000, h: 2000, tag: 'gapthumb', data: { link: set } }]), set);
			await page.evaluate(() => t.open());
			const src = await page.evaluate(() => t.$('.bp-img img').currentSrc),
				loads = [requests('/gap/1170x'), requests('/gap/1182x'), requests('/gap/3000x')];
			check('srcset: a new gallery picks the candidate for the size of its stage', src.endsWith('/gap/1182x788.png') && show(loads) === '[0,1,0]', show({ src, loads }));
		}

		// srcset: the gallery loads the candidate of the shown size first, and the zoom loads the largest one
		{
			const set = [[800, 533], [1600, 1067], [3000, 2000]].map(([w, h]) => '/img/set/' + w + 'x' + h + '.png ' + w + 'w').join(', ');
			await page.evaluate((set) => t.grid([{ w: 3000, h: 2000, tag: 'thumb', data: { link: set } }]), set);
			await page.evaluate(() => t.open());
			const first = await page.evaluate(() => ({ src: t.$('.bp-img img').currentSrc, natural: window.bp.items[0].width, sizes: t.$('.bp-img img').sizes })),
				loads = [requests('/set/800x'), requests('/set/1600x'), requests('/set/3000x')];
			const center = await page.evaluate(() => t.center('.bp-img'));
			await page.mouse.click(center.x, center.y);
			await idle();
			await page.waitForFunction(() => t.$('.bp-img img').currentSrc.includes('3000x'), { timeout: 3000 }).catch(() => {});
			const zoom = await page.evaluate(() => ({ src: t.$('.bp-img img').currentSrc, width: t.img().width }));
			check('srcset: the gallery loads only the candidate of the shown size', first.src.includes('/set/1600x') && show(loads) === '[0,1,0]', show({ ...first, loads }));
			check('srcset: the full size is the one of the largest candidate', first.natural === 3000, show(first));
			check('srcset: the zoom reaches the largest candidate and loads it', zoom.src.includes('/set/3000x') && Math.abs(zoom.width - 3000) <= 1, show(zoom));
		}
	}],

	['navigation and keys', async ({ page, check, idle, drag }) => {
		const specs = [photo, { w: 2000, h: 3000 }, { w: 2400, h: 2400 }, { w: 4000, h: 1000 }, { w: 1000, h: 3000 }, { w: 3000, h: 1500 }].map((spec) => ({ ...spec, tag: 'nav' }));
		await page.evaluate((specs) => t.grid(specs), specs);
		const state = () => page.evaluate((specs) => {
			const index = +t.count().split(' / ')[0] - 1;
			return { count: t.count(), slides: t.$$('.bp-slide').length, visible: t.visible(), fit: t.fit(specs[index].w, specs[index].h) };
		}, specs);

		// The buttons and the counter, with the wrap at both ends
		{
			await page.evaluate(() => t.open());
			await page.click('.bp-next');
			await idle();
			const next = await state();
			await page.click('.bp-prev');
			await page.click('.bp-prev');
			await idle();
			const wrap = await state();
			await page.click('.bp-next');
			await idle();
			const first = await state();
			check('the next button goes to the next item, and the item fits', next.count === '2 / 6' && next.slides === 1 && near(next.visible, next.fit), show(next));
			check('the previous button on the first item goes to the last one', wrap.count === '6 / 6' && near(wrap.visible, wrap.fit), show(wrap));
			check('the next button on the last item goes to the first one', first.count === '1 / 6', first.count);
		}

		// The motion of a change: the new slide comes 20 px from the right, the old one goes 20 px to the left, then it is removed
		{
			const value = await page.evaluate(async () => {
				await t.open();
				const old = t.slide(),
					from = t.visible(old);
				window.bp.next();
				await t.wait(0);
				const slide = t.slide();
				t.seek(0, slide);
				t.seek(1, old);
				const start = { new: t.visible(slide), old: t.visible(old), slides: t.$$('.bp-slide').length },
					durations = [slide, old].map((node) => node.getAnimations()[0]?.effect.getComputedTiming().endTime);
				t.play();
				await t.idle();
				return { from, start, durations, slides: t.$$('.bp-slide').length, old: old.isConnected, end: t.visible() };
			});
			check('next: the motions of both slides last 250 ms, half of the open motion', show(value.durations) === '[250,250]', show(value.durations));
			check('next: the new slide starts 20 px to the right and transparent', value.start.new.left - value.end.left === 20 && value.start.new.opacity === 0 && value.start.slides === 2, show(value.start));
			check('next: the old slide ends 20 px to the left and transparent', Math.round(value.from.left - value.start.old.left) === 20 && value.start.old.opacity === 0, show({ from: value.from, old: value.start.old }));
			check('next: the old slide is removed at the end', value.slides === 1 && !value.old, show(value));
		}

		// Fast key presses: one slide at the end, the right item, and the right size
		{
			await page.evaluate(() => t.open());
			for (let index = 0; index < 9; index++) {
				await page.keyboard.press('ArrowRight');
				await wait(25);
			}
			await idle();
			const value = await state();
			check('9 fast ArrowRight presses: one slide, the 4th item, and its own size', value.count === '4 / 6' && value.slides === 1 && near(value.visible, value.fit), show(value));
		}

		// Keys with modifiers, and keys of the page
		{
			await page.evaluate(async () => {
				await t.open();
				let page = 0;
				const listen = (event) => event.key === 'ArrowRight' && page++;
				document.addEventListener('keydown', listen);
				window.page = () => page;
				window.unlisten = () => document.removeEventListener('keydown', listen);
			});
			await page.keyboard.down('Alt');
			await page.keyboard.press('ArrowRight');
			await page.keyboard.up('Alt');
			await page.keyboard.down('Control');
			await page.keyboard.press('ArrowRight');
			await page.keyboard.up('Control');
			await idle();
			const modified = await state();
			await page.keyboard.press('ArrowRight');
			await idle();
			const plain = await state(),
				heard = await page.evaluate(() => window.page());
			await page.keyboard.press('Escape');
			await idle();
			await page.keyboard.press('ArrowRight');
			const after = await page.evaluate(() => {
				window.unlisten();
				return window.page();
			});
			check('Alt and Ctrl with an arrow do not change the item', modified.count === '1 / 6', modified.count);
			check('the page does not get the arrow keys of the gallery', plain.count === '2 / 6' && heard === 2, show({ count: plain.count, heard }));
			check('the page gets the keys again after the close', after === heard + 1, show({ heard, after }));
		}

		// The focus stays in the gallery on Tab and Shift+Tab
		{
			await page.evaluate(() => t.open({ download: true }));
			const seen = [];
			for (const shift of [false, true]) {
				shift && (await page.keyboard.down('Shift'));
				for (let index = 0; index < 8; index++) {
					await page.keyboard.press('Tab');
					seen.push(await page.evaluate(() => (t.$('.bp-wrap').contains(document.activeElement) ? document.activeElement.className : 'out:' + document.activeElement.tagName)));
				}
				shift && (await page.keyboard.up('Shift'));
			}
			check('Tab and Shift+Tab keep the focus on the controls of the gallery', seen.every((name) => !name.startsWith('out') && name !== 'bp-wrap') && new Set(seen).size === 4, show(seen));
		}

		// The preload of the next and the previous item
		{
			await page.evaluate(() => t.grid([0, 1, 2, 3, 4, 5].map(() => ({ w: 1500, h: 1000, tag: 'pre' }))));
			await page.evaluate(() => t.open({ position: 2 }));
			await wait(300);
			const loads = [0, 1, 2, 3, 4, 5].map((index) => requests('/pre/' + index + '/1500x1000.png'));
			check('the gallery preloads the next and the previous image only', show(loads) === '[0,1,1,1,0,0]', show(loads));
		}

		// persistent: no close on Escape, on a click on the space and on a swipe up, and no close button
		{
			await page.evaluate((specs) => t.grid(specs), specs);
			await page.evaluate(() => t.open({ persistent: true }));
			await page.keyboard.press('Escape');
			const space = await page.evaluate(() => t.space()),
				center = await page.evaluate(() => t.center('.bp-img'));
			await page.mouse.click(space.x, space.y);
			await drag(center, 0, -200);
			await idle();
			const value = await page.evaluate(() => ({ wrap: !!t.$('.bp-wrap'), button: getComputedStyle(t.$('.bp-x')).display }));
			check('persistent: Escape, a click on the space and a swipe up keep the gallery, and the close button is hidden', value.wrap && value.button === 'none', show(value));
		}

		// A swipe of the mouse: left goes to the next item, right to the previous one, and up closes
		{
			await page.evaluate(() => t.open());
			const center = await page.evaluate(() => t.center('.bp-img'));
			await drag(center, -120, 0);
			await idle();
			const left = await state();
			await drag(center, 120, 0);
			await idle();
			const right = await state();
			await drag(center, 100, 60);
			await idle();
			const slant = await state();
			await drag(center, 0, -150);
			await idle();
			const up = await page.evaluate(() => !!t.$('.bp-wrap'));
			check('a drag to the left goes to the next item, to the right to the previous one', left.count === '2 / 6' && right.count === '1 / 6', show([left.count, right.count]));
			check('a slanted drag does not change the item', slant.count === '1 / 6', slant.count);
			check('a drag up closes the gallery', !up);
		}

		// history: the back button closes the gallery, and a close removes the history entry
		{
			const length = await page.evaluate(() => history.length);
			await page.evaluate(() => t.open({ history: true }));
			const pushed = await page.evaluate(() => ({ state: history.state, length: history.length }));
			await page.goBack();
			await idle();
			const back = await page.evaluate(() => ({ wrap: !!t.$('.bp-wrap'), url: location.href }));
			await page.evaluate(() => t.open({ history: true }));
			await page.click('.bp-x');
			await idle();
			await wait(100);
			const closed = await page.evaluate(() => ({ state: history.state, wrap: !!t.$('.bp-wrap') }));
			check('history: the open adds a history entry', pushed.state?.bp && pushed.length === length + 1, show(pushed));
			check('history: the back button closes the gallery and stays on the page', !back.wrap && back.url === base, show(back));
			check('history: the close button removes the history entry', !closed.state?.bp && !closed.wrap, show(closed));
		}

		// history: a link to an anchor in an HTML item adds an entry and leaves the gallery open. The back button still closes it.
		{
			await page.evaluate(async () => {
				t.make();
				window.bp.open({ items: [{ html: '<a id="anchor" href="#part">part</a>' }, { html: '<p>two</p>' }], history: true, ...t.options });
				await t.idle();
			});
			await page.click('#anchor');
			await idle();
			const anchor = await page.evaluate(() => !!t.$('.bp-wrap'));
			await page.goBack();
			await idle();
			const first = await page.evaluate(() => !!t.$('.bp-wrap'));
			await page.goBack();
			await idle();
			const second = await page.evaluate(() => ({ wrap: !!t.$('.bp-wrap'), url: location.href }));
			check('history: a link to an anchor in an HTML item leaves the gallery open', anchor && first, show({ anchor, first }));
			check('history: after an anchor, the back button closes the gallery', !second.wrap && second.url === base, show(second));
		}

		// A long caption scrolls with the wheel, and the item stays
		{
			await page.evaluate(async () => {
				await t.grid([{ w: 1500, h: 1000, caption: Array.from({ length: 40 }, (value, index) => 'Line ' + index).join('<br>') }, { w: 1500, h: 1000 }]);
				await t.open();
			});
			const box = await page.evaluate(() => t.center('.bp-caption'));
			await page.mouse.move(box.x, box.y);
			await page.mouse.wheel({ deltaY: 100 });
			await wait(100);
			const value = await page.evaluate(() => ({ top: t.$('.bp-caption').scrollTop, inside: t.$('.bp-caption').getBoundingClientRect().bottom <= innerHeight, count: t.count(), zoomed: !!t.$('.bp-zoomed') }));
			check('a long caption scrolls with the wheel, and the item stays', value.top > 0 && value.inside && value.count === '1 / 2' && !value.zoomed, show(value));
		}

		// The controls: labels, the download link, the caption, and buttons in a form
		{
			await page.evaluate(() => t.grid([{ w: 3000, h: 2000, caption: 'A <b>caption</b>', data: { link: '/img/dl/1000x667.png 1000w, /img/dl/3000x2000.png 3000w' } }, { w: 1500, h: 1000, data: { download: 'false' } }]));
			const value = await page.evaluate(async () => {
				await t.open({ download: true, labels: { next: 'Forward', close: 'Shut' } });
				const first = { next: t.$('.bp-next').getAttribute('aria-label'), close: t.$('.bp-x').title, download: t.$('.bp-dl')?.getAttribute('href'), caption: t.$('.bp-caption')?.innerHTML.trim() };
				window.bp.next();
				await t.idle();
				return { first, second: { download: !!t.$('.bp-dl'), caption: !!t.$('.bp-caption') } };
			});
			check('labels: the controls get the texts', value.first.next === 'Forward' && value.first.close === 'Shut', show(value.first));
			check('download: the link gives the largest image of the srcset', value.first.download === '/img/dl/3000x2000.png', show(value.first));
			check('download: data-download="false" hides the link of an item', !value.second.download, show(value.second));
			check('the caption shows its HTML, and an item with no caption has none', value.first.caption === 'A <b>caption</b>' && !value.second.caption, show(value));

			const submitted = await page.evaluate(async () => {
				let count = 0;
				t.$('#box').addEventListener('submit', (event) => {
					count++;
					event.preventDefault();
				});
				t.make({ target: t.$('#box') });
				window.bp.open({ items: t.$$('#root a'), inline: true });
				await t.idle();
				t.$('.bp-next').click();
				await t.idle();
				t.$('.bp-x').click();
				await t.idle();
				return count;
			});
			check('the buttons of a gallery in a form do not submit it', submitted === 0, submitted);
		}
	}],

	['scaling', async ({ page, check, idle }) => {
		const specs = [photo, { w: 1667, h: 2500 }, { w: 2400, h: 2400 }, { w: 4000, h: 1000 }, { w: 1000, h: 3000 }, { w: 400, h: 300 }].map((spec) => ({ ...spec, tag: 'scale' }));
		await page.evaluate((specs) => t.grid(specs), specs);
		const fitAll = (options = {}, scale = 1) => page.evaluate(async (specs, options, scale) => {
			const result = [];
			for (const [index, spec] of specs.entries()) {
				await t.open({ position: index, ...options });
				const image = t.$('.bp-img img');
				result.push({ index, visible: t.visible(), fit: t.fit(spec.w, spec.h, scale), ratio: image.naturalWidth / image.naturalHeight, shown: image.offsetWidth / image.offsetHeight });
			}
			return result;
		}, specs, options, scale);
		const report = (list) => list.filter((item) => !near(item.visible, item.fit) || Math.abs(item.ratio - item.shown) > 0.01);

		for (const [name, viewport] of [['1200 x 900', { width: 1200, height: 900 }], ['700 x 1000', { width: 700, height: 1000 }], ['1600 x 500', { width: 1600, height: 500 }]]) {
			await page.setViewport(viewport);
			const bad = report(await fitAll());
			check(name + ': each item fits the stage, centered, with its own aspect ratio', !bad.length, show(bad));
		}
		await page.setViewport({ width: 1200, height: 900 });

		// The scale option and the thumbnails
		{
			const bad = report(await fitAll({ scale: 0.6 }, 0.6));
			check('scale: 0.6 makes each item 0.6 of the fit size', !bad.length, show(bad));
			const value = await page.evaluate(async () => {
				await t.open({ thumbs: true });
				return { visible: t.visible(), fit: t.fit(3000, 2000), thumbs: t.$('.bp-thumbs').getBoundingClientRect().top, stage: t.stage(), arrows: [t.center('.bp-prev').y, t.center('.bp-next').y] };
			});
			check('thumbs: the item fits the stage above the thumbnails', near(value.visible, value.fit) && value.visible.top + value.visible.height <= value.thumbs && value.stage.bottom <= value.thumbs, show(value));
			check('thumbs: the arrows are on the middle of the stage', value.arrows.every((y) => Math.abs(y - (value.stage.top + value.stage.height / 2)) <= 1), show({ arrows: value.arrows, stage: value.stage }));
		}

		// A resize of an open gallery fits the item again
		{
			await page.evaluate(() => t.open({ thumbs: true }));
			const result = [];
			// Both sizes change, then only the height, then only the width
			for (const viewport of [{ width: 800, height: 600 }, { width: 800, height: 900 }, { width: 1400, height: 900 }, { width: 1200, height: 900 }]) {
				await page.setViewport(viewport);
				await idle();
				result.push(await page.evaluate(() => ({ visible: t.visible(), fit: t.fit(3000, 2000) })));
			}
			check('a resize of an open gallery fits the item to each new size', result.every((item) => near(item.visible, item.fit)), show(result));
		}

		// The offsets of the page
		{
			const value = await page.evaluate(async () => {
				document.body.style.cssText = '--offset-top: 60px; --offset-bottom: 40px';
				await t.open();
				const result = { visible: t.visible(), fit: t.fit(3000, 2000), stage: t.stage() };
				t.reset();
				document.body.style.cssText = '';
				return result;
			});
			check('--offset-top and --offset-bottom make the stage smaller, and the item fits it', value.stage.top === 60 && value.stage.bottom === 860 && near(value.visible, value.fit), show(value));
		}

		// The size of the thumbnail is only a ratio: the item gets the ratio of the image once it loads
		{
			const value = await page.evaluate(async () => {
				await t.grid([{ w: 3000, h: 2000, thumb: [300, 300], tag: 'square' }, { w: 3000, h: 1000, thumb: false, tag: 'none' }, { w: 1000, h: 2000, lazy: true, tag: 'lazy' }], 'margin-top: 2000px');
				const result = [];
				for (const [index, size] of [[0, [3000, 2000]], [1, [3000, 1000]], [2, [1000, 2000]]]) {
					await t.open({ position: index });
					result.push({ index, visible: t.visible(), fit: t.fit(...size) });
				}
				return result;
			});
			check('a square thumbnail of a 3:2 image: the item takes the ratio of the image', near(value[0].visible, value[0].fit), show(value[0]));
			check('no thumbnail: the item takes the size of the image', near(value[1].visible, value[1].fit), show(value[1]));
			check('a lazy thumbnail that is not loaded: the item takes the size of the image', near(value[2].visible, value[2].fit), show(value[2]));
		}

		// A high density screen loads a larger candidate
		{
			await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
			const set = [[800, 533], [1600, 1067], [3000, 2000]].map(([w, h]) => '/img/dpr/' + w + 'x' + h + '.png ' + w + 'w').join(', ');
			await page.evaluate((set) => t.grid([{ w: 3000, h: 2000, data: { link: set } }]), set);
			await page.evaluate(() => t.open());
			const value = await page.evaluate(() => ({ src: t.$('.bp-img img').currentSrc, visible: t.visible(), fit: t.fit(3000, 2000) })),
				loads = [requests('/dpr/800x'), requests('/dpr/1600x'), requests('/dpr/3000x')];
			check('srcset at 2x: the gallery loads only the candidate sharp for 2x', value.src.includes('/dpr/3000x') && show(loads) === '[0,0,1]' && near(value.visible, value.fit), show({ ...value, loads }));
		}
	}],

	['thumbnails', async ({ page, check, idle, drag }) => {
		await page.evaluate(() => t.grid(Array.from({ length: 30 }, (item, index) => ({ w: 1500, h: 1000, tag: 'strip', alt: 'Photo ' + index }))));
		const strip = () => page.evaluate(() => {
			const bar = t.$('.bp-thumbs').getBoundingClientRect(),
				buttons = t.$$('.bp-thumbs button'),
				active = t.$('.bp-thumbs .active');
			return { count: t.count(), translate: t.strip(), active: buttons.indexOf(active), shown: active && active.getBoundingClientRect().left >= bar.left && active.getBoundingClientRect().right <= bar.right, last: buttons.at(-1).getBoundingClientRect().right, right: bar.right };
		});

		await page.evaluate(() => t.open({ thumbs: true }));
		const labels = await page.evaluate(() => t.$$('.bp-thumbs button').slice(0, 2).map((button) => button.getAttribute('aria-label')));
		check('thumbs: each button has the alt text of its image as its label', show(labels) === show(['Photo 0', 'Photo 1']), show(labels));

		await page.click('.bp-thumbs button:nth-child(4)');
		await idle();
		const click = await strip();
		check('thumbs: a click on a thumbnail shows its item and marks it active', click.count === '4 / 30' && click.active === 3, show(click));

		await page.evaluate(() => window.bp.setPosition(29));
		await wait(50);
		await idle();
		const end = await strip();
		await page.evaluate(() => window.bp.setPosition(0));
		await wait(50);
		await idle();
		const start = await strip();
		check('thumbs: the strip scrolls to show the active thumbnail at the end', end.active === 29 && end.shown && end.translate < 0, show(end));
		check('thumbs: the strip scrolls back to the start', start.active === 0 && start.shown && start.translate === 0, show(start));

		// A right-to-left page: the strip still scrolls to the active thumbnail, and the counter stays at the left, out of the actions
		await page.evaluate(() => (document.documentElement.dir = 'rtl'));
		await page.evaluate(() => window.bp.setPosition(29));
		await wait(50);
		await idle();
		const rtl = await strip(),
			counter = await page.evaluate(() => t.$('.bp-count').getBoundingClientRect().left);
		await page.evaluate(() => {
			document.documentElement.dir = '';
			window.bp.setPosition(0);
		});
		await wait(50);
		await idle();
		check('thumbs: on a right-to-left page, the strip scrolls to the active thumbnail', rtl.active === 29 && rtl.shown, show(rtl));
		check('on a right-to-left page, the counter stays at the left', counter === 0, counter);

		// A drag of the strip moves it and does not click a thumbnail
		{
			const point = { x: 1000, y: await page.evaluate(() => t.center('.bp-thumbs button').y) };
			await drag(point, -400, 0);
			await idle();
			const moved = await strip();
			check('thumbs: a drag moves the strip with the mouse and does not change the item', Math.abs(moved.translate + 400) <= 2 && moved.count === '1 / 30', show(moved));
			const y = point.y;
			await drag({ x: 50, y }, 1100, 0, 20);
			await drag({ x: 50, y }, 1100, 0, 20);
			await idle();
			const left = await strip();
			await drag({ x: 1150, y }, -1100, 0, 20);
			await drag({ x: 1150, y }, -1100, 0, 20);
			await idle();
			const right = await strip();
			check('thumbs: the strip stops at its start and at its end', left.translate === 0 && Math.abs(right.last - right.right) <= 2, show({ left: left.translate, last: right.last, right: right.right }));
		}

		// The focus of a hidden thumbnail scrolls the strip to it
		{
			await page.evaluate(() => window.bp.setPosition(0));
			await idle();
			await page.evaluate(() => t.$$('.bp-thumbs button')[20].focus());
			await idle();
			const value = await page.evaluate(() => {
				const bar = t.$('.bp-thumbs').getBoundingClientRect(),
					rect = t.$$('.bp-thumbs button')[20].getBoundingClientRect();
				return { left: rect.left, right: rect.right, bar: [bar.left, bar.right] };
			});
			check('thumbs: the focus of a hidden thumbnail scrolls the strip to it', value.left >= value.bar[0] && value.right <= value.bar[1], show(value));
		}

		// The thumbnails load lazily: the hidden ones do not load
		{
			const loads = Array.from({ length: 30 }, (item, index) => requests('/strip/' + index + '/300x200.png?thumb'));
			check('thumbs: the page loads each thumbnail once', loads.every((count) => count === 1), show(loads));
		}

		// One item: no strip, no counter and no arrows
		{
			const value = await page.evaluate(async () => {
				await t.grid([{ w: 1500, h: 1000 }]);
				await t.open({ thumbs: true });
				return { strip: !!t.$('.bp-thumbs'), count: !!t.$('.bp-count'), arrows: t.$$('.bp-prev, .bp-next').length };
			});
			check('one item: no strip, no counter and no arrows', !value.strip && !value.count && !value.arrows, show(value));
		}
	}],

	['touch', async ({ page, check, swipe, idle }) => {
		await page.evaluate((photo) => t.grid([photo, photo, photo].map((spec) => ({ ...spec, tag: 'touch' })), 'grid-template-columns: repeat(2, 160px)'), photo);
		const state = () => page.evaluate(() => ({ count: t.count(), wrap: !!t.$('.bp-wrap'), img: t.$('.bp-img') && t.img(), zoomed: !!t.$('.bp-zoomed'), stage: t.$('.bp-ruler') && t.stage() }));

		await page.evaluate(() => t.open());
		const fit = await page.evaluate(() => ({ visible: t.visible(), fit: t.fit(3000, 2000), small: t.$('.bp-wrap').classList.contains('bp-small') }));
		check('small screen: the item fits the stage', near(fit.visible, fit.fit) && fit.small, show(fit));

		const center = await page.evaluate(() => t.center('.bp-img'));
		await swipe(center, -100, 0);
		await idle();
		const left = await state();
		await swipe(center, 100, 0);
		await idle();
		const right = await state();
		await swipe(center, 60, 50);
		await idle();
		const slant = await state();
		check('a swipe to the left goes to the next item, to the right to the previous one', left.count === '2 / 3' && right.count === '1 / 3', show([left.count, right.count]));
		check('a slanted swipe does not change the item', slant.count === '1 / 3', slant.count);

		// A tap zooms, and a swipe of a zoomed image past its edge goes to the next item
		{
			await page.touchscreen.tap(center.x, center.y);
			await idle();
			const tap = await state();
			check('a tap zooms the image to its natural size', tap.zoomed && Math.abs(tap.img.width - 3000) <= 1, show(tap.img));
			const controls = await page.evaluate(() => getComputedStyle(t.$('.bp-controls')).opacity);
			check('the controls hide while the image is zoomed on a small screen', controls === '0', controls);
			// A tap on the hidden next button reaches the image, which zooms out
			const button = await page.evaluate(() => t.center('.bp-next')),
				target = await page.evaluate((button) => document.elementFromPoint(button.x, button.y).className, button);
			check('the hidden controls of a zoomed image take no input', !/bp-next/.test(target), target);
			await page.touchscreen.tap(button.x, button.y);
			await idle();
			const hidden = await state();
			await page.touchscreen.tap(button.x, button.y);
			await idle();
			const again = await state();
			check('after a zoom out, a tap on the next button goes to the next item', again.count === '2 / 3', show(again));
			check('a tap on a hidden control of a zoomed image does not change the item', hidden.count === '1 / 3', show(hidden));
			// The tap at 150 px right of the center pans the image near its right edge, the first swipe pans it to the edge, and the second passes it
			await page.evaluate(() => t.open());
			await page.touchscreen.tap(center.x + 150, center.y);
			await idle();
			await swipe({ x: 340, y: center.y }, -320, 0);
			await idle();
			const before = await state();
			await swipe({ x: 340, y: center.y }, -320, 0);
			await idle();
			const edge = await state();
			// The same at the left edge
			await page.evaluate(() => t.open());
			await page.touchscreen.tap(center.x - 145, center.y);
			await idle();
			await swipe({ x: 50, y: center.y }, 320, 0);
			await idle();
			const left = await state();
			check('a swipe of a zoomed image to its edge stays on the item', before.count === '1 / 3' && before.zoomed && left.count === '1 / 3' && left.zoomed, show({ before, left }));
			check('a swipe of a zoomed image past its edge goes to the next item on a small screen', edge.count === '2 / 3', show(edge));
		}

		// A turn of the phone keeps the zoom, and keeps the image in its bounds
		{
			await page.evaluate(() => t.open());
			await page.touchscreen.tap(center.x, center.y);
			await idle();
			await page.setViewport({ width: 700, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
			await idle();
			const value = await state();
			await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
			await idle();
			const inside = value.img.left <= value.stage.left + 0.5 && value.img.left + value.img.width >= value.stage.right - 0.5 && value.img.top <= value.stage.top + 0.5 && value.img.top + value.img.height >= value.stage.bottom - 0.5;
			check('a turn of the phone keeps the zoom, and the image covers the stage', value.zoomed && inside, show(value));
		}

		// A swipe up closes
		{
			await page.evaluate(() => t.open());
			await swipe(center, 0, -150);
			await idle();
			const value = await state();
			check('a swipe up closes the gallery', !value.wrap);
		}

		// A pinch zooms, and noPinch stops it
		{
			const cdp = await page.createCDPSession(),
				touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) }),
				pinch = async () => {
					const { x, y } = center;
					await touch('touchStart', [[x - 30, y], [x + 30, y]]);
					for (let step = 1; step <= 8; step++) {
						await touch('touchMove', [[x - 30 - step * 8, y], [x + 30 + step * 8, y]]);
						await wait(16);
					}
					await touch('touchEnd', []);
					await idle();
				};
			await page.evaluate(() => t.open());
			await pinch();
			const zoom = await state();
			await page.evaluate(() => t.open({ noPinch: true }));
			await pinch();
			const off = await state();
			check('a pinch zooms the image in', zoom.zoomed && zoom.img.width > fit.fit.width * 2, show(zoom.img));
			check('noPinch: a pinch does not zoom', !off.zoomed && near(off.img, fit.fit), show(off.img));
			await cdp.detach();
		}

		// A high density phone loads the candidate sharp for its density
		{
			const set = [[400, 267], [800, 533], [3000, 2000]].map(([w, h]) => '/img/phone/' + w + 'x' + h + '.png ' + w + 'w').join(', ');
			await page.evaluate((set) => t.grid([{ w: 3000, h: 2000, data: { link: set } }]), set);
			await page.evaluate(() => t.open());
			const src = await page.evaluate(() => t.$('.bp-img img').currentSrc),
				loads = [requests('/phone/400x'), requests('/phone/800x'), requests('/phone/3000x')];
			check('srcset at 2x on a phone: the gallery loads only the 800w candidate', src.includes('/phone/800x') && show(loads) === '[0,1,0]', show({ src, loads }));
		}
	}, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],

	['content', async ({ page, check, idle }) => {
		// Other sites get an empty page, so that the checks need no network
		await page.setRequestInterception(true);
		page.on('request', (request) => (request.url().startsWith(base) || request.url().startsWith('data:') ? request.continue() : request.respond({ status: 200, contentType: 'text/html', body: '' })));

		const value = await page.evaluate(async () => {
			const errors = [];
			t.make({}, { onError: (container, item) => errors.push(item.i) });
			const items = [
				{ link: 'https://www.youtube.com/watch?v=abcdefghijk&t=1h2m3s' },
				{ link: 'https://vimeo.com/123456/abcdef1234' },
				{ link: '/img/c/1000x500.png?x=1,2', type: 'image', width: 1000, height: 500 },
				{ link: '/img/c/600x400.png 600w,/img/c/1200x800.png 1200w' },
				{ html: '<div style="width: 400px; height: 300px; background: #fff"><input id="field" value="text"></div>' },
				{ link: '/frame.html', type: 'iframe', width: 800, height: 600 },
				{ sources: [{ src: '/tone.wav', type: 'audio/wav' }], width: 800, height: 450 },
				{ link: '/img/c/404.png?status=404' },
				{ link: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="red"/></svg>') },
				{ link: '/file.txt' },
				{ link: 'https://www.youtube-nocookie.com/embed/abcdefghijk' },
				{ link: 'https://vimeo.com/channels/staffpicks/123456' },
				{ link: 'https://www.youtube.com/shorts/abcdefghijk' },
				{ link: '/img/c/photo.jfif' },
				{ link: '/frame.html', type: 'iframe', width: '400px', height: '300px' },
				{ sources: [{ src: '/tone.wav' }] },
				{ link: 'https://example.com/page?u=youtube.com/watch?v=abcdefghijk' }
			];
			const copy = JSON.stringify(items);
			window.bp.open({ items, ...t.options });
			await t.idle();
			const read = {};
			for (let index = 0; index < 9; index++) {
				window.bp.setPosition(index);
				await t.wait(50);
				await t.idle();
				const slide = t.slide();
				read[index] = { type: window.bp.items[index].type, iframe: t.$('iframe', slide)?.src, img: t.$('.bp-img img', slide)?.currentSrc, audio: !!t.$('audio source', slide), loader: t.$('.bp-load', slide)?.className ?? null, html: !!t.$('#field', slide) };
			}
			const links = window.bp.items.slice(9).map((item) => item.type + ' ' + item.link),
				sizes = window.bp.items.slice(9).map((item) => item.width + 'x' + item.height);
			// A video with no size takes the size of the file once its metadata loads
			window.bp.setPosition(14);
			await t.idle();
			const video = t.$('video', t.slide());
			Object.defineProperties(video, { videoWidth: { value: 270 }, videoHeight: { value: 480 } });
			video.dispatchEvent(new Event('loadedmetadata'));
			await t.idle();
			const box = t.$('.bp-video', t.slide()).getBoundingClientRect();
			window.bp.setPosition(0);
			await t.idle();
			return { read, count: window.bp.items.length, errors, same: JSON.stringify(items) === copy, links, sizes, ratio: box.width / box.height };
		});
		const read = value.read;
		check('YouTube: the embed URL with the start time in seconds', read[0].iframe === 'https://www.youtube.com/embed/abcdefghijk?autoplay=1&playsinline=1&controls=1&rel=0&start=3723', read[0].iframe);
		check('Vimeo: the player URL with the private hash', read[1].iframe === 'https://player.vimeo.com/video/123456?autoplay=1&playsinline=1&h=abcdef1234', read[1].iframe);
		check('a comma in an image URL stays in the URL', (read[2].img || '').endsWith('/img/c/1000x500.png?x=1,2'), read[2].img);
		check('a srcset with no space after the comma: the gallery picks a candidate', /\/img\/c\/1200x800\.png$/.test(read[3].img || ''), read[3].img);
		check('HTML, iframe and audio items show their content', read[4].html && read[5].iframe === base + 'frame.html' && read[6].audio, show([read[4], read[5], read[6]]));
		check('the loader of an iframe and an audio item fades out once they load', /bp-loaded/.test(read[5].loader ?? 'bp-loaded') && /bp-loaded/.test(read[6].loader ?? 'bp-loaded'), show([read[5].loader, read[6].loader]));
		check('a data URL of an image is an image item', read[8].type === 'image' && read[8].img?.startsWith('data:image/svg'), show(read[8]));
		check('a link with no known type is left out, and the item objects stay as they are', value.count === 15 && value.same, show(value));
		check('youtube-nocookie: the embed stays on its host', value.links[0] === 'iframe https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1&playsinline=1&controls=1&rel=0', value.links[0]);
		check('Vimeo: a link in a channel gives the player URL', value.links[1] === 'iframe https://player.vimeo.com/video/123456?autoplay=1&playsinline=1', value.links[1]);
		check('YouTube Shorts are portrait', value.sizes[2] === '1080x1920', value.sizes[2]);
		check('a .jfif link is an image', value.links[3] === 'image /img/c/photo.jfif', value.links[3]);
		check('a size with a unit, such as "400px", is a number', value.sizes[4] === '400x300', value.sizes[4]);
		check('a video with no size takes the size of the file', Math.abs(value.ratio - 270 / 480) < 0.01, value.ratio);
		check('onError gets the item of an image that does not load', show(value.errors) === '[7]', show(value.errors));

		// A text field of an HTML item keeps the arrow keys
		{
			await page.evaluate(async () => {
				window.bp.setPosition(4);
				await t.idle();
				t.$('#field').focus();
			});
			await page.keyboard.press('ArrowLeft');
			const count = await page.evaluate(() => t.count());
			check('an arrow key in a text field of an HTML item moves the caret, not the gallery', count === '5 / 15', count);
		}

		// A focused audio or video item keeps the arrow keys, the player seeks
		{
			await page.evaluate(async () => {
				window.bp.setPosition(6);
				await t.idle();
				t.$('audio', t.slide()).focus();
			});
			await page.keyboard.press('ArrowRight');
			await idle();
			const count = await page.evaluate(() => t.count());
			check('an arrow key on a focused audio item seeks, and does not change the item', count === '7 / 15', count);
		}

		// Space plays and pauses an audio or video item, and a focused player toggles once
		{
			const paused = () => page.evaluate(() => t.$('audio', t.slide()).paused);
			const start = await paused();
			await page.keyboard.press(' ');
			const player = await paused();
			await page.evaluate(() => t.$('.bp-wrap').focus());
			await page.keyboard.press(' ');
			const wrap = await paused();
			await page.keyboard.press(' ');
			const back = await paused();
			check('Space on a focused player plays or pauses it once', player !== start, show({ start, player }));
			check('Space plays and pauses the audio item', wrap !== player && back === player, show({ player, wrap, back }));
		}

		// HTML larger than the stage fits in it and scrolls, and a long word breaks
		{
			const value = await page.evaluate(async () => {
				t.make();
				window.bp.open({ items: [{ html: '<div id="tall" style="background: #fff"><div style="width: 5000px; height: 5000px">x</div></div>' }, { html: '<p id="long" style="background: #fff">' + 'a'.repeat(1000) + '</p>' }], ...t.options });
				await t.idle();
				const stage = t.stage(),
					tall = t.$('#tall'),
					rect = tall.getBoundingClientRect(),
					inside = rect.left >= stage.left && rect.top >= stage.top && rect.right <= stage.right && rect.bottom <= stage.bottom;
				tall.scrollTop = 200;
				const scrolled = tall.scrollTop;
				window.bp.next();
				await t.idle();
				const long = t.$('#long');
				return { inside, scrolled, wide: long.scrollWidth - long.clientWidth, width: long.getBoundingClientRect().width, stage: stage.width };
			});
			check('HTML larger than the stage fits in it, and scrolls', value.inside && value.scrolled === 200, show(value));
			check('a long word in an HTML item breaks to the next line', value.wide === 0 && value.width <= value.stage, show(value));
		}

		// The callbacks of the first item get the gallery element, which mounts after the item is made
		{
			const value = await page.evaluate(async () => {
				let gallery;
				t.make({}, { onError: (container) => (gallery = container) });
				window.bp.open({ items: [{ link: '/img/c/404.png?status=404' }], ...t.options });
				await t.idle();
				return gallery?.className;
			});
			check('onError of the first item gets the gallery element', /bp-wrap/.test(value), value);
		}

		// The types option
		{
			const value = await page.evaluate(async () => {
				t.make();
				window.bp.open({ items: [{ link: '/img/a/600x400.png' }, { link: '/frame.html', type: 'iframe' }, { html: '<p>x</p>' }], types: ['image', 'html'] });
				await t.idle();
				return window.bp.items.map((item) => item.type);
			});
			check('types: only the items of the given types show', show(value) === show(['image', 'html']), show(value));
		}
	}],

	['inline and dialog', async ({ page, check, idle }) => {
		await page.evaluate((photo) => t.grid([photo, photo]), photo);

		// An inline gallery: no lock, no keys, the wheel scrolls the page until the image is zoomed. The box is 340 x 240 at the top 1000 px.
		{
			await page.evaluate(() => {
				scrollTo(0, 900);
				t.make({ target: t.$('#box') });
				window.bp.open({ items: t.$$('#root a'), inline: true });
			});
			await idle();
			const value = await page.evaluate(() => {
				const box = t.$('#box').getBoundingClientRect(),
					item = t.visible(),
					ratio = Math.min(box.width / 3000, box.height / 2000);
				return { role: t.$('.bp-wrap').getAttribute('role'), lock: document.documentElement.classList.contains('bp-lock'), item, fit: { left: box.left + (box.width - Math.round(3000 * ratio)) / 2, top: box.top + (box.height - Math.round(2000 * ratio)) / 2, width: Math.round(3000 * ratio), height: Math.round(2000 * ratio) } };
			});
			check('inline: a region in the target, with no scroll lock', value.role === 'region' && !value.lock, show(value));
			check('inline: the item fits the target', near(value.item, value.fit), show(value));

			// The 340 px box has no gap, so the 340 px item needs the 680w candidate. With the default gap of the page, it is 320 px, and 330w would do.
			const set = await page.evaluate(async () => {
				const link = document.createElement('a');
				link.href = '/img/inset/330x220.png';
				link.dataset.link = '/img/inset/330x220.png 330w, /img/inset/680x453.png 680w, /img/inset/3000x2000.png 3000w';
				t.make({ target: t.$('#box') });
				window.bp.open({ items: [link], inline: true });
				await t.idle();
				return t.$('.bp-img img').currentSrc;
			});
			const loads = [requests('/inset/330x'), requests('/inset/680x'), requests('/inset/3000x')];
			check('inline: the gallery loads only the srcset candidate for the size with no gap', set.endsWith('/inset/680x453.png') && show(loads) === '[0,1,0]', show({ set, loads }));
			await page.evaluate(() => {
				t.make({ target: t.$('#box') });
				window.bp.open({ items: t.$$('#root a'), inline: true });
			});
			await idle();

			await page.keyboard.press('ArrowRight');
			const key = await page.evaluate(() => t.count());
			check('inline: the gallery does not take the arrow keys of the page', key === '1 / 2', key);

			const center = await page.evaluate(() => t.center('.bp-img'));
			await page.mouse.move(center.x, center.y);
			await page.mouse.wheel({ deltaY: 200 });
			await wait(300);
			const scroll = await page.evaluate(() => ({ scroll: scrollY, zoomed: !!t.$('.bp-zoomed') }));
			check('inline: the wheel over an image that is not zoomed scrolls the page', scroll.scroll > 900 && !scroll.zoomed, show(scroll));

			await page.evaluate(() => scrollTo(0, 900));
			const point = await page.evaluate(() => t.center('.bp-img'));
			await page.mouse.click(point.x, point.y);
			await idle();
			await page.mouse.wheel({ deltaY: -200 });
			await idle();
			const zoom = await page.evaluate(() => ({ scroll: scrollY, zoomed: !!t.$('.bp-zoomed') }));
			check('inline: a click zooms, and then the wheel zooms and does not scroll the page', zoom.scroll === 900 && zoom.zoomed, show(zoom));
			await page.evaluate(() => scrollTo(0, 0));
		}

		// dialog: true: a modal dialog in the top layer, and Escape closes it with the motion
		{
			await page.evaluate(() => t.open({}, { dialog: true }));
			const value = await page.evaluate(() => ({ tag: t.$('.bp-wrap').tagName, modal: t.$('.bp-wrap').matches(':modal') }));
			await page.keyboard.press('Escape');
			const during = await page.evaluate(() => ({ open: t.$('.bp-wrap')?.open, closing: !!t.$('.bp-closing') }));
			await idle();
			const after = await page.evaluate(() => !!t.$('.bp-wrap'));
			check('dialog: the gallery is a modal dialog', value.tag === 'DIALOG' && value.modal, show(value));
			check('dialog: Escape runs the close motion, and then removes the dialog', during.open && during.closing && !after, show({ during, after }));
		}

		// A gallery opened over another one gets the keys, the one under it does not
		{
			const value = await page.evaluate(async () => {
				await t.open();
				const under = window.bp,
					over = BiggerPicture();
				over.open({ items: t.$$('#root a') });
				await t.idle();
				t.$$('.bp-wrap')[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
				await t.idle();
				const counts = t.$$('.bp-count').map((node) => node.textContent.trim());
				over.$destroy();
				under.$destroy();
				return counts;
			});
			check('two galleries: a key in the upper gallery moves only that one', value[0] === '1 / 2' && value[1] === '2 / 2', show(value));
		}

		// Two galleries: a key with no focused node goes to the upper one, and the page stays locked until both close
		{
			const value = await page.evaluate(async () => {
				document.body.style.minHeight = '3000px';
				await t.open();
				const under = window.bp,
					over = BiggerPicture();
				over.open({ items: t.$$('#root a') });
				await t.idle();
				document.activeElement.blur();
				document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
				await t.idle();
				const counts = t.$$('.bp-count').map((node) => node.textContent.trim().split(' ')[0]);
				over.close();
				await t.wait(700);
				await t.idle();
				const lock = document.documentElement.classList.contains('bp-lock');
				under.$destroy();
				document.body.style.minHeight = '';
				return { counts, lock, after: document.documentElement.classList.contains('bp-lock') };
			});
			check('two galleries: a key with no focused node moves only the upper one', show(value.counts) === show(['1', '2']), show(value.counts));
			check('two galleries: the page stays locked until the last one closes', value.lock && !value.after, show(value));
		}
	}],

	['performance', async ({ page, check, idle }) => {
		await page.evaluate((photo) => t.grid(Array.from({ length: 20 }, () => ({ ...photo, tag: 'perf' }))), photo);
		// Load the images first, so that the trace has only the motions
		await page.evaluate(() => t.open({ thumbs: true }));
		await page.evaluate(() => t.reset());

		// The motions run on the compositor
		{
			await page.tracing.start({ categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.animations'] });
			await page.evaluate(async () => {
				await t.open({ thumbs: true });
				window.bp.next();
				await t.idle();
				window.bp.items[1].zoom = true;
				await t.idle();
				window.bp.items[1].zoom = false;
				await t.idle();
				window.bp.close();
				await t.idle();
			});
			const data = JSON.parse(new TextDecoder().decode(await page.tracing.stop())),
				events = data.traceEvents,
				failed = events.filter((event) => event.name === 'Animation' && event.args?.data?.compositeFailed).map((event) => (event.args.data.name || '(none)') + ':' + event.args.data.compositeFailed),
				animations = events.filter((event) => event.name === 'Animation' && event.ph === 'b').length;
			check('open, next, zoom and close: each animation runs on the compositor', animations > 5 && !failed.length, show({ animations, failed: [...new Set(failed)] }));
		}

		// No layer of the gallery that paints is dropped at the end of a motion: a dropped layer repaints its content, and it can blink
		{
			const cdp = await page.createCDPSession(),
				snapshots = [];
			await cdp.send('DOM.getDocument');
			await cdp.send('LayerTree.enable');
			// The nodes with a layer that paints. all has the nodes with any layer.
			let all = new Set();
			cdp.on('LayerTree.layerTreeDidChange', ({ layers }) => {
				if (layers) {
					all = new Set(layers.map((layer) => layer.backendNodeId));
					snapshots.push(new Set(layers.filter((layer) => layer.drawsContent).map((layer) => layer.backendNodeId).filter(Boolean)));
				}
			});
			// The tag and the class of the nodes that are still in the page
			const names = async (ids) => {
				const list = [];
				for (const id of ids) {
					const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: id }).catch(() => ({}));
					const { result } = object ? await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: 'function () { return this.isConnected ? this.tagName + "." + this.className : "" }', returnByValue: true }) : {};
					result?.value && list.push(result.value);
				}
				return list;
			};
			// Run a motion, and add the nodes that had a layer during it and have none at rest after it
			const dropped = new Set(),
				observe = async (step) => {
					const first = snapshots.length;
					await page.evaluate(step);
					await idle();
					await wait(200);
					const rest = snapshots.at(-1) || new Set(),
						seen = new Set(snapshots.slice(Math.max(0, first - 1)).flatMap((set) => [...set]));
					(await names([...seen].filter((id) => !rest.has(id)))).forEach((name) => dropped.add(name));
				};
			// The open, a change of the item, and a change that scrolls the thumbnail strip
			await observe(() => t.open({ thumbs: true }, {}, false));
			await observe(() => window.bp.next());
			await observe(() => window.bp.setPosition(15));
			const parts = ['bp-overlay', 'bp-slide', 'bp-img', 'bp-thumbs', 'bp-thumbs-outer'],
				of = (part) => [...dropped].filter((name) => name.split('.')[1]?.split(' ').includes(part));
			for (const part of parts) {
				check('open, next and a strip scroll: the .' + part + ' layer stays when the motion ends', snapshots.length > 0 && !of(part).length, show(of(part)));
			}
			// The slide paints nothing, but it keeps its layer, so that the close does not wait for a new one
			const { root } = await cdp.send('DOM.getDocument'),
				{ nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.bp-slide' }),
				{ node } = await cdp.send('DOM.describeNode', { nodeId });
			check('at rest: the slide keeps its layer for the close', all.has(node.backendNodeId), show({ layers: all.size }));
			const other = [...dropped].filter((name) => /bp-/.test(name) && !parts.some((part) => of(part).includes(name)));
			check('open, next and a strip scroll: no layer of the other parts is dropped when the motion ends', !other.length, show(other));
			await cdp.send('LayerTree.disable');
			await cdp.detach();
		}

		// No work at rest: no frames, timers or layouts once the gallery is still
		{
			await page.evaluate(() => t.open({ thumbs: true }));
			await wait(300);
			await page.tracing.start({ categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });
			await wait(1000);
			const data = JSON.parse(new TextDecoder().decode(await page.tracing.stop())),
				count = (name) => data.traceEvents.filter((event) => event.name === name && event.ph !== 'E').length,
				value = { frames: count('FireAnimationFrame'), timers: count('TimerFire'), layouts: count('Layout'), paints: count('Paint') };
			check('at rest: 1 s with no frames, timers, layouts or paints', !value.frames && !value.timers && !value.layouts && !value.paints, show(value));
		}

		// The DOM and the listeners go after the close
		{
			const value = await page.evaluate(async () => {
				t.reset();
				const before = document.body.querySelectorAll('*').length;
				await t.open({ thumbs: true, history: true });
				window.bp.close();
				await t.idle();
				await t.wait(100);
				return { before, after: document.body.querySelectorAll('*').length, wraps: t.$$('.bp-wrap, .bp-slide').length };
			});
			check('the close removes all the nodes of the gallery', value.before === value.after && !value.wraps, show(value));
		}
	}],
	['edge cases', async ({ page, check, idle }) => {
		// Other sites get an empty page, so that the checks need no network
		await page.setRequestInterception(true);
		page.on('request', (request) => (request.url().startsWith(base) || request.url().startsWith('data:') ? request.continue() : request.respond({ status: 200, contentType: 'text/html', body: '' })));

		// An item of another type after a zoomed image is not zoomed: the caption shows and the arrows work
		{
			await page.evaluate(async () => {
				await t.grid([{ w: 3000, h: 2000 }]);
				t.make();
				window.bp.open({ items: [t.$('#root a'), { html: '<p>two</p>', caption: 'Two' }, { html: '<p>three</p>' }], ...t.options });
				await t.idle();
			});
			await page.keyboard.press('Space');
			await idle();
			const zoomed = await page.evaluate(() => t.$('.bp-wrap').classList.contains('bp-zoomed'));
			await page.evaluate(() => window.bp.next());
			await idle();
			const next = await page.evaluate(() => ({ zoomed: t.$('.bp-wrap').classList.contains('bp-zoomed'), caption: getComputedStyle(t.$('.bp-caption')).opacity }));
			await page.keyboard.press('ArrowRight');
			await idle();
			const count = await page.evaluate(() => t.$('.bp-count').textContent.trim());
			check('zoom: the next item of another type is not zoomed', zoomed && !next.zoomed && next.caption === '1' && count === '3 / 3', show({ zoomed, next, count }));
		}

		// The focus goes back to the trigger in dialog mode too, and onClose can move it out during the outro
		{
			const value = await page.evaluate(async () => {
				const link = t.$('#root a'),
					button = document.body.appendChild(document.createElement('button'));
				// After make, the destroy of the last gallery gives the focus back to its own trigger
				t.make({ dialog: true });
				link.focus();
				window.bp.open({ items: [link] });
				await t.idle();
				window.bp.close();
				await t.idle();
				await t.wait(100);
				const dialog = document.activeElement === link;
				t.make({}, { onClose: () => button.focus() });
				window.bp.open({ items: [link], ...t.options });
				await t.idle();
				window.bp.close();
				const outro = document.activeElement === button;
				await t.idle();
				await t.wait(100);
				button.remove();
				return { dialog, outro };
			});
			check('dialog: the close gives the focus back to the trigger', value.dialog);
			check('onClose can move the focus out of the gallery during the outro', value.outro);
		}

		// attr: false removes an attribute, such as a default one. Other values stay, also "0" and ""
		{
			const value = await page.evaluate(async () => {
				t.make();
				window.bp.open({ items: [{ sources: [{ src: '/tone.wav', type: 'audio/wav' }], attr: { autoplay: false, controls: false, 'data-empty': '', 'data-zero': '0' } }] });
				await t.wait(50);
				const audio = t.$('audio');
				return { autoplay: audio.autoplay, controls: audio.controls, tabindex: audio.getAttribute('tabindex'), empty: audio.getAttribute('data-empty'), zero: audio.getAttribute('data-zero') };
			});
			check('attr: false removes an attribute, and "0" and "" stay', !value.autoplay && !value.controls && value.tabindex === '0' && value.empty === '' && value.zero === '0', show(value));
		}

		// history: each gallery has its own entry
		{
			// An open call while open, with no motion: the next gallery takes the entry, so no popstate closes it
			await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
			const reopen = await page.evaluate(async () => {
				t.make();
				window.bp.open({ items: [{ html: '<p>one</p>' }], history: true });
				await t.wait(100);
				const length = history.length;
				window.bp.open({ items: [{ html: '<p>two</p>' }], history: true });
				await t.wait(500);
				return { wrap: !!t.$('.bp-wrap'), state: !!history.state?.bp, same: history.length === length };
			});
			await page.emulateMediaFeatures([]);
			check('history: an open call while open, with no motion, shows the next gallery', reopen.wrap && reopen.state && reopen.same, show(reopen));

			// The back button closes the upper one of two galleries, then the lower one
			const stacked = await page.evaluate(async () => {
				t.make();
				window.bp.open({ items: [{ html: '<p>lower</p>' }], history: true });
				await t.idle();
				const upper = BiggerPicture({});
				upper.open({ items: [{ html: '<p>upper</p>' }], history: true });
				await t.idle();
				const count = () => t.$$('.bp-wrap').length;
				history.back();
				await t.wait(100);
				await t.idle();
				const first = count();
				history.back();
				await t.wait(100);
				await t.idle();
				upper.$destroy();
				return [first, count()];
			});
			check('history: the back button closes the upper of two galleries, then the lower one', stacked[0] === 1 && stacked[1] === 0, show(stacked));

			// An inline gallery adds no entry, so its close removes none
			const inline = await page.evaluate(async () => {
				t.make();
				window.bp.open({ items: [{ html: '<p>modal</p>' }], history: true });
				await t.idle();
				const region = BiggerPicture({ target: t.$('#box') });
				region.open({ items: [{ html: '<p>inline</p>' }], inline: true, history: true });
				await t.idle();
				region.close();
				await t.wait(100);
				await t.idle();
				const value = { modal: !!t.$('.bp-wrap:not(.bp-inline)'), state: !!history.state?.bp };
				region.$destroy();
				window.bp.close();
				await t.idle();
				return value;
			});
			check('history: the close of an inline gallery keeps the modal one open', inline.modal && inline.state, show(inline));
		}

		// YouTube: a playlist keeps its path and list, also after another parameter, and gets no thumbnail of a video
		{
			const value = await page.evaluate(async () => {
				t.make();
				window.bp.open({ items: [{ link: 'https://www.youtube.com/embed/videoseries?si=abc&list=PL123' }, { link: 'https://www.youtube.com/embed?listType=playlist&list=PL123' }] });
				await t.wait(50);
				return { links: window.bp.items.map((item) => item.link), thumbs: window.bp.items.map((item) => item.thumb) };
			});
			check('YouTube: a playlist keeps its list and gets no video thumbnail', value.links[0] === 'https://www.youtube.com/embed/videoseries?autoplay=1&playsinline=1&controls=1&rel=0&si=abc&list=PL123' && value.links[1] === 'https://www.youtube.com/embed/?autoplay=1&playsinline=1&controls=1&rel=0&listType=playlist&list=PL123' && !value.thumbs[0] && !value.thumbs[1], show(value));
		}

		// Items that the gallery can't measure or play: no errors, see the check of page errors
		{
			const value = await page.evaluate(async () => {
				// An HTML item in a hidden target has no size to zoom from
				const hidden = document.body.appendChild(document.createElement('div'));
				hidden.style.display = 'none';
				t.make({ target: hidden });
				window.bp.open({ items: [{ html: '<p>hidden</p>' }], inline: true });
				await t.wait(50);
				window.bp.close();
				await t.idle();
				hidden.remove();
				// An empty list of sources is no sources
				t.make();
				window.bp.open({ items: [{ sources: [] }] });
				await t.wait(50);
				const none = !t.$('.bp-wrap');
				window.bp.open({ items: [{ sources: [], html: '<p id="no-sources">html</p>' }] });
				await t.wait(50);
				const html = !!t.$('#no-sources');
				// A failed video hides its loader
				t.make();
				window.bp.open({ items: [{ sources: [{ src: '/media/a.mp4?status=404', type: 'video/mp4' }, { src: '/media/b.webm?status=404', type: 'video/webm' }] }] });
				await t.wait(1000);
				const loader = t.$('.bp-load')?.className ?? 'removed';
				// An HTML item with no size fades in, and a removed thumbnail fades out, with no NaN or Infinity
				t.make();
				window.bp.open({ items: [{ html: '<div></div>' }] });
				await t.wait(50);
				const empty = t.slide().style.cssText;
				await t.grid([{ w: 3000, h: 2000 }]);
				await t.open();
				t.$('#root a').remove();
				window.bp.close();
				const removed = t.slide().style.cssText;
				await t.idle();
				return { none, html, loader, empty, removed };
			});
			check('sources: an empty list is no sources', value.none && value.html, show(value));
			check('the loader of a video goes when its last source fails', value.loader === 'removed' || /bp-loaded/.test(value.loader), value.loader);
			check('an item or a thumbnail with no size fades, with no NaN or Infinity', !/NaN|Infinity/.test(value.empty + value.removed) && /translateY/.test(value.empty) && /translateY/.test(value.removed), show(value));
		}

		// A close in onOpen keeps its outro
		{
			const value = await page.evaluate(async () => {
				t.make({}, { onOpen: () => window.bp.close() });
				window.bp.open({ items: [{ html: '<p>one</p>' }], ...t.options });
				await t.wait(50);
				const className = t.slide()?.className;
				await t.idle();
				return className;
			});
			check('a close in onOpen keeps its outro', /bp-out/.test(value), value);
		}

		// The download of a srcset: an encoded href, and a density with a fraction
		{
			const value = await page.evaluate(async () => {
				t.make();
				window.bp.open({ download: true, items: [{ link: '/img/dl/400x300.png%20400w,%20/img/dl/800x600.png%20800w', type: 'image' }, { link: '/img/dl/400x300.png 1x, /img/dl/600x450.png 1.5x' }] });
				await t.wait(50);
				return window.bp.items.map((item) => item.download);
			});
			check('download: the largest candidate of an encoded srcset and of a 1.5x density', value[0] === '/img/dl/800x600.png' && value[1] === '/img/dl/600x450.png', show(value));
		}

		// setPosition: an index below the negative length wraps
		{
			const value = await page.evaluate(async () => {
				t.make();
				window.bp.open({ items: [{ html: '1' }, { html: '2' }, { html: '3' }] });
				await t.idle();
				window.bp.setPosition(-5);
				await t.idle();
				return t.$('.bp-count').textContent.trim();
			});
			check('setPosition: an index below the negative length wraps', value === '2 / 3', value);
		}

		// Thumbnails of an inline gallery away from the left of the screen, and in a panel that gets wider
		{
			const value = await page.evaluate(async () => {
				const box = t.$('#box');
				box.style.left = '500px';
				scrollTo(0, 900);
				await t.grid(Array.from({ length: 10 }, () => ({ w: 3000, h: 2000 })));
				t.make({ target: box });
				window.bp.open({ items: t.$$('#root a'), inline: true, thumbs: true });
				await t.idle();
				const left = () => t.$('.bp-thumbs button').getBoundingClientRect().left - t.$('.bp-thumbs').getBoundingClientRect().left;
				window.bp.setPosition(9);
				await t.idle();
				window.bp.setPosition(0);
				await t.wait(50);
				await t.idle();
				const back = left();
				window.bp.setPosition(9);
				await t.idle();
				box.style.width = '1600px';
				await t.wait(50);
				await t.idle();
				const wide = { left: left(), strip: t.$('.bp-thumbs-inner').offsetWidth, panel: t.$('.bp-thumbs').offsetWidth };
				t.reset();
				box.style.left = box.style.width = '';
				scrollTo(0, 0);
				return { back, wide };
			});
			check('thumbnails: the first button comes back into an inline panel away from the left', value.back >= 0, show(value));
			check('thumbnails: a panel that gets wider than the strip shows it from its start', value.wide.strip < value.wide.panel && value.wide.left >= 0, show(value));
		}

		// Tab from a player with no control after it keeps the focus in the gallery
		{
			const value = await page.evaluate(async () => {
				t.make();
				window.bp.open({ items: [{ sources: [{ src: '/tone.wav', type: 'audio/wav' }] }], persistent: true });
				await t.idle();
				const after = document.createElement('button');
				after.id = 'after-gallery';
				document.body.append(after);
				t.$('audio').focus();
			});
			const inside = [];
			for (let step = 0; step < 4; step++) {
				await page.keyboard.press('Tab');
				inside.push(await page.evaluate(() => !!document.activeElement.closest('.bp-wrap')));
			}
			await page.evaluate(() => t.$('#after-gallery').remove());
			check('Tab from a player with no control after it keeps the focus in the gallery', inside.every(Boolean), show(inside));
		}

		// The scroll lock gives back the inline padding of the page
		{
			const value = await page.evaluate(async () => {
				// After the reset, the unlock of the last gallery sets the padding it found
				const root = document.documentElement;
				t.reset();
				root.style.paddingRight = '20px';
				await t.open();
				const locked = root.style.paddingRight;
				window.bp.close();
				await t.idle();
				await t.wait(100);
				const after = root.style.paddingRight;
				root.style.paddingRight = '';
				return { locked, after };
			});
			check('scroll lock: the close gives back the inline padding of the page', value.locked === '35px' && value.after === '20px', show(value));
		}

		// A thumbnail URL with quotes, such as of an SVG, shows under the image while it loads
		{
			const value = await page.evaluate(async () => {
				t.make();
				window.bp.open({ items: [{ link: t.image('quote', 400, 300, 3000), thumb: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"></svg>' }] });
				await t.wait(100);
				return t.$('.bp-img').style.backgroundImage;
			});
			check('a thumbnail URL with quotes shows under the image while it loads', /^url\(/.test(value), value);
		}

		// The backdrop of a dialog takes --bp-duration
		{
			const value = await page.evaluate(async () => {
				const root = document.documentElement;
				root.style.setProperty('--bp-duration', '100ms');
				t.make({ dialog: true });
				window.bp.open({ items: [{ html: '<p>one</p>' }] });
				await t.wait(50);
				const duration = getComputedStyle(t.$('dialog'), '::backdrop').animationDuration;
				root.style.removeProperty('--bp-duration');
				return duration;
			});
			check('dialog: the backdrop takes --bp-duration', value === '0.1s', value);
		}

		// The thumbnail buttons get the text of an HTML caption
		{
			const value = await page.evaluate(async () => {
				t.make();
				window.bp.open({ thumbs: true, items: [{ html: '<p>one</p>', caption: '<b>Bold</b> &amp; <a href="#">link</a>' }, { html: '<p>two</p>' }] });
				await t.wait(50);
				const button = t.$('.bp-thumbs button');
				return [button.title, button.getAttribute('aria-label')];
			});
			check('thumbnails: the title and the label are the text of an HTML caption', value[0] === 'Bold & link' && value[1] === 'Bold & link', show(value));
		}

		// history: a gallery that doesn't take the entry of the last one drops it: an inline one, and one with no items
		{
			const value = await page.evaluate(async () => {
				const read = async (options) => {
					// The entries of the checks above stay, so the state goes back to the one before the modal gallery
					t.make();
					const before = history.state?.bp;
					window.bp.open({ items: [{ html: '<p>modal</p>' }], history: true });
					await t.idle();
					window.bp.open({ history: true, ...options });
					await t.wait(100);
					await t.idle();
					await t.wait(100);
					return history.state?.bp === before;
				};
				return [await read({ items: [{ html: '<p>inline</p>' }], inline: true }), await read({ items: [] })];
			});
			check('history: an inline gallery or one with no items drops the entry of the last one', value[0] && value[1], show(value));
		}
	}],
];

const start = performance.now();

// Each worker runs the next group from the queue
const queue = groups.filter(([name]) => !only || only.includes(name)).entries(),
	reports = [];
await Promise.all(Array.from({ length: workers }, async () => {
	for (const [index, [name, run, viewport = { width: 1200, height: 900 }]] of queue) {
		const list = [],
			time = performance.now(),
			tools = await open(list, viewport);
		try {
			await run(tools);
		} catch (error) {
			tools.check(name + ': the group runs to the end', false, error.message);
		}
		await tools.browser.close();
		reports[index] = ['== ' + name + ', ' + ((performance.now() - time) / 1000).toFixed(1) + ' s', ...list];
	}
}));

server.close();

const lines = reports.flat(),
	failed = lines.filter((line) => line.startsWith('FAIL')).length,
	passed = lines.filter((line) => line.startsWith('PASS')).length;

console.log(lines.join('\n'));
console.log('\n' + passed + ' passed, ' + failed + ' failed in ' + ((performance.now() - start) / 1000).toFixed(1) + ' s');
process.env.E2E_FAILS && (await writeFile(process.env.E2E_FAILS, JSON.stringify([...new Set(failures)])));
process.exit(failures.some((name) => !known.has(name)) ? 1 : 0);
