// if this will not be used as npm module we could get rid of
// the 'config' constructor parameter or even the whole class
const unirest = require('unirest')
const config = require('../../config/config.json')

class VsBridgeClient {
  constructor (config) {
    if (!config.vsbridge.apiKey || !config.vsbridge.url) {
      throw Error('apiKey and url are required config keys')
    }
    this.apiKey = config.vsbridge.apiKey
    // this.token = ??? how is auth working really?
    this.baseUrl = `${config.url}/vsbridge`
    this.client = unirest
    this.auth()
  }

  _setupRequest (unirest) {
    return unirest.headers({
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }).strictSSL(!!config.vsbridge.ssl)
  }
  _setupUrl (endpointUrl) {
    const url = `${endpointUrl}?apikey=${encodeURIComponent(this.apiKey)}`
    console.log('Fetching data from', url)
    return url
  }

  // authWith (apiKey) {
  //   console.log('auth with', apiKey)
  //   this.apiKey = apiKey
  // }
  auth () {
    const { auth_endpoint: endpoint, auth: { username, password } } = config.vsbridge
    this.post(endpoint).type('json').send({
      username,
      password
    }).end((resp) => {
      if (resp.body && resp.body.code === 200 && resp.body.result) {
        console.log(`Magento auth token: ${resp.body.result}\n`)
        this.apiKey = resp.body.result
      } else {
        // @todo: log some more useful information from 'resp' object.
        console.error({
          code: resp.body.code,
          result: resp.body.result
        })
        throw new Error('Magento Authentication failed.')
      }
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
      console.log('*** Getting attribute data')
      this.get(config.vsbridge['product_mapping_endpoint']).type('json').end((resp) => {
        if (resp.body && resp.body.code !== 200) { // unauthroized request
          console.log(resp.body.result)
          process.exit(-1)
        }
        resolve(resp.body.result)
        reject(new Error('Attribute data not available now, please try again later'))
      })
    }).then(
      result => (result),
      error => (error)
    )
  }
}

module.exports = new VsBridgeClient(config)
