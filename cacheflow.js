exports.testMsg = function () {
  console.log("This is a test message from cacheflow");
};

const track = {}; //this will keep track of how many times data is requested

exports.cache = async function (cacheConfig = {}, callback) {
  //metric provider function
  console.log("This is cache test message");
  const startDate = Date.now();
  if (typeof cacheConfig !== "object" || Array.isArray(cacheConfig))
    throw new Error("Config object is invalid");

  // if (cacheConfig.location === 'local') {
  //   console.log('stored locally');

  //   if (track[cacheConfig.info.])

  //   const dataBack = await callback()
  // }

  //check where user wants to cache?

  //are thresholds going to be in this?

  //how do we set up a terminal command to provide user data, what will that data show

  track[cacheConfig.resolverName] //in here the key shouldnt just be a count, it should take total time and // divide by the number of times the endpoint gets hit
    ? track[cacheConfig.resolverName]++
    : (track[cacheConfig.resolverName] = 1);

  console.log(track);

  const dataBack = await callback();

  console.log("Request latency: ", Date.now() - startDate, "ms");

  return dataBack;
};

//auto cache function

//in here could we provide the user with an idea of how much time is saved?

//
