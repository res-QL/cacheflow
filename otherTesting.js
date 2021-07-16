const { cache } = require('./cacheflow.js');

console.log(
  cache({ location: 'local' }, { path: { key: 'hello' } }, function () {
    return 1;
  })
);
