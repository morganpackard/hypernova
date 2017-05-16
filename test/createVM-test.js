import { assert } from 'chai';
import { createVM } from '../server';

describe('createVM', () => {
  let vm;

  beforeEach(() => {
    vm = createVM();
  });

  it('runs the code', () => {
    const code = `
      module.exports = 12;
    `;
    const num = vm.run('test.js', code);

    assert(num === 12, 'returned value was given');
  });

  it('adds data passed in to the global context in which the module is run', () => {
    const code = `
      module.exports = foo;
    `;

    const exports = vm.run('test.js', code, {
      preferCachedInializer: true,
      useGlobalContext: true,
      globals: { foo: 'foo' },
    });

    assert(exports === 'foo', 'foo was retrieved from the global context');
  });

  it('does not bleed globals from one request to the next', () => {
    // possibly counterintuitively, turning global context
    // on triggers the clearing of the global context

    const module = `
      module.exports = global.foo;
    `;

    vm.run('module1', module, {
      preferCachedInializer: true,
      useGlobalContext: true,
      globals: { foo: 'foo' },
    });

    const exports = vm.run('module1', module, {
      preferCachedInializer: true,
      useGlobalContext: true,
    });

    assert(exports !== 'foo', 'foo was not retrieved from the global context');
  });

  it('caches module.exports', () => {
    process.foo = 0;
    const code = `
      process.foo += 1;
      module.exports = process.foo;
    `;

    const num = vm.run('test.js', code);

    assert(num === 1, 'the resulting code was incremented');

    const nextNum = vm.run('test.js', code);

    assert(nextNum === 1, 'the module.exports was cached');
  });

  it('flushes the cache', () => {
    vm.run('test.js', '');
    assert(vm.exportsCache.itemCount === 1, 'the cache has 1 entry');
    vm.exportsCache.reset();
    assert(vm.exportsCache.itemCount === 0, 'the cache was reset');
  });
});
