const unirest = require('unirest')
const config = require('../../config/config.json')
const util = require('util')
const setTimeoutPromise = util.promisify(setTimeout)

function getShortUnirestErrorInfo (response) {
  const { code, status, statusType, info, ok, error, body: { result } } = response
  return { code, status, statusType, info, ok, error, result }
}

class VsBridgeClient {
  constructor (config) {
    if (!config.vsbridge.url) {
      throw new Error('Missing config.key: vsbridge.url.')
    }
    this.config = config
    this.client = unirest
    this.baseUrl = `${this.config.url}/vsbridge`
    this.maxDNSResolveRetrys = 6
    this.DNSResolveRetrys = 0
    this.waitTimeBeforeRetryMS = 5000
  }

  _setupRequest (request) {
    // finish request configuration
    return request
      .headers({
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      })
      .strictSSL(!!this.config.vsbridge.ssl)
      .type('json')
  }
  _setupUrl (endpointUrl) {
    let url = endpointUrl
    if (this.apiKey) {
      url += `?apikey=${encodeURIComponent(this.apiKey)}`
    }
    console.log('\n> Will fetch from:', url)
    return url
  }

  auth (callback) {
    return new Promise((resolve, reject) => {
      const { auth_endpoint: url, auth: { username, password } } = this.config.vsbridge
      this.post(url).send({
        username,
        password
      }).end((resp) => {
        if (!this.responseOk(resp)) {
          console.log(resp.error)
          reject(new Error('Could not get magento auth token.'))
          return
        }
        const apiKey = resp.body.result
        console.log(`> Authenticated to magento. Token is: ${apiKey}\n`)
        this.apiKey = apiKey
        resolve(apiKey)
      })
    })
  }

  post (endpointName) {
    return this._setupRequest(this.client.post(this._setupUrl(endpointName)))
  }
  get (endpointName) {
    return this._setupRequest(this.client.get(this._setupUrl(endpointName)))
  }
  put (endpointName) {
    return this._setupRequest(this.client.put(this._setupUrl(endpointName)))
  }
  delete (endpointName) {
    return this._setupRequest(this.client.delete(this._setupUrl(endpointName)))
  }

  // required interface method
  getDocuments (query) {
    const { type, page, pageSize } = query
    return new Promise((resolve, reject) => {
      this.get(this.config.vsbridge[`${type}_endpoint`]).query({ entityType: type, page, pageSize }).end(async resp => {
        if (!this.responseOk(resp)) {
          // retry on dns lookup error
          if (resp.error.code === 'EAI_AGAIN') {
            console.warn('\n> DNS could not resolve ip of magento address.')
            if (this.DNSResolveRetrys < this.maxDNSResolveRetrys) {
              this.DNSResolveRetrys += 1
              console.warn(`\n> Will try again. (${this.DNSResolveRetrys}/${this.maxDNSResolveRetrys})`)
              // wait some before trying again
              // if (this.DNSResolveRetrys === 1) {
              console.log(`\n> Waiting for ${this.waitTimeBeforeRetryMS / 1000} seconds before starting to try again.`)
              await setTimeoutPromise(this.waitTimeBeforeRetryMS)
              // }
              return this.getDocuments(query)
            }
            console.warn(`\n> Aborting after ${this.maxDNSResolveRetrys} trys.`)
          }
          console.log(`\n> Could not get '${type}'.`)
          console.log(resp.error)
          reject(new Error('Magento vsbridge response was not ok.'))
          return
        }
        this.DNSResolveRetrys = 0
        resolve(resp.body.result)
      })
    })
  }
  // @protected
  responseOk (resp) {
    return (resp.body && (resp.body.code === 200 && resp.body.result))
  }

  /**
   * Get attribute data (product mappings) from magento vsbridge action
   * - not used rn, kept untouched but moved here from elastic.js.
   */
  getAttributeData () {
    return new Promise((resolve, reject) => {
      this.get(this.config.vsbridge['product_mapping_endpoint']).end((resp) => {
        if (!resp.ok) {
          console.log(getShortUnirestErrorInfo(resp))
          reject(new Error('Something went wrong when requesting product mappings from magento.'))
          return
        }
        resolve(resp.body.result)
      })
    })
  }
}

module.exports = new VsBridgeClient(config)
