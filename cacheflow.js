const fs = require('fs');
const redis = require('redis');
const { promisify } = require('util');

exports.testMsg = function () {
  console.log('This is a test message from cacheflow');
};

let client;

/*
----------------------------------------------------------------------------
INITIALIZE CACHE FUNCTION: initCache()



*/

exports.initCache = function (configObj) {
  //if user wants to cache they must initialize the cache locations by using these.
  fs.writeFileSync('localMetricsStorage.json', '{}');
  fs.writeFileSync(
    'globalMetrics.json',
    JSON.stringify({
      totalNumberOfRequests: 0,
      totalTimeSaved: 0,
      sizeOfDataRedis: 0,
      sizeOfDataLocal: 0,
    })
  );

  //If user specified to intialize local storage
  if (configObj.local) {
    fs.writeFileSync(`localStorage.json`, '{}');

    setInterval(() => {
      clean();
    }, configObj.local.checkExpire * 1000);
  }

  //If user specified to intialize redis storage
  if (configObj.redis) {
    //redis server connect
    client = redis.createClient({
      host: configObj.redis.host,
      port: configObj.redis.port,
      password: configObj.redis.password,
    });

    client.on('error', (err) => {
      throw new Error(err);
    });
  }
};

/*
-------------------------------------------------------------
CACHE FUNCTION: cache()





*/

exports.cache = async function (cacheConfig = {}, info, callback) {
  //Checks to make sure cacheConfig is valid
  if (typeof cacheConfig !== 'object' || Array.isArray(cacheConfig))
    throw new Error('Config object is invalid');

  //if user specified local as storage location:
  if (cacheConfig.location === 'local') {
    return cacheLocal(cacheConfig, info, callback);
  }

  //if user specified redis as storage location:
  if (cacheConfig.location === 'redis') {
    return cacheRedis(cacheConfig, info, callback);
  }
};

async function cacheLocal(cacheConfig, info, callback) {
  //Read local storage file and look for same resolver
  const cachedData = fs.readFileSync('./localStorage.json', 'utf8');
  const parsedData = JSON.parse(cachedData);

  const startDate = Date.now();

  //Only if type is Mutation
  if (cacheConfig.mutate) {
    parsedData[cacheConfig.mutate] = {
      data: await callback(),
      expire: Date.now() + cacheConfig.maxAge * 1000,
    };

    fs.writeFile('localStorage.json', JSON.stringify(parsedData), (err) => {
      if (err) throw new Error(err);
    });

    return parsedData[cacheConfig.mutate].data;
  }

  //if same resolver was found in cache
  if (parsedData[info.path.key]) {
    const currentTime = Date.now();
    const requestLatencyCached = currentTime - startDate;

    console.log('Data found in cache');
    console.log('Request latency: ', requestLatencyCached, 'ms');

    parsedData[info.path.key].expire = currentTime + cacheConfig.maxAge * 1000;

    metrics({ cachedLatency: requestLatencyCached }, info);
  } else {
    //If cant find resolver in cache
    const returnData = await callback(); //run callback
    const currentTime = Date.now();

    console.log('Data not found in cache, caching now.');

    parsedData[info.path.key] = {
      data: returnData,
      expire: currentTime + cacheConfig.maxAge * 1000,
    }; //Append new data to cache

    const requestLatencyUncached = currentTime - startDate;
    metrics(
      {
        uncachedLatency: requestLatencyUncached,
        returnData,
        storedLocation: 'local',
      },
      info
    );
    console.log('Request latency: ', requestLatencyUncached, 'ms');
  }

  fs.writeFile('localStorage.json', JSON.stringify(parsedData), (err) => {
    if (err) throw new Error(err);
  });
  return parsedData[info.path.key].data;
}

async function cacheRedis(cacheConfig, info, callback) {
  const startDate = Date.now();
  const getAsync = promisify(client.get).bind(client);
  let redisData;
  let responseTime;

  if (cacheConfig.mutate) {
    const returnData = await callback();
    client.set(cacheConfig.mutate, JSON.stringify(returnData));
    client.expire(cacheConfig.mutate, cacheConfig.maxAge);

    console.log('Request latency: ', Date.now() - startDate, 'ms');
    return returnData;
  }

  await getAsync(info.path.key).then(async (res) => {
    if (res === null) {
      console.log('Data not found in redis, caching now.');
      const returnData = await callback();
      client.set(info.path.key, JSON.stringify(returnData));
      client.expire(info.path.key, cacheConfig.maxAge);
      redisData = returnData;
      responseTime = Date.now() - startDate;
      metrics(
        {
          uncachedLatency: responseTime,
          storedLocation: 'redis',
          returnData,
        },
        info
      );
    } else {
      console.log('Data found in redis.');
      redisData = JSON.parse(res);
      client.expire(info.path.key, cacheConfig.maxAge);
      responseTime = Date.now() - startDate;
      metrics({ cachedLatency: responseTime }, info);
    }
  });

  console.log('Request latency: ', responseTime, 'ms');
  return redisData;
}

function metrics(resolverData, info) {
  //Reads from metrics json file
  const cachedMetrics = fs.readFileSync('./localMetricsStorage.json', 'utf8');
  const parsedMetrics = JSON.parse(cachedMetrics);

  if (parsedMetrics[info.path.key]) {
    const date = Date.now();

    //MAKES AN ARRAY OF MAX LENGTH TEN WITH TIMESTAMPS OF REQUESTS
    let allCalls = parsedMetrics[info.path.key].allCalls;
    allCalls.push(date);
    allCalls.length > 10 ? allCalls.shift() : allCalls;

    //PLUG IN ALLCALLS.LENGTH-10
    parsedMetrics[info.path.key].averageCallSpan = date - allCalls[0];

    //INCREASE NUMBER OF CALLS BY ONE
    parsedMetrics[info.path.key].numberOfCalls += 1;

    parsedMetrics[info.path.key].cachedCallTime = resolverData.cachedLatency;

    fs.writeFile(
      'localMetricsStorage.json',
      JSON.stringify(parsedMetrics),
      (err) => {
        if (err) {
          throw new Error(err);
        }
      }
    );
  } else {
    parsedMetrics[info.path.key] = {
      firstCall: Date.now(), //timestamp from first call
      allCalls: [Date.now()], //array of timestamps from calls
      numberOfCalls: 1, // total number of calls for resolver
      averageCallSpan: 'Insufficient Data', //avg time between calls
      uncachedCallTime: resolverData.uncachedLatency, //time to respond with unqueried data
      cachedCallTime: null, //time to respond with queried data
      dataSize: sizeOf(resolverData.returnData),
      storedLocation: resolverData.storedLocation,
    };

    fs.writeFile(
      'localMetricsStorage.json',
      JSON.stringify(parsedMetrics),
      (err) => {
        if (err) throw new Error(err);
      }
    );
  }

  //------------------------- GLOBAL METRICS ----------------------------------

  const globalMetrics = fs.readFileSync('globalMetrics.json', 'utf8');
  let globalMetricsParsed = JSON.parse(globalMetrics);

  //TOTAL NUMBER OF REQUESTS
  globalMetricsParsed.totalNumberOfRequests++;

  //TOTAL AMOUNT OF TIME SAVED BY CACHING
  globalMetricsParsed.totalTimeSaved +=
    parsedMetrics[info.path.key].uncachedCallTime -
    parsedMetrics[info.path.key].cachedCallTime;

  // SIZE/AMOUNT OF DATA SAVED ON REDIS AND LOCAL
  resolverData.storedLocation === 'local'
    ? (globalMetricsParsed.sizeOfDataLocal += sizeOf(resolverData.returnData))
    : (globalMetricsParsed.sizeOfDataRedis += sizeOf(resolverData.returnData));

  fs.writeFile(
    'globalMetrics.json',
    JSON.stringify(globalMetricsParsed),
    (err) => {
      if (err) throw new Error(err);
    }
  );
}

function clean() {
  console.log('Cleaning');
  const dateNow = Date.now();

  const curData = fs.readFileSync('localStorage.json', 'utf8');
  let parsedData = JSON.parse(curData);

  const curGlobalData = fs.readFileSync('globalMetrics.json', 'utf8');
  let parsedGlobalData = JSON.parse(curGlobalData);

  const curLocalData = fs.readFileSync('localMetricsStorage.json', 'utf8');
  let parsedLocalData = JSON.parse(curLocalData);

  let sizeOfDeletedDataLocal = 0;

  for (let resolver in parsedData) {
    console.log('resolver.expire', parsedData[resolver]);
    if (dateNow > parsedData[resolver].expire) {
      console.log('deleting');
      sizeOfDeletedDataLocal += parsedLocalData[resolver].dataSize;
      delete parsedData[resolver];
    }
  }

  client.info((req, res) => {
    res.split('\n').map((line) => {
      if (line.match(/used_memory:/)) {
        console.log(line.split(':')[1]);

        parsedGlobalData.sizeOfDataRedis = parseInt(line.split(':')[1]);
        parsedGlobalData.sizeOfDataLocal -= sizeOfDeletedDataLocal;

        fs.writeFile(
          'globalMetrics.json',
          JSON.stringify(parsedGlobalData),
          (err) => {
            if (err) throw new Error(err);
          }
        );
      }
    });
  });

  fs.writeFile('localStorage.json', JSON.stringify(parsedData), (err) => {
    if (err) throw new Error(err);
  });
}

//Function to determine size of obj
const typeSizes = {
  undefined: () => 0,
  boolean: () => 4,
  number: () => 8,
  string: (item) => 2 * item.length,
  object: (item) =>
    !item
      ? 0
      : Object.keys(item).reduce(
          (total, key) => sizeOf(key) + sizeOf(item[key]) + total,
          0
        ),
};

const sizeOf = (value) => typeSizes[typeof value](value);
