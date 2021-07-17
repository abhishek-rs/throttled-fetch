# throttled-fetch

throttled-fetch is a wrapper that provides adaptive client-side throttling of requests on your client apps or servers that make frequent API calls to other upstream resources. By throttling requests that are likely to fail at the source, this library makes your overall service resilient to unexpected traffic surges that are harder to deal with through conventional methods like auto-scaling and load-shedding at the server.

The implementation of throttling used here is based on this chapter of [Google's SRE book](https://sre.google/sre-book/handling-overload/). I suggest you read through the chapter, especially the section 'Client-side throttling' for a better understanding of how this works.

The library comes bundled with lquixada's [cross-fetch](https://github.com/lquixada/cross-fetch) so this library alone should be able to cater to all your API calling needs, but you can also just use the throttler with your own fetching library of choice if you were so inclined.

- Works with any fetch-like library like [axios](https://github.com/axios/axios), [isomorphic-fetch](https://github.com/matthew-andrews/isomorphic-fetch)) etc.
- Can be used on both the server and the client
- Configurable throttle params
- Typescript support
- Includes both cjs and esm versions

## Why?

## How does it work?

## Install

## Usage

## Do you need this?

## License
