# throttled-fetch

![npm-version](https://img.shields.io/npm/v/throttled-fetch?style=flat-square) ![bundle-size](https://img.shields.io/bundlephobia/min/throttled-fetch?style=flat-square) ![node-version](https://img.shields.io/node/v/throttled-fetch?style=flat-square) ![downloads](https://img.shields.io/npm/dm/throttled-fetch?style=flat-square)

A utility library that enhances fetch by providing adaptive client-side throttling of outgoing requests on your client app or server that makes frequent API calls to other upstream resources.
By throttling requests at the source (that are likely to fail), this library makes your service resilient to unexpected traffic surges that are harder to deal with through conventional methods like auto-scaling and load-shedding at the destination server.

The implementation of throttling used here is based on this chapter of [Google's SRE book](https://sre.google/sre-book/handling-overload/). I suggest you read through the chapter, especially the section 'Client-side throttling' for a better understanding of how this works.

The library comes bundled with lquixada's [cross-fetch](https://github.com/lquixada/cross-fetch) so this library alone should be able to cater to all your API calling needs, but you can also just use the throttler with your own fetching library of choice if you were so inclined.

- Works with any fetch-like library like [axios](https://github.com/axios/axios), [isomorphic-fetch](https://github.com/matthew-andrews/isomorphic-fetch)
- Can be used on both the server and the client
- Configurable throttle params
- Typescript support
- Includes both cjs and esm versions

## Why?

Unexpected but organic (non-malicious) traffic surges towards a public web application is not an uncommon occurence. There are several ways to handle these depending on what part of the application you are working with. You can make your infra scale better/quicker, put policies in place that try to predict surges etc. In the backend, you could employ load-shedding to reject additional requests you know you can't handle right away. While all of these are great approaches to solving the problem, doing more at the client (the source where the surge is originating from) to try and _not_ pass on the traffic when the backend is having a hard time coping, will go a long way in improving how well these other measures work. By giving backend services more time to cope with traffic surges, libraries like this one will help you prevent cascading failures from propagating all over your service graph.

## How does it work?

The original idea for the implementation comes from the ['Handling Overload'](https://sre.google/sre-book/handling-overload/) chapter of Google's SRE book. So that is definitely a better source to understand this. But I'll give you quick summary here.
`throttled-fetch` maintains the history and acceptance (success) rates of all of your outgoing requests for a configurable amount of time (default is two minutes). This is done for every unique endpoint and acceptance is defined as any response that is `< 500` status code by default (you can change this to `< 400` if you choose). And based on this data, every new request that your app wants to make is judged using the below formula to determine how likely it is to be rejected by the called service. This is called the 'Client request rejection probability'.

![Screenshot 2021-07-18 at 21 11 37](https://user-images.githubusercontent.com/7901653/126079594-6e86b4cb-c493-4c1f-84d4-58deba04aea0.png)

We use this probability to then either reject the request right away or let it through. As this is a rejection probability, it does not work like a conventional circuit-breaker that cuts off the flow of requests, but it lets a few random requests through from time to time to get the updated health status of the called service. So when the backend starts to cope with the load (either due to auto-scaling or any other methods) the rejection probability will start going down and the client slowly returns to normal functioning.

[See a demo](https://flamboyant-raman-9ad6b0.netlify.app/)!

## Install

```bash
npm i throttled-fetch -S
```

or

```bash
yarn add throttled-fetch
```

## Usage

### Defaut usage

1. Import the library

```javascript
import throttledFetch from 'throttled-fetch';
// or
const throttledFetch = require('throttled-fetch');
```

2. Setup throttler params (if you don't want the defaults)

```javascript
const customFetch = throttledFetch(); // will use defaults shown below

// OR - You can pass three *optional* params to setup how aggressive your throttling will be
const customFetch = throttledFetch({
  K: 2,
  // Multiplier that determines aggressiveness of throttling
  // Higher value is less agressive, 2 is recommended (default)
  windowLength: 120,
  // Determines how many seconds wide the requestWindow is.
  // default is 120 seconds i.e rejection probability is based on how well the backend has been performing in the last 2 minutes
  cleanupFrequency: 60,
  // Determines how often requests history is cleaned (delete old keys), default 60 seconds
});
```

3. Use your custom throttled-fetch function just like native fetch (with more custom options). More info on how `cross-fetch` works can be found [here](https://github.com/lquixada/cross-fetch#usage)

```javascript
// With promises
customFetch('https://example.come', { method: 'get' })
  .then(res => res.json())
  .catch(err => console.error(err));

// With async/await
const response = await customFetch('https://example.come', { method: 'get' });
```

### Usage with your own fetch library

1. Import the throttler

```javascript
import { throttler } from 'throttled-fetch';
// or
const { throttler } = require('throttled-fetch');
```

2. Setup throttler params.

```javascript
const requestThrottler = throttler(); // will use defaults shown below

// OR - You can pass three *optional* params to setup how aggressive your throttling will be
const requestThrottler = throttler({
  K: 2,
  // Multiplier that determines aggressiveness of throttling
  // Higher value is less agressive, 2 is recommended (default)
  windowLength: 120,
  // Determines how many seconds wide the requestWindow is.
  // default is 120 seconds i.e rejection probability is based on how well the backend has been performing in the last 2 minutes
  cleanupFrequency: 60,
  // Determines how often requests history is cleaned (delete old keys), default 60 seconds
});
```

3. Use the return vales `shouldThrottle` and the updater to let the throttler know what the response was.

```javascript
const [shouldThrottle, callOnComplete] = requestThrottler(
  'http://example.com/api'
);

if (shouldThrottle) {
  callOnComplete(false);
  // Reject the request
}

// Handle normal fetch
axios
  .get(url)
  .then(res => {
    res.status < 500
      ? callOnComplete(true) // if successful request
      : callOnComplete(false); // if failed request
    // handle success
  })
  .catch(err => {
    callOnComplete(false); // failed request
    // handle failure
  });
```

### Additional options

You can also pass a few boolean options to treat individual endpoints/services differently in terms of throttling if you want

- `applyThrottling` - (default: true) - If you'd like to skip throttling a service/endpoint for some reason (non-critical/external service)
- `removeQueryParams` - (default: true) - As this library is aiming to throttle requests based on healthiness of a endpoint/service, it's a good idea to clean out the query params from a url before adding them to the history to keep the history map small and manageable. But if you want to leave them in, essentially meaning you think `http://example.com?foo=bar`'s bad health should not affect rejection rate of `http://example.com?baz=too`, you can use this.
- `throttle400s` - (default: false) - Services usually return 500s when they are overwhelmed so that is the default definition of failure here, but if you want to include 400s as well (if maybe you want to throttle users who are getting unauthorized response way too much), use this.

## Do you need this?

Does your service deal with unexpected traffic surges that your backend sometimes can't cope with? ✅

Are you not sure? It's good to have it anyway ✅

In all other cases, you probably don't need it.

## Credits

All the credit for the idea for client-side adaptive throttling goes to Google's SRE team and the authors of the ['Handling Overload' chapter](https://sre.google/sre-book/handling-overload/), Alejandro Forero Cuervo and Sarah Chavis.

## License

throttled-fetch is licensed under the [MIT license](https://github.com/abhishek-rs/throttled-fetch/blob/main/LICENSE) © Abhishek Shetty
