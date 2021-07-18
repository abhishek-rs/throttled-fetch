
'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./throttled-fetch.cjs.production.min.js')
} else {
  module.exports = require('./throttled-fetch.cjs.development.js')
}
