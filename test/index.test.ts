import {
  throttler,
  requestsMap,
  getRequestValues,
  updateRequestValues,
  diffInSeconds,
} from '../src';

const addTimeInSeconds = (base: Date, seconds: number) => {
  const updatedTime = new Date(base);
  updatedTime.setTime(updatedTime.getTime() + seconds * 1000);
  return updatedTime;
};

const mockOptions = {
  K: 2,
  windowLength: 120,
  cleanupFrequency: 60000,
};

describe('Request throttling tests:', () => {
  let MathRandomOriginal: any;

  beforeEach(() => {
    MathRandomOriginal = global.Math.random;
    global.Math.random = () => 0.6;
  });

  afterEach(() => {
    global.Math.random = MathRandomOriginal;
    jest.resetAllMocks();
  });

  describe('requestThrotter: ', () => {
    it('Should not throttle first request', () => {
      const requestThrottler = throttler(mockOptions);
      const [shouldThrottle, callOnComplete] = requestThrottler('http://test');
      expect(shouldThrottle).toBeFalsy();
      expect(callOnComplete).toBeInstanceOf(Function);
      callOnComplete(false);
    });

    it('Should (probably) throttle third request when first two fail', () => {
      const url = 'http://test2';
      const requestThrottler = throttler(mockOptions);
      let [shouldThrottle, callOnComplete] = requestThrottler(url);
      expect(shouldThrottle).toBeFalsy();
      callOnComplete(false);
      [shouldThrottle, callOnComplete] = requestThrottler(url);
      expect(shouldThrottle).toBeFalsy();
      callOnComplete(false);
      [shouldThrottle, callOnComplete] = requestThrottler(url);
      expect(shouldThrottle).toBeTruthy();
    });

    it('Should never throttle when requests are all successful', () => {
      const requestThrottler = throttler(mockOptions);
      for (let i = 0; i < 10; i++) {
        let [shouldThrottle, callOnComplete] = requestThrottler('http://test3');
        expect(shouldThrottle).toBeFalsy();
        callOnComplete(true);
      }
    });
  });

  describe('getRequestValues: ', () => {
    it('Should return the sum of all [requests, accepts] for the last 120 seconds', () => {
      const url = 'http://test4';
      const now = new Date();
      const requestThrottler = throttler(mockOptions);
      let res = requestThrottler(url);
      res[1](true);
      res = requestThrottler(url);
      res[1](false);
      res = requestThrottler(url);
      res[1](true);

      const requestWindow = requestsMap.get(url);
      const [requests, accepts] = getRequestValues(
        requestWindow,
        addTimeInSeconds(now, 20),
        mockOptions.windowLength
      );
      expect(requests).toBe(3);
      expect(accepts).toBe(2);
    });

    it('Should leave out [requests, accepts] outside the requestWindow', () => {
      const url = 'http://test5';
      const now = new Date();
      const requestThrottler = throttler(mockOptions);
      let res = requestThrottler(url);
      res[1](true);
      res = requestThrottler(url);
      res[1](false);
      res = requestThrottler(url);
      res[1](true);

      const requestWindow = requestsMap.get(url);
      const [requests, accepts] = getRequestValues(
        requestWindow,
        addTimeInSeconds(now, 120),
        mockOptions.windowLength
      );
      expect(requests).toBe(0);
      expect(accepts).toBe(0);
    });
  });

  describe('updateRequestValues: ', () => {
    it('Should update the right bucket when the current time is in the window', () => {
      const url = 'http://test6';
      const now = new Date();
      const requestThrottler = throttler(mockOptions);
      requestThrottler(url);
      updateRequestValues(
        url,
        addTimeInSeconds(now, 20),
        mockOptions.windowLength,
        true,
        true
      );
      const requestWindow = requestsMap.get(url);
      const [requests, accepts] = getRequestValues(
        requestWindow,
        addTimeInSeconds(now, 10),
        mockOptions.windowLength
      );
      expect(requests).toBe(1);
      expect(accepts).toBe(1);
      expect(diffInSeconds(requestWindow.head, now)).toEqual(0);
    });

    it('Should update the first bucket when the current time is out of the window and update head', () => {
      const url = 'http://test7';
      const now = new Date();
      const requestThrottler = throttler(mockOptions);
      requestThrottler(url);
      updateRequestValues(
        url,
        addTimeInSeconds(now, 121),
        mockOptions.windowLength,
        true,
        true
      );
      const requestWindow = requestsMap.get(url);
      const [requests, accepts] = getRequestValues(
        requestWindow,
        addTimeInSeconds(now, 10),
        mockOptions.windowLength
      );
      expect(requests).toBe(1);
      expect(accepts).toBe(1);
      expect(diffInSeconds(requestWindow.head, now)).toEqual(121);
    });
  });
});
