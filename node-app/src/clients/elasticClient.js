const es = require('elasticsearch')

const config = require('../../../config/config.json')

const { host, apiVersion } = config.elasticsearch

module.exports = new es.Client({
  host,
  apiVersion,
  log: {
    level: ['error']
  },
  requestTimeout: 5000,
  maxRetries: 3,
  maxSockets: 25
})
