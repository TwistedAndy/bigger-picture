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

/** @returns {boolean} */
function safe_not_equal(a, b) {
	return a != a ? b == b : a !== b || (a && typeof a === 'object') || typeof a === 'function';
}

/** @returns {boolean} */
function not_equal(a, b) {
	return a != a ? b == b : a !== b;
}

/** @returns {boolean} */
function is_empty(obj) {
	return Object.keys(obj).length === 0;
}

function subscribe(store, ...callbacks) {
	if (store == null) {
		for (const callback of callbacks) {
			callback(undefined);
		}
		return noop;
	}
	const unsub = store.subscribe(...callbacks);
	return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
}

/** @returns {void} */
function component_subscribe(component, store, callback) {
	component.$$.on_destroy.push(subscribe(store, callback));
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
 * List of attributes that should always be set through the attr method,
 * because updating them through the property setter doesn't work reliably.
 * In the example of `width`/`height`, the problem is that the setter only
 * accepts numeric values, but the attribute can also be set to a string like `50%`.
 * If this list becomes too big, rethink this approach.
 */
const always_set_through_set_attribute = ['width', 'height'];

/**
 * @param {Element & ElementCSSInlineStyle} node
 * @param {{ [x: string]: string }} attributes
 * @returns {void}
 */
function set_attributes(node, attributes) {
	// @ts-ignore
	const descriptors = Object.getOwnPropertyDescriptors(node.__proto__);
	for (const key in attributes) {
		if (attributes[key] == null) {
			node.removeAttribute(key);
		} else if (key === 'style') {
			node.style.cssText = attributes[key];
		} else if (key === '__value') {
			/** @type {any} */ (node).value = node[key] = attributes[key];
		} else if (
			descriptors[key] &&
			descriptors[key].set &&
			always_set_through_set_attribute.indexOf(key) === -1
		) {
			node[key] = attributes[key];
		} else {
			attr(node, key, attributes[key]);
		}
	}
}

/**
 * @param {Record<string, unknown>} data_map
 * @returns {void}
 */
function set_custom_element_data_map(node, data_map) {
	Object.keys(data_map).forEach((key) => {
		set_custom_element_data(node, key, data_map[key]);
	});
}

/**
 * @returns {void} */
function set_custom_element_data(node, prop, value) {
	const lower = prop.toLowerCase(); // for backwards compatibility with existing behavior we do lowercase first
	if (lower in node) {
		node[lower] = typeof node[lower] === 'boolean' && value === '' ? true : value;
	} else if (prop in node) {
		node[prop] = typeof node[prop] === 'boolean' && value === '' ? true : value;
	} else {
		attr(node, prop, value);
	}
}

/**
 * @param {string} tag
 */
function set_dynamic_element_data(tag) {
	return /-/.test(tag) ? set_custom_element_data_map : set_attributes;
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

let current_component;

/** @returns {void} */
function set_current_component(component) {
	current_component = component;
}

const dirty_components = [];
const binding_callbacks = [];

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

/** @returns {void} */
function add_render_callback(fn) {
	render_callbacks.push(fn);
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
	const saved_component = current_component;
	do {
		// first, call beforeUpdate functions
		// and update components
		try {
			while (flushidx < dirty_components.length) {
				const component = dirty_components[flushidx];
				flushidx++;
				set_current_component(component);
				update(component.$$);
			}
		} catch (e) {
			// reset dirty state to not end up in a deadlocked state and then rethrow
			dirty_components.length = 0;
			flushidx = 0;
			throw e;
		}
		set_current_component(null);
		dirty_components.length = 0;
		flushidx = 0;
		while (binding_callbacks.length) binding_callbacks.pop()();
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
	set_current_component(saved_component);
}

/** @returns {void} */
function update($$) {
	if ($$.fragment !== null) {
		$$.update();
		run_all($$.before_update);
		const dirty = $$.dirty;
		$$.dirty = [-1];
		$$.fragment && $$.fragment.p($$.ctx, dirty);
		$$.after_update.forEach(add_render_callback);
	}
}

/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 * @param {Function[]} fns
 * @returns {void}
 */
function flush_render_callbacks(fns) {
	const filtered = [];
	const targets = [];
	render_callbacks.forEach((c) => (fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c)));
	targets.forEach((c) => c());
	render_callbacks = filtered;
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

// keyed each functions:

/** @returns {void} */
function destroy_block(block, lookup) {
	block.d(1);
	lookup.delete(block.key);
}

/** @returns {any[]} */
function update_keyed_each(
	old_blocks,
	dirty,
	get_key,
	dynamic,
	ctx,
	list,
	lookup,
	node,
	destroy,
	create_each_block,
	next,
	get_context
) {
	let o = old_blocks.length;
	let n = list.length;
	let i = o;
	const old_indexes = {};
	while (i--) old_indexes[old_blocks[i].key] = i;
	const new_blocks = [];
	const new_lookup = new Map();
	const deltas = new Map();
	const updates = [];
	i = n;
	while (i--) {
		const child_ctx = get_context(ctx, list, i);
		const key = get_key(child_ctx);
		let block = lookup.get(key);
		if (!block) {
			block = create_each_block(key, child_ctx);
			block.c();
		} else {
			// defer updates until all the DOM shuffling is done
			updates.push(() => block.p(child_ctx, dirty));
		}
		new_lookup.set(key, (new_blocks[i] = block));
		if (key in old_indexes) deltas.set(key, Math.abs(i - old_indexes[key]));
	}
	const will_move = new Set();
	const did_move = new Set();
	/** @returns {void} */
	function insert(block) {
		transition_in(block, 1);
		block.m(node, next);
		lookup.set(block.key, block);
		next = block.first;
		n--;
	}
	while (o && n) {
		const new_block = new_blocks[n - 1];
		const old_block = old_blocks[o - 1];
		const new_key = new_block.key;
		const old_key = old_block.key;
		if (new_block === old_block) {
			// do nothing
			next = new_block.first;
			o--;
			n--;
		} else if (!new_lookup.has(old_key)) {
			// remove old block
			destroy(old_block, lookup);
			o--;
		} else if (!lookup.has(new_key) || will_move.has(new_key)) {
			insert(new_block);
		} else if (did_move.has(old_key)) {
			o--;
		} else if (deltas.get(new_key) > deltas.get(old_key)) {
			did_move.add(new_key);
			insert(new_block);
		} else {
			will_move.add(old_key);
			o--;
		}
	}
	while (o--) {
		const old_block = old_blocks[o];
		if (!new_lookup.has(old_block.key)) destroy(old_block, lookup);
	}
	while (n) insert(new_blocks[n - 1]);
	run_all(updates);
	return new_blocks;
}

/** @returns {void} */
function create_component(block) {
	block && block.c();
}

/** @returns {void} */
function mount_component(component, target, anchor) {
	const { fragment, after_update } = component.$$;
	fragment && fragment.m(target, anchor);
	// onMount happens before the initial afterUpdate
	add_render_callback(() => {
		const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
		// if the component was destroyed immediately
		// it will update the `$$.on_destroy` reference to `null`.
		// the destructured on_destroy may still reference to the old array
		if (component.$$.on_destroy) {
			component.$$.on_destroy.push(...new_on_destroy);
		} else {
			// Edge case - component was destroyed immediately,
			// most likely as a result of a binding initialising
			run_all(new_on_destroy);
		}
		component.$$.on_mount = [];
	});
	after_update.forEach(add_render_callback);
}

/** @returns {void} */
function destroy_component(component, detaching) {
	const $$ = component.$$;
	if ($$.fragment !== null) {
		flush_render_callbacks($$.after_update);
		run_all($$.on_destroy);
		$$.fragment && $$.fragment.d(detaching);
		// TODO null out other refs, including component.$$ (but need to
		// preserve final state?)
		$$.on_destroy = $$.fragment = null;
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
	const parent_component = current_component;
	set_current_component(component);
	/** @type {import('./private.js').T$$} */
	const $$ = (component.$$ = {
		fragment: null,
		ctx: [],
		// state
		props,
		update: noop,
		not_equal,
		bound: {},
		// lifecycle
		on_mount: [],
		on_destroy: [],
		on_disconnect: [],
		before_update: [],
		after_update: [],
		context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
		// everything else
		callbacks: {},
		dirty,
		skip_bound: false,
		root: options.target || parent_component.$$.root
	});
	append_styles && append_styles($$.root);
	let ready = false;
	$$.ctx = instance
		? instance(component, options.props || {}, (i, ret, ...rest) => {
				const value = rest.length ? rest[0] : ret;
				if ($$.ctx && not_equal($$.ctx[i], ($$.ctx[i] = value))) {
					if (!$$.skip_bound && $$.bound[i]) $$.bound[i](value);
					if (ready) make_dirty(component, i);
				}
				return ret;
		  })
		: [];
	$$.update();
	ready = true;
	run_all($$.before_update);
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
	set_current_component(parent_component);
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
	$on(type, callback) {
		if (!is_function(callback)) {
			return noop;
		}
		const callbacks = this.$$.callbacks[type] || (this.$$.callbacks[type] = []);
		callbacks.push(callback);
		return () => {
			const index = callbacks.indexOf(callback);
			if (index !== -1) callbacks.splice(index, 1);
		};
	}

	/**
	 * @param {Partial<Props>} props
	 * @returns {void}
	 */
	$set(props) {
		if (this.$$set && !is_empty(props)) {
			this.$$.skip_bound = true;
			this.$$set(props);
			this.$$.skip_bound = false;
		}
	}
}

/**
 * @typedef {Object} CustomElementPropDefinition
 * @property {string} [attribute]
 * @property {boolean} [reflect]
 * @property {'String'|'Boolean'|'Number'|'Array'|'Object'} [type]
 */

// generated during release, do not modify

const PUBLIC_VERSION = '4';

(window._bp || (window._bp = { v: new Set() })).v.add(PUBLIC_VERSION);

const subscriber_queue = [];

/**
 * Create a `Writable` store that allows both updating and reading by subscription.
 *
 * https://svelte.dev/docs/svelte-store#writable
 * @template T
 * @param {T} [value] initial value
 * @param {import('./public.js').StartStopNotifier<T>} [start]
 * @returns {import('./public.js').Writable<T>}
 */
function writable(value, start = noop) {
	/** @type {import('./public.js').Unsubscriber} */
	let stop;
	/** @type {Set<import('./private.js').SubscribeInvalidateTuple<T>>} */
	const subscribers = new Set();
	/** @param {T} new_value
	 * @returns {void}
	 */
	function set(new_value) {
		if (safe_not_equal(value, new_value)) {
			value = new_value;
			if (stop) {
				// store is ready
				const run_queue = !subscriber_queue.length;
				for (const subscriber of subscribers) {
					subscriber[1]();
					subscriber_queue.push(subscriber, value);
				}
				if (run_queue) {
					for (let i = 0; i < subscriber_queue.length; i += 2) {
						subscriber_queue[i][0](subscriber_queue[i + 1]);
					}
					subscriber_queue.length = 0;
				}
			}
		}
	}

	/**
	 * @param {import('./public.js').Updater<T>} fn
	 * @returns {void}
	 */
	function update(fn) {
		set(fn(value));
	}

	/**
	 * @param {import('./public.js').Subscriber<T>} run
	 * @param {import('./private.js').Invalidator<T>} [invalidate]
	 * @returns {import('./public.js').Unsubscriber}
	 */
	function subscribe(run, invalidate = noop) {
		/** @type {import('./private.js').SubscribeInvalidateTuple<T>} */
		const subscriber = [run, invalidate];
		subscribers.add(subscriber);
		if (subscribers.size === 1) {
			stop = start(set, update) || noop;
		}
		run(value);
		return () => {
			subscribers.delete(subscriber);
			if (subscribers.size === 0 && stop) {
				stop();
				stop = null;
			}
		};
	}
	return { set, update, subscribe };
}

const getThumbBackground = (activeItem) => activeItem.thumb ? `url(${activeItem.thumb.src})` : null;

// Adds attributes to the given node based on the provided object
const addAttributes = (node, attributes) => {
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

/* src\components\thumbs.svelte generated by Svelte v4.2.20 */

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[21] = list[i];
	return child_ctx;
}

// (126:3) {#each items as item (item.i)}
function create_each_block(key_1, ctx) {
	let button;
	let button_title_value;
	let button_aria_label_value;
	let mounted;
	let dispose;

	function click_handler() {
		return /*click_handler*/ ctx[13](/*item*/ ctx[21]);
	}

	return {
		key: key_1,
		first: null,
		c() {
			button = element("button");
			attr(button, "title", button_title_value = /*item*/ ctx[21].caption);
			attr(button, "aria-label", button_aria_label_value = /*item*/ ctx[21].alt || /*item*/ ctx[21].caption || `${/*label*/ ctx[3]} ${/*item*/ ctx[21].i + 1}`);
			toggle_class(button, "active", /*item*/ ctx[21].i === /*position*/ ctx[1]);
			set_style(button, "background-image", getThumbBackground(/*item*/ ctx[21]));
			this.first = button;
		},
		m(target, anchor) {
			insert(target, button, anchor);

			if (!mounted) {
				dispose = [
					listen(button, "focus", /*focus_handler*/ ctx[12]),
					listen(button, "click", click_handler)
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (dirty & /*items*/ 1 && button_title_value !== (button_title_value = /*item*/ ctx[21].caption)) {
				attr(button, "title", button_title_value);
			}

			if (dirty & /*items, label*/ 9 && button_aria_label_value !== (button_aria_label_value = /*item*/ ctx[21].alt || /*item*/ ctx[21].caption || `${/*label*/ ctx[3]} ${/*item*/ ctx[21].i + 1}`)) {
				attr(button, "aria-label", button_aria_label_value);
			}

			if (dirty & /*items, position*/ 3) {
				toggle_class(button, "active", /*item*/ ctx[21].i === /*position*/ ctx[1]);
			}

			if (dirty & /*items*/ 1) {
				set_style(button, "background-image", getThumbBackground(/*item*/ ctx[21]));
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

function create_fragment$5(ctx) {
	let div2;
	let div1;
	let div0;
	let each_blocks = [];
	let each_1_lookup = new Map();
	let style_transform = `translateX(${/*thumbsTranslate*/ ctx[4]}px)`;
	let mounted;
	let dispose;
	let each_value = ensure_array_like(/*items*/ ctx[0]);
	const get_key = ctx => /*item*/ ctx[21].i;

	for (let i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context(ctx, each_value, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
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
					action_destroyer(/*thumbsActions*/ ctx[11].call(null, div0)),
					listen(div1, "pointerdown", /*pointerDown*/ ctx[8]),
					action_destroyer(/*thumbsActions*/ ctx[11].call(null, div2)),
					listen(div2, "pointermove", /*pointerMove*/ ctx[9]),
					listen(div2, "pointerup", /*pointerUp*/ ctx[10]),
					listen(div2, "pointercancel", /*pointerUp*/ ctx[10])
				];

				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (dirty & /*items, label, position, scrollToButton, hasDragged, setPosition*/ 207) {
				each_value = ensure_array_like(/*items*/ ctx[0]);
				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div0, destroy_block, create_each_block, null, get_each_context);
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

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].d();
			}

			mounted = false;
			run_all(dispose);
		}
	};
}

function instance$5($$self, $$props, $$invalidate) {
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

		let { left, right, width } = activeBtn.getBoundingClientRect();
		let margin = 3;
		let { offsetLeft } = activeBtn;

		if (left + width > thumbsPanelWidth) {
			$$invalidate(4, thumbsTranslate = boundTranslate(-offsetLeft - width + thumbsPanelWidth - margin));
		} else if (right - width < 0) {
			$$invalidate(4, thumbsTranslate = boundTranslate(-offsetLeft + margin));
		}

		initialTranslate = thumbsTranslate;
	};

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
		if (isPointerDown) {
			let dragAmount = -(pointerDownX - e.clientX);

			if (hasDragged) {
				$$invalidate(4, thumbsTranslate = boundTranslate(initialTranslate + dragAmount));
				dragPositions.push(e.clientX);
			} else {
				$$invalidate(6, hasDragged = Math.abs(dragAmount) > 5);
			}
		}
	};

	const pointerUp = () => {
		if (hasDragged) {
			dragPositions = dragPositions.slice(-3);

			if (dragPositions.length > 1) {
				let xDiff = dragPositions[0] - dragPositions.pop();

				if (Math.abs(xDiff) > 5) {
					$$invalidate(4, thumbsTranslate = boundTranslate(thumbsTranslate - xDiff * 5));
				}
			}
		}

		dragPositions = [];
		$$invalidate(5, isPointerDown = $$invalidate(6, hasDragged = false));
		initialTranslate = thumbsTranslate;
	};

	// Update dimensions on resize
	const thumbsActions = function (node) {
		thumbsPanel = node;

		const resizeObserver = new ResizeObserver(entries => {
				for (const entry of entries) {
					if (entry.target === thumbsPanel) {
						thumbsPanelWidth = entry.contentRect.width;
					} else {
						thumbsWidth = entry.contentRect.width;
					}
				}
			});

		resizeObserver.observe(node);

		return {
			destroy() {
				resizeObserver.unobserve(node);
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
		if ($$self.$$.dirty & /*position*/ 2) {
			// Scroll to an active position on external change
			if (position !== undefined) {
				setTimeout(() => scrollToButton());
			}
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
		scrollToButton,
		pointerDown,
		pointerMove,
		pointerUp,
		thumbsActions,
		focus_handler,
		click_handler
	];
}

class Thumbs extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance$5, create_fragment$5, not_equal, {
			items: 0,
			position: 1,
			setPosition: 2,
			label: 3
		});
	}
}

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
				dispose = listen(div, "animationend", /*animationend_handler*/ ctx[5]);
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

// (17:67) {#if $closing}
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

function create_fragment$4(ctx) {
	let if_block0_anchor;
	let if_block1_anchor;
	let if_block0 = !/*hidden*/ ctx[3] && create_if_block_1$2(ctx);
	let if_block1 = /*$closing*/ ctx[4] && create_if_block$2(ctx);

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

			if (/*$closing*/ ctx[4]) {
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

function instance$4($$self, $$props, $$invalidate) {
	let $closing,
		$$unsubscribe_closing = noop,
		$$subscribe_closing = () => ($$unsubscribe_closing(), $$unsubscribe_closing = subscribe(closing, $$value => $$invalidate(4, $closing = $$value)), closing);

	$$self.$$.on_destroy.push(() => $$unsubscribe_closing());
	let { activeItem } = $$props;
	let { loaded } = $$props;
	let { closing } = $$props;
	$$subscribe_closing();

	// True once the loader has faded out
	let hidden;

	const animationend_handler = e => $$invalidate(3, hidden = e.animationName === 'bp-fade-out');

	$$self.$$set = $$props => {
		if ('activeItem' in $$props) $$invalidate(0, activeItem = $$props.activeItem);
		if ('loaded' in $$props) $$invalidate(1, loaded = $$props.loaded);
		if ('closing' in $$props) $$subscribe_closing($$invalidate(2, closing = $$props.closing));
	};

	return [activeItem, loaded, closing, hidden, $closing, animationend_handler];
}

class Loading extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$4, create_fragment$4, not_equal, { activeItem: 0, loaded: 1, closing: 2 });
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
			attr(img, "sizes", img_sizes_value = /*activeItem*/ ctx[9].sizes || /*opts*/ ctx[10].sizes || `${/*sizes*/ ctx[2]}px`);
			attr(img, "alt", /*activeItem*/ ctx[9].alt);
		},
		m(target, anchor) {
			insert(target, img, anchor);

			if (!mounted) {
				dispose = [
					action_destroyer(/*addSrc*/ ctx[22].call(null, img)),
					listen(img, "error", /*error_handler*/ ctx[29])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*sizes*/ 4 && img_sizes_value !== (img_sizes_value = /*activeItem*/ ctx[9].sizes || /*opts*/ ctx[10].sizes || `${/*sizes*/ ctx[2]}px`)) {
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

// (361:10) {#if showLoader}
function create_if_block$1(ctx) {
	let loading;
	let current;

	loading = new Loading({
			props: {
				activeItem: /*activeItem*/ ctx[9],
				loaded: /*loaded*/ ctx[3],
				closing: /*closing*/ ctx[12]
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
			if (dirty[0] & /*loaded*/ 8) loading_changes.loaded = /*loaded*/ ctx[3];
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

function create_fragment$3(ctx) {
	let div1;
	let div0;
	let if_block0_anchor;
	let style_transform = `translate3d(${/*translate*/ ctx[8][0]}px, ${/*translate*/ ctx[8][1]}px, 0) scale(${/*scale*/ ctx[1]})`;
	let current;
	let mounted;
	let dispose;
	let if_block0 = /*loaded*/ ctx[3] && create_if_block_1$1(ctx);
	let if_block1 = /*showLoader*/ ctx[4] && create_if_block$1(ctx);

	return {
		c() {
			div1 = element("div");
			div0 = element("div");
			if (if_block0) if_block0.c();
			if_block0_anchor = empty();
			if (if_block1) if_block1.c();
			attr(div0, "class", "bp-img");
			set_style(div0, "width", /*activeDimensions*/ ctx[0][0] + "px");
			set_style(div0, "height", /*activeDimensions*/ ctx[0][1] + "px");
			toggle_class(div0, "bp-drag", /*pointerDown*/ ctx[5]);
			toggle_class(div0, "bp-canzoom", /*maxZoom*/ ctx[14] > 1 && /*activeDimensions*/ ctx[0][0] * /*scale*/ ctx[1] < /*naturalWidth*/ ctx[7]);
			set_style(div0, "background-image", getThumbBackground(/*activeItem*/ ctx[9]));
			set_style(div0, "transform", style_transform);
			attr(div1, "class", "bp-img-wrap");
			attr(div1, "role", "none");
			toggle_class(div1, "bp-close", /*closingWhileZoomed*/ ctx[6]);
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
					listen(window, "keydown", /*onKeydown*/ ctx[15]),
					action_destroyer(/*onMount*/ ctx[21].call(null, div0)),
					listen(div1, "wheel", /*onWheel*/ ctx[16]),
					listen(div1, "pointerdown", /*onPointerDown*/ ctx[17]),
					listen(div1, "pointermove", /*onPointerMove*/ ctx[18]),
					listen(div1, "pointerup", /*onPointerUp*/ ctx[20]),
					listen(div1, "pointercancel", /*removeEventFromCache*/ ctx[19])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (/*loaded*/ ctx[3]) {
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

			if (/*showLoader*/ ctx[4]) {
				if (if_block1) {
					if_block1.p(ctx, dirty);

					if (dirty[0] & /*showLoader*/ 16) {
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

			if (!current || dirty[0] & /*activeDimensions*/ 1) {
				set_style(div0, "width", /*activeDimensions*/ ctx[0][0] + "px");
			}

			if (!current || dirty[0] & /*activeDimensions*/ 1) {
				set_style(div0, "height", /*activeDimensions*/ ctx[0][1] + "px");
			}

			if (!current || dirty[0] & /*pointerDown*/ 32) {
				toggle_class(div0, "bp-drag", /*pointerDown*/ ctx[5]);
			}

			if (!current || dirty[0] & /*maxZoom, activeDimensions, scale, naturalWidth*/ 16515) {
				toggle_class(div0, "bp-canzoom", /*maxZoom*/ ctx[14] > 1 && /*activeDimensions*/ ctx[0][0] * /*scale*/ ctx[1] < /*naturalWidth*/ ctx[7]);
			}

			const style_changed = dirty[0] & /*activeDimensions*/ 1;

			if (dirty[0] & /*activeDimensions*/ 1 || style_changed) {
				set_style(div0, "background-image", getThumbBackground(/*activeItem*/ ctx[9]));
			}

			if (dirty[0] & /*translate, scale, activeDimensions*/ 259 && style_transform !== (style_transform = `translate3d(${/*translate*/ ctx[8][0]}px, ${/*translate*/ ctx[8][1]}px, 0) scale(${/*scale*/ ctx[1]})`) || style_changed) {
				set_style(div0, "transform", style_transform);
			}

			if (!current || dirty[0] & /*closingWhileZoomed*/ 64) {
				toggle_class(div1, "bp-close", /*closingWhileZoomed*/ ctx[6]);
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

function instance$3($$self, $$props, $$invalidate) {
	let $zoomed;
	let $closing;
	let { props } = $$props;
	let { smallScreen } = $$props;
	let { containerWidth } = $$props;
	let { containerHeight } = $$props;
	let { activeDimensions } = $$props;
	let { activeItem, opts, prev, next, zoomed, closing, container } = props;
	component_subscribe($$self, zoomed, value => $$invalidate(27, $zoomed = value));
	component_subscribe($$self, closing, value => $$invalidate(28, $closing = value));
	let maxZoom = activeItem.maxZoom || opts.maxZoom || 10;

	// Value of sizes attribute
	let sizes = activeDimensions[0];

	// Tracks load state of image
	let loaded, showLoader;

	// Stores pinch info if multiple touch events active
	let pinchDetails;

	// Image html element (.bp-img)
	let bpImg;

	// Track distance for pinch events
	let prevDiff = 0;

	let pointerDown, hasDragged;
	let dragStartX, dragStartY;

	// Translate values on start of drag
	let dragStartTranslateX, dragStartTranslateY;

	// If true, adds class to .bp-wrap to avoid image cropping
	let closingWhileZoomed;

	let naturalWidth = +activeItem.width;

	// Store positions for drag inertia
	const dragPositions = [];

	// Cache pointer events to handle pinch
	const pointerCache = new Map();

	// Zoom level of the image, 1 is the starting size, a CSS transition animates it
	let scale = 1;

	// Translate of the zoomed image, animated with the scale
	let translate = [0, 0];

	// Calculate translate position with bounds
	const boundTranslateValues = ([x, y], newScale = scale) => {
		// Image drag translate bounds
		let maxTranslateX = (activeDimensions[0] * newScale - containerWidth) / 2,
			maxTranslateY = (activeDimensions[1] * newScale - containerHeight) / 2;

		// X max drag
		if (maxTranslateX < 0) {
			x = 0;
		} else if (x > maxTranslateX) {
			if (smallScreen) {
				// Bound to left side (allow slight over drag)
				x = pointerDown
				? maxTranslateX + (x - maxTranslateX) / 10
				: maxTranslateX;

				// Previous item if dragged past threshold
				if (x > maxTranslateX + 20) {
					// Setting pointerDown to undefined stops pointermove from running again
					$$invalidate(5, pointerDown = prev());
				}
			} else {
				x = maxTranslateX;
			}
		} else if (x < -maxTranslateX) {
			// Bound to right side (allow slight over drag)
			if (smallScreen) {
				x = pointerDown
				? -maxTranslateX - (-maxTranslateX - x) / 10
				: -maxTranslateX;

				// Next item if dragged past threshold
				if (x < -maxTranslateX - 20) {
					// Setting pointerDown to undefined stops pointermove from running again
					$$invalidate(5, pointerDown = next());
				}
			} else {
				x = -maxTranslateX;
			}
		}

		// Y max drag
		if (maxTranslateY < 0) {
			y = 0;
		} else if (y > maxTranslateY) {
			y = maxTranslateY;
		} else if (y < -maxTranslateY) {
			y = -maxTranslateY;
		}

		return [x, y];
	};

	// Updates zoom level in or out based on amt value
	function changeZoom(amt = maxZoom, e) {
		if ($closing) {
			return;
		}

		let newScale = scale + scale * amt;

		if (amt > 0) {
			// Not larger than the max zoom and the natural size
			newScale = Math.min(newScale, maxZoom, naturalWidth / activeDimensions[0]);
		} else if (newScale < 1) {
			// If requesting image smaller than starting size
			$$invalidate(1, scale = 1);

			return $$invalidate(8, translate = [0, 0]);
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
		$$invalidate(2, sizes = Math.round(Math.max(sizes, activeDimensions[0] * newScale)));

		$$invalidate(8, translate = boundTranslateValues([translate[0] + x * ratio, translate[1] + y * ratio], newScale));
		$$invalidate(1, scale = newScale);
	}

	// Allow zoom to be read / set externally
	Object.defineProperty(activeItem, 'zoom', {
		configurable: true,
		get: () => $zoomed,
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

		if (opts.inline || $closing) {
			return;
		}

		if (zoom) {
			changeZoom(zoom);
		} else if (pan && $zoomed) {
			e.preventDefault();

			// Starts from the target, so held keys keep panning while the transition runs
			$$invalidate(8, translate = boundTranslateValues([translate[0] + pan[0], translate[1] + pan[1]]));
		}
	};

	const onWheel = e => {
		// Return if scrolling past inline gallery w/ wheel
		if (opts.inline && !$zoomed) {
			return;
		}

		// Prevent the default to stop scrolling on a zoomed inline image
		e.preventDefault();

		// Change zoom on wheel
		changeZoom(e.deltaY / -300, e);
	};

	// On drag start, store initial position and image translate values
	const onPointerDown = e => {
		// Don't run if right click
		if (e.button !== 2) {
			e.preventDefault();

			if ($zoomed) {
				// Stop the transition where it is, the drag moves the image without one
				const img = bpImg.getBoundingClientRect();

				const wrap = bpImg.parentNode.getBoundingClientRect();
				$$invalidate(1, scale = img.width / activeDimensions[0]);

				$$invalidate(8, translate = [
					img.left + img.width / 2 - wrap.left - wrap.width / 2,
					img.top + img.height / 2 - wrap.top - wrap.height / 2
				]);
			}

			$$invalidate(5, pointerDown = true);
			pointerCache.set(e.pointerId, e);
			dragStartX = e.clientX;
			dragStartY = e.clientY;
			dragStartTranslateX = translate[0];
			dragStartTranslateY = translate[1];
		}
	};

	// On drag, update image translate val
	const onPointerMove = e => {
		if (pointerCache.size > 1) {
			// If multiple pointer events, pass to handlePinch function
			$$invalidate(5, pointerDown = false);

			const { noPinch } = opts;

			return (typeof noPinch == 'function'
			? noPinch(container)
			: noPinch) || handlePinch(e);
		}

		if (!pointerDown) {
			return;
		}

		let x = e.clientX;
		let y = e.clientY;

		// Store positions for drag inertia, flag drag by distance
		dragPositions.push({ x, y });

		hasDragged = hasDragged || Math.hypot(x - dragStartX, y - dragStartY) > 5;

		// Overall drag diff from start location
		x = x - dragStartX;

		y = y - dragStartY;

		// Handle unzoomed left / right / up swipes
		if (!$zoomed) {
			// Close if swipe up
			if (y < -90) {
				$$invalidate(5, pointerDown = !opts.persistent && props.close());
			}

			// Only handle left / right if not swiping vertically
			if (Math.abs(y) < 30) {
				// Previous if swipe left
				if (x > 40) {
					// Setting pointerDown to undefined stops pointermove from running again
					$$invalidate(5, pointerDown = prev());
				}

				// Next if swipe right
				if (x < -40) {
					// Setting pointerDown to undefined stops pointermove from running again
					$$invalidate(5, pointerDown = next());
				}
			}
		}

		// Image drag when zoomed
		if ($zoomed && hasDragged && !$closing) {
			$$invalidate(8, translate = boundTranslateValues([dragStartTranslateX + x, dragStartTranslateY + y]));
		}
	};

	const handlePinch = e => {
		// Update event in cache and get values
		const [p1, p2] = pointerCache.set(e.pointerId, e).values();

		// Calculate the distance between the two pointers
		const dx = p1.clientX - p2.clientX;

		const dy = p1.clientY - p2.clientY;
		const curDiff = Math.hypot(dx, dy);

		// Cache the original pinch center
		pinchDetails = pinchDetails || {
			clientX: (p1.clientX + p2.clientX) / 2,
			clientY: (p1.clientY + p2.clientY) / 2
		};

		// Scale image
		changeZoom(((prevDiff || curDiff) - curDiff) / -35, pinchDetails);

		// Cache the distance for the next move event
		prevDiff = curDiff;
	};

	// Remove event from pointer event cache
	const removeEventFromCache = e => pointerCache.delete(e.pointerId);

	const onPointerUp = function (e) {
		removeEventFromCache(e);

		if (pinchDetails) {
			// Reset prevDiff and clear pointerDown to trigger return below
			$$invalidate(5, pointerDown = prevDiff = 0);

			// Set pinchDetails to null after last finger lifts
			pinchDetails = pointerCache.size ? pinchDetails : null;
		}

		// Make sure pointer events don't carry over to next image
		if (!pointerDown) {
			return;
		}

		$$invalidate(5, pointerDown = false);

		// Close if overlay is clicked
		if (e.target === this && !opts.persistent) {
			return props.close();
		}

		// Add drag inertia / snap back to bounds
		if (hasDragged) {
			const [posOne, posTwo, posThree] = dragPositions.slice(-3);

			// A short flick may have fewer than three moves, it gets no inertia
			if (posThree && Math.hypot(posTwo.x - posThree.x, posTwo.y - posThree.y) > 5) {
				$$invalidate(8, translate = boundTranslateValues([
					translate[0] - (posOne.x - posThree.x) * 5,
					translate[1] - (posOne.y - posThree.y) * 5
				]));
			}
		} else if (!opts.onImageClick?.(container, activeItem)) {
			changeZoom($zoomed ? -maxZoom : maxZoom, e);
		}

		// Reset pointer states
		hasDragged = false;

		// Reset dragPositions
		dragPositions.length = 0;
	};

	const onMount = node => {
		bpImg = node;

		// Decode initial image before rendering
		props.loadImage(activeItem).then(() => {
			$$invalidate(7, naturalWidth = +activeItem.width);
			$$invalidate(3, loaded = true);
			props.preloadNext();
		});

		// Show loading indicator if needed
		setTimeout(
			() => {
				$$invalidate(4, showLoader = !loaded);
			},
			250
		);
	};

	const addSrc = node => {
		addAttributes(node, activeItem.attr);
	};

	const error_handler = error => opts.onError?.(container, activeItem, error);

	$$self.$$set = $$props => {
		
		if ('smallScreen' in $$props) $$invalidate(24, smallScreen = $$props.smallScreen);
		if ('containerWidth' in $$props) $$invalidate(25, containerWidth = $$props.containerWidth);
		if ('containerHeight' in $$props) $$invalidate(26, containerHeight = $$props.containerHeight);
		if ('activeDimensions' in $$props) $$invalidate(0, activeDimensions = $$props.activeDimensions);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty[0] & /*$closing, $zoomed*/ 402653184) {
			// If zoomed while closing, zoom out image and add class
			// to change contain value on .bp-wrap to avoid cropping
			if ($closing && $zoomed && opts.zoom) {
				$$invalidate(1, scale = 1);
				$$invalidate(8, translate = [0, 0]);
				$$invalidate(6, closingWhileZoomed = true);
			}
		}

		if ($$self.$$.dirty[0] & /*activeDimensions, smallScreen*/ 16777217) {
			if (activeDimensions && (opts.inline || !smallScreen)) {
				$$invalidate(1, scale = 1);
				$$invalidate(8, translate = [0, 0]);
			}
		}

		if ($$self.$$.dirty[0] & /*activeDimensions, scale*/ 3) {
			zoomed.set(activeDimensions[0] * (scale - 1) > 10);
		}
	};

	return [
		activeDimensions,
		scale,
		sizes,
		loaded,
		showLoader,
		pointerDown,
		closingWhileZoomed,
		naturalWidth,
		translate,
		activeItem,
		opts,
		zoomed,
		closing,
		container,
		maxZoom,
		onKeydown,
		onWheel,
		onPointerDown,
		onPointerMove,
		removeEventFromCache,
		onPointerUp,
		onMount,
		addSrc,
		props,
		smallScreen,
		containerWidth,
		containerHeight,
		$zoomed,
		$closing,
		error_handler
	];
}

let Image$1 = class Image extends SvelteComponent {
	constructor(options) {
		super();

		init(
			this,
			options,
			instance$3,
			create_fragment$3,
			not_equal,
			{
				props: 23,
				smallScreen: 24,
				containerWidth: 25,
				containerHeight: 26,
				activeDimensions: 0
			},
			null,
			[-1, -1]
		);
	}
};

/* src\components\iframe.svelte generated by Svelte v4.2.20 */

function create_fragment$2(ctx) {
	let div;
	let iframe;
	let loading;
	let style_width = `${/*activeDimensions*/ ctx[0][0]}px`;
	let style_height = `${/*activeDimensions*/ ctx[0][1]}px`;
	let current;
	let mounted;
	let dispose;

	loading = new Loading({
			props: {
				activeItem: /*activeItem*/ ctx[2],
				loaded: /*loaded*/ ctx[1],
				closing: /*closing*/ ctx[3]
			}
		});

	return {
		c() {
			div = element("div");
			iframe = element("iframe");
			create_component(loading.$$.fragment);
			attr(iframe, "allow", "autoplay; fullscreen");
			attr(iframe, "title", /*activeItem*/ ctx[2].alt);
			attr(div, "class", "bp-iframe");
			set_style(div, "width", style_width);
			set_style(div, "height", style_height);
		},
		m(target, anchor) {
			insert(target, div, anchor);
			append(div, iframe);
			mount_component(loading, div, null);
			current = true;

			if (!mounted) {
				dispose = [
					action_destroyer(/*addSrc*/ ctx[4].call(null, iframe)),
					listen(iframe, "load", /*load_handler*/ ctx[6])
				];

				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			const loading_changes = {};
			if (dirty & /*loaded*/ 2) loading_changes.loaded = /*loaded*/ ctx[1];
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
			run_all(dispose);
		}
	};
}

function instance$2($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let { activeDimensions } = $$props;
	let loaded = false;
	const { activeItem, closing } = props;

	const addSrc = node => {
		addAttributes(node, activeItem.attr);
		node.src = activeItem.link;
	};

	const load_handler = () => $$invalidate(1, loaded = true);

	$$self.$$set = $$props => {
		
		if ('activeDimensions' in $$props) $$invalidate(0, activeDimensions = $$props.activeDimensions);
	};

	return [activeDimensions, loaded, activeItem, closing, addSrc, props, load_handler];
}

class Iframe extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$2, create_fragment$2, not_equal, { props: 5, activeDimensions: 0 });
	}
}

/* src\components\video.svelte generated by Svelte v4.2.20 */

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
				activeItem: /*activeItem*/ ctx[2],
				loaded: /*loaded*/ ctx[1],
				closing: /*closing*/ ctx[3]
			}
		});

	return {
		c() {
			div = element("div");
			create_component(loading.$$.fragment);
			attr(div, "class", "bp-video");
			set_style(div, "width", style_width);
			set_style(div, "height", style_height);
			set_style(div, "background-image", getThumbBackground(/*activeItem*/ ctx[2]));
		},
		m(target, anchor) {
			insert(target, div, anchor);
			mount_component(loading, div, null);
			current = true;

			if (!mounted) {
				dispose = action_destroyer(/*onMount*/ ctx[4].call(null, div));
				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			const loading_changes = {};
			if (dirty & /*loaded*/ 2) loading_changes.loaded = /*loaded*/ ctx[1];
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

const positions = {};

function instance$1($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let { activeDimensions } = $$props;
	let loaded = false;
	const { activeItem, opts, closing, container } = props;

	// Create audio / video element
	const onMount = node => {
		const mediaElement = document.createElement(activeItem.type);

		addAttributes(mediaElement, {
			controls: true,
			autoplay: true,
			playsinline: true,
			tabindex: '0'
		});

		// The alt text names the player for screen readers
		if (activeItem.alt) {
			mediaElement.setAttribute('aria-label', activeItem.alt);
		}

		addAttributes(mediaElement, activeItem.attr);

		// Takes supplied object and creates elements in video
		const appendToVideo = (tag, list) => {
			for (let item of list) {
				// Add sources / tracks to media element
				let el = document.createElement(tag);

				addAttributes(el, item);

				if (tag === 'source') {
					el.onerror = error => opts.onError?.(container, activeItem, error);
				}

				mediaElement.append(el);
			}
		};

		appendToVideo('source', activeItem.sources);

		if (activeItem.tracks) {
			appendToVideo('track', activeItem.tracks);
		}

		mediaElement.oncanplay = () => $$invalidate(1, loaded = true);

		// Before the metadata loads, this sets the position the playback starts from
		const key = activeItem.sources[0].src;

		mediaElement.currentTime = positions[key] || 0;
		node.append(mediaElement);

		return {
			destroy() {
				// A finished video starts over next time
				positions[key] = mediaElement.ended ? 0 : mediaElement.currentTime;
			}
		};
	};

	$$self.$$set = $$props => {
		
		if ('activeDimensions' in $$props) $$invalidate(0, activeDimensions = $$props.activeDimensions);
	};

	return [activeDimensions, loaded, activeItem, closing, onMount, props];
}

class Video extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$1, create_fragment$1, not_equal, { props: 5, activeDimensions: 0 });
	}
}

/* src\bigger-picture.svelte generated by Svelte v4.2.20 */

function create_if_block(ctx) {
	let previous_tag = /*dialog*/ ctx[1] ? 'dialog' : 'div';
	let svelte_element_anchor;
	let svelte_element = (/*dialog*/ ctx[1] ? 'dialog' : 'div') && create_dynamic_element(ctx);

	return {
		c() {
			if (svelte_element) svelte_element.c();
			svelte_element_anchor = empty();
		},
		m(target, anchor) {
			if (svelte_element) svelte_element.m(target, anchor);
			insert(target, svelte_element_anchor, anchor);
		},
		p(ctx, dirty) {
			if (/*dialog*/ ctx[1] ? 'dialog' : 'div') {
				if (!previous_tag) {
					svelte_element = create_dynamic_element(ctx);
					previous_tag = /*dialog*/ ctx[1] ? 'dialog' : 'div';
					svelte_element.c();
					svelte_element.m(svelte_element_anchor.parentNode, svelte_element_anchor);
				} else if (not_equal(previous_tag, /*dialog*/ ctx[1] ? 'dialog' : 'div')) {
					svelte_element.d(1);
					svelte_element = create_dynamic_element(ctx);
					previous_tag = /*dialog*/ ctx[1] ? 'dialog' : 'div';
					svelte_element.c();
					svelte_element.m(svelte_element_anchor.parentNode, svelte_element_anchor);
				} else {
					svelte_element.p(ctx, dirty);
				}
			} else if (previous_tag) {
				svelte_element.d(1);
				svelte_element = null;
				previous_tag = /*dialog*/ ctx[1] ? 'dialog' : 'div';
			}
		},
		i: noop,
		o(local) {
			transition_out(svelte_element, local);
		},
		d(detaching) {
			if (detaching) {
				detach(svelte_element_anchor);
			}

			if (svelte_element) svelte_element.d(detaching);
		}
	};
}

// (778:2) {#if !dialog}
function create_if_block_9(ctx) {
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

// (789:6) {#if containerWidth > 0 && containerHeight > 0}
function create_if_block_5(ctx) {
	let current_block_type_index;
	let if_block;
	let if_block_anchor;
	let current;
	const if_block_creators = [create_if_block_6, create_if_block_7, create_if_block_8, create_else_block];
	const if_blocks = [];

	function select_block_type(ctx, dirty) {
		if (/*activeItem*/ ctx[8].type === 'image') return 0;
		if (/*activeItem*/ ctx[8].sources) return 1;
		if (/*activeItem*/ ctx[8].type === 'iframe') return 2;
		return 3;
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

// (789:364) {:else}
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

// (789:311) 
function create_if_block_8(ctx) {
	let iframe;
	let current;

	iframe = new Iframe({
			props: {
				props: /*getChildProps*/ ctx[21](),
				activeDimensions: /*activeDimensions*/ ctx[15]
			}
		});

	return {
		c() {
			create_component(iframe.$$.fragment);
		},
		m(target, anchor) {
			mount_component(iframe, target, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const iframe_changes = {};
			if (dirty[0] & /*activeDimensions*/ 32768) iframe_changes.activeDimensions = /*activeDimensions*/ ctx[15];
			iframe.$set(iframe_changes);
		},
		i(local) {
			if (current) return;
			transition_in(iframe.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(iframe.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(iframe, detaching);
		}
	};
}

// (789:220) 
function create_if_block_7(ctx) {
	let video;
	let current;

	video = new Video({
			props: {
				props: /*getChildProps*/ ctx[21](),
				activeDimensions: /*activeDimensions*/ ctx[15]
			}
		});

	return {
		c() {
			create_component(video.$$.fragment);
		},
		m(target, anchor) {
			mount_component(video, target, anchor);
			current = true;
		},
		p(ctx, dirty) {
			const video_changes = {};
			if (dirty[0] & /*activeDimensions*/ 32768) video_changes.activeDimensions = /*activeDimensions*/ ctx[15];
			video.$set(video_changes);
		},
		i(local) {
			if (current) return;
			transition_in(video.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(video.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(video, detaching);
		}
	};
}

// (789:53) {#if activeItem.type === 'image'}
function create_if_block_6(ctx) {
	let imageitem;
	let current;

	imageitem = new Image$1({
			props: {
				props: /*getChildProps*/ ctx[21](),
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

// (778:94) {#key activeItem.i}
function create_key_block(ctx) {
	let div;
	let current;
	let mounted;
	let dispose;
	let if_block = /*containerWidth*/ ctx[7] > 0 && /*containerHeight*/ ctx[14] > 0 && create_if_block_5(ctx);

	return {
		c() {
			div = element("div");
			if (if_block) if_block.c();
			attr(div, "class", "bp-slide");
			attr(div, "role", "none");
		},
		m(target, anchor) {
			insert(target, div, anchor);
			if (if_block) if_block.m(div, null);
			current = true;

			if (!mounted) {
				dispose = [
					action_destroyer(/*slideActions*/ ctx[20].call(null, div)),
					listen(div, "pointerdown", /*pointerdown_handler*/ ctx[27]),
					listen(div, "pointerup", /*pointerup_handler*/ ctx[28])
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
					if_block.m(div, null);
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
				detach(div);
			}

			if (if_block) if_block.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

// (789:494) {#if activeItem.caption}
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

// (789:634) {#if activeItem.download}
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
				dispose = action_destroyer(/*label*/ ctx[22].call(null, a, 'download'));
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

// (789:992) {#if items.length > 1}
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
			attr(button0, "class", "bp-prev");
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
					action_destroyer(/*label*/ ctx[22].call(null, button0, 'prev')),
					listen(button0, "click", /*prev*/ ctx[3]),
					action_destroyer(/*label*/ ctx[22].call(null, button1, 'next')),
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

// (797:25) {#if opts.thumbs && items.length > 1}
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

// (769:20) <svelte:element   this={dialog ? 'dialog' : 'div'}   use:containerActions   class="bp-wrap"   class:bp-zoomed={$zoomed}   class:bp-inline={inline}   class:bp-small={smallScreen}   class:bp-noclose={opts.persistent}   class:bp-closing={$closing}  >
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
	let if_block0 = !/*dialog*/ ctx[1] && create_if_block_9();
	let key_block = create_key_block(ctx);
	let if_block1 = /*activeItem*/ ctx[8].caption && create_if_block_4(ctx);
	let if_block2 = /*activeItem*/ ctx[8].download && create_if_block_3(ctx);
	let if_block3 = /*items*/ ctx[0].length > 1 && create_if_block_2(ctx);
	let if_block4 = /*opts*/ ctx[9].thumbs && /*items*/ ctx[0].length > 1 && create_if_block_1(ctx);

	return {
		c() {
			svelte_element = element(/*dialog*/ ctx[1] ? 'dialog' : 'div');
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
			attr(button, "class", "bp-x");
			attr(div3, "class", "bp-actions");
			attr(div4, "class", "bp-controls");
			set_dynamic_element_data(/*dialog*/ ctx[1] ? 'dialog' : 'div')(svelte_element, { class: "bp-wrap" });
			toggle_class(svelte_element, "bp-zoomed", /*$zoomed*/ ctx[16]);
			toggle_class(svelte_element, "bp-inline", /*inline*/ ctx[11]);
			toggle_class(svelte_element, "bp-small", /*smallScreen*/ ctx[10]);
			toggle_class(svelte_element, "bp-noclose", /*opts*/ ctx[9].persistent);
			toggle_class(svelte_element, "bp-closing", /*$closing*/ ctx[17]);
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
					action_destroyer(/*rulerActions*/ ctx[24].call(null, div0)),
					action_destroyer(/*label*/ ctx[22].call(null, button, 'close')),
					listen(button, "click", /*close*/ ctx[2]),
					action_destroyer(/*containerActions*/ ctx[23].call(null, svelte_element))
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (!/*dialog*/ ctx[1]) {
				if (if_block0) ; else {
					if_block0 = create_if_block_9();
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

			if (!current || dirty[0] & /*$zoomed*/ 65536) {
				toggle_class(svelte_element, "bp-zoomed", /*$zoomed*/ ctx[16]);
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

			if (!current || dirty[0] & /*$closing*/ 131072) {
				toggle_class(svelte_element, "bp-closing", /*$closing*/ ctx[17]);
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

function instance($$self, $$props, $$invalidate) {
	let $zoomed;
	let $closing;
	let { items = undefined } = $$props;
	let { target = undefined } = $$props;
	let { dialog = false } = $$props;
	const html = document.documentElement;

	// Index of current active item
	let position = 0;

	// Options passed via open method
	let opts;

	// Bool tracks open state
	let isOpen;

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

	// Slide of the active item
	let slide;

	// Texts of the controls, merged with the labels option
	let labels;

	// Gap around the stage, read on open and on resize instead of on every measure
	let gap = 0;

	let ruler;
	let container;
	let containerWidth;
	let containerHeight;

	// Active item object
	let activeItem = null;

	let activeDimensions;

	// True if the image is zoomed past its starting size
	const zoomed = writable(0);

	component_subscribe($$self, zoomed, value => $$invalidate(16, $zoomed = value));

	// True while this gallery runs its outro, other galleries on the page keep their own
	const closing = writable(0);

	component_subscribe($$self, closing, value => $$invalidate(17, $closing = value));

	// True while the gallery runs its outro animation
	let isClosing;

	// Options of an open call made while closing, applied once the gallery is removed
	let pendingOptions;

	const open = options => {
		if (isClosing) {
			pendingOptions = options;
			return;
		}

		// intro and noClose are the deprecated names of zoom: false and persistent
		$$invalidate(9, opts = {
			zoom: !options.intro,
			persistent: options.noClose,
			...options
		});

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

		if (target) {
			container = target;
			$$invalidate(7, containerWidth = target.offsetWidth);

			$$invalidate(14, containerHeight = target === document.body
			? window.innerHeight
			: target.clientHeight);

			readGap();
		}

		$$invalidate(6, position = 0);

		// Set the gallery items, el is the deprecated name of current
		const list = [], current = opts.current || opts.el;

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

		// Nothing to show, e.g. every item was filtered out
		if (!list.length) {
			return;
		}

		// Lock the scroll unless gallery is inline
		if (!inline && html.scrollHeight > html.clientHeight) {
			const style = getComputedStyle(html);
			const scrollbar = innerWidth - html.clientWidth;

			// Padding takes the place of the hidden scrollbar, toggling scrollbar-gutter instead restyles the whole page
			if (scrollbar && style.scrollbarGutter === 'auto') {
				html.style.paddingRight = parseFloat(style.paddingRight) + scrollbar + 'px';
			}

			html.classList.add('bp-lock');
		}

		$$invalidate(0, items = list);
	};

	const close = () => {
		if (!items || isClosing) {
			return;
		}

		isClosing = true;
		opts.onClose?.(container, activeItem);
		closing.set(true);
		window.removeEventListener('keydown', onKeydown);

		// Closed without the back button, drop the history entry the gallery added
		if (opts.history && history.state?.bp) {
			history.back();
		}

		// No slide yet when closed in the same tick as opened
		slide && zoom(slide, 'bp-out');

		// Remove the gallery once the slide has finished its outro
		afterAnimations(slide, () => {
			$$invalidate(0, items = null);
			focusTrigger?.focus({ preventScroll: true });
		});
	};

	// Run a callback once the animations of a node are finished, right away if it has none
	const afterAnimations = (node, callback) => Promise.all(node?.getAnimations().map(animation => animation.finished) || []).finally(callback);

	const prev = () => setPosition(position - 1);
	const next = () => setPosition(position + 1);

	const setPosition = index => {
		const nextPosition = getNextPosition(index);
		movement = index - position;

		if (nextPosition !== position) {
			$$invalidate(6, position = nextPosition);
			opts.onUpdate?.(container, items[position]);
		}
	};

	// Get the next gallery position
	const getNextPosition = index => (index + items.length) % items.length;

	// Handle the keyboard events
	const onKeydown = e => {
		const { key, shiftKey } = e;

		if (key === 'Escape') {
			!opts.persistent && close();
		} else if (key === 'ArrowRight' && !$zoomed) {
			// The zoomed image pans with the arrows instead
			next();
		} else if (key === 'ArrowLeft' && !$zoomed) {
			prev();
		} else if (key === 'Tab') {
			// Trap the focus on tab press
			const { activeElement } = document;

			// Allow browser to handle tab into video controls only
			if (shiftKey || !activeElement.controls) {
				e.preventDefault();
				const { focusWrap = container } = opts;
				const tabbable = [...focusWrap.querySelectorAll('*')].filter(node => node.tabIndex >= 0);
				let index = tabbable.indexOf(activeElement);

				// From the container itself, Tab goes to the first control and Shift+Tab to the last
				index = (index < 0 && shiftKey ? 0 : index) + tabbable.length + (shiftKey ? -1 : 1);

				tabbable[index % tabbable.length].focus();
			}
		}
	};

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

		// A copy too, the gallery writes the image src, srcset and sizes into it
		item.attr = { ...item.attr };

		// title is the deprecated name of alt
		item.alt = item.alt || item.title;

		let link = item.link = item.link || item.element?.href, type = item.type;

		if (item.sources) {
			item.type = type === 'audio' || (/^audio/).test(item.sources[0]?.type)
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

			for (const [,url, value] of link.matchAll(/(\S+)\s+(\d+)[wx]/gi)) {
				if (+value > max) {
					max = +value;
					link = url;
				}
			}

			return link;
		}

		return sources?.[0]?.src || '';
	};

	// Parse the link and detect the content type
	const parseLink = (link, item) => {
		// Also matches the first candidate of a srcset
		let match = link.match(/\.(?:jpe?g|png|gif|bmp|webp|avif|svg|tiff|ico)(?:[\?#]\S*)?(?:\s|$)/i);

		if (match) {
			item.type = 'image';
			return item;
		}

		// HTML5 video and audio, the first group holds a video extension
		match = link.match(/\.(?:(mp4|mpeg|mov|ogv|webm|avi|h264)|(mp3|wav|ogg|oga|m4a|aac|flac|opus|wma|weba|mid))([?#].*)?$/i);

		if (match) {
			const ext = (match[1] || match[2]).toLowerCase();

			const mimeMap = {
				ogv: 'ogg',
				mov: 'quicktime',
				avi: 'x-msvideo',
				mp3: 'mpeg',
				m4a: 'mp4',
				oga: 'ogg',
				opus: 'ogg',
				mid: 'midi',
				weba: 'webm'
			};

			item.type = match[1] ? 'video' : 'audio';

			item.sources = [
				{
					src: link,
					type: item.type + '/' + (mimeMap[ext] || ext)
				}
			];

			return item;
		}

		// YouTube Video
		match = link.match(/(youtube\.com|youtu\.be)\/(?:watch\?(?:.*&)?v=|v\/|u\/|shorts\/|embed\/?)?(videoseries\?list=(?:.*)|[\w-]{11}|\?listType=(?:.*)&list=(?:.*))(?:.*)/i);

		if (match) {
			let videoID = encodeURIComponent(match[2]),
				sourceURL = new URL(link),
				targetURL = new URL('https://www.youtube.com/embed/' + videoID + '?autoplay=1&playsinline=1&controls=1&rel=0');

			sourceURL.searchParams.delete('v');

			for (let [key, value] of sourceURL.searchParams) {
				if (key === 't') {
					let timeMatch = value.match(/((\d*)m)?(\d*)s?/);

					if (timeMatch) {
						key = 'start';
						value = 60 * parseInt(timeMatch[2] || '0') + parseInt(timeMatch[3] || '0');
					}
				}

				targetURL.searchParams.set(key, value);
			}

			item.type = 'iframe';
			item.link = targetURL.toString();
			item.thumb = item.thumb || 'https://i.ytimg.com/vi/' + videoID + '/mqdefault.jpg';
			return item;
		}

		// Vimeo Video
		match = link.match(/^.+vimeo.com\/(?:\/)?(video\/)?([\d]+)((\/|\?h=)([a-z0-9]+))?(.*)?/);

		if (match) {
			let videoID = encodeURIComponent(match[2]),
				sourceURL = new URL(link),
				targetURL = new URL('https://player.vimeo.com/video/' + videoID + '?autoplay=1&playsinline=1');

			for (let [key, value] of sourceURL.searchParams) {
				targetURL.searchParams.set(key, value);
			}

			if (match[5]) {
				targetURL.searchParams.set('h', match[5]);
			} else {
				item.thumb = item.thumb || 'https://vumbnail.com/' + videoID + '.jpg';
			}

			if (sourceURL.hash && sourceURL.hash.startsWith('#t=')) {
				targetURL.hash = sourceURL.hash;
			}

			item.type = 'iframe';
			item.link = targetURL.toString();
			return item;
		}

		// SoundCloud Widget
		match = link.match(/^(https?:\/\/)?(www\.)?(m\.)?soundcloud\.com\/([a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+.*)$/);

		if (match) {
			let targetURL = new URL('https://w.soundcloud.com/player/?auto_play=1&visual=1&hide_related=1&show_comments=0');
			targetURL.searchParams.set('url', link);
			item.type = 'iframe';
			item.link = targetURL.toString();
			return item;
		}

		// Google Drive, Dropbox, and PDF files
		match = link.match(/(drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+))|(dropbox\.com\/s\/)|(\.pdf($|\?|#))/i);

		if (match) {
			if (match[1] && match[2]) {
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

			item.type = 'iframe';
			return item;
		}

		return false;
	};

	// Parse a thumbnail, update dimensions, and the fit option
	const parseThumbnail = item => {
		let thumbLink = '', thumbElement = false;

		if (item.element) {
			thumbElement = item.element.querySelector('img');
		}

		// A link without a thumbnail shows the full image in the strip, otherwise the gallery loads it when shown
		if (item.type === 'image' && opts.thumbs) {
			thumbLink = item.element?.href || '';
		}

		if (item.thumb instanceof HTMLImageElement) {
			thumbElement = item.thumb;
		} else if (item.thumb) {
			thumbLink = item.thumb;
		}

		item.source = item.element;
		item.thumb = false;

		if (thumbElement) {
			item.thumb = thumbElement;
			item.source = item.thumb;
			setDimensions(item, thumbElement);

			if (!item.fit) {
				item.fit = window.getComputedStyle(thumbElement).objectFit;
			}
		} else if (thumbLink) {
			thumbElement = new Image();
			thumbElement.src = thumbLink;

			thumbElement.onload = () => {
				setDimensions(item, thumbElement);
			};

			item.thumb = thumbElement;
		}

		return item;
	};

	// Set item dimensions based on a thumbnail image if not already specified
	const setDimensions = (item, thumb) => {
		if (!item.width || !item.height) {
			let dimensions = calculateDimensions({
				width: thumb.naturalWidth,
				height: thumb.naturalHeight
			});

			item.width = dimensions[0];
			item.height = dimensions[1];
			item.scaled = 1;
			$$invalidate(15, activeDimensions = dimensions);
		}
	};

	const readGap = () => gap = parseInt(getComputedStyle(container).getPropertyValue('--bp-stage-gap')) || 0;

	// Calculate width and height to fit inside a container
	const calculateDimensions = ({ width = 1920, height = 1080 }) => {
		const { scale = 1 } = opts;
		const ratio = Math.min((containerWidth - 2 * gap) / width * scale, (containerHeight - 2 * gap) / height * scale);

		// Round number so we don't use a float as the sizes attribute
		return [Math.round(width * ratio), Math.round(height * ratio)];
	};

	// Preloads images for previous and next items in gallery
	const preloadNext = () => {
		if (items) {
			const nextItem = items[getNextPosition(position + 1)];
			const prevItem = items[getNextPosition(position - 1)];
			!nextItem.preload && loadImage(nextItem);
			!prevItem.preload && loadImage(prevItem);
		}
	};

	// Load and decode the image for an item
	const loadImage = item => {
		if (item.type === 'image') {
			let image = document.createElement('img'),
				src = decodeURIComponent(item.link),
				srcset = '';

			if ((/\s+\d+[wx]/).test(src)) {
				const parts = Array.from(src.matchAll(/(\S+)\s+(\d+)([wx])/gi), match => ({
					url: match[1],
					value: parseInt(match[2]),
					type: match[3]
				}));

				srcset = src;

				// The first candidate wide enough for the container or the screen density, the largest otherwise
				parts.sort((a, b) => a.value - b.value);

				const match = parts.find(c => c.value >= (c.type === 'w'
				? containerWidth
				: window.devicePixelRatio || 1)) || parts[parts.length - 1];

				image.src = match.url;
				item.attr.src = match.url;
				image.sizes = item.sizes || opts.sizes || `${calculateDimensions(item)[0]}px`;
				item.attr.sizes = image.sizes;
				item.attr.srcset = srcset;
			} else {
				image.src = src;
				item.attr.src = src;
			}

			item.preload = true;

			return image.decode().then(() => {
				// The size from a thumbnail is only a ratio, and an item without one takes it from the image
				if ((item.scaled || !item.width || !item.height) && image.naturalWidth) {
					item.width = image.naturalWidth;
					item.height = image.naturalHeight;

					if (item === activeItem) {
						$$invalidate(15, activeDimensions = calculateDimensions(item));
					}
				}

				// It's important to set srcset after we read the image dimensions
				if (srcset) {
					image.srcset = srcset;
				}
			}).catch(error => {
				
			});
		}
	};

	// Set the state a slide animates from or to, the CSS animations of the classes do the rest
	const animate = (node, className, transform, css = '--bp-opacity:0') => {
		node.className = 'bp-slide ' + className;
		node.style.cssText = `--bp-transform:${transform};${css}`;
	};

	// Zoom the slide out of the thumbnail on open and back into it on close, or fade it up with zoom: false
	const zoom = (node, className) => {
		if (!opts.zoom) {
			return animate(node, className, `translateY(${className ? -10 : 10}px)`);
		}

		let dimensions;

		// Update the container dimensions before triggering an animation
		if (ruler) {
			$$invalidate(7, containerWidth = ruler.clientWidth);
			$$invalidate(14, containerHeight = ruler.clientHeight);
		}

		if (activeItem.type === 'html') {
			const bpItem = node.firstElementChild.firstElementChild;
			dimensions = [bpItem.clientWidth, bpItem.clientHeight];
		} else {
			dimensions = activeDimensions;
		}

		// Rect is the content box of the trigger element, the image is drawn inside its padding and border
		const source = activeItem.source || focusTrigger;

		const style = window.getComputedStyle(source);
		const edge = side => parseFloat(style['padding' + side]) + parseFloat(style['border' + side + 'Width']);
		const bounds = source.getBoundingClientRect();

		const rect = {
			left: bounds.left + edge('Left'),
			top: bounds.top + edge('Top'),
			width: bounds.width - edge('Left') - edge('Right'),
			height: bounds.height - edge('Top') - edge('Bottom')
		};

		const leftOffset = rect.left - (containerWidth - rect.width) / 2;
		const centerTop = rect.top - (containerHeight - rect.height) / 2;
		let scaleWidth = rect.width / dimensions[0];
		let scaleHeight = rect.height / dimensions[1];
		let css = '--bp-opacity:1';

		if (activeItem.fit === 'cover') {
			scaleWidth = scaleHeight = Math.max(scaleHeight, scaleWidth);

			// Crop the item like the thumbnail
			css += `;--bp-clip-y:${Math.max((dimensions[1] - rect.height / scaleHeight) / 2, 0)}px;--bp-clip-x:${Math.max((dimensions[0] - rect.width / scaleWidth) / 2, 0)}px`;

			className += ' bp-clip';
		} else if (activeItem.fit === 'contain') {
			scaleWidth = scaleHeight = Math.min(scaleHeight, scaleWidth);
		}

		animate(node, className, `translate(${leftOffset}px,${centerTop}px) scale(${scaleWidth},${scaleHeight})`, css);
	};

	// Animate the slides, the first one zooms in, the next ones slide in and out
	const slideActions = node => {
		slide = node;

		if (isOpen) {
			animate(node, 'bp-nav', `translate(${movement > 0 ? 20 : -20}px)`);
		} else {
			isOpen = true;

			// Deferred so the item is measured after the container action has shown the dialog and called onOpen
			queueMicrotask(() => zoom(node, ''));
		}

		return {
			destroy() {
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
		calculateDimensions,
		closing,
		preloadNext,
		activeItem,
		loadImage,
		container,
		zoomed,
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

		// Set here, attributes on svelte:element compile to a much larger spread
		node.tabIndex = -1;

		node.setAttribute('role', inline ? 'region' : 'dialog');
		node.setAttribute('aria-modal', !inline);
		node.setAttribute('aria-label', labels.gallery);

		// Use the top layer API for proper modal behavior
		if (dialog) {
			// Keep the dialog open on Escape, the keydown handler closes it with the outro animation
			node.oncancel = e => e.preventDefault();

			if (!inline) {
				node.showModal();
			} else {
				node.show();
			}
		}

		opts.onOpen?.(container, activeItem);

		// Don't use keyboard events for inline galleries
		if (!inline) {
			window.addEventListener('keydown', onKeydown);

			// Keyboard and screen reader users start inside the gallery
			node.focus({ preventScroll: true });

			// The back button closes the gallery instead of leaving the page
			if (opts.history) {
				history.pushState({ bp: 1 }, '');
				window.addEventListener('popstate', close);
			}
		}

		return {
			destroy() {
				// Close the dialog properly to remove it from top layer
				if (node.open) {
					node.close();
				}

				window.removeEventListener('keydown', onKeydown);
				window.removeEventListener('popstate', close);
				closing.set(false);
				isOpen = false;
				isClosing = false;

				// Remove class hiding scroll
				html.classList.remove('bp-lock');

				html.style.paddingRight = '';
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
				const rect = entries[0].contentRect;

				if (rect.width !== containerWidth || rect.height !== containerHeight) {
					$$invalidate(7, containerWidth = rect.width);
					$$invalidate(14, containerHeight = rect.height);
					readGap();
					$$invalidate(15, activeDimensions = calculateDimensions(activeItem));
				}

				// Run the user-defined resize function
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

	const pointerup_handler = function (e) {
		// Only close if left click on self and not dragged
		if (e.button !== 2 && e.target === this && clickedEl === this) {
			!opts.persistent && close();
		}
	};

	$$self.$$set = $$props => {
		if ('items' in $$props) $$invalidate(0, items = $$props.items);
		if ('target' in $$props) $$invalidate(25, target = $$props.target);
		if ('dialog' in $$props) $$invalidate(1, dialog = $$props.dialog);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty[0] & /*items, position, activeItem*/ 321) {
			// Update the active item and dimensions on position change
			if (items && items[position]) {
				$$invalidate(8, activeItem = items[position]);
				$$invalidate(15, activeDimensions = calculateDimensions(activeItem));
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
		$zoomed,
		$closing,
		zoomed,
		closing,
		slideActions,
		getChildProps,
		label,
		containerActions,
		rulerActions,
		target,
		open,
		pointerdown_handler,
		pointerup_handler
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
				target: 25,
				dialog: 1,
				open: 26,
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
		return this.$$.ctx[25];
	}



	get dialog() {
		return this.$$.ctx[1];
	}



	get open() {
		return this.$$.ctx[26];
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
