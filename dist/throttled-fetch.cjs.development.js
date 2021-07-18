'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var fetch = /*#__PURE__*/require('cross-fetch');
/*
Client side throttling
Read more at - https://sre.google/sre-book/handling-overload/
*/

/* Utils */
// Remove query params to reduce the no. of unique keys in the requestsMap


var sanitizeUrl = function sanitizeUrl(url) {
  var urlMinusQuery = url.split('?')[0];
  return urlMinusQuery;
};

var diffInSeconds = function diffInSeconds(a, b) {
  return Math.round((a.valueOf() - b.valueOf()) / 1000);
}; // A place to store the requests' totalCount and acceptance count using their urls as keys

var requestsMap = /*#__PURE__*/new Map();
/* --- */

/* Core methods */
// We need the 'time' value here for every item because a lot of these items could be outdated (out of our current window of interest),
// as we only clean them up on a need-to-do basis when we replace an item
// During the update phase, if we arrive at a time that is more than [windowLength] seconds from head we update the head
// For more on update see updateRequestValues below

var getTwoMinuteWindow = function getTwoMinuteWindow(now, windowLength) {
  return {
    head: now,
    values: new Array(windowLength).fill({
      requests: 0,
      accepts: 0,
      time: null
    })
  };
};

var cleanUpTaskId; // Returns the sum of all [requests, acceptedRequests] in the last [windowLength] second window

var getRequestValues = function getRequestValues(reqWindow, now, windowLength) {
  var reqValues = reqWindow.values;
  return reqValues.reduce(function (acc, _ref) {
    var time = _ref.time,
        requests = _ref.requests,
        accepts = _ref.accepts;

    if (time && diffInSeconds(now, time) < windowLength) {
      return [acc[0] + requests, acc[1] + accepts];
    }

    return acc;
  }, [0, 0]);
}; // If the time we are updating for, represented by 'now', is out of the range of current head,
// we replace the head with 'now' and set its values to the first item
// If the time we are updating falls within the window of [head + winddowLength seconds] we update the item representing the current second

var updateRequestValues = function updateRequestValues(url, now, windowLength, incRequests, incAccepts) {
  if (incRequests === void 0) {
    incRequests = false;
  }

  if (incAccepts === void 0) {
    incAccepts = false;
  }

  var requestWindow = requestsMap.get(url);

  if (requestWindow) {
    var head = requestWindow.head,
        reqValues = requestWindow.values;
    var diffFromHead = diffInSeconds(now, head);

    if (diffFromHead >= windowLength) {
      reqValues[0] = {
        requests: incRequests ? 1 : 0,
        accepts: incAccepts ? 1 : 0,
        time: now
      };
      requestsMap.set(url, {
        head: now,
        values: reqValues
      });
    } else {
      var currentVal = reqValues[diffFromHead];
      reqValues[diffFromHead] = {
        requests: incRequests ? currentVal.requests + 1 : currentVal.requests,
        accepts: incAccepts ? currentVal.accepts + 1 : currentVal.accepts,
        time: now
      };
    }
  }

  return;
}; // Go through the entries and clean up all the ones that haven't been updated in the last 2.5 * [windowLength] seconds

var cleanUpOldEntries = function cleanUpOldEntries(windowLength) {
  return function () {
    requestsMap.forEach(function (_ref2, key) {
      var head = _ref2.head;

      if (diffInSeconds(new Date(), head) > 2.5 * windowLength) {
        requestsMap["delete"](key);
      }
    });
  };
};
/* --- */
// Multiplier that determines aggressiveness of throttling
// Higher value is less agressive, 2 is recommended


var defaultK = 2; // Determines how many seconds wide the requestWindow is.
// Default is 120 seconds i.e rejection probability is based on how well the backend has been performing in the last 2 minutes

var defaultWindowLength = 120; // Determines how often requestsMap is cleaned (delete old keys), default 60 seconds

var defaultCleanUpFreq = 60;
var defaultOptions = {
  K: defaultK,
  windowLength: defaultWindowLength,
  cleanupFrequency: defaultCleanUpFreq
};
var throttler = function throttler(_temp) {
  var _ref3 = _temp === void 0 ? defaultOptions : _temp,
      _ref3$K = _ref3.K,
      K = _ref3$K === void 0 ? defaultK : _ref3$K,
      _ref3$windowLength = _ref3.windowLength,
      windowLength = _ref3$windowLength === void 0 ? defaultWindowLength : _ref3$windowLength,
      _ref3$cleanupFrequenc = _ref3.cleanupFrequency,
      cleanupFrequency = _ref3$cleanupFrequenc === void 0 ? defaultCleanUpFreq : _ref3$cleanupFrequenc;

  return function (url) {
    if (!cleanUpTaskId) {
      // Setup cleanup job to run every minute if it hasn't already been setup
      cleanUpTaskId = setInterval(cleanUpOldEntries(windowLength), cleanupFrequency * 1000);
    }

    var now = new Date();

    if (!requestsMap.has(url)) {
      // If the requestsMap doesn't have an entry for the current url, create one
      requestsMap.set(url, getTwoMinuteWindow(now, windowLength));
    }

    var requestWindow = requestsMap.get(url);

    var _getRequestValues = getRequestValues(requestWindow, now, windowLength),
        requests = _getRequestValues[0],
        accepts = _getRequestValues[1];

    var chanceOfThrottle = Math.max(0, (requests - K * accepts) / (requests + 1));

    if (Math.random() < chanceOfThrottle) {
      return [true, function (x) {
        return x;
      }];
    }

    return [false, function (isSuccess) {
      return updateRequestValues(url, now, windowLength, true, isSuccess);
    }];
  };
};

var throttledFetch = function throttledFetch(throttleOptions) {
  return function (url, options, applyThrottling, removeQueryParams, throttle400s) {
    if (options === void 0) {
      options = {};
    }

    if (applyThrottling === void 0) {
      applyThrottling = true;
    }

    if (removeQueryParams === void 0) {
      removeQueryParams = true;
    }

    if (throttle400s === void 0) {
      throttle400s = false;
    }

    var callOnComplete;

    if (applyThrottling) {
      var shouldThrottle;
      var requestThrottler = throttler(throttleOptions);

      var _requestThrottler = requestThrottler(removeQueryParams ? sanitizeUrl(url) : url);

      shouldThrottle = _requestThrottler[0];
      callOnComplete = _requestThrottler[1];

      if (shouldThrottle) {
        return Promise.reject(new Error('The request was throttled.'));
      }
    }

    var throttleThresholdCode = throttle400s ? 400 : 500;
    return fetch(url, options).then(function (res) {
      (res == null ? void 0 : res.status) < throttleThresholdCode ? callOnComplete(true) : callOnComplete(false);
      return res;
    })["catch"](function (err) {
      if (err.name === 'AbortError') {
        throw err;
      } else {
        callOnComplete(false);
        throw err;
      }
    });
  };
};

exports.default = throttledFetch;
exports.diffInSeconds = diffInSeconds;
exports.getRequestValues = getRequestValues;
exports.requestsMap = requestsMap;
exports.throttler = throttler;
exports.updateRequestValues = updateRequestValues;
//# sourceMappingURL=throttled-fetch.cjs.development.js.map
