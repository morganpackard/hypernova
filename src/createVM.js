import lruCache from 'lru-cache';
import { ok } from 'assert';
import crypto from 'crypto';
import Module from './Module';

function defaultGetKey(name, code) {
  const hash = crypto.createHash('sha1').update(code).digest('hex');
  return `${name}::${hash}`;
}

export default (options = {}) => {
  // This is to cache the entry point of all bundles which makes running on a vm blazing fast.
  // Everyone gets their own sandbox to play with and nothing is leaked between requests.
  // We're caching with `code` as the key to ensure that if the code changes we break the cache.
  const exportsCache = lruCache({
    max: options.cacheSize,
  });

  const getKey = options.getKey || defaultGetKey;

  return {
    exportsCache,

    run(name, code, runOptions = {}) {
      const key = getKey(name, code);

      if (!runOptions.preferCachedInializer && exportsCache.has(key)) return exportsCache.get(key);

      const environment = options.environment && options.environment(name);
      const moduleOptions = {
        id: name,
        parent: environment,
        preferCachedInializer: runOptions.preferCachedInializer,
      };

      if (runOptions.globals) {
        ok(runOptions.useGlobalContext, 'if you set globals you must use the global context');
        moduleOptions.context = runOptions.globals;
      }

      if (runOptions.useGlobalContext) {
        moduleOptions.useGlobalContext = true;
        Module.initGlobalContext(runOptions.globals || {});
      }

      const module = new Module(moduleOptions);
      module.load(name);
      // eslint-disable-next-line no-underscore-dangle
      module._compile(code, name);

      if (!runOptions.preferCachedInializer) {
        exportsCache.set(key, module.exports);
      }

      return module.exports;
    },
  };
};
