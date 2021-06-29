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
        metrics(info);
        console.log('Request latency: ', Date.now() - startDate, 'ms');

        return parsedData[info.path.key];
      } else {
        //if resolver is not found in cache
        const returnData = callback(); //run callback
        console.log('Data not found in cache, caching now.');
        metrics(info);
        parsedData[info.path.key] = returnData; //Append new data to cache

        //Update cache with new data
        fs.writeFile('localStorage.json', JSON.stringify(parsedData), (err) => {
          if (err) throw new Error(err);
        });
        const requestLatency = Date.now() - startDate;
        console.log('Request latency: ', requestLatency, 'ms');
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

function metrics(info) {
  //have to make sure the info gets passed in
  //Reads from metrics json file
  const cachedMetrics = fs.readFileSync('./localMetricsStorage.json', 'utf8');
  const parsedMetrics = JSON.parse(cachedMetrics);

  if (parsedMetrics[info.path.key]) {
    const { numberOfCalls, allCalls, averageCallSpan } =
      parsedMetrics[info.path.key];
    console.log('number of calls', numberOfCalls);

    // INCREASE HITCOUNT BY ONE
    parsedMetrics[info.path.key].numberOfCalls++;

    // TAKE TIMESTAMP OF CURRENT HIT, TAKE DIFFERENCE FROM HIT
    //BEFORE AND CALCULATE NEW AVG
    // THIS WILL CHECK IF THRESHOLD IS HIT

    const curTime = Date.now();
    parsedMetrics[info.path.key].allCalls.push(curTime);

    // const dateWindow = curTime - firstCall; //total time elapsed
    const timeSinceLastCall = curtime - parsedMetrics[info.path.key].lastCall;

    // parsedMetrics[info.path.key].averageCallSpan *

    // timesCalled++/TotalTimesElapse

    // MAX AGE OF THE REQUEST

    //LOCATION OF CACHED DATA (LOCAL/REDIS)
    //LENGTH OF REQUEST UNCACHED
    //LENGTH OF REQUEST CACHED
    //SIZE OF DATA
  } else {
    //TO DO IF NOT IN METRICS

    parsedMetrics[info.path.key] = {
      firstCall: Date.now(),
      allCalls: [this.firstCall], //we can update this will a timestamp from every call
      numberOfCalls: 1,
      averageCallSpan: 'Insufficient Data',
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
