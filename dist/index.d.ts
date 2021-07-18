export declare const diffInSeconds: (a: Date, b: Date) => number;
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
    windowLength: number;
    cleanupFrequency: number;
}
export declare const requestsMap: Map<string, RequestMapEntry>;
export declare const getRequestValues: (reqWindow: RequestMapEntry, now: Date, windowLength: number) => number[];
export declare const updateRequestValues: (url: string, now: Date, windowLength: number, incRequests?: boolean, incAccepts?: boolean) => void;
export declare const throttler: ({ K, windowLength, cleanupFrequency, }?: ThrottlerOptions) => (url: string) => readonly [true, (x: boolean) => boolean] | readonly [false, (isSuccess: boolean) => void];
declare const throttledFetch: (throttleOptions: ThrottlerOptions) => (url: string, options?: object, applyThrottling?: boolean, removeQueryParams?: boolean, throttle400s?: boolean) => any;
export default throttledFetch;
