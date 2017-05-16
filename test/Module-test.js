import { assert } from 'chai';
import has from 'has';
import { Module } from '../server';
import mutableArray from './mutableArray';

function instantiateModule(code, options = {}) {
  const name = __filename;

  const module = new Module({ id: name, ...options });
  module.load(name);
  // eslint-disable-next-line no-underscore-dangle
  module._compile(code, name);

  return module;
}

function run(code, options = {}) {
  return instantiateModule(code, options).exports;
}

describe('Module', () => {
  it('does not leak globals across requests', () => {
    global.foo = 10;
    const code = `
      global.foo = global.foo || 0;
      global.foo += 1;
    `;
    run(code);
    assert(global.foo === 10, 'our environment\'s global was unaffected');
    run(code);
    assert(global.foo === 10, 'our environment\'s global was unaffected after a second run');
  });

  it('loads a module and return the instance', () => {
    const module = Module.load('./test/mutableArray.js');
    assert(has(module, 'exports') === true, 'module has exports property');
    assert.isArray(module.exports, 'module.exports is our array');
  });

  it('should not be able to mutate singletons', () => {
    assert(mutableArray.length === 0, 'our array is empty');

    mutableArray.push(1, 2, 3);

    assert(mutableArray.length === 3, 'our array has a length of 3');

    const code = `
      var mutableArray = require('./mutableArray');
      mutableArray.push(1);
      module.exports = mutableArray;
    `;

    const arr = run(code);

    assert(mutableArray !== arr, 'both arrays do not equal each other');
    assert(arr.length === 1, 'returned mutableArray has length of 1');
    assert(mutableArray.length === 3, 'our array still has a length of 3');
  });

  it('creates a new context for a new module by default', () => {
    const code = 'global.foo = 1';

    const moduleV1 = instantiateModule(code);
    const moduleV2 = instantiateModule(code);

    assert(moduleV1.context !== moduleV2.context, 'a new context was created');
  });

  it('caches the module initializer if instructed to', () => {
    // Initial context, which is passed internally in the call to vm.runInNewContext
    // If we run this module again, and request Module to ininitalize using the cached initializer,
    // it will reuse the same global context.
    //
    // You might think that reusing the global context is a bad thing. It's not ideal,
    // but it allows us to cache the module initializer function.
    //
    // This isn't the most straightforward test of initializer reuse,
    // but it's the best I can come up with right now.

    const code = 'module.exports = global';

    Module.initGlobalContext();
    const moduleV1 = instantiateModule(code, {
      useGlobalContext: true,
      preferCachedInializer: true,
    });

    const moduleV2 = instantiateModule(code, {
      useGlobalContext: true,
      preferCachedInializer: true,
    });

    assert(moduleV1.exports === moduleV2.exports, 'the global object in each version of the module is the same');
    assert(moduleV1.context === moduleV2.context, 'the first context was reused');
  });

  it('clears the module inializer cache', () => {
    // just make sure it doesn't blow up
    Module.clearInitializerCache();
  });
});
