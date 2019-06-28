const es = require('elasticsearch')
const path = require('path')
const filesystem = require('../lib/filesystem')
const promise = require('../lib/promise')
const config = require('../../../config/config.json')

class ElasticsearchClient {
  constructor (config) {
    const { host, apiVersion } = config.elasticsearch
    this.client = new es.Client({
      host,
      apiVersion,
      log: {
        level: ['error']
      },
      requestTimeout: 5000,
      maxRetries: 3,
      maxSockets: 25
    })
  }
  async putMapping (indexName, mapping) {
    console.log(`Will add mapping for type '${mapping.type}'.`)
    try {
      const response = await this.client.indices.putMapping({
        updateAllTypes: true, // if multiple document types have a field with the same name, update the field type for every document to get no conflicts.
        index: indexName,
        type: mapping.type,
        body: {
          properties: mapping.properties
        }
      })
      console.log(`Successfully put mapping for '${mapping.type}'.`)
      return response
    } catch (e) {
      console.log(`Something happened when adding mapping for '${mapping.type}'.`)
      console.log('Elasticsearch can only execute the following actions for existing mappings: add field, upgrade field to multi-field.')
      console.log('If you need to change some field use reindex.')
      throw new Error(e)
    }
  }
  putMappings (esClient, indexName, mappings) {
    return new Promise((resolveAll, rejectAll) => {
      promise.serial(Object.values(mappings).map(mapping => () => new Promise((resolve, reject) => {
        try {
          const response = this.putMapping(indexName, mapping)
          resolve(response)
        } catch (e) {
          reject(e)
          rejectAll(e)
        }
      })))
        .then(res => {
          console.log('Mappings were added successfully.\n')
          resolveAll(true)
        })
        .catch(e => rejectAll(e)) // this wont happen anyways, cause the outer promise will get rejected if some inner promise had an error.
    })
  }
  putMappingsFromDirectory (indexName, absolutePath) {
    const mappings = filesystem.readMappingsFromDirectory(absolutePath)
    console.log('TEST: put mapping from directory, mappings:', mappings)
    return this.putMappings(indexName, mappings)
  }
  putMappingFromFile (indexName, absolutePath) {
    const mapping = require(path.resolve(__dirname, absolutePath))
    console.log('TEST: put mapping from single file, mapping:', mapping)
    return this.putMapping(indexName, mapping)
  }
}

module.exports = new ElasticsearchClient(config)
