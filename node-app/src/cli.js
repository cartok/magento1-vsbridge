
const CommandRouter = require('command-router')
const path = require('path')
const jsonFile = require('jsonfile')

const promise = require('./lib/promise')

const VsBridgeImporter = require('./importers/VsBridgeImporter')

const elasticClient = require('./clients/elasticClient')
const vsBridgeClient = require('./clients/vsBridgeClient')
const storyblokClient = require('./clients/storyblokClient')

const config = require('../config/config.json')

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

// STORYBLOK IMPORTER
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
      elasticClient.client.index({
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
// VSBRIDGE IMPORTER
async function importListOf (entityType, importer, page = 0, pageSize = 100) {
  return new Promise(async (resolve, reject) => {
    // importer.api.authWith(MAGENTO_AUTH_TOKEN)

    const info = await elasticClient.info
    const query = {
      entityType: entityType,
      page: page,
      pageSize: pageSize
    }

    console.log('*** Getting objects list for', query)
    importer.api.get(config.vsbridge[entityType + '_endpoint']).query(query).end((resp) => {
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
                elasticClient.client.index({
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
  await elasticClient.client.cat.indices({ v: true }).then(res => {
    console.log(res)
  })

  // show current
  const info = await elasticClient.info
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
  await elasticClient.client.cat.tasks({ detailed: true }).then(res => console.log(res))
  console.log('Pending Tasks:')
  await elasticClient.client.cat.pendingTasks({ v: true }).then(res => console.log(res))
})

cli.command('create index', () => {
  elasticClient.createIndexAndAddMappings()
})

cli.command('delete index', () => {
  const { id, name } = cli.options
  elasticClient.deleteIndex({ id, name })
})
cli.command('reindex', async () => {
  elasticClient.reindexFromAliasedIndex()
})

cli.command('alias latest index', async () => {
  elasticClient.setAliasToLatestIndex()
})
cli.command('alias index', () => {
  const { id, name } = cli.options
  elasticClient.setAliasToLatestIndex({ id, name })
})
// @todo: finish index selection + integration
cli.command('select index', async () => {
  const info = await elasticClient.info
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
  const info = await elasticClient.info
  elasticClient.deleteIndex({ name: info.indices.latest.name })
})

cli.command('update latest index mappings', async () => {
  const info = await elasticClient.info
  elasticClient.putMappings(elasticClient, info.indices.latest.name)
})
cli.command('update aliased index mappings', async () => {
  const info = await elasticClient.info
  elasticClient.putMappings(elasticClient, info.indices.aliased.name)
})
cli.command('update mapping', () => {
  console.log('index selection not implemented.')
  // const { path } = cli.options
  // if(!path){
  //     throw new Error('Execute put mapping with -f or --file <path> and pass a valid json file like in node-app/mappings.')
  // }
  // elasticClient.putMappingsFromDirectory(elasticClient, path)
})
cli.command('foo', async () => {
  try {
    const response = await vsBridgeClient.getAttributeData()
    console.log(response)
  } catch (e) {
    console.error(e)
    process.exit(-1)
  }
})
cli.command('bar', () => {
  try {
    vsBridgeClient.client.get(config.vsbridge.category_endpoint).query({
      entityType: 'attribute',
      page: 0,
      pageSize: 1
    }).end(response => {
      const { code, status, statusType, info, ok, clientError, serverError, unauthorized, error, body: { result } } = response
      console.log({ code, status, statusType, info, ok, clientError, serverError, unauthorized, error, result })
    })
  } catch (e) {
    console.log(e)
  }
})
// @todo: store getInfo result globally
cli.command('add storyblok', async () => {
  const { page, pageSize } = cli.options
  const info = await elasticClient.info
  addPagesFromStoryblok({
    index: info.indices.latest.name,
    type: 'cms_storyblok',
    page,
    pageSize
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
        { name: 'alias index --id <number> | --name <string>', summary: 'sets THE alias to an index' },
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
        { name: 'add cms', summary: 'add cms to the latest index' },
        { name: 'add storyblok', summary: 'add storyblok pages to the latest index' }
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

// execute application
;(async () => {
  const magentoApiKey = await vsBridgeClient.auth()
  console.log({ magentoApiKey })
  cli.parse(process.argv)
})()
