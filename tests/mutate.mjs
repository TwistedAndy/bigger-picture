// Mutation testing: put one small bug at a time into a copy of src/, build it, and run the browser checks on it.
// A mutant is killed when a check fails that passes on the original code. A mutant that survives shows a gap in the checks.
// Run: npm run mutate, or node tests/mutate.mjs 3 7 to run only the mutants with these numbers, or --list to list them.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rollup } from 'rollup';
import * as sass from 'sass';

const root = fileURLToPath(new URL('..', import.meta.url)),
	work = root + 'tests/.mutants/',
	copy = work + 'src/';

// [file in src/, the code to find, the code to put in its place, what the bug breaks]
const mutants = [
	['bigger-picture.svelte', "html.style.paddingRight = parseFloat(style.paddingRight) + scrollbar + 'px';", '', 'no padding for the hidden scrollbar'],
	['bigger-picture.svelte', 'focusTrigger?.focus({ preventScroll: true });', '', 'no focus back to the link'],
	['bigger-picture.svelte', 'movement = index - position;', 'movement = position - index;', 'the change motion goes the wrong way'],
	['bigger-picture.svelte', 'const getNextPosition = (index) => ((index % items.length) + items.length) % items.length;', 'const getNextPosition = (index) => Math.max(0, Math.min(index, items.length - 1));', 'no wrap at the ends'],
	['bigger-picture.svelte', '\t\t// The page doesn\'t get the keys the gallery uses, such as the arrows of a slider under it\n\t\te.stopPropagation();', '', 'the page gets the keys of the gallery'],
	['bigger-picture.svelte', 'const arrows = !zoomed && ', 'const arrows = ', 'the arrows change the item of a zoomed image'],
	['bigger-picture.svelte', 'if (shiftKey || !activeElement.controls) {\n\t\t\t\te.preventDefault();', 'if (shiftKey || !activeElement.controls) {', 'Tab leaves the gallery'],
	['bigger-picture.svelte', '(?:^|,)\\s*(\\S+)', '(?:^|,)\\s+(\\S+)', 'a srcset needs a space after a comma'],
	['bigger-picture.svelte', 'value = 3600 * (time[1] | 0)', 'value = 60 * (time[1] | 0)', 'a wrong YouTube start time'],
	['bigger-picture.svelte', 'scaleWidth = scaleHeight = Math.max(scaleHeight, scaleWidth);', 'scaleWidth = scaleHeight = Math.min(scaleHeight, scaleWidth);', 'a wrong crop of a cover thumbnail'],
	['bigger-picture.svelte', "const edge = (side) => parseFloat(style['padding' + side]) + parseFloat(style['border' + side + 'Width']);", 'const edge = () => 0;', 'the padding and border of a thumbnail are not cut off'],
	['bigger-picture.svelte', 'Math.min((containerWidth - 2 * gap) / width, (containerHeight - 2 * gap) / height)', 'Math.min((containerWidth - gap) / width, (containerHeight - gap) / height)', 'a wrong fit size'],
	['bigger-picture.svelte', '* (window.devicePixelRatio || 1)', '', 'the srcset choice ignores the screen density'],
	['bigger-picture.svelte', 'factor = largest.value / match.value;', 'factor = 1;', 'the zoom stops at the loaded candidate'],
	['bigger-picture.svelte', '\t\t\tloadImage(items[getNextPosition(position - 1)]);\n', '', 'no preload of the previous image'],
	['bigger-picture.svelte', "history.pushState({ bp: (historyId = Math.random()) }, '');", '', 'no history entry'],
	['bigger-picture.svelte', "if (key === 'Escape') {\n\t\t\t!opts.persistent && close();", "if (key === 'Escape') {\n\t\t\tclose();", 'Escape closes a persistent gallery'],
	['bigger-picture.svelte', 'if (width !== containerWidth || height !== containerHeight) {', 'if (width !== containerWidth) {', 'a change of the height does not fit the item again'],
	['bigger-picture.svelte', 'if (!inline && html.scrollHeight > html.clientHeight) {', 'if (html.scrollHeight > html.clientHeight) {', 'an inline gallery locks the page'],
	['bigger-picture.svelte', "animate(node, 'bp-nav', `translate(${movement > 0 ? 20 : -20}px)`);", "animate(node, 'bp-nav', `translate(${movement > 0 ? 60 : -60}px)`);", 'a longer change motion'],
	['bigger-picture.svelte', "\t\t\t\tif (item === activeItem) {\n\t\t\t\t\tactiveDimensions = calculateDimensions(item);\n\t\t\t\t}", '', 'the shown item keeps the ratio of its thumbnail'],
	['bigger-picture.svelte', 'if (opts.position == null ? current && current === item.element : i === opts.position) {', 'if (i === opts.position) {', 'the link that was clicked is not the item shown'],
	['bigger-picture.svelte', "\tif (dialog) {\n\t\t\t// Keep the dialog open on Escape, the keydown handler closes it with the outro animation\n\t\t\tnode.oncancel = (e) => e.preventDefault();", '\tif (dialog) {', 'Escape closes a dialog with no motion'],
	['bigger-picture.svelte', "return (!opts.types || opts.types.includes(item.type)) && parseThumbnail(item);", 'return parseThumbnail(item);', 'the types option does nothing'],
	['components/image.svelte', 'const ratio = 1 - newScale / scale;', 'const ratio = 0;', 'the zoom does not keep the point under the mouse'],
	['components/image.svelte', 'Math.min(newScale, maxZoom, naturalWidth / activeDimensions[0])', 'Math.min(newScale, maxZoom)', 'the zoom goes past the natural size'],
	['components/image.svelte', 'Math.max(-max, Math.min(value, max))', 'Math.min(value, max)', 'a zoomed image can be dragged past its bottom edge'],
	['components/image.svelte', 'if (y < -90) {', 'if (y < -900) {', 'a swipe up does not close'],
	['components/image.svelte', 'if (Math.abs(y) < 30) {', 'if (Math.abs(y) < 300) {', 'a slanted swipe changes the item'],
	['components/image.svelte', '(posOne.x - posThree.x) * 5', '(posOne.x - posThree.x) * 0', 'no glide after a flick'],
	['components/image.svelte', 'scale = img.width / activeDimensions[0];', '', 'a press during the zoom makes the image jump'],
	['components/image.svelte', 'zoomed || !opts.inline ? onWheel : null', 'onWheel', 'the wheel over an inline gallery does not scroll the page'],
	['bigger-picture.svelte', 'activeItem.thumb?.load?.();', '', 'an item without a size does not take the ratio of its thumbnail URL'],
	['components/image.svelte', 'sizes = Math.round(Math.max(sizes, activeDimensions[0] * newScale));', '', 'the zoom does not load a larger candidate'],
	['components/image.svelte', 'if (e.target === this && !hasDragged && !opts.persistent) {', 'if (e.target === this && !opts.persistent) {', 'a drag that ends on the space closes the gallery'],
	['components/image.svelte', 'if (opts.inline || !smallScreen) {', 'if (true) {', 'a turn of the phone zooms out'],
	['components/image.svelte', "'-': -1 / 3", "'-': -1 / 2", 'the minus key zooms out too far'],
	['components/image.svelte', 'changeZoom(((prevDiff || curDiff) - curDiff) / -35, pinchDetails);', 'changeZoom(((prevDiff || curDiff) - curDiff) / 35, pinchDetails);', 'a pinch out zooms out'],
	['components/image.svelte', 'if (Math.abs(x - edge) > 20) {', 'if (Math.abs(x - edge) > 2000) {', 'a swipe past the edge of a zoomed image stays'],
	['components/image.svelte', 'if (Math.abs(x - edge) > 20) {', 'if (x !== edge) {', 'a drag of a zoomed image to its left edge goes back'],
	['components/image.svelte', "if (typeof noPinch == 'function' ? noPinch(props.container) : noPinch) {", 'if (0) {', 'noPinch does nothing'],
	['components/image.svelte', 'naturalWidth = activeItem.width || 0;\n\t\t\tloaded = true;', 'loaded = true;', 'the zoom limit is the size of the thumbnail'],
	['components/thumbs.svelte', '!hasDragged && setPosition(item.i)', 'setPosition(item.i)', 'a drag of the strip clicks a thumbnail'],
	['components/thumbs.svelte', 'thumbsTranslate = boundTranslate(thumbsPanelWidth - activeBtn.offsetLeft - width - 3);', '', 'the strip does not scroll to the active thumbnail'],
	['components/thumbs.svelte', 'Math.min(0, Math.max(int, thumbsPanelWidth - thumbsWidth - 1))', 'Math.min(200, Math.max(int, thumbsPanelWidth - thumbsWidth - 200))', 'the strip can be dragged past its ends'],
	['components/media.svelte', 'media.oncanplay = () => (loaded = true);', '', 'the loader of a video stays'],
	['components/media.svelte', 'media.onload = () => {\n\t\t\t\tloaded = true;', 'media.onload = () => {', 'the loader of an iframe stays'],
	['bigger-picture.scss', '\tinset: var(--bp-stage-gap);\n\twill-change: transform;', '\tinset: var(--bp-stage-gap);', 'the slide has no layer of its own'],
	['bigger-picture.scss', '\t// Keeps the layer of the fade in, dropping it once the intro ends repaints the bar and can blink\n\twill-change: opacity;', '', 'the thumbnail bar drops its layer after the fade in'],
	['bigger-picture.scss', '\t\t// A layer of its own for good, adding and dropping one on every scroll repaints the thumbnails\n\t\twill-change: transform;', '', 'the strip drops its layer after each scroll'],
	['bigger-picture.scss', '.bp-clip {\n\toverflow: hidden;', '.bp-clip {', 'the slide of a cover thumbnail is not clipped'],
	['bigger-picture.scss', '--bp-k: -2;', '--bp-k: -1;', 'a wrong crop of a cover thumbnail'],
	['bigger-picture.scss', '.bp-nav {\n\tanimation-duration: calc(var(--bp-duration) / 2);\n}', '', 'the change motion is as long as the open motion'],
	['bigger-picture.scss', '\ttransition: transform var(--bp-duration) var(--bp-easing);\n\n\t&-wrap', '\n\t&-wrap', 'the zoom has no motion'],
	['bigger-picture.scss', '@media (prefers-reduced-motion) {', '@media (max-width: 1px) {', 'reduced motion still moves'],
	['bigger-picture.scss', '\t\tbottom: calc(var(--bp-offset-bottom) + var(--bp-thumb-height));', '', 'the arrows are not centered above the thumbnails'],
	['bigger-picture.scss', '\tpadding: var(--bp-offset-top) 0 var(--bp-offset-bottom);\n\tmargin: 0;', '\tmargin: 0;', 'the offsets of the page do nothing'],
	['bigger-picture.scss', '\t\t\t\tbutton,\n\t\t\t\ta {\n\t\t\t\t\tpointer-events: none;', '\t\t\t\tbutton,\n\t\t\t\ta {', 'the hidden controls of a zoomed image take clicks'],
	['bigger-picture.scss', '.bp-img {\n\tposition: absolute;\n\ttop: 50%;\n\tleft: 50%;', '.bp-img {\n\tposition: absolute;\n\ttop: 50%;\n\tleft: 49%;', 'the image is not centered'],
	['components/image.svelte', '\t$: activeDimensions, fitZoom();\n\n\t// True if the image is zoomed past its starting size, the gallery gets it too\n\t$: zoomed = activeDimensions[0] * (scale - 1) > 10;', '\t$: zoomed = activeDimensions[0] * (scale - 1) > 10;\n\n\t$: activeDimensions, fitZoom();', 'a resize ends the zoom, but the gallery stays zoomed'],
	['bigger-picture.svelte', 'zoomed || readGap();', 'readGap();', 'a resize while zoomed fits the item with no gap'],
	['bigger-picture.svelte', '\t\treadGap();\n\t\tactiveDimensions = calculateDimensions(activeItem);\n', '', 'an inline gallery fits the item in the gap of the page'],
	['components/image.svelte', 'queueMicrotask(() => props.loadImage(activeItem).then(() => {', '((run) => run())(() => props.loadImage(activeItem).then(() => {', 'the first image picks its srcset candidate before the gap is known'],
	['bigger-picture.svelte', '.then(callback, callback);', '.finally(callback);', 'a cancelled animation leaves an unhandled AbortError'],
	['components/image.svelte', "wrap.addEventListener('click', dropClick, { capture: true, once: true });", '', 'the tap that zooms out presses the control under the finger'],
	['bigger-picture.svelte', '({ width: containerWidth, height: containerHeight } = ruler.getBoundingClientRect());', '', 'the first image picks its srcset candidate for the size of the page'],
	['bigger-picture.scss', '\t// Keeps the layer of the fade in, dropping it once the intro ends repaints the whole screen and can blink\n\twill-change: opacity;\n', '', 'the overlay drops its layer after the fade in'],
	['bigger-picture.svelte', "VIDEO|AUDIO", 'VIDEO', 'the arrow keys of a focused audio item change the item'],
	['bigger-picture.svelte', 'if (history.state?.bp !== historyId && location.href === historyUrl) {', 'if (1) {', 'a link to an anchor in an HTML item closes the gallery'],
	['bigger-picture.svelte', 'history.state?.bp !== historyId && location.href', 'location.href', 'the back button from an anchor closes the gallery at once'],
	['bigger-picture.scss', 'overflow-y: auto;', '', 'a long caption does not scroll'],
	['bigger-picture.svelte', 'the outro\n\t\tif (!items || closing) {', 'the outro\n\t\tif (closing) {', 'next with no gallery open throws'],
	['bigger-picture.svelte', 'the outro\n\t\tif (!items || closing) {', 'the outro\n\t\tif (!items) {', 'next during the close changes the item'],
	['bigger-picture.svelte', '\t\t\tclose();\n\t\t\treturn;', '\t\t\treturn;', 'an open call while open waits for a close that does not come'],
	['bigger-picture.svelte', 'if (!getUpperGallery()) {', 'if (1) {', 'the first gallery to close unlocks the page'],
	['utils.js', "getUpperGallery() === container", '1', 'a key with no focused node moves every gallery'],
	['bigger-picture.scss', '\tdirection: ltr;', '', 'the strip breaks on a right-to-left page'],
	['bigger-picture.scss', 'the actions are on the right\n\tleft: 0;', 'the actions are on the right', 'the counter covers the actions on a right-to-left page'],
	['bigger-picture.svelte', "youtube' + (match[2] || '') + '.com", "youtube.com", 'youtube-nocookie links embed on youtube.com'],
	['bigger-picture.svelte', '(?:[^?#]*?\\/)?(\\d+)', '(\\d+)', 'a Vimeo link in a channel is not detected'],
	['bigger-picture.svelte', 'item.width = 1080;', 'item.width = 1920;', 'YouTube Shorts are landscape'],
	['bigger-picture.svelte', 'jpe?g|jfif|', 'jpe?g|', 'a .jfif link is not detected'],
	['bigger-picture.svelte', 'item.width = parseFloat(item.width) || undefined;', '', 'a width with a unit is not a number'],
	['bigger-picture.scss', '\t\tmax-height: 100%;\n\t\toverflow: auto;', '\t\tmax-height: 100%;', 'HTML larger than the stage does not scroll'],
	['bigger-picture.scss', '\t\toverflow-wrap: break-word;', '', 'a long word in an HTML item does not break'],
	['bigger-picture.scss', '\t\tmax-width: 100%;\n\t\tmax-height: 100%;', '', 'HTML larger than the stage overflows it'],
	['bigger-picture.svelte', "key === ' ' && target === container", "key === ' '", 'Space on a focused control also acts on the item'],
	['bigger-picture.svelte', 'activeItem.zoom = !activeItem.zoom;', '', 'Space does not zoom an image'],
	['bigger-picture.svelte', 'media.paused ? media.play() : media.pause();', '', 'Space does not play or pause a video or audio'],
	['bigger-picture.svelte', 'get container() {\n\t\t\treturn container;\n\t\t},', 'container: container || document.body,', 'the first item gets the page body as the gallery element'],
	['components/media.svelte', 'media.onloadedmetadata', 'media.onmetadata', 'a video with no size stays 16:9'],
];

const args = process.argv.slice(2),
	list = args.includes('--list'),
	picked = args.filter((arg) => /^\d+$/.test(arg)).map(Number),
	source = (file) => readFileSync(root + 'src/' + file, 'utf8').replace(/\r\n/g, '\n');

// Each mutant must find its code exactly once
const broken = mutants.map(([file, find], index) => [index + 1, source(file).split(find).length - 1]).filter(([, count]) => count !== 1);
if (broken.length) {
	console.log('These mutants do not find their code exactly once: ' + broken.map(([number, count]) => number + ' (' + count + ')').join(', '));
	process.exit(1);
}
if (list) {
	mutants.forEach(([file, , , name], index) => console.log(index + 1 + '. ' + file + ': ' + name));
	process.exit(0);
}

// The plugins of the minified build, the one the checks test
const config = (await import('../rollup.config.js')).default.at(-1),
	plugins = config.plugins.filter((plugin) => !/size/.test(plugin.name));

/**
 * Build the library from the copy of src/ to the work folder.
 */
async function build() {
	const bundle = await rollup({ input: copy + 'bigger-picture.js', plugins, onwarn: () => {} });
	await bundle.write({ format: 'iife', name: 'BiggerPicture', file: work + 'lib.js', strict: false });
	await bundle.close();
	writeFileSync(work + 'lib.css', sass.compile(copy + 'bigger-picture.scss', { style: 'compressed', silenceDeprecations: ['import', 'global-builtin'] }).css);
}

/**
 * Run the browser checks on the build in the work folder, and give the exit code and the output.
 *
 * @param {object} env
 */
function run(env) {
	const result = spawnSync(process.execPath, [root + 'tests/e2e.mjs'], { env: { ...process.env, BP_SCRIPT: work + 'lib.js', BP_STYLE: work + 'lib.css', ...env }, encoding: 'utf8', timeout: 300000 });
	return { code: result.status, output: result.stdout + result.stderr };
}

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

// The original code: its failed checks are known, a mutant must fail another one
cpSync(root + 'src', copy, { recursive: true });
await build();
run({ E2E_FAILS: work + 'known.json' });
const known = JSON.parse(readFileSync(work + 'known.json', 'utf8'));
console.log('The original code fails ' + known.length + ' checks' + (known.length ? ': ' + known.join('; ') : ''));

const start = performance.now(),
	survived = [];
for (const [index, [file, find, replace, name]] of mutants.entries()) {
	if (picked.length && !picked.includes(index + 1)) {
		continue;
	}
	rmSync(copy, { recursive: true, force: true });
	cpSync(root + 'src', copy, { recursive: true });
	writeFileSync(copy + file, source(file).replace(find, () => replace));
	let line;
	try {
		await build();
		const result = run({ E2E_KNOWN: work + 'known.json' });
		line = result.code ? 'KILLED   by ' + (result.output.match(/^FAIL (.*)$/m)?.[1].slice(0, 160) || 'exit code ' + result.code) : 'SURVIVED';
	} catch (error) {
		line = 'KILLED   by the build: ' + error.message.split('\n')[0];
	}
	line.startsWith('SURVIVED') && survived.push(index + 1);
	console.log(String(index + 1).padStart(2) + '. ' + file + ': ' + name + '\n    ' + line);
}

rmSync(copy, { recursive: true, force: true });
console.log('\n' + survived.length + ' survived' + (survived.length ? ': ' + survived.join(', ') : '') + ', in ' + ((performance.now() - start) / 60000).toFixed(1) + ' min');
process.exit(survived.length ? 1 : 0);
