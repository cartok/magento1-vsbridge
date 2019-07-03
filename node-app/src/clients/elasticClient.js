const es = require('elasticsearch')
const path = require('path')
const filesystem = require('../lib/filesystem')
const promise = require('../lib/promise')
const config = require('../../config/config.json')

// @todo: refactor methods that use 'idOrName' object with a generalized argument type check
// to determine whether its an index name (string) or an index id.
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

      // get latest index
      const latestIndex = indices.find(i => i.name.endsWith(`_${latestId}`))

      // get aliases from api
      // only one index may be aliased, acces the first entry, and find its index obj to store the same type of information.
      const aliases = await this.client.cat.aliases({ format: 'json' })
      const aliasedIndex = aliases.length > 0
        ? indices.find(i => i.name === aliases[0].index)
        : undefined

      // get selected index
      let selectedIndex
      try {
        selectedIndex = require('../../var/selected-index.json')
        selectedIndex = indices.find(i => i.name === selectedIndex.name)
      } catch (error) {
        selectedIndex = undefined
      }

      return {
        aliases,
        indices: {
          list: indices,
          latest: latestIndex,
          aliased: aliasedIndex,
          selected: selectedIndex
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
          if (!idOrName) {
            return this.indices.list && this.indices.list.length > 0
          }
          return this.getIndex(idOrName) !== undefined
        },
        hasAlias () {
          return this.indices.aliased !== undefined
        }
      }
    })()
  }

  // @todo: maybe don't finish implementation, execution would take very long to execute
  // and the implementation must make additional use of the ES task API where nothing is implemented for yet.
  async normalizeIndexIds () {
    // get info (contains all indices named: config.elasticsearch.indexName underscore info.indices.latest.id)
    const info = await this.info
    const { list: indices, aliased, selected } = info.indices

    // save id of selected and aliased index
    const specialIds = {
      aliased: aliased.id,
      selected: selected.id
    }

    // create arrays of unsorted and sorted index ids
    // @note: Array.prototype.sort is an in-place operation, but Array.prototype.map does.
    const unsortedIndexIds = indices.map(i => i.d)
    const sortedIndexIds = indices.map(i => i.id).sort((a, b) => {
      if (a.id < b.id) {
        return -1
      }
      if (a.id > b.id) {
        return 1
      }
      return 0
    })

    // create a map that assigns the id of every index to its 'future' id.
    const indexIdChangeMap = sortedIndexIds.reduce((map, id, newPosition) => {
      const oldId = unsortedIndexIds.find(oldId => oldId === id)
      if (!oldId) {
        throw new Error('Something unexpected happend.')
      }
      const newId = newPosition + 1
      map.set(oldId, newId)
    }, new Map())

    // 1. create an array of promises that resolve when for every index a new index named ${config.elastic.indexName}_${id}_temp was created by reindexing
    // or just use Array.prototype.reduce or whatever.
    // 2. when all promises are resolved / all temporary copys have been created: delete all old indices.
    // 3. for every temporary index create a copy like in (1.) named ${config.elastic.indexName}_${indexIdChangeMap}.get(idOfTempIndex) to create the final sorted indices.
    // 4. reassign selected and aliased index using the indexIdChangeMap.
  }
  async createNextIndexAndAddMappings () {
    return new Promise(async (resolve, reject) => {
      console.log('\n> Will create a new index by increasing the id of the latest and adding the all mappings from the mappings directory to it.')
      const info = await this.info
      const indexName = info.hasIndex()
        ? `${config.elasticsearch.indexName}_${info.indices.latest.id + 1}`
        : `${config.elasticsearch.indexName}_1`
      // create index
      try {
        await this.createIndex({ name: indexName })
      } catch (error) {
        reject(error)
        return
      }
      // add mappings
      try {
        await this.putMappings(indexName)
      } catch (error) {
        // additional catch to delete index if mapping went wrong.
        console.log('\n> Mapping went wrong, will delete created index.\n')
        this.deleteIndex({ name: indexName })
        reject(error)
        return
      }
      resolve()
    })
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

  async reindexFrom (indexName) {
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
    const sourceIndexName = indexName
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
  async deleteAllIndices (idOrName) {
    const info = await this.info

    const promises = info.indices.list.map(index => () => new Promise(async (resolve, reject) => {
      try {
        await this.deleteIndex({ name: index.name })
        resolve('index deleted')
      } catch (error) {
        // @todo: add msg
        reject(error)
      }
    }))

    try {
      await promise.execPromiseReturningFunctionsSequential(promises)
    } catch (error) {
      console.log(`\n > Could not delete all indices.`)
      throw error
    }
  }
  async insertDocument (params = { index: '', type: '', id: -1, document: {}, idx: -1 }) {
    const { index, type, id, document, idx } = params
    const response = await this.client.index({
      index,
      type,
      id,
      body: document
    })
    if (response._shards.failed > 0) {
      throw new Error(`From elastic client: Something went wrong when trying to add pages to '${index}'.`)
    }
    console.log('* Record done for', id, index, idx)
  }
  // @todo: use ES bulk api instead
  async insertDocuments (params = { index: '', type: '', documents: [{}] }) {
    const { index, type, documents } = params
    // create an array of functions that return promises for every entry from magento.
    // you could directly create promises, but then they would immediately start to execute while mapping.
    // creating functions that return promises instead allows us to later decide whether we want sequential or parallel execution.
    const promises = documents.map((entry, i) => () => new Promise(async (resolve, reject) => {
      try {
        await this.insertDocument({ index, type, id: entry.id, document: entry, idx: ++i })
        resolve('document inserted')
      } catch (error) {
        console.log(`\n> Could not add entry with id '${entry.id}' to index '${index}'.`)
        reject(error)
      }
    }))

    try {
      if (config.elasticsearch.insertDocumentsSequentially) {
        await promise.execPromiseReturningFunctionsSequential(promises)
      } else {
        await promise.execPromiseReturningFunctionsParallel(promises)
      }
    } catch (error) {
      console.log(`\n> Could not completely add pages to index '${index}'.`)
      throw error
    }
  }

  // @protected
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
      promise.execPromiseReturningFunctionsSequential(Object.values(mappings).map(mapping => () => new Promise(async (resolve, reject) => {
        try {
          const response = await this.putMapping(indexName, mapping)
          resolve(response)
        } catch (error) {
          reject(error)
          rejectAll(error)
        }
      }))).then(res => {
        console.log('\n> Mappings were added successfully.\n')
        resolveAll('mappings added')
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

  async setAlias (indexName) {
    return new Promise(async (resolve, reject) => {
      // try catch to log error from this.info or one from alias-deletition-loop
      try {
        const info = await this.info
        // only one alias should exist, get a list of all aliases, filter, map to index name and delete their aliases.
        info.aliases
          .filter(alias => alias.alias === config.elasticsearch.indexName)
          .map(alias => alias.index)
          .forEach(async (indexName) => {
            // try catch here to reject early with the correct reason
            try {
              const response = await this.client.indices.deleteAlias({
                index: indexName,
                name: config.elasticsearch.indexName
              })
              if (!response.acknowledged) {
                throw new Error(`Error from elastic. Could not delete alias on index '${indexName}'.`)
              }
              console.log('\n> Index alias deleted, response:')
              console.log(response)
            } catch (error) {
              reject(error)
              // throw again to exit loop
              throw error
            }
          })
      } catch (error) {
        console.error(error)
        // promise is allready rejected and can get catched outside
        // return to stop the function execution
        return
      }

      // create new alias
      try {
        const response = await this.client.indices.putAlias({
          index: indexName,
          name: config.elasticsearch.indexName
        })
        if (!response.acknowledged) {
          throw new Error(`Error from elastic. Could not create alias on index '${indexName}'.`)
        }
        console.log('\n> Index alias created, response:')
        console.log(response)
        resolve('alias created')
      } catch (error) {
        console.error(error)
        reject(error)
      }
    })
  }
}

module.exports = new ElasticsearchClient(config)
