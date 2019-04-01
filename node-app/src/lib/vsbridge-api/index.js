'use strict'
const unirest = require('unirest')

function getOAuthHeaderString(config) {
    const settings = Object.assign({}, config.vsbridge.auth.oauth, {
        oauth_signature_method: 'HMAC-SHA1',
        oauth_version: '1.0'
    })
    return Object.keys(settings).reduce((OAuthString, key) => {
        OAuthString += ` ${key}=${settings[key]}`
        return OAuthString
    }, 'OAuth')
}
class VsBridgeApiClient {

    /**
     * Setup Pimcore Api Client
     * @param {object} config configuration with "apiKey" and "url" keys for Pimcore API endpoint
     */
    constructor(config) {
        this.config = config
        
        if (!config.vsbridge.apiKey || !config.vsbridge.url){
            throw Error('apiKey and url are required config keys for Pimcore Api Client')
        }
        this.apiKey = config.vsbridge.apiKey

        this.baseUrl = `${config.url}vsbridge/`
        this.client = unirest
    }

    authWith(apiKey) {
        this.apiKey = apiKey
    }
    _setupRequest(unirest) {
        const headers = {
            'Accept': 'application/json', 
            'Content-Type': 'application/json',
            'Authorization': getOAuthHeaderString(this.config),
        }
        console.log('HEADERS:', headers)
        return unirest.headers(headers)
    }
    _setupUrl(endpointUrl) {
        const url = endpointUrl + '?apikey=' + encodeURIComponent(this.apiKey)
        console.log('Fetching data from', url);
        return url
    }
    post(endpointName) {
        return this._setupRequest(this.client.post(this._setupUrl(endpointName)))
    }

    get(endpointName) {
        return this._setupRequest(this.client.get(this._setupUrl(endpointName)))
    }

    put(endpointName) {
        return this._setupRequest(client.put(this._setupUrl(endpointName)))
    }

    delete(endpointName) {
        return this._setupRequest(client.delete(this._setupUrl(endpointName)))
    }
    
}
module.exports = VsBridgeApiClient
