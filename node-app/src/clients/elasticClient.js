const es = require('elasticsearch')
const path = require('path')
const filesystem = require('../lib/filesystem')
const promise = require('../lib/promise')
const config = require('../../config/config.json')

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
  get info () {
    return (async () => {
      // get all indices and add 'id' and 'name' to every index.
      const indices = (await this.client.cat.indices({ format: 'json' }))
        .map(index => Object.assign(index, {
          id: parseInt(index.index.replace(/.*?_(\d+)/, '$1')),
          name: index.index
        }))
        .filter(index => index.name.startsWith(config.elasticsearch.indexName))

      // add mapping to every index.
      // @FRÜHSPORT!
      // indices.reduce(async (i, index) => {
      //     console.log({i})
      //     console.log({index})
      //     const mapping = await this.client.indices.getMapping({ index: index.index }) // using index.index even tho we add index.name
      //     index = Object.assign(index, { mapping })
      //     i.push(index)
      //     return i
      // }, Promise.resolve())
      // indices.forEach(index => {
      //     console.log({XXX: index.mapping})
      //     console.log({name: index.name})
      // })

      // filter all indices that start with the name in the config
      // and get the latest version (biggest number)
      const latestId = Math.max(...indices
        .filter(i => i.index.startsWith(config.elasticsearch.indexName))
        .map(i => i.name)
        .map(version => parseInt(version.replace(/^.*_(\d+)$/, '$1')))
      )

      // get whole data of the latest index
      const latestIndex = indices.find(i => i.name.endsWith(`_${latestId}`))

      // get aliases
      // add name to index object, just for semantic
      const aliases = (await this.client.cat.aliases({ format: 'json' }))
        .map(alias => Object.assign(alias, { name: alias.index }))

      return {
        aliases,
        indices: {
          all: indices,
          latest: Object.assign(latestIndex, {
            isPublished: aliases.find(alias => alias.index === latestIndex.name) !== undefined
          }),
          aliased: aliases[0] // only one index may be aliased.
        },
        getIndex (idOrName) {
          return indices.find(index => {
            if (typeof idOrName === 'number') {
              return index.id === idOrName
            }
            if (typeof idOrName === 'string') {
              return index.name === idOrName
            }
          })
        },
        hasIndex (idOrName) {
          return this.getIndex(idOrName) !== undefined
        }
      }
    })()
  }

  createIndexAndAddMappings () {
    return new Promise(async (resolve, reject) => {
      console.log('Will create a new index by increasing the id of the latest and adding the all mappings from the mappings directory to it.')
      const indexName = `${config.elasticsearch.indexName}_${this.info.indices.latest.id + 1}`
      // create index
      try {
        const response = await this.client.indices.create({ index: indexName })
        console.log('Index created', response)
      } catch (e) {
        console.error('Could not create index')
        console.error(e)
        reject(e)
      }
      // add mappings
      try {
        const response = await this.putMappings(indexName)
        console.log('Mappings added', response)
      } catch (e) {
        console.error('Could not add mapping')
        console.error(e)
        this.deleteIndex({ name: indexName })
        reject(e)
      }
      resolve()
    })
  }
  async reindexFromAliasedIndex () {
    // reindexing references:
    // https://medium.com/@eyaldahari/reindex-elasticsearch-documents-is-easier-than-ever-103f63d411c
    // https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/16.x/api-reference-5-6.html#api-indices-putmapping-5-6
    // https://www.elastic.co/guide/en/elasticsearch/reference/5.6/docs-reindex.html

    // create a new index and add current mappings
    try {
      await this.createIndexAndAddMappings()
    } catch (e) {
      console.error('Something went wrong in createIndexAndAddMappings, stopping execution.')
      return Promise.reject(e)
    }

    const destIndexName = this.info.indices.latest.name
    const sourceIndexName = this.info.indices.aliased.name

    // fill the new index with data from the previous index
    console.log(`Will reindex ${destIndexName} with documents from ${sourceIndexName}\n`)
    try {
      const response = await this.client.reindex({
        timeout: '30m',
        wait_for_completion: false, // return directly after starting task. else we get timeout here. the process will run in the background use 'elastic info' to check its state.
        body: {
          source: {
            index: sourceIndexName
          },
          dest: {
            index: destIndexName
          }
        }
      })
      console.log('Reindexing task was successfully triggered, check its state by using \'elastic info\' command', response)
      this.setAliasToLatestIndex()
      return Promise.resolve(response)
    } catch (e) {
      console.error('Something went wrong when trying to reindex. Deleting newly created index.')
      console.error(e)
      console.error(`Error: status: ${e.status}, message: ${e.message}, failures: ${e.failures}\n`)
      await this.deleteIndex({ name: destIndexName })
      return Promise.reject(e)
    }
  }
  // test delete index function for error handling of elastic client, guess it uses fetch.
  // maybe i need to check the response.ok.
  // could use fetch-errors package for it aswell.
  async deleteIndex (idOrName) {
    const { id, name } = idOrName
    if ((id && name) || !(id || name)) {
      throw new Error('Either provide id or name.')
    }

    const index = id
      ? `${config.elasticsearch.indexName}_${id}`
      : name

    try {
      console.log(`Deleting index: ${index}.`)
      const response = await this.client.indices.delete({ index })
      console.log(`Successfully deleted index: ${index}.`)
      return response
    } catch (e) {
      console.error(`Could not delete index '${index}'`)
      return Promise.reject(e)
    }
  }

  // @todo: change indexName to be isOrName, use flow.
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
  putMappings (indexName, mappings) {
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

  async setAlias (idOrName) {
    return new Promise(async (resolve, reject) => {
      const { id, name } = idOrName
      if ((id && name) || !(id || name)) {
        throw new Error('Either provide id or name.')
      }

      const index = id
        ? `${config.elasticsearch.indexName}_${id}`
        : name

      // only one alias should exist, get a list of all aliases, filter, map to index name and delete their aliases.
      this.info.aliases
        .filter(alias => alias.alias === config.elasticsearch.indexName)
        .map(alias => alias.index)
        .forEach(async (index) => {
          try {
            const response = await this.client.indices.deleteAlias({
              index,
              name: config.elasticsearch.indexName
            })
            console.log('Index alias deleted', response)
          } catch (e) {
            console.log('Index alias does not exists', e.message)
          }
        })

      try {
        const response = await this.client.indices.putAlias({
          index,
          name: config.elasticsearch.indexName
        })
        console.log('Index alias created', response)
        resolve(response)
      } catch (e) {
        console.log('Could not create alias', e.message)
        reject(e)
      }
    })
  }

  async setAliasToLatestIndex () {
    const index = this.info.indices.latest.name
    console.log(`Setting alias to latest index: ${index}`)
    return this.setAlias({ name: index })
  }
}

module.exports = new ElasticsearchClient(config)
