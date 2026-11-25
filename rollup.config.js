import svelte from 'rollup-plugin-svelte';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import size from 'rollup-plugin-size';
import modify from 'rollup-plugin-modify';
import * as sass from 'sass';
import { copyFileSync, writeFileSync } from 'node:fs';

const production = !process.env.ROLLUP_WATCH;

const stylesSource = 'src/bigger-picture.scss';

const terserOptions = {
	ecma: 2015,
	mangle: {
		// Internal names of Svelte and of the components. Builtins lets terser mangle the names it knows from the DOM, such as
		// fragment and update, so the list must not have a public name, such as the close, prev and next methods
		properties: {
			builtins: true,
			regex: /^(duration|easing|delay|activeItem|activeDimensions|calculateDimensions|containerWidth|containerHeight|loaded|closing|setZoomed|dirty|tick|preloadNext|setDimensions|opts|loadImage|smallScreen|props|ctx|\$\$set|\$set|invalidate|not_equal|fragment|update|\$\$)$/
		}
	},
	compress: {
		booleans_as_integers: true,
		pure_getters: true,
		drop_console: true,
		unsafe: true,
		unsafe_arrows: true,
		unsafe_comps: true,
		unsafe_Function: true,
		unsafe_math: true,
		unsafe_symbols: true,
		unsafe_methods: true,
		unsafe_proto: true,
		unsafe_regexp: true,
		unsafe_undefined: true,
		passes: 3
	}
};

/**
 * Clean some redundant Svelte code to reduce the size by ~0.5KB
 */
const cleanSvelteWhitespace = {
	markup: ({ content }) => {
		const code = content.replace(/(>)[\s]*([<{])/g, '$1$2').replace(/({[/:][a-z]+})[\s]*([<{])/g, '$1$2').replace(/({[#:][a-z]+ .+?})[\s]*([<{])/g, '$1$2').replace(/([>}])[\s]+(<|{[/#:][a-z][^}]*})/g, '$1$2');
		return { code };
	}
};

/**
 * Reduce the size of scripts
 */
const findReplaceOptions = [
	['if (options.hydrate)', 'if (false)'],
	['if (options.intro)', 'if (false)'],
	[`, important ? 'important' : ''`, ''],
	[/if \('props' in \$\$props.+;$/gm, ''],
	[': blank_object()', ': {}'],
	// The library uses no bind:, context, $on, beforeUpdate, afterUpdate or component styles, so the runtime drops their code
	[/^\s*(bound|callbacks): \{},$|^\s*(on_disconnect|before_update|after_update): \[],$|^\s*context: new Map\(.+$|^\s*skip_bound: false,$|^\s*root: options\.target.+$/gm, ''],
	[/^\s*append_styles && append_styles\(\$\$\.root\);$/gm, ''],
	[/^\s*if \(!\$\$\.skip_bound && \$\$\.bound\[i]\).+$/gm, ''],
	[/^\s*this\.\$\$\.skip_bound = (true|false);$/gm, ''],
	[/^\s*run_all\(\$\$\.before_update\);$/gm, ''],
	[/^\s*(\$\$\.)?after_update\.forEach\(add_render_callback\);$/gm, ''],
	['const { fragment, after_update } = component.$$;', 'const { fragment } = component.$$;'],
	[/^\s*flush_render_callbacks\(\$\$\.after_update\);$/gm, ''],
	[/^\s*while \(binding_callbacks\.length\) binding_callbacks\.pop\(\)\(\);$/gm, ''],
	[/^\t\$on\(type, callback\) \{[\s\S]*?^\t}$/gm, ''],
	// No onMount, onDestroy or store subscriptions, so the lists stay empty, and nothing reads the current component
	[/^\t\/\/ onMount happens before the initial afterUpdate\n\tadd_render_callback\(\(\) => \{[\s\S]*?^\t}\);$/m, ''],
	[/^\s*on_(mount|destroy): \[],$|^\s*run_all\(\$\$\.on_destroy\);$/gm, ''],
	['$$.on_destroy = $$.fragment = null;', '$$.fragment = null;'],
	[/^\s*set_current_component\(.*\);$|^\s*const (parent|saved)_component = current_component;$/gm, ''],
	// Only the thumbnail src uses it, which changes when the items change. A relative URL sets the same src again then
	[/export function src_url_equal\(element_src, url\) \{\n[\s\S]*?\n}/, 'export function src_url_equal(element_src, url) {\n\treturn element_src === url;\n}'],
].map(([find, replace]) => modify({ find, replace }))

/**
 * Compile the library styles to dist, and copy the SCSS source
 */
const styles = {
	name: 'styles',
	buildStart() {
		this.addWatchFile(stylesSource);
	},
	writeBundle() {
		const { css } = sass.compile(stylesSource, {
			style: 'compressed',
			charset: false,
			silenceDeprecations: ['import', 'global-builtin']
		});
		writeFileSync('dist/bigger-picture.css', css + '\n');
		copyFileSync(stylesSource, 'dist/bigger-picture.scss');
	}
};

if (production) {
	// remove unneeded setters in library
	findReplaceOptions.push(modify({
		find: /^\sset .+{$\n\s+this.+[^}]+}/gm,
		replace: ''
	}));
}

const svelteOptions = {
	preprocess: [cleanSvelteWhitespace],
	compilerOptions: {
		immutable: true,
		// No code that adds the Svelte version to window
		discloseVersion: false,
		css: false
	}
};

/**
 * The entry checks for the Svelte 5 `mount`, which Svelte 4 does not export
 */
const onwarn = (warning, warn) => {
	if (warning.code !== 'MISSING_EXPORT' || warning.binding !== 'mount') {
		warn(warning);
	}
};

// unminified dist files, the UMD build is also used by index.html
let config = [
	{
		input: 'src/bigger-picture.js',
		onwarn,
		output: [
			{
				format: 'es',
				file: 'dist/bigger-picture.mjs'
			},
			{
				format: 'umd',
				name: 'BiggerPicture',
				file: 'dist/bigger-picture.umd.js',
				strict: false
			},
			{
				format: 'cjs',
				name: 'BiggerPicture',
				file: 'dist/bigger-picture.cjs',
				strict: false,
				exports: 'default'
			}
		],
		plugins: [
			commonjs(),
			svelte(svelteOptions),
			resolve({ browser: true }),
			...findReplaceOptions,
			styles
		]
	}
];

if (production) {
	// minified dist files
	config.push({
		input: 'src/bigger-picture.js',
		onwarn,
		output: [
			{
				format: 'iife',
				name: 'BiggerPicture',
				file: 'dist/bigger-picture.min.js',
				strict: false
			},
			{
				format: 'es',
				file: 'dist/bigger-picture.min.mjs'
			}
		],
		plugins: [
			commonjs(),
			svelte(svelteOptions),
			resolve({ browser: true }),
			...findReplaceOptions,
			terser(terserOptions),
			size()
		]
	});
}

export default config;
