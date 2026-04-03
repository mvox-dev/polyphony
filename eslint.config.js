// ESLint configuration for complexity analysis
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
	{
		ignores: ['**/paraglide/**', '**/.svelte-kit/**'],
	},
	{
		files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
		ignores: ['**/*.spec.ts', '**/*.test.ts', '**/tests/**'],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module'
			}
		},
		plugins: {
			'@typescript-eslint': tseslint
		},
		rules: {
			// Cyclomatic complexity threshold
			'complexity': ['warn', { max: 10 }],
			
			// Max nesting depth
			'max-depth': ['warn', 4],
			
			// Max lines per function
			'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true, skipComments: true }],
			
			// Max statements per function
			'max-statements': ['warn', 15],
			
			// Max parameters
			'max-params': ['warn', 5]
		}
	},
	{
		// Svelte files - basic metrics only (no parser available)
		files: ['**/*.svelte'],
		rules: {
			// Disable rules that require AST parsing
		}
	}
];
