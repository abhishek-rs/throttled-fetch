const fetch = require('cross-fetch');

/*
Client side throttling
Read more at - https://sre.google/sre-book/handling-overload/
*/

/* Utils */

// Remove query params to reduce the no. of unique keys in the requestsMap
const sanitizeUrl = (url: string) => {
  const urlMinusQuery = url.split('?')[0];
  return urlMinusQuery;
};

export const diffInSeconds = (a: Date, b: Date) => {
  return Math.round((a.valueOf() - b.valueOf()) / 1000);
};

/* --- */

/* Requests' recent history store */

// We need to keep the no. of requests and no. of accepted requests for the last [windowLength] seconds and disregard the rest
// This is done here by using arrays of [windowLength] items, for every url, each representing the second that is [index] seconds away from head
// i.e index 0 represents the head, index 1 represents 1 second ahead of the head
interface WindowItem {
  requests: number;
  accepts: number;
  time: Date;
}
interface RequestMapEntry {
  head: Date;
  values: Array<WindowItem>;
}
interface ThrottlerOptions {
  K: number;
  windowLength: number; // seconds
  cleanupFrequency: number; // seconds
}

// A place to store the requests' totalCount and acceptance count using their urls as keys
export const requestsMap: Map<string, RequestMapEntry> = new Map();

/* --- */

/* Core methods */

// We need the 'time' value here for every item because a lot of these items could be outdated (out of our current window of interest),
// as we only clean them up on a need-to-do basis when we replace an item
// During the update phase, if we arrive at a time that is more than [windowLength] seconds from head we update the head
// For more on update see updateRequestValues below
const getTwoMinuteWindow = (now: Date, windowLength: number) => ({
  head: now,
  values: new Array(windowLength).fill({
    requests: 0,
    accepts: 0,
    time: null,
  }),
});

let cleanUpTaskId: NodeJS.Timer;

// Returns the sum of all [requests, acceptedRequests] in the last [windowLength] second window
export const getRequestValues = (
  reqWindow: RequestMapEntry,
  now: Date,
  windowLength: number
) => {
  const { values: reqValues } = reqWindow;
  return reqValues.reduce(
    (acc: Array<number>, { time, requests, accepts }: WindowItem) => {
      if (time && diffInSeconds(now, time) < windowLength) {
        return [acc[0] + requests, acc[1] + accepts];
      }
      return acc;
    },
    [0, 0]
  );
};

// If the time we are updating for, represented by 'now', is out of the range of current head,
// we replace the head with 'now' and set its values to the first item
// If the time we are updating falls within the window of [head + winddowLength seconds] we update the item representing the current second
export const updateRequestValues = (
  url: string,
  now: Date,
  windowLength: number,
  incRequests: boolean = false,
  incAccepts: boolean = false
) => {
  const requestWindow = requestsMap.get(url);

  if (requestWindow) {
    const { head, values: reqValues } = requestWindow;
    const diffFromHead = diffInSeconds(now, head);

    if (diffFromHead >= windowLength) {
      reqValues[0] = {
        requests: incRequests ? 1 : 0,
        accepts: incAccepts ? 1 : 0,
        time: now,
      };
      requestsMap.set(url, { head: now, values: reqValues });
    } else {
      const currentVal = reqValues[diffFromHead];
      reqValues[diffFromHead] = {
        requests: incRequests ? currentVal.requests + 1 : currentVal.requests,
        accepts: incAccepts ? currentVal.accepts + 1 : currentVal.accepts,
        time: now,
      };
    }
  }

  return;
};

// Go through the entries and clean up all the ones that haven't been updated in the last 2.5 * [windowLength] seconds
const cleanUpOldEntries = (windowLength: number) => () => {
  requestsMap.forEach(({ head }, key) => {
    if (diffInSeconds(new Date(), head) > 2.5 * windowLength) {
      requestsMap.delete(key);
    }
  });
};

/* --- */

// Multiplier that determines aggressiveness of throttling
// Higher value is less agressive, 2 is recommended
const defaultK = 2;

// Determines how many seconds wide the requestWindow is.
// Default is 120 seconds i.e rejection probability is based on how well the backend has been performing in the last 2 minutes
const defaultWindowLength = 120;

// Determines how often requestsMap is cleaned (delete old keys), default 60 seconds
const defaultCleanUpFreq = 60;

const defaultOptions = {
  K: defaultK,
  windowLength: defaultWindowLength,
  cleanupFrequency: defaultCleanUpFreq,
};

export const throttler = ({
  K = defaultK,
  windowLength = defaultWindowLength,
  cleanupFrequency = defaultCleanUpFreq,
}: ThrottlerOptions = defaultOptions) => (url: string) => {
  if (!cleanUpTaskId) {
    // Setup cleanup job to run every minute if it hasn't already been setup
    cleanUpTaskId = setInterval(
      cleanUpOldEntries(windowLength),
      cleanupFrequency * 1000
    );
  }

  const now = new Date();
  if (!requestsMap.has(url)) {
    // If the requestsMap doesn't have an entry for the current url, create one
    requestsMap.set(url, getTwoMinuteWindow(now, windowLength));
  }
  const requestWindow: RequestMapEntry = requestsMap.get(url)!;
  const [requests, accepts] = getRequestValues(
    requestWindow,
    now,
    windowLength
  );

  const chanceOfThrottle = Math.max(
    0,
    (requests - K * accepts) / (requests + 1)
  );

  if (Math.random() < chanceOfThrottle) {
    return [true, (x: boolean) => x] as const;
  }

  return [
    false,
    (isSuccess: boolean) =>
      updateRequestValues(url, now, windowLength, true, isSuccess),
  ] as const;
};

const throttledFetch = (throttleOptions: ThrottlerOptions) => (
  url: string,
  options: object = {},
  applyThrottling: boolean = true,
  removeQueryParams: boolean = true,
  throttle400s: boolean = false
) => {
  let callOnComplete: any;
  if (applyThrottling) {
    let shouldThrottle;
    const requestThrottler = throttler(throttleOptions);
    [shouldThrottle, callOnComplete] = requestThrottler(
      removeQueryParams ? sanitizeUrl(url) : url
    );

    if (shouldThrottle) {
      callOnComplete(false);
      return Promise.reject(new Error('The request was throttled.'));
    }
  }

  const throttleThresholdCode = throttle400s ? 400 : 500;

  return fetch(url, options)
    .then((res: Response) => {
      if (applyThrottling) {
        res?.status < throttleThresholdCode
          ? callOnComplete(true)
          : callOnComplete(false);
      }
      return res;
    })
    .catch((err: Error) => {
      if (err.name === 'AbortError') {
        throw err;
      } else {
        applyThrottling && callOnComplete(false);
        throw err;
      }
    });
};

export default throttledFetch;
