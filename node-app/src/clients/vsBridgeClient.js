const unirest = require('unirest')
const config = require('../../config/config.json')

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
    const url = `${endpointUrl}?apikey=${encodeURIComponent(this.apiKey)}`
    console.log('Fetching data from', url)
    return url
  }

  auth (callback) {
    return new Promise((resolve, reject) => {
      const { auth_endpoint: url, auth: { username, password } } = this.config.vsbridge
      console.log('Authenticating to magento')
      this.post(url).send({
        username,
        password
      }).end((resp) => {
        if (resp.body && resp.body.code === 200 && resp.body.result) {
          const apiKey = resp.body.result
          console.log(`Magento auth token: ${apiKey}.`)
          this.apiKey = apiKey
          resolve(apiKey)
          // if (callback) {
          //   callback(apiKey)
          // }
        } else {
          console.error({
            code: resp.body.code,
            result: resp.body.result
          })
          reject(new Error('Could not get magento auth token.'))
          // throw new Error('Could not get magento auth token.')
        }
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

  /**
   * Get attribute data (product mappings) from magento vsbridge action
   * - not used rn, kept untouched but moved here from elastic.js.
   */
  getAttributeData () {
    return new Promise((resolve, reject) => {
      this.get(this.config.vsbridge['product_mapping_endpoint']).end((resp) => {
        if (!resp.ok) {
          console.error(getShortUnirestErrorInfo(resp))
          reject(new Error('Something went wrong when requesting product mappings from magento.'))
        }
        resolve(resp.body.result)
      })
    })
  }
}

module.exports = new VsBridgeClient(config)
