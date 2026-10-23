import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = new URL('../', import.meta.url);
registerHooks({
  resolve(specifier, context, next) {
    let target;
    if (specifier.startsWith('@/')) target = new URL('src/' + specifier.slice(2), root);
    else if (specifier.startsWith('.') && context.parentURL)
      target = new URL(specifier, context.parentURL);
    if (target?.protocol === 'file:' && !existsSync(fileURLToPath(target))) {
      for (const suffix of ['.ts', '.tsx']) {
        const path = fileURLToPath(target) + suffix;
        if (existsSync(path)) return next(pathToFileURL(path).href, context);
      }
    }
    return next(specifier, context);
  },
});
