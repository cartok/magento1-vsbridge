
const CommandRouter = require('command-router')
const path = require('path')
const jsonFile = require('jsonfile')

const importer = require('./importer')

const elasticClient = require('./clients/elasticClient')
const vsBridgeClient = require('./clients/vsBridgeClient')
const storyblokClient = require('./clients/storyblokClient')

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

async function getIndexUsingCliOptions (options) {
  const { id, name, latest, selected } = cli.options
  const info = await elasticClient.info
  if (!info.hasIndex()) {
    console.log(`\nNo index created yet.`)
    process.exit(126)
  }

  let index
  if (id) {
    index = info.getIndex(id)
  }
  if (name) {
    index = info.getIndex(name)
  }
  if (latest) {
    index = info.indices.latest
  }
  if (selected) {
    index = info.indices.selected
  }

  // as default use the selected index (if any).
  if (!id && !name && !latest && !selected) {
    if (info.indices.selected) {
      index = info.indices.selected
    }
  }

  if (!index) {
    showHelp()
    console.log(`\n> Either the index you wanted to use does not exist or you did not use this command properly. This message also apears if no index is selected, please select some index first.\n`)
    process.exit(126)
  }

  return index
}

// add commands
cli.command('info', async () => {
  try {
    // show info table
    await elasticClient.client.cat.indices({ v: true }).then(res => {
      console.log(res)
    })

    // show current
    const info = await elasticClient.info
    if (info.hasIndex()) {
      console.log(`> Latest index version: ${info.indices.latest.id}`)
    }

    // show aliases
    if (info.hasAlias()) {
      console.log(`> Aliased index version: ${info.indices.aliased.id}`)
    } else {
      console.log(`> No alias defined. Use the cli to set one.`)
    }

    // show selected index
    if (info.hasIndex()) {
      console.log(`> Selected index version: ${info.indices.selected.id}`)
    }

    // show tasks
    console.log('\nTasks:')
    await elasticClient.client.cat.tasks({ detailed: true }).then(res => console.log(res))
    console.log('Pending Tasks:')
    await elasticClient.client.cat.pendingTasks({ v: true }).then(res => console.log(res))
  } catch (error) {
    console.error(error)
  }
})
cli.command('create index', async () => {
  try {
    // @todo: either dont add mappings directly using the default mappings directory,
    // or add handle directory cli param + augment the method below.
    if (cli.options.path) {
      console.warn('\n> Using a path to use mappings from is not finally implemented.')
      process.exit(126)
    }
    await elasticClient.createNextIndexAndAddMappings()
  } catch (error) {
    console.error(error)
  }
})
cli.command('delete index', async () => {
  try {
    const index = await getIndexUsingCliOptions(cli.options)
    elasticClient.deleteIndex(index.name)
  } catch (error) {
    console.error(error)
  }
})
cli.command('delete all indices', async () => {
  try {
    await elasticClient.deleteAllIndices()
  } catch (error) {
    console.error(error)
  }
})
cli.command('normalize index ids', async () => {
  try {
    console.warn('--- not implemented ---')
    process.exit(126)
    await elasticClient.normalizeIndexIds()
  } catch (error) {
    console.error(error)
  }
})
cli.command('reindex', async () => {
  try {
    // @todo: handle path
    if (cli.options.path) {
      console.warn('\n> Using a path to use mappings from is not finally implemented.')
      process.exit(126)
    }
    const index = await getIndexUsingCliOptions(cli.options)
    await elasticClient.reindexFrom(index.name)
  } catch (error) {
    console.error(error)
  }
})
cli.command('update mappings', async () => {
  try {
    const index = await getIndexUsingCliOptions(cli.options)
    const { path } = cli.options
    if (path) {
      console.warn('\n> Using a path to use mappings from is not tested.')
      process.exit(126)
      await elasticClient.putMappingsFromDirectory(index.name, path)
    } else {
      await elasticClient.putMappings(index.name)
    }
  } catch (error) {
    console.log(error)
  }
})
cli.command('select index', async () => {
  const index = await getIndexUsingCliOptions(cli.options)
  try {
    // save selected index info to file.
    jsonFile.writeFileSync(path.resolve(__dirname, '../var/selected-index.json'), {
      'name': index.name,
      'id': index.id
    }, { spaces: 2, EOL: '\n' })
    console.log(`> Saved selected index information to file.`)
    console.log(`> Index with id ${index.id} is now selected.`)
  } catch (error) {
    console.log(`> Could not write to file.`)
    console.log(`> Index with id ${index.id} is not selected.`)
    throw error
  }
})
cli.command('alias index', async () => {
  try {
    const index = await getIndexUsingCliOptions(cli.options)
    await elasticClient.setAlias(index.name)
  } catch (error) {
    console.error(error)
  }
})

cli.command('add attributes', async () => {
  try {
    const index = await getIndexUsingCliOptions(cli.options)
    const { page, pageSize } = cli.options
    await importer.importDocuments({
      client: vsBridgeClient,
      index: index.name,
      type: 'attribute',
      page,
      pageSize
    })
  } catch (error) {
    console.error(error)
  }
})
cli.command('add taxrules', async () => {
  try {
    const index = await getIndexUsingCliOptions(cli.options)
    const { page, pageSize } = cli.options
    await importer.importDocuments({
      client: vsBridgeClient,
      index: index.name,
      type: 'taxrule',
      page,
      pageSize
    })
  } catch (error) {
    console.error(error)
  }
})
cli.command('add categories', async () => {
  try {
    const index = await getIndexUsingCliOptions(cli.options)
    const { page, pageSize } = cli.options
    await importer.importDocuments({
      client: vsBridgeClient,
      index: index.name,
      type: 'category',
      page,
      pageSize
    })
  } catch (error) {
    console.error(error)
  }
})
cli.command('add products', async () => {
  try {
    const index = await getIndexUsingCliOptions(cli.options)
    const { page, pageSize } = cli.options
    await importer.importDocuments({
      client: vsBridgeClient,
      index: index.name,
      type: 'product',
      page,
      pageSize
    })
  } catch (error) {
    console.error(error)
  }
})
cli.command('add cms', async () => {
  const index = await getIndexUsingCliOptions(cli.options)
  const { page, pageSize } = cli.options
  const { pages, blocks, hierarchy } = cli.options
  function importCmsPages () {
    return importer.importDocuments({
      client: vsBridgeClient,
      index: index.name,
      type: 'cms_page',
      page,
      pageSize
    })
  }
  function importCmsBlocks () {
    return importer.importDocuments({
      client: vsBridgeClient,
      index: index.name,
      type: 'cms_block',
      page,
      pageSize
    })
  }
  function importCmsHierarchy () {
    return importer.importDocuments({
      client: vsBridgeClient,
      index: index.name,
      type: 'cms_hierarchy',
      page,
      pageSize
    })
  }
  try {
    if (pages) {
      await importCmsPages()
    } else if (blocks) {
      await importCmsBlocks()
    } else if (hierarchy) {
      await importCmsHierarchy()
    } else {
      await importCmsPages()
      await importCmsBlocks()
      await importCmsHierarchy()
    }
  } catch (error) {
    console.error(error)
  }
})
cli.command('add storyblok', async () => {
  try {
    const index = await getIndexUsingCliOptions(cli.options)
    const { page, pageSize } = cli.options
    importer.importDocuments({
      client: storyblokClient,
      index: index.name,
      type: 'cms_storyblok',
      page,
      pageSize
    })
  } catch (error) {
    console.error(error)
  }
})

const commandLineUsage = require('command-line-usage')
function showHelp () {
  console.log(commandLineUsage([
    {
      header: 'Elasticsearch javascript cli specialized for vue-storefront.',
      // i needed to double escape '}' even tho using a template string, cause chalk could not handle it (parsing error).
      content: `To select an index for a command use \\{ --id <number> | --name <string> | --latest | --aliased | --selected \\}. Otherwise the currently selected index will be used (if any). For mapping selection use \\{ --path \\} if you want to use mappings from a directory different than the project.`
    },
    {
      header: 'Synopsis',
      content: [
        { name: 'help | h | ', summary: 'show help' },
        { name: 'info', summary: 'show elastic info' },
        { name: 'create index', summary: 'creates a new index and adds mappings' },
        { name: 'reindex', summary: 'creates a new index, adds mappings and reindexes it from some given index' },
        { name: 'delete index', summary: 'deletes some index' },
        { name: 'update mappings ', summary: 'updates all mappings of some index' },
        { name: 'select index', summary: 'select some index' },
        { name: 'alias index', summary: 'set alias for some index' },
        { name: 'add attributes', summary: 'add attributes to some index' },
        { name: 'add taxrules', summary: 'add taxrules to some index' },
        { name: 'add categories', summary: 'add categories to some index' },
        { name: 'add products', summary: 'add products to some index' },
        { name: 'add cms', summary: 'add cms to some index' },
        { name: 'add storyblok', summary: 'add storyblok pages someindex ' }
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

// this command is only for test purposes
cli.command('fail', async () => {
  try {
    await elasticClient.putMappingsFromDirectory('fooindex', path.resolve(__dirname, '../654'))
  } catch (error) {
    console.error(error)
    process.exit(-1)
  }
})
// this command is only for test purposes
const util = require('util')
const setTimeoutPromise = util.promisify(setTimeout)
cli.command('test', async () => {
  try {
    console.log('start')
    console.log('timeout 1 start...')
    await setTimeoutPromise(2000)
    console.log('timeout 1 end...')
    await new Promise((resolve, reject) => {
      console.log('timeout 2 start...')
      setTimeout(() => {
        console.log('timeout 2 end...')
        resolve()
      }, 2000)
    })
    console.log('end')
  } catch (error) {
    console.error(error)
  }
})

// handle events events
cli.on('notfound', (action) => {
  showHelp()
  console.error(`\n> I don't know how to '${action}'.\n`)
  process.exit(1)
})

// execute application
;(async () => {
  try {
    await vsBridgeClient.auth()
  } catch (error) {
    console.error(error)
    return
  }
  cli.parse(process.argv)
})()
