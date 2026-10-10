// ES Module entry point for Electron (when package.json has "type": "module")
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('./electron/main.cjs');
