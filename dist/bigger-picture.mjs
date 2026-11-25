/** @returns {void} */
function noop() {}

function run(fn) {
	return fn();
}

/**
 * @param {Function[]} fns
 * @returns {void}
 */
function run_all(fns) {
	fns.forEach(run);
}

/**
 * @param {any} thing
 * @returns {thing is Function}
 */
function is_function(thing) {
	return typeof thing === 'function';
}

/**
 * @param {string} element_src
 * @param {string} url
 * @returns {boolean}
 */
function src_url_equal(element_src, url) {
	return element_src === url;
}

/** @returns {boolean} */
function not_equal(a, b) {
	return a != a ? b == b : a !== b;
}

/** @returns {boolean} */
function is_empty(obj) {
	return Object.keys(obj).length === 0;
}

function action_destroyer(action_result) {
	return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
}

/**
 * @param {Node} target
 * @param {Node} node
 * @returns {void}
 */
function append(target, node) {
	target.appendChild(node);
}

/**
 * @param {Node} target
 * @param {Node} node
 * @param {Node} [anchor]
 * @returns {void}
 */
function insert(target, node, anchor) {
	target.insertBefore(node, anchor || null);
}

/**
 * @param {Node} node
 * @returns {void}
 */
function detach(node) {
	if (node.parentNode) {
		node.parentNode.removeChild(node);
	}
}

/**
 * @returns {void} */
function destroy_each(iterations, detaching) {
	for (let i = 0; i < iterations.length; i += 1) {
		if (iterations[i]) iterations[i].d(detaching);
	}
}

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} name
 * @returns {HTMLElementTagNameMap[K]}
 */
function element(name) {
	return document.createElement(name);
}

/**
 * @param {string} data
 * @returns {Text}
 */
function text(data) {
	return document.createTextNode(data);
}

/**
 * @returns {Text} */
function empty() {
	return text('');
}

/**
 * @param {EventTarget} node
 * @param {string} event
 * @param {EventListenerOrEventListenerObject} handler
 * @param {boolean | AddEventListenerOptions | EventListenerOptions} [options]
 * @returns {() => void}
 */
function listen(node, event, handler, options) {
	node.addEventListener(event, handler, options);
	return () => node.removeEventListener(event, handler, options);
}

/**
 * @param {Element} node
 * @param {string} attribute
 * @param {string} [value]
 * @returns {void}
 */
function attr(node, attribute, value) {
	if (value == null) node.removeAttribute(attribute);
	else if (node.getAttribute(attribute) !== value) node.setAttribute(attribute, value);
}

/**
 * @param {Text} text
 * @param {unknown} data
 * @returns {void}
 */
function set_data(text, data) {
	data = '' + data;
	if (text.data === data) return;
	text.data = /** @type {string} */ (data);
}

/**
 * @returns {void} */
function set_style(node, key, value, important) {
	if (value == null) {
		node.style.removeProperty(key);
	} else {
		node.style.setProperty(key, value);
	}
}

/**
 * @returns {void} */
function toggle_class(element, name, toggle) {
	// The `!!` is required because an `undefined` flag means flipping the current state.
	element.classList.toggle(name, !!toggle);
}

/**
 * @typedef {Node & {
 * 	claim_order?: number;
 * 	hydrate_init?: true;
 * 	actual_end_child?: NodeEx;
 * 	childNodes: NodeListOf<NodeEx>;
 * }} NodeEx
 */

/** @typedef {ChildNode & NodeEx} ChildNodeEx */

/** @typedef {NodeEx & { claim_order: number }} NodeEx2 */

/**
 * @typedef {ChildNodeEx[] & {
 * 	claim_info?: {
 * 		last_index: number;
 * 		total_claimed: number;
 * 	};
 * }} ChildNodeArray
 */

const dirty_components = [];

let render_callbacks = [];

const flush_callbacks = [];

const resolved_promise = /* @__PURE__ */ Promise.resolve();

let update_scheduled = false;

/** @returns {void} */
function schedule_update() {
	if (!update_scheduled) {
		update_scheduled = true;
		resolved_promise.then(flush);
	}
}

// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();

let flushidx = 0; // Do *not* move this inside the flush() function

/** @returns {void} */
function flush() {
	// Do not reenter flush while dirty components are updated, as this can
	// result in an infinite loop. Instead, let the inner flush handle it.
	// Reentrancy is ok afterwards for bindings etc.
	if (flushidx !== 0) {
		return;
	}

	do {
		// first, call beforeUpdate functions
		// and update components
		try {
			while (flushidx < dirty_components.length) {
				const component = dirty_components[flushidx];
				flushidx++;

				update(component.$$);
			}
		} catch (e) {
			// reset dirty state to not end up in a deadlocked state and then rethrow
			dirty_components.length = 0;
			flushidx = 0;
			throw e;
		}

		dirty_components.length = 0;
		flushidx = 0;

		// then, once components are updated, call
		// afterUpdate functions. This may cause
		// subsequent updates...
		for (let i = 0; i < render_callbacks.length; i += 1) {
			const callback = render_callbacks[i];
			if (!seen_callbacks.has(callback)) {
				// ...so guard against infinite loops
				seen_callbacks.add(callback);
				callback();
			}
		}
		render_callbacks.length = 0;
	} while (dirty_components.length);
	while (flush_callbacks.length) {
		flush_callbacks.pop()();
	}
	update_scheduled = false;
	seen_callbacks.clear();

}

/** @returns {void} */
function update($$) {
	if ($$.fragment !== null) {
		$$.update();

		const dirty = $$.dirty;
		$$.dirty = [-1];
		$$.fragment && $$.fragment.p($$.ctx, dirty);

	}
}

const outroing = new Set();

/**
 * @type {Outro}
 */
let outros;

/**
 * @returns {void} */
function group_outros() {
	outros = {
		r: 0,
		c: [],
		p: outros // parent group
	};
}

/**
 * @returns {void} */
function check_outros() {
	if (!outros.r) {
		run_all(outros.c);
	}
	outros = outros.p;
}

/**
 * @param {import('./private.js').Fragment} block
 * @param {0 | 1} [local]
 * @returns {void}
 */
function transition_in(block, local) {
	if (block && block.i) {
		outroing.delete(block);
		block.i(local);
	}
}

/**
 * @param {import('./private.js').Fragment} block
 * @param {0 | 1} local
 * @param {0 | 1} [detach]
 * @param {() => void} [callback]
 * @returns {void}
 */
function transition_out(block, local, detach, callback) {
	if (block && block.o) {
		if (outroing.has(block)) return;
		outroing.add(block);
		outros.c.push(() => {
			outroing.delete(block);
			if (callback) {
				if (detach) block.d(1);
				callback();
			}
		});
		block.o(local);
	} else if (callback) {
		callback();
	}
}

/** @typedef {1} INTRO */
/** @typedef {0} OUTRO */
/** @typedef {{ direction: 'in' | 'out' | 'both' }} TransitionOptions */
/** @typedef {(node: Element, params: any, options: TransitionOptions) => import('../transition/public.js').TransitionConfig} TransitionFn */

/**
 * @typedef {Object} Outro
 * @property {number} r
 * @property {Function[]} c
 * @property {Object} p
 */

/**
 * @typedef {Object} PendingProgram
 * @property {number} start
 * @property {INTRO|OUTRO} b
 * @property {Outro} [group]
 */

/**
 * @typedef {Object} Program
 * @property {number} a
 * @property {INTRO|OUTRO} b
 * @property {1|-1} d
 * @property {number} duration
 * @property {number} start
 * @property {number} end
 * @property {Outro} [group]
 */

// general each functions:

function ensure_array_like(array_like_or_iterator) {
	return array_like_or_iterator?.length !== undefined
		? array_like_or_iterator
		: Array.from(array_like_or_iterator);
}

/** @returns {void} */
function create_component(block) {
	block && block.c();
}

/** @returns {void} */
function mount_component(component, target, anchor) {
	const { fragment } = component.$$;
	fragment && fragment.m(target, anchor);


}

/** @returns {void} */
function destroy_component(component, detaching) {
	const $$ = component.$$;
	if ($$.fragment !== null) {

		$$.fragment && $$.fragment.d(detaching);
		// TODO null out other refs, including component.$$ (but need to
		// preserve final state?)
		$$.fragment = null;
		$$.ctx = [];
	}
}

/** @returns {void} */
function make_dirty(component, i) {
	if (component.$$.dirty[0] === -1) {
		dirty_components.push(component);
		schedule_update();
		component.$$.dirty.fill(0);
	}
	component.$$.dirty[(i / 31) | 0] |= 1 << i % 31;
}

// TODO: Document the other params
/**
 * @param {SvelteComponent} component
 * @param {import('./public.js').ComponentConstructorOptions} options
 *
 * @param {import('./utils.js')['not_equal']} not_equal Used to compare props and state values.
 * @param {(target: Element | ShadowRoot) => void} [append_styles] Function that appends styles to the DOM when the component is first initialised.
 * This will be the `add_css` function from the compiled component.
 *
 * @returns {void}
 */
function init(
	component,
	options,
	instance,
	create_fragment,
	not_equal,
	props,
	append_styles = null,
	dirty = [-1]
) {


	/** @type {import('./private.js').T$$} */
	const $$ = (component.$$ = {
		fragment: null,
		ctx: [],
		// state
		props,
		update: noop,
		not_equal,

		// lifecycle






		// everything else

		dirty,


	});

	let ready = false;
	$$.ctx = instance
		? instance(component, options.props || {}, (i, ret, ...rest) => {
				const value = rest.length ? rest[0] : ret;
				if ($$.ctx && not_equal($$.ctx[i], ($$.ctx[i] = value))) {

					if (ready) make_dirty(component, i);
				}
				return ret;
		  })
		: [];
	$$.update();
	ready = true;

	// `false` as a special case of no DOM component
	$$.fragment = create_fragment ? create_fragment($$.ctx) : false;
	if (options.target) {
		{
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			$$.fragment && $$.fragment.c();
		}
		mount_component(component, options.target, options.anchor);
		flush();
	}

}

/**
 * Base class for Svelte components. Used when dev=false.
 *
 * @template {Record<string, any>} [Props=any]
 * @template {Record<string, any>} [Events=any]
 */
class SvelteComponent {
	/**
	 * ### PRIVATE API
	 *
	 * Do not use, may change at any time
	 *
	 * @type {any}
	 */
	$$ = undefined;
	/**
	 * ### PRIVATE API
	 *
	 * Do not use, may change at any time
	 *
	 * @type {any}
	 */
	$$set = undefined;

	/** @returns {void} */
	$destroy() {
		destroy_component(this, 1);
		this.$destroy = noop;
	}

	/**
	 * @template {Extract<keyof Events, string>} K
	 * @param {K} type
	 * @param {((e: Events[K]) => void) | null | undefined} callback
	 * @returns {() => void}
	 */


	/**
	 * @param {Partial<Props>} props
	 * @returns {void}
	 */
	$set(props) {
		if (this.$$set && !is_empty(props)) {

			this.$$set(props);

		}
	}
}

/**
 * @typedef {Object} CustomElementPropDefinition
 * @property {string} [attribute]
 * @property {boolean} [reflect]
 * @property {'String'|'Boolean'|'Number'|'Array'|'Object'} [type]
 */

/* src\components\thumbs.svelte generated by Svelte v4.2.20 */

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[23] = list[i];
	return child_ctx;
}

// (136:31) {#each items as item}
function create_each_block(ctx) {
	let button;
	let img;
	let img_src_value;
	let button_title_value;
	let button_aria_label_value;
	let button_data_type_value;
	let mounted;
	let dispose;

	function click_handler() {
		return /*click_handler*/ ctx[15](/*item*/ ctx[23]);
	}

	return {
		c() {
			button = element("button");
			img = element("img");
			if (!src_url_equal(img.src, img_src_value = /*item*/ ctx[23].thumb?.src)) attr(img, "src", img_src_value);
			attr(img, "alt", "");
			attr(img, "loading", "lazy");
			attr(button, "type", "button");
			attr(button, "title", button_title_value = /*captions*/ ctx[7][/*item*/ ctx[23].i] || null);
			attr(button, "aria-label", button_aria_label_value = /*item*/ ctx[23].alt || /*captions*/ ctx[7][/*item*/ ctx[23].i] || `${/*label*/ ctx[3]} ${/*item*/ ctx[23].i + 1}`);
			attr(button, "data-type", button_data_type_value = /*item*/ ctx[23].thumb ? null : /*item*/ ctx[23].type);
			toggle_class(button, "active", /*item*/ ctx[23].i === /*position*/ ctx[1]);
		},
		m(target, anchor) {
			insert(target, button, anchor);
			append(button, img);

			if (!mounted) {
				dispose = [
					listen(button, "focus", /*focus_handler*/ ctx[14]),
					listen(button, "click", click_handler)
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (dirty & /*items*/ 1 && !src_url_equal(img.src, img_src_value = /*item*/ ctx[23].thumb?.src)) {
				attr(img, "src", img_src_value);
			}

			if (dirty & /*captions, items*/ 129 && button_title_value !== (button_title_value = /*captions*/ ctx[7][/*item*/ ctx[23].i] || null)) {
				attr(button, "title", button_title_value);
			}

			if (dirty & /*items, captions, label*/ 137 && button_aria_label_value !== (button_aria_label_value = /*item*/ ctx[23].alt || /*captions*/ ctx[7][/*item*/ ctx[23].i] || `${/*label*/ ctx[3]} ${/*item*/ ctx[23].i + 1}`)) {
				attr(button, "aria-label", button_aria_label_value);
			}

			if (dirty & /*items*/ 1 && button_data_type_value !== (button_data_type_value = /*item*/ ctx[23].thumb ? null : /*item*/ ctx[23].type)) {
				attr(button, "data-type", button_data_type_value);
			}

			if (dirty & /*items, position*/ 3) {
				toggle_class(button, "active", /*item*/ ctx[23].i === /*position*/ ctx[1]);
			}
		},
		d(detaching) {
			if (detaching) {
				detach(button);
			}

			mounted = false;
			run_all(dispose);
		}
	};
}

function create_fragment$4(ctx) {
	let div2;
	let div1;
	let div0;
	let style_transform = `translateX(${/*thumbsTranslate*/ ctx[4]}px)`;
	let mounted;
	let dispose;
	let each_value = ensure_array_like(/*items*/ ctx[0]);
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	return {
		c() {
			div2 = element("div");
			div1 = element("div");
			div0 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			attr(div0, "class", "bp-thumbs-inner");
			attr(div1, "class", "bp-thumbs-outer");
			attr(div1, "role", "none");
			toggle_class(div1, "bp-drag", /*isPointerDown*/ ctx[5]);
			set_style(div1, "transform", style_transform);
			attr(div2, "role", "none");
			attr(div2, "class", "bp-thumbs");
		},
		m(target, anchor) {
			insert(target, div2, anchor);
			append(div2, div1);
			append(div1, div0);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div0, null);
				}
			}

			if (!mounted) {
				dispose = [
					listen(div1, "pointerdown", /*pointerDown*/ ctx[9]),
					action_destroyer(/*thumbsActions*/ ctx[12].call(null, div2)),
					listen(div2, "pointermove", /*pointerMove*/ ctx[10]),
					listen(div2, "pointerup", /*pointerUp*/ ctx[11]),
					listen(div2, "pointercancel", /*pointerUp*/ ctx[11])
				];

				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (dirty & /*captions, items, label, position, scrollToButton, hasDragged, setPosition*/ 463) {
				each_value = ensure_array_like(/*items*/ ctx[0]);
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div0, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}

			if (dirty & /*isPointerDown*/ 32) {
				toggle_class(div1, "bp-drag", /*isPointerDown*/ ctx[5]);
			}

			if (dirty & /*thumbsTranslate*/ 16 && style_transform !== (style_transform = `translateX(${/*thumbsTranslate*/ ctx[4]}px)`)) {
				set_style(div1, "transform", style_transform);
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) {
				detach(div2);
			}

			destroy_each(each_blocks, detaching);
			mounted = false;
			run_all(dispose);
		}
	};
}

function instance$4($$self, $$props, $$invalidate) {
	let captions;
	let { items } = $$props;
	let { position } = $$props;
	let { setPosition } = $$props;
	let { label } = $$props;
	let thumbsWidth;
	let thumbsPanel;
	let thumbsPanelWidth;
	let initialTranslate = 0;

	// Translate of the strip, a CSS transition animates it
	let thumbsTranslate = 0;

	let isPointerDown, pointerDownX, hasDragged;
	let dragPositions = [];

	const scrollToButton = button => {
		const activeBtn = button || thumbsPanel?.querySelector('.active');

		if (!activeBtn) {
			return;
		}

		// The button shows in full, 3px from the edge. The panel is not at the left of the screen in an inline gallery
		const offset = thumbsPanel.getBoundingClientRect().left;

		let { left, right, width } = activeBtn.getBoundingClientRect();

		if (right - offset > thumbsPanelWidth) {
			$$invalidate(4, thumbsTranslate = boundTranslate(thumbsPanelWidth - activeBtn.offsetLeft - width - 3));
		} else if (left < offset) {
			$$invalidate(4, thumbsTranslate = boundTranslate(3 - activeBtn.offsetLeft));
		}

		initialTranslate = thumbsTranslate;
	};

	// The text of each caption, which can be HTML, for the title and the label. Once for the items, not on each change of the
	// position. The content of a template runs no scripts and loads no images
	const template = document.createElement('template');

	const boundTranslate = int => Math.min(0, Math.max(int, thumbsPanelWidth - thumbsWidth - 1));

	const pointerDown = function (e) {
		if (thumbsWidth >= thumbsPanelWidth) {
			$$invalidate(5, isPointerDown = true);
			pointerDownX = e.clientX;

			// Stop the transition where it is, the drag moves the strip without one
			$$invalidate(4, thumbsTranslate = initialTranslate = new DOMMatrix(getComputedStyle(this).transform).m41);
		}
	};

	const pointerMove = e => {
		if (!isPointerDown) {
			return;
		}

		// A release outside the strip sends no pointerup to it, so a move without a pressed button ends the drag, with no
		// inertia
		if (!e.buttons) {
			dragPositions = [];
			return pointerUp();
		}

		const dragAmount = e.clientX - pointerDownX;

		if (hasDragged) {
			$$invalidate(4, thumbsTranslate = boundTranslate(initialTranslate + dragAmount));
			dragPositions.push(e.clientX);
		} else {
			$$invalidate(6, hasDragged = Math.abs(dragAmount) > 5);
		}
	};

	const pointerUp = () => {
		// The speed of the last moves, NaN with no moves, such as after a tap
		const xDiff = dragPositions.slice(-3)[0] - dragPositions.pop();

		if (Math.abs(xDiff) > 5) {
			$$invalidate(4, thumbsTranslate = boundTranslate(thumbsTranslate - xDiff * 5));
		}

		dragPositions = [];
		$$invalidate(5, isPointerDown = false);

		// The click of a drag that ends on the thumbnail it started on comes after the pointerup, so it still sees the drag
		setTimeout(() => $$invalidate(6, hasDragged = false));

		initialTranslate = thumbsTranslate;
	};

	// Measure the panel and the strip in it, also on resize
	const thumbsActions = node => {
		thumbsPanel = node;

		const strip = node.querySelector('.bp-thumbs-inner'),
			resizeObserver = new ResizeObserver(entries => {
					for (const { target, contentRect } of entries) {
						if (target === strip) {
							thumbsWidth = contentRect.width;
						} else {
							thumbsPanelWidth = contentRect.width;
						}
					}

					// A wider panel can show more of the strip, or all of it
					$$invalidate(4, thumbsTranslate = initialTranslate = boundTranslate(thumbsTranslate));
				});

		resizeObserver.observe(node);
		resizeObserver.observe(strip);

		return {
			destroy() {
				resizeObserver.disconnect();
			}
		};
	};

	const focus_handler = e => scrollToButton(e.target);
	const click_handler = item => !hasDragged && setPosition(item.i);

	$$self.$$set = $$props => {
		if ('items' in $$props) $$invalidate(0, items = $$props.items);
		if ('position' in $$props) $$invalidate(1, position = $$props.position);
		if ('setPosition' in $$props) $$invalidate(2, setPosition = $$props.setPosition);
		if ('label' in $$props) $$invalidate(3, label = $$props.label);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*items, template*/ 8193) {
			$$invalidate(7, captions = items.map(({ caption }) => {
				$$invalidate(13, template.innerHTML = caption || '', template);
				return template.content.textContent;
			}));
		}

		if ($$self.$$.dirty & /*position*/ 2) {
			// Scroll to the active thumbnail when the position changes
			(setTimeout(scrollToButton));
		}
	};

	return [
		items,
		position,
		setPosition,
		label,
		thumbsTranslate,
		isPointerDown,
		hasDragged,
		captions,
		scrollToButton,
		pointerDown,
		pointerMove,
		pointerUp,
		thumbsActions,
		template,
		focus_handler,
		click_handler
	];
}

class Thumbs extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance$4, create_fragment$4, not_equal, {
			items: 0,
			position: 1,
			setPosition: 2,
			label: 3
		});
	}
}

// Playback positions by a key: the first source of a video, or the link of a YouTube or Vimeo player. A video or a player
// opened again resumes from there
const positions = {};

// Quoted, a URL with parentheses, such as "photo (1).jpg", is invalid in a bare url(). Escaped, a quote in a data URL, such
// as of an SVG, doesn't end the string
const getThumbBackground = (activeItem) => activeItem.thumb ? `url("${CSS.escape(activeItem.thumb.src)}")` : null;

// The upper modal gallery, the last one on the page
const getUpperGallery = () => [...document.querySelectorAll('.bp-wrap:not(.bp-inline)')].pop();

// A key for the gallery: not a browser shortcut, such as Alt+Left for back or Ctrl+= for the page zoom, and not from an
// element outside the gallery, such as from a gallery opened over it. The body has the focus when the focused node is
// removed, and a script can send a key to the document or the window. These keys go to the upper gallery, the last one
const isGalleryKey = ({ target, altKey, ctrlKey, metaKey }, { focusWrap }, container) => !altKey && !ctrlKey && !metaKey
	&& (target.nodeType != 1 || target === document.body ? getUpperGallery() === container : (focusWrap || container).contains(target));

// Adds the attributes of the item to the media element, the item has an attr object always. False removes an attribute,
// such as a default one: a boolean attribute is on with any value, also "false". Not === false, the booleans_as_integers
// option of terser compiles it to == 0, which is also true for "0" and ""
const addAttributes = (node, attributes) => {
	for (const key in attributes) {
		const value = attributes[key];
		!value && typeof value == 'boolean' ? node.removeAttribute(key) : node.setAttribute(key, value);
	}
};

/* src\components\loading.svelte generated by Svelte v4.2.20 */

function create_if_block_1$2(ctx) {
	let div;
	let mounted;
	let dispose;

	return {
		c() {
			div = element("div");
			div.innerHTML = `<span class="bp-bar"></span><span class="bp-o"></span>`;
			attr(div, "class", "bp-load");
			toggle_class(div, "bp-loaded", /*loaded*/ ctx[1]);
			set_style(div, "background-image", getThumbBackground(/*activeItem*/ ctx[0]));
		},
		m(target, anchor) {
			insert(target, div, anchor);

			if (!mounted) {
				dispose = listen(div, "animationend", /*animationend_handler*/ ctx[4]);
				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty & /*loaded*/ 2) {
				toggle_class(div, "bp-loaded", /*loaded*/ ctx[1]);
			}

			if (dirty & /*activeItem*/ 1) {
				set_style(div, "background-image", getThumbBackground(/*activeItem*/ ctx[0]));
			}
		},
		d(detaching) {
			if (detaching) {
				detach(div);
			}

			mounted = false;
			dispose();
		}
	};
}

// (17:67) {#if closing}
function create_if_block$2(ctx) {
	let div;

	return {
		c() {
			div = element("div");
			attr(div, "class", "bp-load");
			set_style(div, "background-image", getThumbBackground(/*activeItem*/ ctx[0]));
		},
		m(target, anchor) {
			insert(target, div, anchor);
		},
		p(ctx, dirty) {
			if (dirty & /*activeItem*/ 1) {
				set_style(div, "background-image", getThumbBackground(/*activeItem*/ ctx[0]));
			}
		},
		d(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

function create_fragment$3(ctx) {
	let if_block0_anchor;
	let if_block1_anchor;
	let if_block0 = !/*hidden*/ ctx[3] && create_if_block_1$2(ctx);
	let if_block1 = /*closing*/ ctx[2] && create_if_block$2(ctx);

	return {
		c() {
			if (if_block0) if_block0.c();
			if_block0_anchor = empty();
			if (if_block1) if_block1.c();
			if_block1_anchor = empty();
		},
		m(target, anchor) {
			if (if_block0) if_block0.m(target, anchor);
			insert(target, if_block0_anchor, anchor);
			if (if_block1) if_block1.m(target, anchor);
			insert(target, if_block1_anchor, anchor);
		},
		p(ctx, [dirty]) {
			if (!/*hidden*/ ctx[3]) {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_1$2(ctx);
					if_block0.c();
					if_block0.m(if_block0_anchor.parentNode, if_block0_anchor);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (/*closing*/ ctx[2]) {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block$2(ctx);
					if_block1.c();
					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) {
				detach(if_block0_anchor);
				detach(if_block1_anchor);
			}

			if (if_block0) if_block0.d(detaching);
			if (if_block1) if_block1.d(detaching);
		}
	};
}

function instance$3($$self, $$props, $$invalidate) {
	let { activeItem } = $$props;
	let { loaded } = $$props;
	let { closing } = $$props;

	// True once the loader has faded out
	let hidden;

	const animationend_handler = e => $$invalidate(3, hidden = e.animationName === 'bp-fade-out');

	$$self.$$set = $$props => {
		if ('activeItem' in $$props) $$invalidate(0, activeItem = $$props.activeItem);
		if ('loaded' in $$props) $$invalidate(1, loaded = $$props.loaded);
		if ('closing' in $$props) $$invalidate(2, closing = $$props.closing);
	};

	return [activeItem, loaded, closing, hidden, animationend_handler];
}

class Loading extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$3, create_fragment$3, not_equal, { activeItem: 0, loaded: 1, closing: 2 });
	}
}

/* src\components\image.svelte generated by Svelte v4.2.20 */

function create_if_block_1$1(ctx) {
	let img;
	let img_sizes_value;
	let mounted;
	let dispose;

	return {
		c() {
			img = element("img");
			attr(img, "sizes", img_sizes_value = /*activeItem*/ ctx[13].sizes || /*opts*/ ctx[14].sizes || `${Math.max(/*sizes*/ ctx[4], /*activeDimensions*/ ctx[1][0])}px`);
			attr(img, "alt", /*activeItem*/ ctx[13].alt || '');
		},
		m(target, anchor) {
			insert(target, img, anchor);

			if (!mounted) {
				dispose = [
					action_destroyer(addAttributes.call(null, img, /*activeItem*/ ctx[13].attr)),
					listen(img, "load", /*load_handler*/ ctx[29]),
					listen(img, "error", /*error_handler*/ ctx[30])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*sizes, activeDimensions*/ 18 && img_sizes_value !== (img_sizes_value = /*activeItem*/ ctx[13].sizes || /*opts*/ ctx[14].sizes || `${Math.max(/*sizes*/ ctx[4], /*activeDimensions*/ ctx[1][0])}px`)) {
				attr(img, "sizes", img_sizes_value);
			}
		},
		d(detaching) {
			if (detaching) {
				detach(img);
			}

			mounted = false;
			run_all(dispose);
		}
	};
}

// (388:10) {#if showLoader}
function create_if_block$1(ctx) {
	let loading;
	let current;

	loading = new Loading({
			props: {
				activeItem: /*activeItem*/ ctx[13],
				loaded: /*loaded*/ ctx[5],
				closing: /*closing*/ ctx[2]
			}
		});

	return {
		c() {
			create_component(loading.$$.fragment);
		},
		m(target, anchor) {
			mount_component(loading, target, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const loading_changes = {};
			if (dirty[0] & /*loaded*/ 32) loading_changes.loaded = /*loaded*/ ctx[5];
			if (dirty[0] & /*closing*/ 4) loading_changes.closing = /*closing*/ ctx[2];
			loading.$set(loading_changes);
		},
		i(local) {
			if (current) return;
			transition_in(loading.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(loading.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(loading, detaching);
		}
	};
}

function create_fragment$2(ctx) {
	let div1;
	let div0;
	let if_block0_anchor;
	let style_transform = `translate3d(${/*translate*/ ctx[12][0]}px, ${/*translate*/ ctx[12][1]}px, 0) scale(${/*scale*/ ctx[3]})`;
	let current;
	let mounted;
	let dispose;
	let if_block0 = /*loaded*/ ctx[5] && create_if_block_1$1(ctx);
	let if_block1 = /*showLoader*/ ctx[6] && create_if_block$1(ctx);

	return {
		c() {
			div1 = element("div");
			div0 = element("div");
			if (if_block0) if_block0.c();
			if_block0_anchor = empty();
			if (if_block1) if_block1.c();
			attr(div0, "class", "bp-img");
			set_style(div0, "width", /*activeDimensions*/ ctx[1][0] + "px");
			set_style(div0, "height", /*activeDimensions*/ ctx[1][1] + "px");
			toggle_class(div0, "bp-drag", /*pointerDown*/ ctx[9] || /*prevDiff*/ ctx[8]);
			toggle_class(div0, "bp-canzoom", /*maxZoom*/ ctx[15] > 1 && /*activeDimensions*/ ctx[1][0] * /*scale*/ ctx[3] < /*naturalWidth*/ ctx[11]);

			set_style(div0, "background-image", /*shown*/ ctx[7]
			? null
			: getThumbBackground(/*activeItem*/ ctx[13]));

			set_style(div0, "transform", style_transform);
			attr(div1, "class", "bp-img-wrap");
			attr(div1, "role", "none");
			toggle_class(div1, "bp-close", /*closingWhileZoomed*/ ctx[10]);
		},
		m(target, anchor) {
			insert(target, div1, anchor);
			append(div1, div0);
			if (if_block0) if_block0.m(div0, null);
			append(div0, if_block0_anchor);
			if (if_block1) if_block1.m(div0, null);
			current = true;

			if (!mounted) {
				dispose = [
					listen(window, "keydown", /*onKeydown*/ ctx[17], true),
					action_destroyer(/*onMount*/ ctx[23].call(null, div0)),
					listen(div1, "pointerdown", /*onPointerDown*/ ctx[18]),
					listen(div1, "pointermove", /*onPointerMove*/ ctx[19]),
					listen(div1, "pointerup", /*onPointerUp*/ ctx[21]),
					listen(div1, "pointercancel", /*onPointerCancel*/ ctx[20]),
					listen(div1, "click", /*onClick*/ ctx[22])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (/*loaded*/ ctx[5]) {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_1$1(ctx);
					if_block0.c();
					if_block0.m(div0, if_block0_anchor);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (/*showLoader*/ ctx[6]) {
				if (if_block1) {
					if_block1.p(ctx, dirty);

					if (dirty[0] & /*showLoader*/ 64) {
						transition_in(if_block1, 1);
					}
				} else {
					if_block1 = create_if_block$1(ctx);
					if_block1.c();
					transition_in(if_block1, 1);
					if_block1.m(div0, null);
				}
			} else if (if_block1) {
				group_outros();

				transition_out(if_block1, 1, 1, () => {
					if_block1 = null;
				});

				check_outros();
			}

			if (!current || dirty[0] & /*activeDimensions*/ 2) {
				set_style(div0, "width", /*activeDimensions*/ ctx[1][0] + "px");
			}

			if (!current || dirty[0] & /*activeDimensions*/ 2) {
				set_style(div0, "height", /*activeDimensions*/ ctx[1][1] + "px");
			}

			if (!current || dirty[0] & /*pointerDown, prevDiff*/ 768) {
				toggle_class(div0, "bp-drag", /*pointerDown*/ ctx[9] || /*prevDiff*/ ctx[8]);
			}

			if (!current || dirty[0] & /*maxZoom, activeDimensions, scale, naturalWidth*/ 34826) {
				toggle_class(div0, "bp-canzoom", /*maxZoom*/ ctx[15] > 1 && /*activeDimensions*/ ctx[1][0] * /*scale*/ ctx[3] < /*naturalWidth*/ ctx[11]);
			}

			const style_changed = dirty[0] & /*activeDimensions*/ 2;

			if (dirty[0] & /*shown, activeDimensions*/ 130 || style_changed) {
				set_style(div0, "background-image", /*shown*/ ctx[7]
				? null
				: getThumbBackground(/*activeItem*/ ctx[13]));
			}

			if (dirty[0] & /*translate, scale, activeDimensions*/ 4106 && style_transform !== (style_transform = `translate3d(${/*translate*/ ctx[12][0]}px, ${/*translate*/ ctx[12][1]}px, 0) scale(${/*scale*/ ctx[3]})`) || style_changed) {
				set_style(div0, "transform", style_transform);
			}

			if (!current || dirty[0] & /*closingWhileZoomed*/ 1024) {
				toggle_class(div1, "bp-close", /*closingWhileZoomed*/ ctx[10]);
			}
		},
		i(local) {
			if (current) return;
			transition_in(if_block1);
			current = true;
		},
		o(local) {
			transition_out(if_block1);
			current = false;
		},
		d(detaching) {
			if (detaching) {
				detach(div1);
			}

			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

function instance$2($$self, $$props, $$invalidate) {
	let zoomed;
	let { props } = $$props;
	let { smallScreen } = $$props;
	let { containerWidth } = $$props;
	let { containerHeight } = $$props;
	let { activeDimensions } = $$props;
	let { closing } = $$props;
	const { activeItem, opts, prev, next } = props;
	const maxZoom = activeItem.maxZoom || opts.maxZoom || 10;

	// The largest zoomed width, the sizes attribute is at least the shown width
	let sizes = 0;

	// Tracks load state of image, shown is true once the img is decoded, then the thumbnail under it goes, so it can't
	// show through a transparent image
	let loaded, showLoader, shown;

	const show = () => $$invalidate(7, shown = true);

	// Stores pinch info if multiple touch events active
	let pinchDetails;

	// Image html element (.bp-img)
	let bpImg;

	// Track distance for pinch events. Not zero during a pinch, which scales the image with no transition, as a drag moves it
	let prevDiff = 0;

	let pointerDown, hasDragged;

	// The pointerdown event and the translate of the image at the start of the drag
	let dragStart, dragStartTranslate;

	// If true, adds class to .bp-wrap to avoid image cropping
	let closingWhileZoomed;

	// Zero until the size is known, so a zoom before the load does nothing
	let naturalWidth = activeItem.width || 0;

	// Store positions for drag inertia
	const dragPositions = [];

	// Cache pointer events to handle pinch
	const pointerCache = new Map();

	// Zoom level of the image, 1 is the starting size, a CSS transition animates it
	let scale = 1;

	// Translate of the zoomed image, animated with the scale
	let translate = [0, 0];

	// Fit the zoom to a new stage size. Small screens keep the zoom, e.g. on a turn of the phone, and only bring the image
	// back into its bounds. A function, so the statement doesn't run again on each translate change. Before the zoomed
	// statement below, which must see the scale this sets
	const fitZoom = () => {
		if (opts.inline || !smallScreen) {
			reset();
		} else {
			$$invalidate(12, translate = boundTranslateValues(translate));
		}
	};

	// Back to the starting size, in the center
	const reset = () => {
		$$invalidate(3, scale = 1);
		$$invalidate(12, translate = [0, 0]);
	};

	// A value between -max and max, or 0 when the image is smaller than the stage on that axis
	const clamp = (value, max) => max < 0 ? 0 : Math.max(-max, Math.min(value, max));

	// Calculate translate position with bounds
	const boundTranslateValues = ([x, y], newScale = scale) => {
		const maxX = (activeDimensions[0] * newScale - containerWidth) / 2,
			edge = clamp(x, maxX);

		// On a small screen, a drag goes a little past the edge, and more than 20px past it goes to the previous or the next
		// item. Setting pointerDown to undefined stops pointermove from running again
		if (smallScreen && maxX >= 0 && x !== edge) {
			x = pointerDown ? edge + (x - edge) / 10 : edge;

			if (Math.abs(x - edge) > 20) {
				$$invalidate(9, pointerDown = x > edge ? prev() : next());
			}
		} else {
			x = edge;
		}

		return [x, clamp(y, (activeDimensions[1] * newScale - containerHeight) / 2)];
	};

	// Updates zoom level in or out based on amt value
	function changeZoom(amt = maxZoom, e) {
		if (closing) {
			return;
		}

		let newScale = scale + scale * amt;

		if (amt > 0) {
			// Not larger than the max zoom and the natural size, and never smaller, an image that fills
			// the screen past its natural size stays at its scale
			newScale = Math.max(scale, Math.min(newScale, maxZoom, naturalWidth / activeDimensions[0]));
		} else if (newScale < 1) {
			// If requesting image smaller than starting size
			return reset();
		}

		let x = 0, y = 0;

		if (e) {
			// Distance clicked from center of image
			const { left, top, width, height } = bpImg.parentNode.getBoundingClientRect();

			x = e.clientX - left - width / 2 - translate[0];
			y = e.clientY - top - height / 2 - translate[1];
		}

		// Keep the clicked point in place
		const ratio = 1 - newScale / scale;

		// Update sizes property, the browser loads a larger source if there is one
		$$invalidate(4, sizes = Math.round(Math.max(sizes, activeDimensions[0] * newScale)));

		$$invalidate(12, translate = boundTranslateValues([translate[0] + x * ratio, translate[1] + y * ratio], newScale));
		$$invalidate(3, scale = newScale);
	}

	// Allow zoom to be read / set externally
	Object.defineProperty(activeItem, 'zoom', {
		configurable: true,
		get: () => zoomed,
		set: bool => changeZoom(bool ? maxZoom : -maxZoom)
	});

	// Zoom with + and -, and pan the zoomed image with the arrows, the gallery handles the other keys
	const onKeydown = e => {
		// Zoom out by the same factor, 1.5x in and 1 / 1.5x out
		const zoom = ({ '+': 0.5, '=': 0.5, '-': -1 / 3 })[e.key];

		const pan = ({
			ArrowLeft: [100, 0],
			ArrowRight: [-100, 0],
			ArrowUp: [0, 100],
			ArrowDown: [0, -100]
		})[e.key];

		if (opts.inline || closing || !isGalleryKey(e, opts, props.container)) {
			return;
		}

		if (zoom) {
			changeZoom(zoom);
		} else if (pan && zoomed) {
			e.preventDefault();

			// Starts from the target, so held keys keep panning while the transition runs
			$$invalidate(12, translate = boundTranslateValues([translate[0] + pan[0], translate[1] + pan[1]]));
		} else {
			return;
		}

		e.stopPropagation();
	};

	const onWheel = e => {
		// Zoom instead of scrolling the page
		e.preventDefault();

		changeZoom(e.deltaY / -300, e);
	};

	// On drag start, store initial position and image translate values
	const onPointerDown = e => {
		// Don't run if right click
		if (e.button !== 2) {
			e.preventDefault();

			if (e.isPrimary) {
				// A new gesture drops the state of the last one, which can end without a pointerup, e.g. under a context
				// menu, or with an early return in onPointerUp after a swipe or a pinch
				pointerCache.clear();

				pinchDetails = null;
				$$invalidate(8, prevDiff = 0);
				hasDragged = false;
				dragPositions.length = 0;
			}

			if (zoomed) {
				// Stop the transition where it is, the drag moves the image without one
				const img = bpImg.getBoundingClientRect();

				const wrap = bpImg.parentNode.getBoundingClientRect();
				$$invalidate(3, scale = img.width / activeDimensions[0]);

				$$invalidate(12, translate = [
					img.left + img.width / 2 - wrap.left - wrap.width / 2,
					img.top + img.height / 2 - wrap.top - wrap.height / 2
				]);
			}

			$$invalidate(9, pointerDown = true);
			pointerCache.set(e.pointerId, e);
			dragStart = e;
			dragStartTranslate = translate;
		}
	};

	// On drag, update image translate val
	const onPointerMove = e => {
		if (pointerCache.size > 1) {
			// Two pointers pinch
			$$invalidate(9, pointerDown = false);

			const { noPinch } = opts;

			if (typeof noPinch == 'function'
			? noPinch(props.container)
			: noPinch) {
				return;
			}

			// Update event in cache and get values
			const [p1, p2] = pointerCache.set(e.pointerId, e).values();

			// The distance between the two pointers
			const curDiff = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);

			// Cache the original pinch center
			pinchDetails = pinchDetails || {
				clientX: (p1.clientX + p2.clientX) / 2,
				clientY: (p1.clientY + p2.clientY) / 2
			};

			// Scale image
			changeZoom(((prevDiff || curDiff) - curDiff) / -35, pinchDetails);

			// Cache the distance for the next move event
			$$invalidate(8, prevDiff = curDiff);

			return;
		}

		// A release outside the image, such as over a button, sends no pointerup here, so a move without a pressed button ends the drag
		if (!e.buttons) {
			$$invalidate(9, pointerDown = false);
		}

		if (!pointerDown) {
			return;
		}

		let x = e.clientX;
		let y = e.clientY;

		// Store positions for drag inertia
		dragPositions.push({ x, y });

		// Overall drag diff from start location, a move of more than 5px is a drag
		x -= dragStart.clientX;

		y -= dragStart.clientY;
		hasDragged = hasDragged || Math.hypot(x, y) > 5;

		// Handle unzoomed left / right / up swipes
		if (!zoomed) {
			// Close if swipe up
			if (y < -90) {
				$$invalidate(9, pointerDown = !opts.persistent && props.close());
			}

			// Only handle left / right if not swiping vertically
			if (Math.abs(y) < 30) {
				// Previous if swipe left
				if (x > 40) {
					// Setting pointerDown to undefined stops pointermove from running again
					$$invalidate(9, pointerDown = prev());
				}

				// Next if swipe right
				if (x < -40) {
					// Setting pointerDown to undefined stops pointermove from running again
					$$invalidate(9, pointerDown = next());
				}
			}
		}

		// Image drag when zoomed
		if (zoomed && hasDragged && !closing) {
			$$invalidate(12, translate = boundTranslateValues([dragStartTranslate[0] + x, dragStartTranslate[1] + y]));
		}
	};

	// The browser took the pointer, such as for a system gesture, so the drag or the pinch ends without a tap
	const onPointerCancel = e => {
		pointerCache.delete(e.pointerId);
		$$invalidate(9, pointerDown = $$invalidate(8, prevDiff = 0));
	};

	const onPointerUp = function (e) {
		pointerCache.delete(e.pointerId);

		if (pinchDetails) {
			// Reset prevDiff and clear pointerDown to trigger return below, the next gesture clears pinchDetails
			$$invalidate(9, pointerDown = $$invalidate(8, prevDiff = 0));
		}

		// Make sure pointer events don't carry over to next image
		if (!pointerDown) {
			return;
		}

		$$invalidate(9, pointerDown = false);

		// A tap on the space around the image closes the gallery in onClick
		if (e.target === this && !opts.persistent) {
			return;
		}

		// Add drag inertia / snap back to bounds
		if (hasDragged) {
			const [posOne, posTwo, posThree] = dragPositions.slice(-3);

			// A short flick may have fewer than three moves, it gets no inertia
			if (posThree && Math.hypot(posTwo.x - posThree.x, posTwo.y - posThree.y) > 5) {
				$$invalidate(12, translate = boundTranslateValues([
					translate[0] - (posOne.x - posThree.x) * 5,
					translate[1] - (posOne.y - posThree.y) * 5
				]));
			}
		} else if (!opts.onImageClick?.(props.container, activeItem)) {
			if (zoomed) {
				const wrap = this.closest('.bp-wrap');
				wrap.addEventListener('click', dropClick, { capture: true, once: true });
				wrap.addEventListener('pointerdown', () => wrap.removeEventListener('click', dropClick, true), { capture: true, once: true });
			}

			changeZoom(zoomed ? -maxZoom : maxZoom, e);
		}
	};

	// The click of a tap comes after its pointerup. Once the tap zooms out, a small screen shows the controls it hides while
	// zoomed, and the click must not press the one under the finger. So the gallery drops the next click out of the image,
	// up to the next press
	const dropClick = e => {
		if (!bpImg.parentNode.contains(e.target)) {
			e.stopPropagation();
			e.preventDefault();
		}
	};

	// Close when the space around the image is clicked. On click, not on pointerup: a tap sends its click after the pointerup,
	// and without an outro, such as with reduced motion, the gallery is gone by then and the click opens the link under it
	const onClick = function (e) {
		if (e.target === this && !hasDragged && !opts.persistent) {
			props.close();
		}
	};

	const onMount = node => {
		$$invalidate(27, bpImg = node);

		// Decode initial image before rendering. In a microtask: on open, the gallery measures its stage and reads its gap
		// after its items are made, and the choice of a srcset candidate needs the size the item fits in
		queueMicrotask(() => props.loadImage(activeItem).then(() => {
			$$invalidate(11, naturalWidth = activeItem.width || 0);
			$$invalidate(5, loaded = true);
			props.preloadNext();
		}));

		// Show loading indicator if needed
		setTimeout(
			() => {
				$$invalidate(6, showLoader = !loaded);
			},
			250
		);
	};

	const load_handler = e => e.target.decode().then(show, show);
	const error_handler = error => opts.onError?.(props.container, activeItem, error);

	$$self.$$set = $$props => {
		
		if ('smallScreen' in $$props) $$invalidate(24, smallScreen = $$props.smallScreen);
		if ('containerWidth' in $$props) $$invalidate(25, containerWidth = $$props.containerWidth);
		if ('containerHeight' in $$props) $$invalidate(26, containerHeight = $$props.containerHeight);
		if ('activeDimensions' in $$props) $$invalidate(1, activeDimensions = $$props.activeDimensions);
		if ('closing' in $$props) $$invalidate(2, closing = $$props.closing);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty[0] & /*activeDimensions*/ 2) {
			(fitZoom());
		}

		if ($$self.$$.dirty[0] & /*activeDimensions, scale*/ 10) {
			// True if the image is zoomed past its starting size, the gallery gets it too
			$$invalidate(28, zoomed = activeDimensions[0] * (scale - 1) > 10);
		}

		if ($$self.$$.dirty[0] & /*props, zoomed*/ 268435457) {
			props.setZoomed(zoomed);
		}

		if ($$self.$$.dirty[0] & /*closing, scale*/ 12) {
			// If zoomed while closing, zoom out image and add class
			// to change contain value on .bp-wrap to avoid cropping
			if (closing && scale !== 1 && opts.zoom) {
				reset();
				$$invalidate(10, closingWhileZoomed = true);
			}
		}

		if ($$self.$$.dirty[0] & /*bpImg, zoomed*/ 402653184) {
			// The wheel scrolls the page past an inline image that is not zoomed. A wheel listener makes the browser wait for it
			// before it scrolls, so there is none then
			if (bpImg) $$invalidate(27, bpImg.parentNode.onwheel = zoomed || !opts.inline ? onWheel : null, bpImg);
		}
	};

	return [
		props,
		activeDimensions,
		closing,
		scale,
		sizes,
		loaded,
		showLoader,
		shown,
		prevDiff,
		pointerDown,
		closingWhileZoomed,
		naturalWidth,
		translate,
		activeItem,
		opts,
		maxZoom,
		show,
		onKeydown,
		onPointerDown,
		onPointerMove,
		onPointerCancel,
		onPointerUp,
		onClick,
		onMount,
		smallScreen,
		containerWidth,
		containerHeight,
		bpImg,
		zoomed,
		load_handler,
		error_handler
	];
}

let Image$1 = class Image extends SvelteComponent {
	constructor(options) {
		super();

		init(
			this,
			options,
			instance$2,
			create_fragment$2,
			not_equal,
			{
				props: 0,
				smallScreen: 24,
				containerWidth: 25,
				containerHeight: 26,
				activeDimensions: 1,
				closing: 2
			},
			null,
			[-1, -1]
		);
	}
};

/* src\components\media.svelte generated by Svelte v4.2.20 */

function create_fragment$1(ctx) {
	let div;
	let loading;
	let style_width = `${/*activeDimensions*/ ctx[0][0]}px`;
	let style_height = `${/*activeDimensions*/ ctx[0][1]}px`;
	let current;
	let mounted;
	let dispose;

	loading = new Loading({
			props: {
				activeItem: /*activeItem*/ ctx[3],
				loaded: /*loaded*/ ctx[2],
				closing: /*closing*/ ctx[1]
			}
		});

	return {
		c() {
			div = element("div");
			create_component(loading.$$.fragment);
			attr(div, "class", /*sources*/ ctx[4] ? 'bp-video' : 'bp-iframe');
			set_style(div, "width", style_width);
			set_style(div, "height", style_height);
			set_style(div, "background-image", /*sources*/ ctx[4] && getThumbBackground(/*activeItem*/ ctx[3]));
		},
		m(target, anchor) {
			insert(target, div, anchor);
			mount_component(loading, div, null);
			current = true;

			if (!mounted) {
				dispose = action_destroyer(/*onMount*/ ctx[5].call(null, div));
				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			const loading_changes = {};
			if (dirty & /*loaded*/ 4) loading_changes.loaded = /*loaded*/ ctx[2];
			if (dirty & /*closing*/ 2) loading_changes.closing = /*closing*/ ctx[1];
			loading.$set(loading_changes);

			if (dirty & /*activeDimensions*/ 1 && style_width !== (style_width = `${/*activeDimensions*/ ctx[0][0]}px`)) {
				set_style(div, "width", style_width);
			}

			if (dirty & /*activeDimensions*/ 1 && style_height !== (style_height = `${/*activeDimensions*/ ctx[0][1]}px`)) {
				set_style(div, "height", style_height);
			}
		},
		i(local) {
			if (current) return;
			transition_in(loading.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(loading.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) {
				detach(div);
			}

			destroy_component(loading);
			mounted = false;
			dispose();
		}
	};
}

function instance$1($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let { activeDimensions } = $$props;
	let { closing } = $$props;
	let loaded;
	const { activeItem, opts } = props;
	const { sources, link, alt } = activeItem;

	// Create the video, audio or iframe element
	const onMount = node => {
		const media = document.createElement(sources ? activeItem.type : 'iframe'),
			// Playback positions by the first source of a video, or by the link of a YouTube or Vimeo player
			key = sources ? sources[0].src : link,
			youtube = (/youtube(-nocookie)?\.com\/embed/).test(link),
			post = message => media.contentWindow.postMessage(JSON.stringify(message), '*');

		// The YouTube and Vimeo players send their playback time, and a player opened again resumes from there
		const onMessage = ({ source, data }) => {
			if (source === media.contentWindow) {
				// The players send JSON strings. A message that is not one, or is null, stops here
				try {
					const { event, info = {}, data: { seconds } = {} } = JSON.parse(data);

					// YouTube sends the time in info and the playerState 0 at the end, Vimeo sends it in data and finish at the end
					positions[key] = info.playerState === 0 || event === 'finish'
					? 0
					: info.currentTime ?? seconds ?? positions[key];

					// Vimeo sends events only when it is ready and the page asks for them
					if (event === 'ready') {
						['timeupdate', 'ended'].map(value => post({ method: 'addEventListener', value }));
					}
				} catch {
					
				}
			}
		};

		addAttributes(media, sources
		? {
				controls: true,
				autoplay: true,
				playsinline: true,
				tabindex: '0'
			}
		: { allow: 'autoplay; fullscreen' });

		// The alt text names the player or the frame for screen readers
		if (alt) {
			media.setAttribute(sources ? 'aria-label' : 'title', alt);
		}

		addAttributes(media, activeItem.attr);

		if (sources) {
			// Takes supplied object and creates elements in video
			const appendToVideo = (tag, list) => {
				for (let item of list) {
					// Add sources / tracks to media element
					let el = document.createElement(tag);

					addAttributes(el, item);

					if (tag === 'source') {
						el.onerror = error => {
							// The loader goes when the last source fails too, the browser tries them in order
							$$invalidate(2, loaded ||= item === list.at(-1));

							opts.onError?.(props.container, activeItem, error);
						};
					}

					media.append(el);
				}
			};

			appendToVideo('source', sources);
			appendToVideo('track', activeItem.tracks || []);
			media.oncanplay = () => $$invalidate(2, loaded = true);

			// A video with no size given, and no thumbnail to take it from, takes the size of the file, such as a portrait one
			media.onloadedmetadata = () => props.setDimensions(activeItem, {
				naturalWidth: media.videoWidth,
				naturalHeight: media.videoHeight
			});

			// Before the metadata loads, this sets the position the playback starts from
			media.currentTime = positions[key] || 0;
		} else {
			const time = positions[key] | 0;
			let url = link;

			if (time) {
				url = new URL(link);

				youtube
				? url.searchParams.set('start', time)
				: url.hash = 't=' + time + 's';
			}

			media.src = url;

			media.onload = () => {
				$$invalidate(2, loaded = true);

				if (youtube) {
					// YouTube sends its state only to a page that listens
					post({ event: 'listening' });

					// YouTube ignores autoplay on some pages, so send a play command through the player API
					if ((/[?&]autoplay=1/).test(link)) {
						post({ event: 'command', func: 'playVideo' });
					}
				}
			};

			if (youtube || (/player\.vimeo\.com/).test(link)) {
				addEventListener('message', onMessage);
			}
		}

		node.append(media);

		return {
			destroy() {
				// A finished video starts over next time
				if (sources) {
					positions[key] = media.ended ? 0 : media.currentTime;
				}

				removeEventListener('message', onMessage);
			}
		};
	};

	$$self.$$set = $$props => {
		
		if ('activeDimensions' in $$props) $$invalidate(0, activeDimensions = $$props.activeDimensions);
		if ('closing' in $$props) $$invalidate(1, closing = $$props.closing);
	};

	return [activeDimensions, closing, loaded, activeItem, sources, onMount, props];
}

class Media extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance$1, create_fragment$1, not_equal, {
			props: 6,
			activeDimensions: 0,
			closing: 1
		});
	}
}

/* src\bigger-picture.svelte generated by Svelte v4.2.20 */

function create_if_block(ctx) {
	let svelte_element = /*tag*/ ctx[18] && create_dynamic_element(ctx);

	return {
		c() {
			if (svelte_element) svelte_element.c();
		},
		m(target, anchor) {
			if (svelte_element) svelte_element.m(target, anchor);
		},
		p(ctx, dirty) {
			if (/*tag*/ ctx[18]) {
				svelte_element.p(ctx, dirty);
			}
		},
		i: noop,
		o(local) {
			transition_out(svelte_element, local);
		},
		d(detaching) {
			if (svelte_element) svelte_element.d(detaching);
		}
	};
}

// (854:2) {#if !dialog}
function create_if_block_8(ctx) {
	let div;

	return {
		c() {
			div = element("div");
			attr(div, "class", "bp-overlay");
		},
		m(target, anchor) {
			insert(target, div, anchor);
		},
		d(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (865:125) {#if containerWidth > 0 && containerHeight > 0}
function create_if_block_5(ctx) {
	let current_block_type_index;
	let if_block;
	let if_block_anchor;
	let current;
	const if_block_creators = [create_if_block_6, create_if_block_7, create_else_block];
	const if_blocks = [];

	function select_block_type(ctx, dirty) {
		if (/*activeItem*/ ctx[8].type === 'image') return 0;
		if (/*activeItem*/ ctx[8].sources || /*activeItem*/ ctx[8].type === 'iframe') return 1;
		return 2;
	}

	current_block_type_index = select_block_type(ctx);
	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

	return {
		c() {
			if_block.c();
			if_block_anchor = empty();
		},
		m(target, anchor) {
			if_blocks[current_block_type_index].m(target, anchor);
			insert(target, if_block_anchor, anchor);
			current = true;
		},
		p(ctx, dirty) {
			let previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);

			if (current_block_type_index === previous_block_index) {
				if_blocks[current_block_type_index].p(ctx, dirty);
			} else {
				group_outros();

				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});

				check_outros();
				if_block = if_blocks[current_block_type_index];

				if (!if_block) {
					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block.c();
				} else {
					if_block.p(ctx, dirty);
				}

				transition_in(if_block, 1);
				if_block.m(if_block_anchor.parentNode, if_block_anchor);
			}
		},
		i(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o(local) {
			transition_out(if_block);
			current = false;
		},
		d(detaching) {
			if (detaching) {
				detach(if_block_anchor);
			}

			if_blocks[current_block_type_index].d(detaching);
		}
	};
}

// (865:443) {:else}
function create_else_block(ctx) {
	let div;
	let raw_value = /*activeItem*/ ctx[8].html + "";

	return {
		c() {
			div = element("div");
			attr(div, "class", "bp-html");
		},
		m(target, anchor) {
			insert(target, div, anchor);
			div.innerHTML = raw_value;
		},
		p(ctx, dirty) {
			if (dirty[0] & /*activeItem*/ 256 && raw_value !== (raw_value = /*activeItem*/ ctx[8].html + "")) div.innerHTML = raw_value;		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (865:381) 
function create_if_block_7(ctx) {
	let media;
	let current;

	media = new Media({
			props: {
				props: /*getChildProps*/ ctx[20](),
				closing: /*closing*/ ctx[17],
				activeDimensions: /*activeDimensions*/ ctx[15]
			}
		});

	return {
		c() {
			create_component(media.$$.fragment);
		},
		m(target, anchor) {
			mount_component(media, target, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const media_changes = {};
			if (dirty[0] & /*closing*/ 131072) media_changes.closing = /*closing*/ ctx[17];
			if (dirty[0] & /*activeDimensions*/ 32768) media_changes.activeDimensions = /*activeDimensions*/ ctx[15];
			media.$set(media_changes);
		},
		i(local) {
			if (current) return;
			transition_in(media.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(media.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(media, detaching);
		}
	};
}

// (865:172) {#if activeItem.type === 'image'}
function create_if_block_6(ctx) {
	let imageitem;
	let current;

	imageitem = new Image$1({
			props: {
				props: /*getChildProps*/ ctx[20](),
				closing: /*closing*/ ctx[17],
				smallScreen: /*smallScreen*/ ctx[10],
				containerWidth: /*containerWidth*/ ctx[7],
				containerHeight: /*containerHeight*/ ctx[14],
				activeDimensions: /*activeDimensions*/ ctx[15]
			}
		});

	return {
		c() {
			create_component(imageitem.$$.fragment);
		},
		m(target, anchor) {
			mount_component(imageitem, target, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const imageitem_changes = {};
			if (dirty[0] & /*closing*/ 131072) imageitem_changes.closing = /*closing*/ ctx[17];
			if (dirty[0] & /*smallScreen*/ 1024) imageitem_changes.smallScreen = /*smallScreen*/ ctx[10];
			if (dirty[0] & /*containerWidth*/ 128) imageitem_changes.containerWidth = /*containerWidth*/ ctx[7];
			if (dirty[0] & /*containerHeight*/ 16384) imageitem_changes.containerHeight = /*containerHeight*/ ctx[14];
			if (dirty[0] & /*activeDimensions*/ 32768) imageitem_changes.activeDimensions = /*activeDimensions*/ ctx[15];
			imageitem.$set(imageitem_changes);
		},
		i(local) {
			if (current) return;
			transition_in(imageitem.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(imageitem.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(imageitem, detaching);
		}
	};
}

// (854:94) {#key activeItem.i}
function create_key_block(ctx) {
	let div2;
	let div1;
	let div0;
	let current;
	let mounted;
	let dispose;
	let if_block = /*containerWidth*/ ctx[7] > 0 && /*containerHeight*/ ctx[14] > 0 && create_if_block_5(ctx);

	return {
		c() {
			div2 = element("div");
			div1 = element("div");
			div0 = element("div");
			if (if_block) if_block.c();
			attr(div1, "class", "bp-crop");
			attr(div2, "class", "bp-slide");
			attr(div2, "role", "none");
		},
		m(target, anchor) {
			insert(target, div2, anchor);
			append(div2, div1);
			append(div1, div0);
			if (if_block) if_block.m(div0, null);
			current = true;

			if (!mounted) {
				dispose = [
					action_destroyer(/*slideActions*/ ctx[19].call(null, div2)),
					listen(div2, "pointerdown", /*pointerdown_handler*/ ctx[26]),
					listen(div2, "click", /*click_handler*/ ctx[27])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (/*containerWidth*/ ctx[7] > 0 && /*containerHeight*/ ctx[14] > 0) {
				if (if_block) {
					if_block.p(ctx, dirty);

					if (dirty[0] & /*containerWidth, containerHeight*/ 16512) {
						transition_in(if_block, 1);
					}
				} else {
					if_block = create_if_block_5(ctx);
					if_block.c();
					transition_in(if_block, 1);
					if_block.m(div0, null);
				}
			} else if (if_block) {
				group_outros();

				transition_out(if_block, 1, 1, () => {
					if_block = null;
				});

				check_outros();
			}
		},
		i(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o(local) {
			transition_out(if_block);
			current = false;
		},
		d(detaching) {
			if (detaching) {
				detach(div2);
			}

			if (if_block) if_block.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

// (865:585) {#if activeItem.caption}
function create_if_block_4(ctx) {
	let div;
	let raw_value = /*activeItem*/ ctx[8].caption + "";

	return {
		c() {
			div = element("div");
			attr(div, "class", "bp-caption");
		},
		m(target, anchor) {
			insert(target, div, anchor);
			div.innerHTML = raw_value;
		},
		p(ctx, dirty) {
			if (dirty[0] & /*activeItem*/ 256 && raw_value !== (raw_value = /*activeItem*/ ctx[8].caption + "")) div.innerHTML = raw_value;		},
		d(detaching) {
			if (detaching) {
				detach(div);
			}
		}
	};
}

// (865:725) {#if activeItem.download}
function create_if_block_3(ctx) {
	let a;
	let a_href_value;
	let mounted;
	let dispose;

	return {
		c() {
			a = element("a");
			attr(a, "class", "bp-dl");
			attr(a, "href", a_href_value = /*activeItem*/ ctx[8].download);
			attr(a, "download", "");
			attr(a, "target", "_blank");
		},
		m(target, anchor) {
			insert(target, a, anchor);

			if (!mounted) {
				dispose = action_destroyer(/*label*/ ctx[21].call(null, a, 'download'));
				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*activeItem*/ 256 && a_href_value !== (a_href_value = /*activeItem*/ ctx[8].download)) {
				attr(a, "href", a_href_value);
			}
		},
		d(detaching) {
			if (detaching) {
				detach(a);
			}

			mounted = false;
			dispose();
		}
	};
}

// (865:1174) {#if items.length > 1}
function create_if_block_2(ctx) {
	let div;
	let t0_value = /*position*/ ctx[6] + 1 + "";
	let t0;
	let t1;
	let t2_value = /*items*/ ctx[0].length + "";
	let t2;
	let button0;
	let button1;
	let mounted;
	let dispose;

	return {
		c() {
			div = element("div");
			t0 = text(t0_value);
			t1 = text(" / ");
			t2 = text(t2_value);
			button0 = element("button");
			button1 = element("button");
			attr(div, "class", "bp-count");
			attr(button0, "type", "button");
			attr(button0, "class", "bp-prev");
			attr(button1, "type", "button");
			attr(button1, "class", "bp-next");
		},
		m(target, anchor) {
			insert(target, div, anchor);
			append(div, t0);
			append(div, t1);
			append(div, t2);
			insert(target, button0, anchor);
			insert(target, button1, anchor);

			if (!mounted) {
				dispose = [
					action_destroyer(/*label*/ ctx[21].call(null, button0, 'prev')),
					listen(button0, "click", /*prev*/ ctx[3]),
					action_destroyer(/*label*/ ctx[21].call(null, button1, 'next')),
					listen(button1, "click", /*next*/ ctx[4])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*position*/ 64 && t0_value !== (t0_value = /*position*/ ctx[6] + 1 + "")) set_data(t0, t0_value);
			if (dirty[0] & /*items*/ 1 && t2_value !== (t2_value = /*items*/ ctx[0].length + "")) set_data(t2, t2_value);
		},
		d(detaching) {
			if (detaching) {
				detach(div);
				detach(button0);
				detach(button1);
			}

			mounted = false;
			run_all(dispose);
		}
	};
}

// (875:25) {#if opts.thumbs && items.length > 1}
function create_if_block_1(ctx) {
	let thumbs;
	let current;

	thumbs = new Thumbs({
			props: {
				position: /*position*/ ctx[6],
				setPosition: /*setPosition*/ ctx[5],
				items: /*items*/ ctx[0],
				label: /*labels*/ ctx[13].thumb
			}
		});

	return {
		c() {
			create_component(thumbs.$$.fragment);
		},
		m(target, anchor) {
			mount_component(thumbs, target, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const thumbs_changes = {};
			if (dirty[0] & /*position*/ 64) thumbs_changes.position = /*position*/ ctx[6];
			if (dirty[0] & /*items*/ 1) thumbs_changes.items = /*items*/ ctx[0];
			if (dirty[0] & /*labels*/ 8192) thumbs_changes.label = /*labels*/ ctx[13].thumb;
			thumbs.$set(thumbs_changes);
		},
		i(local) {
			if (current) return;
			transition_in(thumbs.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(thumbs.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(thumbs, detaching);
		}
	};
}

// (846:20) <svelte:element   this={tag}   use:containerActions   class:bp-zoomed={zoomed}   class:bp-inline={inline}   class:bp-small={smallScreen}   class:bp-noclose={opts.persistent}   class:bp-closing={closing}  >
function create_dynamic_element(ctx) {
	let svelte_element;
	let div2;
	let div1;
	let previous_key = /*activeItem*/ ctx[8].i;
	let div0;
	let div4;
	let div3;
	let button;
	let current;
	let mounted;
	let dispose;
	let if_block0 = !/*dialog*/ ctx[1] && create_if_block_8();
	let key_block = create_key_block(ctx);
	let if_block1 = /*activeItem*/ ctx[8].caption && create_if_block_4(ctx);
	let if_block2 = /*activeItem*/ ctx[8].download && create_if_block_3(ctx);
	let if_block3 = /*items*/ ctx[0].length > 1 && create_if_block_2(ctx);
	let if_block4 = /*opts*/ ctx[9].thumbs && /*items*/ ctx[0].length > 1 && create_if_block_1(ctx);

	return {
		c() {
			svelte_element = element(/*tag*/ ctx[18]);
			if (if_block0) if_block0.c();
			div2 = element("div");
			div1 = element("div");
			key_block.c();
			div0 = element("div");
			if (if_block1) if_block1.c();
			div4 = element("div");
			div3 = element("div");
			if (if_block2) if_block2.c();
			button = element("button");
			if (if_block3) if_block3.c();
			if (if_block4) if_block4.c();
			attr(div0, "class", "bp-ruler");
			attr(div1, "class", "bp-inner");
			attr(div2, "class", "bp-stage");
			attr(button, "type", "button");
			attr(button, "class", "bp-x");
			attr(div3, "class", "bp-actions");
			attr(div4, "class", "bp-controls");
			toggle_class(svelte_element, "bp-zoomed", /*zoomed*/ ctx[16]);
			toggle_class(svelte_element, "bp-inline", /*inline*/ ctx[11]);
			toggle_class(svelte_element, "bp-small", /*smallScreen*/ ctx[10]);
			toggle_class(svelte_element, "bp-noclose", /*opts*/ ctx[9].persistent);
			toggle_class(svelte_element, "bp-closing", /*closing*/ ctx[17]);
		},
		m(target, anchor) {
			insert(target, svelte_element, anchor);
			if (if_block0) if_block0.m(svelte_element, null);
			append(svelte_element, div2);
			append(div2, div1);
			key_block.m(div1, null);
			append(div1, div0);
			if (if_block1) if_block1.m(div2, null);
			append(svelte_element, div4);
			append(div4, div3);
			if (if_block2) if_block2.m(div3, null);
			append(div3, button);
			if (if_block3) if_block3.m(div4, null);
			if (if_block4) if_block4.m(svelte_element, null);
			current = true;

			if (!mounted) {
				dispose = [
					action_destroyer(/*rulerActions*/ ctx[23].call(null, div0)),
					action_destroyer(/*label*/ ctx[21].call(null, button, 'close')),
					listen(button, "click", /*close*/ ctx[2]),
					action_destroyer(/*containerActions*/ ctx[22].call(null, svelte_element))
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (!/*dialog*/ ctx[1]) {
				if (if_block0) ; else {
					if_block0 = create_if_block_8();
					if_block0.c();
					if_block0.m(svelte_element, div2);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (dirty[0] & /*activeItem*/ 256 && not_equal(previous_key, previous_key = /*activeItem*/ ctx[8].i)) {
				group_outros();
				transition_out(key_block, 1, 1, noop);
				check_outros();
				key_block = create_key_block(ctx);
				key_block.c();
				transition_in(key_block, 1);
				key_block.m(div1, div0);
			} else {
				key_block.p(ctx, dirty);
			}

			if (/*activeItem*/ ctx[8].caption) {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block_4(ctx);
					if_block1.c();
					if_block1.m(div2, null);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (/*activeItem*/ ctx[8].download) {
				if (if_block2) {
					if_block2.p(ctx, dirty);
				} else {
					if_block2 = create_if_block_3(ctx);
					if_block2.c();
					if_block2.m(div3, button);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}

			if (/*items*/ ctx[0].length > 1) {
				if (if_block3) {
					if_block3.p(ctx, dirty);
				} else {
					if_block3 = create_if_block_2(ctx);
					if_block3.c();
					if_block3.m(div4, null);
				}
			} else if (if_block3) {
				if_block3.d(1);
				if_block3 = null;
			}

			if (/*opts*/ ctx[9].thumbs && /*items*/ ctx[0].length > 1) {
				if (if_block4) {
					if_block4.p(ctx, dirty);

					if (dirty[0] & /*opts, items*/ 513) {
						transition_in(if_block4, 1);
					}
				} else {
					if_block4 = create_if_block_1(ctx);
					if_block4.c();
					transition_in(if_block4, 1);
					if_block4.m(svelte_element, null);
				}
			} else if (if_block4) {
				group_outros();

				transition_out(if_block4, 1, 1, () => {
					if_block4 = null;
				});

				check_outros();
			}

			if (!current || dirty[0] & /*zoomed*/ 65536) {
				toggle_class(svelte_element, "bp-zoomed", /*zoomed*/ ctx[16]);
			}

			if (!current || dirty[0] & /*inline*/ 2048) {
				toggle_class(svelte_element, "bp-inline", /*inline*/ ctx[11]);
			}

			if (!current || dirty[0] & /*smallScreen*/ 1024) {
				toggle_class(svelte_element, "bp-small", /*smallScreen*/ ctx[10]);
			}

			if (!current || dirty[0] & /*opts*/ 512) {
				toggle_class(svelte_element, "bp-noclose", /*opts*/ ctx[9].persistent);
			}

			if (!current || dirty[0] & /*closing*/ 131072) {
				toggle_class(svelte_element, "bp-closing", /*closing*/ ctx[17]);
			}
		},
		i(local) {
			if (current) return;
			transition_in(key_block);
			transition_in(if_block4);
			current = true;
		},
		o(local) {
			transition_out(key_block);
			transition_out(if_block4);
			current = false;
		},
		d(detaching) {
			if (detaching) {
				detach(svelte_element);
			}

			if (if_block0) if_block0.d();
			key_block.d(detaching);
			if (if_block1) if_block1.d();
			if (if_block2) if_block2.d();
			if (if_block3) if_block3.d();
			if (if_block4) if_block4.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

function create_fragment(ctx) {
	let if_block_anchor;
	let current;
	let if_block = /*items*/ ctx[0] && create_if_block(ctx);

	return {
		c() {
			if (if_block) if_block.c();
			if_block_anchor = empty();
		},
		m(target, anchor) {
			if (if_block) if_block.m(target, anchor);
			insert(target, if_block_anchor, anchor);
			current = true;
		},
		p(ctx, dirty) {
			if (/*items*/ ctx[0]) {
				if (if_block) {
					if_block.p(ctx, dirty);

					if (dirty[0] & /*items*/ 1) {
						transition_in(if_block, 1);
					}
				} else {
					if_block = create_if_block(ctx);
					if_block.c();
					transition_in(if_block, 1);
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			} else if (if_block) {
				group_outros();

				transition_out(if_block, 1, 1, () => {
					if_block = null;
				});

				check_outros();
			}
		},
		i(local) {
			if (current) return;
			transition_in(if_block);
			current = true;
		},
		o(local) {
			transition_out(if_block);
			current = false;
		},
		d(detaching) {
			if (detaching) {
				detach(if_block_anchor);
			}

			if (if_block) if_block.d(detaching);
		}
	};
}

let pagePadding = null;

function instance($$self, $$props, $$invalidate) {
	let { items = undefined } = $$props;
	let { target = undefined } = $$props;
	let { dialog = false } = $$props;
	const html = document.documentElement;

	// The tag of the gallery, a constant: Svelte has no code to switch the tag then. The dialog prop doesn't change
	const tag = dialog ? 'dialog' : 'div';

	// Index of current active item
	let position = 0;

	// Options passed via open method
	let opts;

	// Dom element to restore focus to on close
	let focusTrigger;

	// Bool true if container width < 769
	let smallScreen;

	// Bool value of inline option passed in open method
	let inline;

	// When position is set
	let movement;

	// Stores target on pointerdown (ref for overlay close)
	let clickedEl;

	// Slide of the active item, none until the first one zooms in
	let slide;

	// Texts of the controls, merged with the labels option
	let labels;

	// Gap around the stage, read from the gallery on open and on resize instead of on every measure
	let gap = 0;

	let ruler;
	let container;
	let containerWidth;
	let containerHeight;

	// Active item object
	let activeItem;

	let activeDimensions;

	// True if the image is zoomed past its starting size, the image sets it
	let zoomed = 0;

	// True while this gallery runs its outro, other galleries on the page keep their own
	let closing = 0;

	// Options of an open call made while closing, applied once the gallery is removed
	let pendingOptions;

	const open = options => {
		// A gallery that is open or closes closes first, the new one opens once it is removed
		if (items) {
			pendingOptions = options;
			close();
			return;
		}

		$$invalidate(9, opts = { zoom: true, ...options });

		$$invalidate(13, labels = {
			close: 'Close',
			download: 'Download',
			prev: 'Previous',
			next: 'Next',
			thumb: 'View image',
			gallery: 'Gallery',
			...opts.labels
		});

		$$invalidate(11, inline = opts.inline);

		// Update trigger element to restore focus
		focusTrigger = document.activeElement;

		// The size before the gallery mounts, for the items that take it, such as a PDF
		if (target) {
			$$invalidate(7, containerWidth = target.offsetWidth);

			$$invalidate(14, containerHeight = target === document.body
			? window.innerHeight
			: target.clientHeight);
		}

		$$invalidate(6, position = 0);

		// Set the gallery items
		const list = [], current = opts.current;

		(opts.items instanceof HTMLElement
		? [opts.items]
		: [...opts.items]).forEach((item, i) => {
			item = prepareItem(item);

			if (typeof item !== 'object') {
				return;
			}

			// Index in the filtered list, used for position and thumbnails
			item.i = list.length;

			// A set position wins, otherwise the item of current
			if (opts.position == null
			? current && current === item.element
			: i === opts.position) {
				$$invalidate(6, position = item.i);
			}

			list.push(item);
		});

		// The entry that the last gallery kept for this one, see close. Not for a gallery with no items, inline or no history
		if (!list.length || inline || !opts.history) {
			dropEntry();
		}

		// Nothing to show, e.g. every item was filtered out
		if (!list.length) {
			return;
		}

		// Lock the scroll unless gallery is inline
		if (!inline && html.scrollHeight > html.clientHeight) {
			// The width the lock frees is the real scrollbar, innerWidth isn't, it follows the zoom
			// and the overflow on mobile, where overlay scrollbars free nothing
			const style = getComputedStyle(html);

			const width = html.clientWidth;
			html.classList.add('bp-lock');
			const scrollbar = html.clientWidth - width;

			// Padding takes the place of the hidden scrollbar, toggling scrollbar-gutter instead restyles the whole page,
			// a stable gutter keeps the space, though clientWidth changes with it
			if (scrollbar && style.scrollbarGutter === 'auto') {
				pagePadding = html.style.paddingRight;
				html.style.paddingRight = parseFloat(style.paddingRight) + scrollbar + 'px';
			}
		}

		$$invalidate(0, items = list);
	};

	// URL and ID of the history entry that the gallery adds. Each gallery has its own ID, so the back button closes only the
	// upper one of two
	let historyUrl, historyId = 0;

	// The back button closes the gallery. A link to an anchor in an HTML item adds an entry with another URL, and the gallery
	// stays open
	const onPopstate = () => {
		if (history.state?.bp !== historyId && location.href === historyUrl) {
			// The entry is left, the next gallery of an open call made while closing adds its own
			historyId = 0;

			close();
		}
	};

	// Drop the history entry that the gallery added. Not when it is left already, such as for an anchor in an HTML item, or
	// an entry of another gallery is the current one
	const dropEntry = () => {
		history.state?.bp === historyId && history.back();
		historyId = 0;
	};

	const close = () => {
		if (!items || closing) {
			return;
		}

		$$invalidate(17, closing = 1);
		opts.onClose?.(container, activeItem);
		window.removeEventListener('keydown', onKeydown, true);

		// Closed without the back button, drop the history entry. The gallery of an open call made while closing takes it
		// or drops it, the popstate of a history.back() now would close that gallery
		if (!pendingOptions) {
			dropEntry();
		}

		// No slide yet when closed in the same tick as opened
		slide && zoom(slide, 'bp-out');

		// Remove the gallery once the slide has finished its outro
		afterAnimations(slide, () => $$invalidate(0, items = null));
	};

	// Run a callback once the animations of a node are finished, right away if it has none
	// A cancelled animation, such as of a slide that a change removes during the close, runs it too
	const afterAnimations = (node, callback) => Promise.all(node?.getAnimations().map(animation => animation.finished) || []).then(callback, callback);

	const prev = () => setPosition(position - 1);
	const next = () => setPosition(position + 1);

	const setPosition = index => {
		// No items while closed, and the item stays during the outro
		if (!items || closing) {
			return;
		}

		const nextPosition = getNextPosition(index);
		movement = index - position;

		if (nextPosition !== position) {
			$$invalidate(6, position = nextPosition);
			opts.onUpdate?.(container, items[position]);
		}
	};

	// Get the next gallery position
	const getNextPosition = index => (index % items.length + items.length) % items.length;

	// Handle the keyboard events
	const onKeydown = e => {
		const { key, shiftKey, target } = e;

		if (!isGalleryKey(e, opts, container)) {
			return;
		}

		// The zoomed image pans with the arrows instead, a text field in an HTML item moves its caret, and a focused video or
		// audio item seeks
		const arrows = !zoomed && !target.isContentEditable && !(/^(INPUT|TEXTAREA|SELECT|VIDEO|AUDIO)$/).test(target.tagName);

		if (key === 'Escape') {
			!opts.persistent && close();
		} else if (key === 'ArrowRight' && arrows) {
			next();
		} else if (key === 'ArrowLeft' && arrows) {
			prev();
		} else if (key === ' ' && target === container) {
			// Space zooms an image in and out as a click does, and plays or pauses a video or audio. A focused control, such as
			// a button or a player, keeps its own Space action. The last player is the one of the active item while it slides in
			if (activeItem.type === 'image') {
				$$invalidate(8, activeItem.zoom = !activeItem.zoom, activeItem);
			} else if (activeItem.sources) {
				const media = [...container.querySelectorAll('video,audio')].pop();
				media.paused ? media.play() : media.pause();
			}
		} else if (key === 'Tab') {
			// Trap the focus on tab press
			const { activeElement } = document;

			// Allow browser to handle tab into video controls only
			if (shiftKey || !activeElement.controls) {
				e.preventDefault();
				const tabbable = [...(opts.focusWrap || container).querySelectorAll('*')].filter(node => node.tabIndex >= 0);
				let index = tabbable.indexOf(activeElement);

				// From the container itself, Tab goes to the first control and Shift+Tab to the last
				index = (index < 0 && shiftKey ? 0 : index) + tabbable.length;

				// Hidden and disabled nodes have a tabIndex too, but can't take the focus, so the next one is tried
				for (let step = 1; step <= tabbable.length && document.activeElement === activeElement; step++) {
					tabbable[(index + (shiftKey ? -step : step)) % tabbable.length].focus();
				}
			}
		} else {
			return;
		}

		// The page doesn't get the keys the gallery uses, such as the arrows of a slider under it
		e.stopPropagation();
	};

	// The focus stays in the upper gallery. Tab moves it out of the controls of a video or audio, as the keydown handler
	// lets the browser move it into them
	const onFocusin = ({ target }) => !closing && getUpperGallery() === container && !(opts.focusWrap || container).contains(target) && container.focus({ preventScroll: true });

	// Normalize a gallery item
	const prepareItem = item => {
		// Work on a copy, the gallery adds its own fields and the caller's objects stay as they are
		item = item instanceof HTMLElement
		? { element: item, ...item.dataset }
		: { ...item };

		// Data attributes pass these as JSON
		['sources', 'tracks', 'attr'].forEach(key => {
			if (typeof item[key] === 'string') {
				item[key] = JSON.parse(item[key]);
			}
		});

		// An empty list is no sources, the player reads the first one
		if (!item.sources?.[0]) {
			delete item.sources;
		}

		// Data attributes pass the size as a string, also with a unit, such as "800px"
		item.width = parseFloat(item.width) || undefined;

		item.height = parseFloat(item.height) || undefined;

		// A copy too, the gallery writes the image src, srcset and sizes into it
		item.attr = { ...item.attr };

		let link = item.link = item.link || item.element?.href, type = item.type;

		if (item.sources) {
			item.type = type === 'audio' || (/^audio/).test(item.sources[0].type)
			? 'audio'
			: 'video';
		} else if (item.html != null) {
			item.type = 'html';
		} else if (!link) {
			return false;
		} else if (type === 'video' || type === 'audio') {
			// A set type shows the link as it is, without detection
			item.sources = [{ src: link }];
		} else if (type !== 'image' && type !== 'iframe' && !parseLink(link, item)) {
			return false;
		}

		item.download = parseDownload(item);
		return (!opts.types || opts.types.includes(item.type)) && parseThumbnail(item);
	};

	// URL of the download link, a set URL or the largest image of a srcset or the first video or audio source
	const parseDownload = ({ download, link, type, sources }) => {
		// Data attributes pass true and false as strings
		if (download == null
		? !opts.download
		: download + '' == 'false') {
			return '';
		}

		if (download && download + '' != 'true') {
			return download;
		}

		if (type === 'image') {
			let max = 0;

			for (const { url, value } of parseSrcset(decodeSrcset(link))) {
				if (value > max) {
					max = value;
					link = url;
				}
			}

			return link;
		}

		return sources?.[0].src || '';
	};

	// The href of a link encodes the spaces of a srcset. Only these, other escapes such as %23 are part of the URL
	const decodeSrcset = link => (/\s/).test(link) ? link : link.replace(/%20/g, ' ');

	// The candidates of a srcset, also with no space after a comma, and with a density such as 1.5x. A comma inside a URL
	// stays in it
	const parseSrcset = srcset => Array.from(srcset.matchAll(/(?:^|,)\s*(\S+)\s+(\d*\.?\d+)([wx])/g), ([,url, value, type]) => ({ url, value: +value, type }));

	// Parse the link and detect the content type
	const parseLink = (link, item) => {
		// Also matches the first candidate of a srcset, and a data URL of an image
		let match = link.match(/^data:image\/|\.(?:jpe?g|jfif|png|gif|bmp|webp|avif|svg|tiff|ico)(?:[?#]\S*)?(?:\s|$)/i);

		if (match) {
			item.type = 'image';
			return item;
		}

		// HTML5 video and audio, the first group holds a video extension. The source has no type: with one source, a type
		// only makes the browser skip a file that it can play, such as an H.264 .mov in Chrome
		match = link.match(/\.(?:(mp4|m4v|mpeg|mov|ogv|webm|avi|h264)|(mp3|wav|ogg|oga|m4a|aac|flac|opus|wma|weba|mid))([?#].*)?$/i);

		if (match) {
			item.type = match[1] ? 'video' : 'audio';
			item.sources = [{ src: link }];
			return item;
		}

		// YouTube Video, the host is matched from the start, so a link with youtube.com in its path or query is not one
		// The path is the video ID, or videoseries or none for a playlist, and its list goes with the other parameters
		match = link.match(/^https?:\/\/([\w-]+\.)*(?:youtube(-nocookie)?\.com|youtu\.be)\/(?:watch\?(?:.*&)?v=|v\/|u\/|shorts\/|live\/|embed\/?)?(videoseries(?=\?(?:.*&)?list=)|(?=\?listType=.*&list=)|([\w-]{11}))/i);

		if (match) {
			// The privacy-enhanced mode stays on the youtube-nocookie.com host
			let sourceURL = new URL(link),
				targetURL = new URL('https://www.youtube' + (match[2] || '') + '.com/embed/' + match[3] + '?autoplay=1&playsinline=1&controls=1&rel=0&enablejsapi=1');

			// Shorts are portrait, 9:16
			if (!item.width && (/\/shorts\//).test(link)) {
				item.width = 1080;
				item.height = 1920;
			}

			sourceURL.searchParams.delete('v');

			for (let [key, value] of sourceURL.searchParams) {
				// The start time, such as 90, 90s, 1m30s or 1h2m3s
				const time = key === 't' && value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);

				if (time) {
					key = 'start';
					value = 3600 * (time[1] | 0) + 60 * (time[2] | 0) + (time[3] | 0);
				}

				targetURL.searchParams.set(key, value);
			}

			// A playlist has no thumbnail of its own
			item.thumb = item.thumb || match[4] && 'https://i.ytimg.com/vi/' + match[4] + '/mqdefault.jpg';

			return iframe(item, targetURL);
		}

		// Vimeo Video, also in a channel or a group. The hash after the ID or in h is the one of a private video
		match = link.match(/^https?:\/\/([\w-]+\.)*vimeo\.com\/(?:[^?#]*?\/)?(\d+)(?:(?:\/|\?h=)([\da-f]+))?/i);

		if (match) {
			let videoID = match[2],
				sourceURL = new URL(link),
				targetURL = new URL('https://player.vimeo.com/video/' + videoID + '?autoplay=1&playsinline=1');

			for (let [key, value] of sourceURL.searchParams) {
				targetURL.searchParams.set(key, value);
			}

			if (match[3]) {
				targetURL.searchParams.set('h', match[3]);
			} else {
				item.thumb = item.thumb || 'https://vumbnail.com/' + videoID + '.jpg';
			}

			if (sourceURL.hash.startsWith('#t=')) {
				targetURL.hash = sourceURL.hash;
			}

			return iframe(item, targetURL);
		}

		// SoundCloud Widget
		match = link.match(/^(https?:\/\/)?(www\.)?(m\.)?soundcloud\.com\/([a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+.*)$/);

		if (match) {
			return iframe(item, 'https://w.soundcloud.com/player/?auto_play=1&visual=1&hide_related=1&show_comments=0&url=' + encodeURIComponent(link));
		}

		// Google Drive, Dropbox, and PDF files
		match = link.match(/(drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+))|(dropbox\.com\/s\/)|(\.pdf($|\?|#))/i);

		if (match) {
			if (match[2]) {
				// Google Drive
				item.link = `https://drive.google.com/file/d/${match[2]}/preview`;
			} else if (match[3]) {
				// Dropbox
				const url = new URL(link);

				url.searchParams.set('raw', '1');
				url.searchParams.delete('dl');
				item.link = url.toString();
			}

			if (!item.width || !item.height) {
				item.width = containerWidth;
				item.height = containerHeight;
			}

			return iframe(item, item.link);
		}

		return false;
	};

	// Show an item in an iframe, with the link as a string
	const iframe = (item, link) => {
		item.type = 'iframe';
		item.link = link + '';
		return item;
	};

	// Parse a thumbnail, update dimensions, and the fit option
	const parseThumbnail = item => {
		// An image element wins over the element when it is an image, then the image inside it, then a thumbnail URL
		let thumbLink = item.thumb,
			element = item.element,
			thumbElement = thumbLink instanceof HTMLImageElement
			? thumbLink
			: (element?.matches('img'))
				? element
				: element?.querySelector('img');

		item.source = element;
		item.thumb = false;

		if (thumbElement) {
			item.thumb = item.source = thumbElement;
			item.alt = item.alt || thumbElement.alt;
			setDimensions(item, thumbElement);
		} else if (thumbLink) {
			// The open does not load the thumbnails of all items, each loads once its item shows. Its ratio is the size of an
			// item without one, and the loading screen shows the same file
			item.thumb = {
				src: thumbLink,
				load() {
					this.load = null;
					const image = new Image();
					image.onload = () => setDimensions(item, image);
					image.src = thumbLink;
				}
			};
		} else if (item.type === 'image' && opts.thumbs && element?.href) {
			// A link without a thumbnail shows the full image in the strip, loaded lazily
			item.thumb = { src: element.href };
		}

		return item;
	};

	// Set item dimensions based on a thumbnail image if not already specified
	const setDimensions = (item, thumb) => {
		// A thumbnail that is not loaded yet, such as a lazy one, has no size
		if ((!item.width || !item.height) && thumb.naturalWidth) {
			const dimensions = calculateDimensions({
				width: thumb.naturalWidth,
				height: thumb.naturalHeight
			});

			[item.width, item.height] = dimensions;
			item.scaled = 1;

			// The thumbnails of the other items load too, only the shown item changes the size on the screen
			if (item === activeItem) {
				$$invalidate(15, activeDimensions = dimensions);
			}
		}
	};

	const readGap = () => gap = parseInt(getComputedStyle(container).getPropertyValue('--bp-stage-gap')) || 0;

	// Calculate width and height to fit inside a container
	const calculateDimensions = ({ width = 1920, height = 1080 }) => {
		const ratio = (opts.scale ?? 1) * Math.min((containerWidth - 2 * gap) / width, (containerHeight - 2 * gap) / height);

		// Round number so we don't use a float as the sizes attribute
		return [Math.round(width * ratio), Math.round(height * ratio)];
	};

	// Preloads images for previous and next items in gallery
	const preloadNext = () => {
		if (items) {
			loadImage(items[getNextPosition(position + 1)]);
			loadImage(items[getNextPosition(position - 1)]);
		}
	};

	// Load and decode the image of an item once, the slide that shows a preloaded item gets the same promise
	const loadImage = item => {
		if (item.type !== 'image' || item.preload) {
			return item.preload;
		}

		let image = new Image(), src = decodeSrcset(item.link), factor = 1;
		const parts = parseSrcset(src);

		if (parts.length) {
			const width = calculateDimensions(item)[0];
			parts.sort((a, b) => a.value - b.value);

			// The first candidate sharp enough for the shown size and the screen density, the same one the browser
			// picks from the srcset and sizes of the shown image, so the file is loaded once
			const largest = parts.at(-1);

			const match = parts.find(c => c.value >= (c.type === 'w' ? width : 1) * (window.devicePixelRatio || 1)) || largest;

			// The full size is the one of the largest candidate, so the zoom can reach it
			factor = largest.value / match.value;

			item.attr.srcset = src;
			item.attr.sizes = item.sizes || opts.sizes || width + 'px';
			src = match.url;
		}

		image.src = item.attr.src = src;

		return item.preload = image.decode().then(() => {
			// The size from a thumbnail is only a ratio, and an item without one takes it from the image
			if ((item.scaled || !item.width || !item.height) && image.naturalWidth) {
				item.width = Math.round(image.naturalWidth * factor);
				item.height = Math.round(image.naturalHeight * factor);

				if (item === activeItem) {
					$$invalidate(15, activeDimensions = calculateDimensions(item));
				}
			}
		}).catch(() => {
			
		});
	};

	// Set the state a slide animates from or to, the CSS animations of the classes do the rest
	const animate = (node, className, transform, css = '--bp-opacity:0') => {
		node.className = 'bp-slide ' + className;
		node.style.cssText = `--bp-transform:${transform};${css}`;
	};

	// Zoom the slide out of the thumbnail on open and back into it on close, or fade it up with zoom: false
	const zoom = (node, className) => {
		if (opts.zoom) {
			// The slide is centered in the stage, not in the screen. Its size is known: the gallery measures it on mount, and
			// the ruler observer keeps it
			const stage = ruler.getBoundingClientRect();

			// No HTML is shown in a stage with no size
			const content = activeItem.type === 'html' && node.querySelector('.bp-html')?.firstElementChild;

			const dimensions = content
			? [content.clientWidth, content.clientHeight]
			: activeDimensions;

			// Rect is the content box of the trigger element, the image is drawn inside its padding and border
			const source = activeItem.source || focusTrigger;

			const style = window.getComputedStyle(source);

			// The object-fit of the thumbnail, read for the active item only, not for each item on open
			const fit = activeItem.fit || style.objectFit;

			const edge = side => parseFloat(style['padding' + side]) + parseFloat(style['border' + side + 'Width']);
			const bounds = source.getBoundingClientRect();

			const rect = {
				left: bounds.left + edge('Left'),
				top: bounds.top + edge('Top'),
				width: bounds.width - edge('Left') - edge('Right'),
				height: bounds.height - edge('Top') - edge('Bottom')
			};

			// A hidden or removed thumbnail, or an item with no size, has no scale to zoom from, the slide fades instead. A
			// removed one has a NaN size. The comparison stays a > 0: the unsafe_comps option of terser compiles !(a > 0) to
			// a <= 0, which is false for NaN
			if (Math.min(rect.width, rect.height, ...dimensions) > 0) {
				let scaleWidth = rect.width / dimensions[0];
				let scaleHeight = rect.height / dimensions[1];
				let css = '--bp-opacity:1';
				let crop = '';

				if (fit === 'cover') {
					scaleWidth = scaleHeight = Math.max(scaleHeight, scaleWidth);

					// Crop the item like the thumbnail: the slide shifts by the crop and clips, the crop inside it shifts back
					// twice as far and clips, and its content returns in place. Translates stay on the compositor, an animated
					// clip-path repaints every frame. The percents follow the slide when the stage gap comes back after the zoom
					css += `;--bp-crop-x:calc(50% - ${rect.width / scaleWidth / 2}px);--bp-crop-y:calc(50% - ${rect.height / scaleHeight / 2}px)`;

					crop = ' translate(var(--bp-crop-x),var(--bp-crop-y))';
					className += ' bp-clip';
				} else if (fit === 'contain') {
					scaleWidth = scaleHeight = Math.min(scaleHeight, scaleWidth);
				}

				// From the center of the stage to the center of the thumbnail
				const x = rect.left - stage.left - (containerWidth - rect.width) / 2;

				const y = rect.top - stage.top - (containerHeight - rect.height) / 2;
				return animate(node, className, `translate(${x}px,${y}px) scale(${scaleWidth},${scaleHeight})` + crop, css);
			}
		}

		animate(node, className, `translateY(${className ? -10 : 10}px)`);
	};

	// Animate the slides, the first one zooms in, the next ones slide in and out
	const slideActions = node => {
		if (slide) {
			animate(node, 'bp-nav', `translate(${movement > 0 ? 20 : -20}px)`);
		} else {
			// Deferred so the item is measured after the container action has shown the dialog and called onOpen. Not when
			// onOpen has closed the gallery, the outro is set then
			queueMicrotask(() => closing || zoom(node, ''));
		}

		slide = node;

		return {
			destroy() {
				// The next item and the next open are not zoomed. The image sets the value itself, an item of another type
				// would keep the value, and the gallery would read the gap of a zoomed one on open
				$$invalidate(16, zoomed = 0);

				// The items are removed on close, the slide leaves with the gallery then
				if (items) {
					// Svelte has removed the previous slide, put it back under the new one until it slides out
					animate(node, 'bp-nav bp-out', `translate(${movement > 0 ? -20 : 20}px)`);

					ruler.parentNode.prepend(node);
					afterAnimations(node, () => node.remove());
				}
			}
		};
	};

	// Provides object w/ needed funcs / data to child components
	const getChildProps = () => ({
		preloadNext,
		setDimensions,
		activeItem,
		loadImage,
		// A getter, the first item is made before the gallery element mounts
		get container() {
			return container;
		},
		setZoomed: value => $$invalidate(16, zoomed = value),
		close,
		opts,
		prev,
		next
	});

	// Name a control, the labels stay the same while the gallery is open
	const label = (node, key) => {
		node.title = labels[key];
		node.setAttribute('aria-label', labels[key]);
	};

	// Process the gallery mount and destroy
	const containerActions = node => {
		container = node;

		// Set here for the reason of the attributes below, and before the measure, as the class sizes the stage
		node.classList.add('bp-wrap');

		// Measure the stage, which the thumbnails, the offsets and the scroll lock make other than the target, and read the gap
		// of the gallery, which can set its own, such as none when inline. The image of the item loads after this, see onMount
		// in image.svelte, so it picks the srcset candidate the browser picks
		$$invalidate(7, { width: containerWidth, height: containerHeight } = ruler.getBoundingClientRect(), containerWidth, $$invalidate(14, containerHeight));

		readGap();
		$$invalidate(15, activeDimensions = calculateDimensions(activeItem));

		// Set here, attributes on svelte:element compile to a much larger spread
		node.tabIndex = -1;

		node.setAttribute('role', inline ? 'region' : 'dialog');
		node.setAttribute('aria-modal', !inline);
		node.setAttribute('aria-label', labels.gallery);

		// Use the top layer API for proper modal behavior
		if (dialog) {
			// Keep the dialog open on Escape, the keydown handler closes it with the outro animation
			node.oncancel = e => e.preventDefault();

			node[inline ? 'show' : 'showModal']();
		}

		opts.onOpen?.(container, activeItem);

		// Don't use keyboard events for inline galleries
		if (!inline) {
			// In the capture phase, so the gallery gets the keys before the page
			window.addEventListener('keydown', onKeydown, true);

			window.addEventListener('focusin', onFocusin);

			// Keyboard and screen reader users start inside the gallery
			node.focus({ preventScroll: true });

			// The back button closes the gallery instead of leaving the page. The gallery of an open call made while closing
			// keeps the entry of the last one. Not when closed in the same tick as opened, the close has already passed its
			// history.back()
			if (opts.history && !closing) {
				if (!historyId) {
					historyUrl = location.href;
					history.pushState({ bp: historyId = Math.random() }, '');
				}

				window.addEventListener('popstate', onPopstate);
			}
		}

		return {
			destroy() {
				// Close the dialog properly to remove it from top layer. Before the focus goes back, the page is inert while
				// the modal dialog is open
				if (node.open) {
					node.close();
				}

				window.removeEventListener('keydown', onKeydown, true);
				window.removeEventListener('focusin', onFocusin);
				window.removeEventListener('popstate', onPopstate);
				focusTrigger?.focus({ preventScroll: true });
				$$invalidate(17, closing = 0);
				slide = null;

				// The page stays locked while another gallery is open, the node of this one is removed already
				if (!getUpperGallery()) {
					html.classList.remove('bp-lock');

					if (pagePadding != null) {
						html.style.paddingRight = pagePadding;
						pagePadding = null;
					}
				}

				opts.onClosed?.(container, activeItem);

				if (pendingOptions) {
					open(pendingOptions);
					pendingOptions = null;
				}
			}
		};
	};

	// Ruler is required to get accurate dimensions and handle container resize
	const rulerActions = node => {
		ruler = node;

		const rulerObserver = new ResizeObserver(entries => {
				// Fit the active item to the new stage size
				const { width, height } = entries[0].contentRect;

				if (width !== containerWidth || height !== containerHeight) {
					$$invalidate(7, containerWidth = width);
					$$invalidate(14, containerHeight = height);

					// A zoomed gallery has no gap, the item keeps the one it fits in once zoomed out
					zoomed || readGap();

					$$invalidate(15, activeDimensions = calculateDimensions(activeItem));
				}

				opts.onResize?.(container, activeItem);
			});

		rulerObserver.observe(node);

		return {
			destroy() {
				rulerObserver.disconnect();
			}
		};
	};

	const pointerdown_handler = e => $$invalidate(12, clickedEl = e.target);

	const click_handler = function (e) {
		// Only close if pressed and released on self. On click, not on pointerup, see onClick in image.svelte
		if (e.target === this && clickedEl === this) {
			!opts.persistent && close();
		}
	};

	$$self.$$set = $$props => {
		if ('items' in $$props) $$invalidate(0, items = $$props.items);
		if ('target' in $$props) $$invalidate(24, target = $$props.target);
		if ('dialog' in $$props) $$invalidate(1, dialog = $$props.dialog);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty[0] & /*items, position, activeItem*/ 321) {
			// Update the active item and dimensions on position change
			if (items?.[position]) {
				$$invalidate(8, activeItem = items[position]);
				$$invalidate(15, activeDimensions = calculateDimensions(activeItem));

				// Load the thumbnail URL once the item shows, see parseThumbnail
				activeItem.thumb?.load?.();
			}
		}

		if ($$self.$$.dirty[0] & /*containerWidth*/ 128) {
			$$invalidate(10, smallScreen = containerWidth < 769);
		}
	};

	return [
		items,
		dialog,
		close,
		prev,
		next,
		setPosition,
		position,
		containerWidth,
		activeItem,
		opts,
		smallScreen,
		inline,
		clickedEl,
		labels,
		containerHeight,
		activeDimensions,
		zoomed,
		closing,
		tag,
		slideActions,
		getChildProps,
		label,
		containerActions,
		rulerActions,
		target,
		open,
		pointerdown_handler,
		click_handler
	];
}

class Bigger_picture extends SvelteComponent {
	constructor(options) {
		super();

		init(
			this,
			options,
			instance,
			create_fragment,
			not_equal,
			{
				items: 0,
				target: 24,
				dialog: 1,
				open: 25,
				close: 2,
				prev: 3,
				next: 4,
				setPosition: 5
			},
			null,
			[-1, -1]
		);
	}

	get items() {
		return this.$$.ctx[0];
	}



	get target() {
		return this.$$.ctx[24];
	}



	get dialog() {
		return this.$$.ctx[1];
	}



	get open() {
		return this.$$.ctx[25];
	}

	get close() {
		return this.$$.ctx[2];
	}

	get prev() {
		return this.$$.ctx[3];
	}

	get next() {
		return this.$$.ctx[4];
	}

	get setPosition() {
		return this.$$.ctx[5];
	}
}

// Initializes BiggerPicture and assigns provided options to a props property
function biggerPicture (options) {
	options = { target: document.body, ...options };
	options = { ...options, props: options };
	// Svelte 5 apps compiling the source mount components with a function, Svelte 4 uses classes
	return new Bigger_picture(options)
}

export { biggerPicture as default };
