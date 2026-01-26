import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
	globalIgnores([
        'data/*',
		"!node_modules/", // unignore `node_modules/` directory
		"node_modules/*", // ignore its content
		"!node_modules/mylibrary/", // unignore `node_modules/mylibrary` directory
	]),
]);