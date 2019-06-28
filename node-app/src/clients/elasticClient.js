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
  // @todo:
  normalizeIndexIds () {
    // get info (contains all indices named: config.elasticsearch.indexName underscore info.indices.latest.id)
    // sort indices ascending by id
    // save id of selected and aliased index
    // set normalizedId to 1
    // assign new ids incrementing normalizedId while saving mapping for selected and aliased index
    // use the mappings to re assign selected and aliased indices
  }
  async createIndex (idOrName) {
    const { id, name } = idOrName
    if ((id && name) || !(id || name)) {
      throw new Error('Either provide id or name.')
    }
    const indexName = id
      ? `${config.elasticsearch.indexName}_${id}`
      : name

    try {
      const response = await this.client.indices.create({ index: indexName })
      if (!response.acknowledged) {
        throw new Error('Error from elastic. Could not create index.')
      }
      console.log('\n> Index created')
      console.log(response)
    } catch (error) {
      throw error
    }
  }
  createNextIndexAndAddMappings () {
    return new Promise(async (resolve, reject) => {
      console.log('\n> Will create a new index by increasing the id of the latest and adding the all mappings from the mappings directory to it.')
      const info = await this.info
      const indexName = `${config.elasticsearch.indexName}_${info.indices.latest.id + 1}`
      // create index
      try {
        await this.createIndex({ name: indexName })
      } catch (error) {
        reject(error)
        throw error
      }
      // add mappings
      try {
        await this.putMappings(indexName)
      } catch (error) {
        // additional catch to delete index if mapping went wrong.
        console.log('\n> Mapping went wrong, will delete created index.\n')
        this.deleteIndex({ name: indexName })
        reject(error)
        throw error
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
      await this.createNextIndexAndAddMappings()
    } catch (error) {
      throw error
    }

    // fill the new index with data from the previous index
    const info = await this.info
    const destIndexName = info.indices.latest.name
    const sourceIndexName = info.indices.aliased.name
    console.log(`\n> Will reindex ${destIndexName} with documents from ${sourceIndexName}\n`)
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
      if (!response.acknowledged) {
        throw new Error('Error from elastic. Could not start reindexing.')
      }
      console.log(`\n> Reindexing task was successfully triggered, check its updating state by using 'elastic info' command.`)
      console.log(response)
      // update alias
      await this.setAliasToLatestIndex()
    } catch (error) {
      // delete index on error
      console.error('\n> Something went wrong when trying to reindex. Deleting newly created index.')
      await this.deleteIndex({ name: destIndexName })
      throw error
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
    const indexName = id
      ? `${config.elasticsearch.indexName}_${id}`
      : name

    try {
      console.log(`\n> Deleting index: ${indexName}.`)
      const response = await this.client.indices.delete({ index: indexName })
      if (!response.acknowledged) {
        throw new Error(`Error from elastic. Could not delete index ${indexName}.`)
      }
      console.log(`\n> Successfully deleted index: ${indexName}.\n`)
      return response
    } catch (error) {
      throw error
    }
  }

  // @todo: change indexName to be isOrName, and use flow.
  async putMapping (indexName, mapping) {
    console.log(`\n> Will add mapping on index '${indexName}' for type '${mapping.type}'.`)
    try {
      const response = await this.client.indices.putMapping({
        updateAllTypes: true, // if multiple document types have a field with the same name, update the field type for every document to get no conflicts.
        index: indexName,
        type: mapping.type,
        body: {
          properties: mapping.properties
        }
      })
      if (!response.acknowledged) {
        throw new Error(`Error from elastic. Something happened when adding mapping '${mapping.type}'.`)
      }
      console.log(`> Successfully put mapping for '${mapping.type}'.\n`)
      return response
    } catch (error) {
      console.log('> Elasticsearch can only execute the following actions for existing mappings: add field, upgrade field to multi-field.')
      console.log('> If you need to change some field use reindex.')
      throw error
    }
  }
  async putMappings (indexName, mappings) {
    // use default mapping path if no mappings are given
    mappings = mappings || filesystem.readMappingsFromDirectory(path.resolve(__dirname, '../../mappings'))
    return new Promise((resolveAll, rejectAll) => {
      promise.serial(Object.values(mappings).map(mapping => () => new Promise((resolve, reject) => {
        try {
          const response = this.putMapping(indexName, mapping)
          resolve(response)
        } catch (error) {
          reject(error)
          rejectAll(error)
          throw error
        }
      }))).then(res => {
        console.log('\n> Mappings were added successfully.\n')
        resolveAll()
      })
    })
  }
  async putMappingsFromDirectory (indexName, absolutePath) {
    const mappings = filesystem.readMappingsFromDirectory(absolutePath)
    return this.putMappings(indexName, mappings)
  }
  async putMappingFromFile (indexName, absolutePath) {
    const mapping = require(absolutePath)
    return this.putMapping(indexName, mapping)
  }

  async setAlias (idOrName) {
    return new Promise(async (resolve, reject) => {
      const { id, name } = idOrName
      if ((id && name) || !(id || name)) {
        throw new Error('Either provide id or name.')
      }
      const indexName = id
        ? `${config.elasticsearch.indexName}_${id}`
        : name

      // only one alias should exist, get a list of all aliases, filter, map to index name and delete their aliases.
      const info = await this.info
      info.aliases
        .filter(alias => alias.alias === config.elasticsearch.indexName)
        .map(alias => alias.index)
        .forEach(async (indexName) => {
          try {
            const response = await this.client.indices.deleteAlias({
              index: indexName,
              name: config.elasticsearch.indexName
            })
            if (!response.acknowledged) {
              throw new Error(`Error from elastic. Could not delete alias on index '${indexName}'.`)
            }
            console.log('\n> Index alias deleted.')
            console.log(response)
          } catch (error) {
            reject(error)
            throw error
          }
        })

      try {
        const response = await this.client.indices.putAlias({
          index: indexName,
          name: config.elasticsearch.indexName
        })
        if (!response.acknowledged) {
          throw new Error(`Error from elastic. Could not create alias on index '${indexName}'.`)
        }
        console.log('\n> Index alias created')
        console.log(response)
        resolve(response)
      } catch (error) {
        reject(error)
        throw error
      }
    })
  }
  // @propably-move: to cli
  async setAliasToLatestIndex () {
    const info = await this.info
    const indexName = info.indices.latest.name
    console.log(`\n> Will set alias on latest index '${indexName}'\n`)
    return this.setAlias({ name: indexName })
  }
}

module.exports = new ElasticsearchClient(config)
