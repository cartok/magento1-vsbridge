
const CommandRouter = require('command-router')
const path = require('path')
const jsonFile = require('jsonfile')

const promise = require('./lib/promise')

const VsBridgeImporter = require('./importers/VsBridgeImporter')

const elasticClient = require('./clients/elasticClient')
const vsBridgeClient = require('./clients/vsBridgeClient')
const storyblokClient = require('./clients/storyblokClient')

const config = require('../config/config.json')
let MAGENTO_AUTH_TOKEN = ''

const cli = CommandRouter()

// add cli options
cli.option({
  name: 'page',
  alias: 'p',
  default: 1,
  type: Number
})
cli.option({
  name: 'pageSize',
  alias: 'l',
  default: 25,
  type: Number
})
cli.option({
  name: 'partitions',
  alias: 't',
  default: 20,
  type: Number
})
cli.option({
  name: 'runSerial',
  alias: 's',
  default: false,
  type: Boolean
})
cli.option({
  name: 'id',
  alias: 'i',
  default: null,
  type: Number
})
cli.option({
  name: 'name',
  alias: 'n',
  default: null,
  type: String
})
cli.option({
  name: 'file',
  alias: 'f',
  default: null,
  type: String
})
cli.option({
  name: 'aliased',
  alias: 'a',
  default: false,
  type: Boolean
})

// SB INTERFACE FUNCTION
// @todo: test jsdoc, maybe go back to standard function param style with default values to be able to understand signature while function is folded.
async function addPagesFromStoryblok (params = { index: null, type: undefined, page: 0, pageSize: 25 }) {
  // assign default params
  const { index, type, page, pageSize } = Object.assign({
    index: undefined,
    type: undefined,
    page: 0,
    pageSize: 25
  }, params)

  // check required params
  if (index === undefined || type === undefined) {
    // @todo: additional validation if index and type exist, else unhandled errors are possible.
    throw new Error(`You need to provide a valid 'index' and 'type' in the parameter object`)
  }

  // request data
  let storyblokResponse
  try {
    // make request to storyblok
    storyblokResponse = await storyblokClient.get('cdn/stories', {
      version: 'published',
      starts_with: `${config.country.toLowerCase()}/`,
      // @note: guess we dont need a query, just 'starts_with' attribute that gets config.country value.
      filter_query: {
        component: {
          in: 'page,article'
        }
      },
      page,
      per_page: pageSize
    })
  } catch (e) {
    console.error('Something went wrong when trying to get pages from storyblok.')
    console.error({ params })
    console.error(e)
    throw new Error(e)
  }

  // add pages to elastic index
  try {
    const pages = storyblokResponse.data.stories
    pages.forEach(page => {
      elasticClient.index({
        index,
        type,
        id: page.uuid,
        body: page
      }).then(() => {
        console.log(`* Record done for id: ${page.uuid} | index: ${index} | pages: ${pageSize}`)
      })
    })

    // stop recursion on an empty page
    if (pages.length === 0) {
      console.log('This was the last page.')
      return
    }
    // continue recursion, starting at next page
    addPagesFromStoryblok({
      index,
      type,
      page: page + 1,
      pageSize
    })
  } catch (e) {
    console.error('Something went wrong when trying to add pages to index.')
    console.error({ params })
    console.error(e)
    console.log('Process will exit now.')
    process.exit(-1)
  }
}

//
async function getInfo () {
  // get all indices and add 'id' and 'name' to every index.
  const indices = (await elasticClient.cat.indices({ format: 'json' }))
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
  //     const mapping = await elasticClient.indices.getMapping({ index: index.index }) // using index.index even tho we add index.name
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
  const aliases = (await elasticClient.cat.aliases({ format: 'json' }))
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
}
//
async function setAlias (idOrName) {
  return new Promise(async (resolve, reject) => {
    const { id, name } = idOrName
    if ((id && name) || !(id || name)) {
      throw new Error('Either provide id or name.')
    }

    const index = id
      ? `${config.elasticsearch.indexName}_${id}`
      : name

    const info = await getInfo()

    // only one alias should exist, get a list of all aliases, filter, map to index name and delete their aliases.
    info.aliases
      .filter(alias => alias.alias === config.elasticsearch.indexName)
      .map(alias => alias.index)
      .forEach(async (index) => {
        try {
          const response = await elasticClient.indices.deleteAlias({
            index,
            name: config.elasticsearch.indexName
          })
          console.log('Index alias deleted', response)
        } catch (e) {
          console.log('Index alias does not exists', e.message)
        }
      })

    try {
      const response = await elasticClient.indices.putAlias({
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
//
async function setAliasToLatestIndex () {
  const info = await getInfo()
  const index = info.indices.latest.name
  console.log(`Setting alias to latest index: ${index}`)
  return setAlias({ name: index })
}
// TO ES INTERFACE
// test delete index function for error handling of elastic client, guess it uses fetch.
// maybe i need to check the response.ok.
// could use fetch-errors package for it aswell.
async function deleteIndex (idOrName) {
  const { id, name } = idOrName
  if ((id && name) || !(id || name)) {
    throw new Error('Either provide id or name.')
  }

  const index = id
    ? `${config.elasticsearch.indexName}_${id}`
    : name

  try {
    console.log(`Deleting index: ${index}.`)
    const response = await elasticClient.indices.delete({ index })
    console.log(`Successfully deleted index: ${index}.`)
    return response
  } catch (e) {
    console.error(`Could not delete index '${index}'`)
    return Promise.reject(e)
  }
}
//
async function reindexFromAliasedIndex () {
  // reindexing references:
  // https://medium.com/@eyaldahari/reindex-elasticsearch-documents-is-easier-than-ever-103f63d411c
  // https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/16.x/api-reference-5-6.html#api-indices-putmapping-5-6
  // https://www.elastic.co/guide/en/elasticsearch/reference/5.6/docs-reindex.html

  // create a new index and add current mappings
  try {
    await createIndexAndAddMappings()
  } catch (e) {
    console.error('Something went wrong in createIndexAndAddMappings, stopping execution.')
    return Promise.reject(e)
  }

  // get info after creation of the destination index
  const info = await getInfo()

  const destIndexName = info.indices.latest.name
  const sourceIndexName = info.indices.aliased.name

  // fill the new index with data from the previous index
  console.log(`Will reindex ${destIndexName} with documents from ${sourceIndexName}\n`)
  try {
    const response = await elasticClient.reindex({
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
    setAliasToLatestIndex()
    return Promise.resolve(response)
  } catch (e) {
    console.error('Something went wrong when trying to reindex. Deleting newly created index.')
    console.error(e)
    console.error(`Error: status: ${e.status}, message: ${e.message}, failures: ${e.failures}\n`)
    await deleteIndex({ name: destIndexName })
    return Promise.reject(e)
  }
}
//
// @todo: reduce logs here, unneded for elasticClient or elasticClient core functions?
async function createIndexAndAddMappings () {
  return new Promise(async (resolve, reject) => {
    console.log('Will create a new index by increasing the id of the latest and adding the all mappings from the mappings directory to it.')
    const info = await getInfo()
    const indexName = `${config.elasticsearch.indexName}_${info.indices.latest.id + 1}`
    // create index
    try {
      const response = await elasticClient.indices.create({ index: indexName })
      console.log('Index created', response)
    } catch (e) {
      console.error('Could not create index')
      console.error(e)
      reject(e)
    }
    // add mappings
    try {
      const response = await elasticClient.putMappings(elasticClient, indexName)
      console.log('Mappings added', response)
    } catch (e) {
      console.error('Could not add mapping')
      console.error(e)
      deleteIndex({ name: indexName })
      reject(e)
    }
    resolve()
  })
}

//
async function importListOf (entityType, importer, page = 0, pageSize = 100) {
  return new Promise(async (resolve, reject) => {
    importer.api.authWith(MAGENTO_AUTH_TOKEN)

    const info = await getInfo()
    const query = {
      entityType: entityType,
      page: page,
      pageSize: pageSize
    }

    console.log('*** Getting objects list for', query)
    importer.api.get(config.vsbridge[entityType + '_endpoint']).type('json').query(query).end((resp) => {
      if (resp.body) {
        if (resp.body.code !== 200) { // unauthroized request
          console.log(resp)
          process.exit(-1)
        }
        if (resp.body.result) {
          const queue = []
          let index = 0
          for (let obj of resp.body.result) { // process single record
            const promise = importer.single(obj).then((singleResults) => {
              // store results
              let i = singleResults.length
              while (--i >= 0) {
                const entry = singleResults[i]
                elasticClient.index({
                  index: `${config.elasticsearch.indexName}_${info.indices.latest.id}`,
                  type: entityType,
                  id: entry.id,
                  body: entry
                })
              }
              console.log('* Record done for ', obj.id, index, pageSize)
              index++
            })
            if (cli.options.runSerial) { queue.push(() => promise) } else { queue.push(promise) }
          }

          let resultParser = (results) => {
            console.log('** Page done ', page, resp.body.result.length)

            if (resp.body.result.length === pageSize) {
              console.log('*** Switching page!')
              return importListOf(entityType, importer, config, vsBridgeClient, page + 1, pageSize)
            }
          }
          if (cli.options.runSerial) { promise.serial(queue).then(resultParser).then((res) => resolve(res)).catch((reason) => { console.error(reason); reject(reason) }) } else { Promise.all(queue).then(resultParser).then((res) => resolve(res)).catch((reason) => { console.error(reason); reject(reason) }) }
        }
      }
    })
  })
}

// add commands
cli.command('info', async () => {
  // show info table
  await elasticClient.cat.indices({ v: true }).then(res => {
    console.log(res)
  })

  // show current
  const info = await getInfo()
  console.log(`\nLatest index version is: ${info.indices.latest.id}.`)

  // show aliases
  if (!info.aliases || info.aliases.length === 0) {
    console.log('No alias defined. Use \'alias latest index\' or \'alias index --id <number>\' to enable some index.')
  } else {
    console.log(`\nAlias ${info.aliases[0].alias} is set on ${info.aliases[0].index}.`)
  }

  // show selected index

  // show tasks
  console.log('\nTasks:')
  await elasticClient.cat.tasks({ detailed: true }).then(res => console.log(res))
  console.log('Pending Tasks:')
  await elasticClient.cat.pendingTasks({ v: true }).then(res => console.log(res))
})

cli.command('create index', () => {
  createIndexAndAddMappings()
})

cli.command('delete index', () => {
  const { id, name } = cli.options
  deleteIndex({ id, name })
})
cli.command('reindex', async () => {
  reindexFromAliasedIndex()
})

cli.command('alias latest index', async () => {
  setAliasToLatestIndex()
})
cli.command('alias index', () => {
  const { id, name } = cli.options
  setAliasToLatestIndex({ id, name })
})
// @todo: finish index selection + integration
cli.command('select index', async () => {
  const info = await getInfo()
  const { id, name, aliased } = cli.options

  let index
  if (id) {
    index = info.getIndex(id)
  }
  if (name) {
    index = info.getIndex(name)
  }
  if (aliased) {
    index = info.indices.aliased
  }

  if (!index) {
    throw new Error('Provide either \'--id <number>\', \'--name <string>\' or --aliased, to select an index.')
  }
  jsonFile.writeFileSync(path.resolve(__dirname, '../../var/selected-index.json'), {
    'name': index.name,
    'id': index.id
  })
  console.log(require('../../var/selected-index.json'))
})
cli.command('delete latest index', async () => {
  const info = await getInfo()
  deleteIndex({ name: info.indices.latest.name })
})

cli.command('update latest index mappings', async () => {
  const info = await getInfo()
  elasticClient.putMappings(elasticClient, info.indices.latest.name)
})
cli.command('update aliased index mappings', async () => {
  const info = await getInfo()
  elasticClient.putMappings(elasticClient, info.indices.aliased.name)
})
cli.command('update mapping', () => {
  console.log('index selection not implemented.')
  // const { path } = cli.options
  // if(!path){
  //     throw new Error('Execute put mapping with -f or --file <path> and pass a valid json file like in node-app/mappings.')
  // }
  // elastic.putMappingsFromDirectory(elasticClient, path)
})
cli.command('foo', () => {
  vsBridgeClient.getAttributeData()
})
// @todo: store getInfo result globally
cli.command('add storyblok', async () => {
  const { page, pageSize } = cli.options
  getInfo().then(info => {
    addPagesFromStoryblok({
      index: info.indices.latest.name,
      type: 'cms_storyblok',
      page,
      pageSize
    })
  })
})
cli.command('add attributes', () => {
  importListOf(
    'attribute',
    new VsBridgeImporter('attribute', config, vsBridgeClient),
    cli.options.page,
    cli.options.pageSize
  )
})
cli.command('add taxrules', () => {
  importListOf(
    'taxrule',
    new VsBridgeImporter('taxrule', config, vsBridgeClient),
    cli.options.page,
    cli.options.pageSize
  )
})
cli.command('add categories', () => {
  importListOf(
    'category',
    new VsBridgeImporter('category', config, vsBridgeClient),
    cli.options.page,
    cli.options.pageSize
  )
})
cli.command('add products', () => {
  importListOf(
    'product',
    new VsBridgeImporter('product', config, vsBridgeClient),
    cli.options.page,
    cli.options.pageSize
  )
})

function importCmsPages () {
  return importListOf(
    'cms_page',
    new VsBridgeImporter('cms_page', config, vsBridgeClient),
    cli.options.page,
    cli.options.pageSize
  )
}
function importCmsBlocks () {
  return importListOf(
    'cms_block',
    new VsBridgeImporter('cms_block', config, vsBridgeClient),
    cli.options.page,
    cli.options.pageSize
  )
}
function importCmsHierarchy () {
  return importListOf(
    'cms_hierarchy',
    new VsBridgeImporter('cms_hierarchy', config, vsBridgeClient),
    cli.options.page,
    cli.options.pageSize
  )
}
cli.command('add cms', () => {
  const { pages, blocks, hierarchy } = cli.options
  if (pages) {
    importCmsPages()
  } else if (blocks) {
    importCmsBlocks()
  } else if (hierarchy) {
    importCmsHierarchy()
  } else {
    importCmsPages()
    importCmsBlocks()
    importCmsHierarchy()
  }
})

const commandLineUsage = require('command-line-usage')
function showHelp () {
  console.log(commandLineUsage([
    {
      header: 'Elasticsearch javascript cli specialized for vue-storefront.',
      content: ''
    },
    {
      header: 'Synopsis',
      content: [
        { name: 'help | h | ', summary: 'show help' },
        { name: 'info', summary: 'show some info' },
        { name: 'create index', summary: 'creates a new index, adds current mappings' },
        { name: 'reindex', summary: 'creates a new index, adds current mappings and uses the previous index to copy the documents from' },
        { name: 'delete index --id <number> | --name <string>', summary: 'deletes an index by id or name' },
        { name: 'delete latest index', summary: 'delete latest index' },
        { name: 'update latest index mappings', summary: 'updates all mappings of the latest index' },
        { name: 'update aliased index mappings', summary: 'updates all mappings of the aliased index' },
        // { name: 'update mapping -f | --file <path>', summary: 'updates all mappings of the latest index' },
        { name: 'publish latest index', summary: 'set alias to latest index' },
        { name: 'add attributes', summary: 'add attributes to the latest index' },
        { name: 'add taxrules', summary: 'add taxrules to the latest index' },
        { name: 'add categories', summary: 'add categories to the latest index' },
        { name: 'add products', summary: 'add products to the latest index' },
        { name: 'add cms', summary: 'add cms to the latest index' }
      ]
    }
  ]))
}
cli.command('help', () => {
  showHelp()
})
cli.command('h', () => {
  showHelp()
})
cli.command('', () => {
  showHelp()
})

// handle events events
cli.on('notfound', (action) => {
  console.error('I don\'t know how to: ' + action)
  showHelp()
  process.exit(1)
})
process.on('unhandledRejection', (reason, promise) => {
  const { message, status } = promise
  console.error('Unhandled Rejection:')
  console.error(`${message}, status: ${status}, reason: ${reason}.`)
  console.dir({ promise })
})
process.on('uncaughtException', function (exception) {
  console.error('Uncaught Exception:')
  console.dir({ exception })
})
process.on('SIGINT', handleSignal)
process.on('SIGTERM', handleSignal)
function handleSignal (signal) {
  console.log('Received exit signal. Bye!')
  process.exit(-1)
}

// run application

// function authToMagento (callback) {
//   return vsBridgeClient.post(config.vsbridge['auth_endpoint']).type('json').send({
//     username: config.vsbridge.auth.username,
//     password: config.vsbridge.auth.password
//   }).end((resp) => {
//     if (resp.body && resp.body.code === 200) {
//       console.log(`Magento auth token: ${resp.body.result}\n`)
//       if (callback) {
//         callback(resp.body)
//       }
//     } else {
//       // todo log response code etc instead of whole resp object
//       console.error(resp)
//       console.error(resp.body)
//     }
//   })
// }

// vsBridgeClient.auth().then(response => {

// })
// authToMagento((authResp) => {
//   MAGENTO_AUTH_TOKEN = authResp.result
//   cli.parse(process.argv)
// })

cli.parse(process.argv)
