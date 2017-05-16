import NativeModule from 'module';
import has from 'has';
import path from 'path';
import { ok } from 'assert';
import { runInNewContext } from 'vm';
import lruCache from 'lru-cache';

const NativeModules = process.binding('natives');

// This means that you won't be able to affect VM extensions by mutating require.extensions
// this is cool since we can now have different extensions for VM than for where your program is
// running.
// If you want to add an extension then you can use addExtension defined and exported below.
  // eslint-disable-next-line 
const moduleExtensions = Object.assign({}, NativeModule._extensions);

function isNativeModule(id) {
  return has(NativeModules, id);
}

const globalContext = {};

const baseGlobals = {
  Buffer,
  clearImmediate,
  clearInterval,
  clearTimeout,
  setImmediate,
  setInterval,
  setTimeout,
  console,
  process,
};

// Creates a fresh global context, or, alternatively, attaches properties to a provided context
// This allows us to pass in globals that will be available to the module
function createContext() {
  const context = Object.assign({}, baseGlobals);
  context.global = context;
  return context;
}

const INITIALIZER_CACHE_SIZE = 10000;
const initializerCache = lruCache({
  max: INITIALIZER_CACHE_SIZE,
});

// This class should satisfy the Module interface that NodeJS defines in their native module.js
// implementation.
class Module {
  constructor(args) {
    // constructor can take comma-separated arguments, or a single arguments map object
    // if the first argument is an object, assume we're using the arguments map approach

    let options;

    if (typeof args !== 'object') {
      options = {
        // eslint-disable-next-line 
        id: arguments[0],
        // eslint-disable-next-line 
        parent: arguments[1],
      };
    } else {
      options = args;
    }

    const {
      id,
      parent,
      preferCachedInializer,
      useGlobalContext,
    } = options;

    ok(
      !!useGlobalContext === !!preferCachedInializer,
      'If either useGlobalcontext or preferCachedInializer is true, the other must be true.',
    );

    ok(!useGlobalContext || Object.keys(globalContext).length, 'If you\'re using the global context, you must initialize it before instantiating a module using Module.initGlobalContext');

    const cache = parent ? parent.cache : null;

    this.id = id;
    this.exports = {};
    this.cache = cache || {};
    this.parent = parent;

    this.filename = null;
    this.loaded = false;

    if (useGlobalContext) {
      this.context = globalContext;
    } else {
      this.context = parent ? parent.context : createContext();
    }
    this.preferCachedInializer = preferCachedInializer;
  }

  load(filename) {
    ok(!this.loaded);
    this.filename = filename;
    // todo cache this
    // eslint-disable-next-line 
    this.paths = NativeModule._nodeModulePaths(path.dirname(filename));
  }

  run(filename) {
    if (this.preferCachedInializer && initializerCache.has(this.id)) {
      this.runInitializer(initializerCache.get(this.id));
    } else {
      const ext = path.extname(filename);
      const extension = moduleExtensions[ext] ? ext : '.js';
      moduleExtensions[extension](this, filename);
    }
    this.loaded = true;
  }

  require(filePath) {
    ok(typeof filePath === 'string', 'path must be a string');
    return Module.loadFile(filePath, this);
  }

  _compile(content, filename) {
    // eslint-disable-next-line
    require.resolve = request => NativeModule._resolveFilename(request, this);
    require.main = process.mainModule;
    require.extensions = moduleExtensions;
    require.cache = this.cache;


    // create wrapper function
    const wrapper = NativeModule.wrap(content);

    const options = {
      filename,
      displayErrors: true,
    };

    let compiledWrapper;
    const usePreviouslyCachedWrapper = this.preferCachedInializer && initializerCache.has(this.id);
    if (usePreviouslyCachedWrapper) {
      compiledWrapper = initializerCache.get(this.id);
    } else {
      compiledWrapper = runInNewContext(wrapper, this.context, options);

      // If we're using the global context, we're also preferring the cached inializer.
      // We can only cache the initializer if we're using the global context
      // If we're not using the global context, we don't want to cache the initializer
      // because the cached initializer won't be using the global context.
      if (this.preferCachedInializer && this.useGlobalContext) {
        initializerCache.set(this.id, compiledWrapper);
      }
    }

    return this.runInitializer(compiledWrapper);
  }

  runInitializer(initializer) {
    const self = this;

    function require(filePath) {
      return self.require(filePath);
    }

    const dirname = path.dirname(this.filename);
    return initializer.call(this.exports, this.exports, require, this, this.filename, dirname);
  }

  static load(id, filename = id) {
    const module = new Module(id);
    module.load(filename);
    module.run(filename);
    return module;
  }

  static loadFile(file, parent) {
    // eslint-disable-next-line 
    const filename = NativeModule._resolveFilename(file, parent);

    if (parent) {
      const cachedModule = parent.cache[filename];
      if (cachedModule) return cachedModule.exports;
    }

    if (isNativeModule(filename)) {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      return require(filename);
    }

    const module = new Module(filename, parent);

    module.cache[filename] = module;

    let hadException = true;

    try {
      module.load(filename);
      module.run(filename);
      hadException = false;
    } finally {
      if (hadException) {
        delete module.cache[filename];
      }
    }

    return module.exports;
  }

  static addExtension(ext, f) {
    moduleExtensions[ext] = f;
  }

  // Initializes the global context. If you're using the global context,
  // you should call this function before every request in order to
  // prevent globals from bleeding between requests
  // don't build a new context,
  // just clear out the object and reattach stuff
  static initGlobalContext(newGlobalProps) {
    Object.keys(globalContext).forEach((prop) => {
      delete globalContext[prop];
    });

    Object.assign(globalContext, baseGlobals, newGlobalProps);

    globalContext.global = globalContext;

    return globalContext;
  }

  static clearInitializerCache() {
    initializerCache.reset();
  }
}

export default Module;
