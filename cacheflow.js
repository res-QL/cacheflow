const fs = require('fs');
const redis = require('redis');

exports.testMsg = function () {
  console.log('This is a test message from cacheflow');
};

exports.initCache = function (configObj) {
  //if user wants to cache they must initialize the cache locations by using these.
  fs.writeFileSync('localMetricsStorage.json', '{}');
  if (configObj.local) {
    /*
    VALID LOCAL STORAGE CONFIG:
    {
      local: {
        name: NAME
      }
    }
    */
    //check if config is valid
    if (
      configObj.local.name === undefined &&
      typeof configObj.local.name !== 'string'
    )
      throw new Error('Local storage configuration is invalid.');
    //fs filesync stuff
    fs.writeFileSync(`localStorage.json`, '{}');
  }
  if (configObj.redis) {
    /*
    VALID REDIS STORAGE CONFIG:
    {
      redis: {
        host: HOSTNAME,
        port: PORT,
        password: PASSWORD
      }
    }
    */
    //check if config is valid: contains redis ip, port, password, etc.
    if (
      configObj.redis.host === undefined ||
      configObj.redis.port === undefined ||
      configObj.redis.password === undefined
    ) {
      throw new Error('Redis storage configuration is invalid.');
    }
    //redis server connect

    const client = redis.createClient({
      host: configObj.redis.host,
      port: configObj.redis.port,
      password: configObj.redis.password,
    });

    client.on('error', (err) => {
      throw new Error(err);
    });
  }
};

const track = {}; //this will keep track of how many times data is requested

exports.cache = function (cacheConfig = {}, info, callback) {
  //intital time stamp of request
  const startDate = Date.now();

  //Checks to make sure cacheConfig is valid
  if (typeof cacheConfig !== 'object' || Array.isArray(cacheConfig))
    throw new Error('Config object is invalid');

  //if user specified local as storage location:
  if (cacheConfig.location === 'local') {
    //Read local storage file and look for same resolver
    const cachedData = fs.readFileSync('./localStorage.json', 'utf8');
    const parsedData = JSON.parse(cachedData);

    return (() => {
      //if same resolver was found in cache
      if (parsedData[info.path.key]) {
        console.log('Data found in cache');

        const requestLatencyCached = Date.now() - startDate;
        console.log('Request latency: ', Date.now() - startDate, 'ms');
        metrics({ cachedLatency: requestLatencyCached }, info);
        return parsedData[info.path.key];
      } else {
        //if resolver is not found in cache
        const returnData = callback(); //run callback
        console.log('Data not found in cache, caching now.');

        parsedData[info.path.key] = returnData; //Append new data to cache

        //Update cache with new data
        fs.writeFile('localStorage.json', JSON.stringify(parsedData), (err) => {
          if (err) throw new Error(err);
        });
        const requestLatencyUncached = Date.now() - startDate;
        metrics({ uncachedLatency: requestLatencyUncached }, info);
        console.log('Request latency: ', requestLatencyUncached, 'ms');
        console.log(returnData);
        //return new data
        return returnData;
      }
    })();
  }

  //if user specified redis as storage location:
  if (cacheConfig.location === 'redis') {
    console.log('stored on redis');
  }
};

function metrics(resolverData, info) {
  console.log(resolverData);

  //have to make sure the info gets passed in
  //Reads from metrics json file
  const cachedMetrics = fs.readFileSync('./localMetricsStorage.json', 'utf8');
  const parsedMetrics = JSON.parse(cachedMetrics);

  if (parsedMetrics[info.path.key]) {
    //Current time of request
    const date = Date.now();

    //MAKES AN ARRAY OF MAX LENGTH TEN WITH TIMESTAMPS OF REQUESTS
    let allCalls = parsedMetrics[info.path.key].allCalls;
    allCalls.push(date);
    allCalls.length > 10 ? allCalls.shift() : allCalls;

    //CHECKS HOW HOT THE RESOLVER IS (TIME IT TOOK FOR THE LAST TEN CALLS)
    //WE COULD ALSO MAKE THE SIZE UP TO 100 AND THEN FOR THE PAST TEN JUST
    //PLUG IN ALLCALLS.LENGTH-10
    parsedMetrics[info.path.key].averageCallSpan = date - allCalls[0];

    //INCREASE NUMBER OF CALLS BY ONE
    parsedMetrics[info.path.key].numberOfCalls += 1;

    // MAX AGE OF THE REQUEST
    const maxAge = date - parsedMetrics[info.path.key].firstcall;

    //UPDATE CACHED LATENCY
    parsedMetrics[info.path.key].cachedCallTime = resolverData.cachedLatency;

    //LOCATION OF CACHED DATA (LOCAL/REDIS) right now all the data is saved locally

    //LENGTH OF REQUEST UNCACHED maybe pass this down from the cache fxn itself?
    //LENGTH OF REQUEST CACHED maybe pass this down from the cache fxn itself?

    //SIZE OF DATA

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
      firstCall: Date.now(),
      allCalls: [Date.now()], //we can update this will a timestamp from every call
      numberOfCalls: 1,
      averageCallSpan: 'Insufficient Data',
      uncachedCallTime: resolverData.uncachedLatency,
      cachedCallTime: null,
    };

    fs.writeFile(
      'localMetricsStorage.json',
      JSON.stringify(parsedMetrics),
      (err) => {
        if (err) throw new Error(err);
      }
    );
  }
}
