const path = require('path')
const fs = require('fs')
const jsonFile = require('jsonfile')
const defaultConfig = require('../../config/default.json')
const customConfig = require('../../config/custom.json')
const objectAssignDeep = require('@cartok/object-assign-deep')
const VsBridgeApiClient = require('./lib/vsbridge-api')
const BasicImporter = require('./importers/basic')
const _ = require('lodash')
const promiseLimit = require('promise-limit')
const limit = promiseLimit(3) // limit N promises to be executed at time
const promise = require('./lib/promise') // right now we're using serial execution because of recursion stack issues
const shell = require('shelljs')
const elastic = require('./meta/elastic')
const { spawn } = require('child_process')
const es = require('elasticsearch')
const CommandRouter = require('command-router')

let AUTH_TOKEN = ''

// merge default and local configs and write to new file.
const config = objectAssignDeep(defaultConfig, customConfig)
jsonFile.writeFileSync(path.join(__dirname, '../../config/config.json'), config)

// init vue-storefront-api client
const api = new VsBridgeApiClient(config)

// init node cli 
const cli = CommandRouter()

// init elastic client
const client = new es.Client({
    host: config.elasticsearch.host,
    log: {
        // level: ['error', 'warning', 'trace', 'info', 'debug'],
        // level: ['error', 'warning', 'info', 'trace'],
        level: ['error'],
    },
    apiVersion: '5.4',
    requestTimeout: 5000,
    maxRetries: 3,
    maxSockets: 25
})

// add cli options
cli.option({ 
    name: 'page',
    alias: 'p',
    default: 1,
    type: Number,
})
cli.option({
    name: 'pageSize',
    alias: 'l',
    default: 25,
    type: Number,
})
cli.option({
    name: 'partitions',
    alias: 't',
    default: 20,
    type: Number,
})
cli.option({
    name: 'runSerial',
    alias: 's',
    default: false,
    type: Boolean,
})
cli.option({
    name: 'id',
    alias: 'i',
    default: null,
    type: Number,
})
cli.option({
    name: 'name',
    alias: 'n',
    default: null,
    type: String,
})

// @todo: add auth for storyblok
function authUser(callback) {
    return api.post(config.vsbridge['auth_endpoint']).type('json').send({
        username: config.vsbridge.auth.username,
        password: config.vsbridge.auth.password,
    }).end((resp) => {
        if(resp.body && resp.body.code == 200)
        {
            console.log(`Magento auth token: ${resp.body.result}\n`)
            if (callback) {
                callback(resp.body)
            }
        } else {
            console.error(resp)
            console.error(resp.body)
            console.error(resp.body.result)
        }
    })
}
// @TODO: move to elastic.js
function importCmsPages() {
    importListOf(
        'cms_page',
        new BasicImporter('cms_page', config, api, page = cli.options.page, pageSize = cli.options.pageSize),
        config,
        api,
        page = cli.options.page,
        pageSize = cli.options.pageSize
    ).then((result) => {
    }).catch(err => {
        console.error(err)
    })
}
// @TODO: move to elastic.js
function importCmsBlocks() {
    importListOf(
        'cms_block',
        new BasicImporter('cms_block', config, api, page = cli.options.page, pageSize = cli.options.pageSize),
        config,
        api,
        page = cli.options.page,
        pageSize = cli.options.pageSize
    ).then((result) => {
    }).catch(err => {
        console.error(err)
    })
}
// @TODO: move to elastic.js
function importCmsHierarchy() {
    importListOf(
        'cms_hierarchy',
        new BasicImporter('cms_hierarchy', config, api, page = cli.options.page, pageSize = cli.options.pageSize),
        config,
        api,
        page = cli.options.page,
        pageSize = cli.options.pageSize
    ).then((result) => {
    }).catch(err => {
        console.error(err)
    })
}

async function getInfo() {
    // add name to index object, just for semantic
    const indices = (await client.cat.indices({ format: 'json' }))
        .map(index => Object.assign(index, { name: index.index }))

    // filter all indices that start with the name in the config
    // and get the latest version (biggest number)
    const latestId = Math.max(...indices
        .filter(i => i.index.startsWith(config.elasticsearch.indexName))
        .map(i => i.name)
        .map(version => parseInt(version.replace(/^.*_(\d+)$/,'$1')))
    )
    
    // get whole data of the latest index
    const latestIndex = indices.find(i => i.name.endsWith(`_${latestId}`))

    // get aliases
    // add name to index object, just for semantic
    const aliases = (await client.cat.aliases({ format: 'json' }))
        .map(alias => Object.assign(alias, { name: alias.index }))

    // // get add mappings
    // const mappings = await indices.map(async (index) => {
    //     const mapping = await client.indices.getMapping({ index: index.name })
    //     console.log({mapping})
    //     return Object.assign({ index: index.name }, mapping.mappings)
    // })
    // console.log(mappings)
    
    return {
        aliases,
        indices: {
            all: indices,
            latest: Object.assign(latestIndex, {
                id: latestId,
                isPublished: aliases.find(alias => alias.index === latestIndex.name) === true
            }),
            aliased: aliases[0]
        },
        // mappings
    }
}
async function getIndexById(id) {
    const indices = await client.cat.indices({ format: 'json' })
    const index = indices.find(i => i.index.endsWith(`_${id}`))
    if(!index){
        throw new Error(`Index ending with '${id}' could not be found.`)
    }
    return index
}

async function updateMappingsOfLatestIndex() {
    console.log('Elasticsearch can only execute the following actions for existing mappings: add field, upgrade field to multi-field.')
    console.log('If you need to change some field use reindex.')
    const info = await getInfo()
    try {
        const response = await elastic.updateMapping(client, info.indices.latest.name)
        return response
    } catch (e){
        console.error(e.message)
        return Promise.reject()
    }
}

async function setAlias(idOrName){
    return new Promise(async (resolve, reject) => {
        const { id, name } = idOrName
        if((id && name) || !(id || name)){
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
                    const response = await client.indices.deleteAlias({
                        index,
                        name: config.elasticsearch.indexName
                    })
                    console.log('Index alias deleted', response)
                } catch(e){
                    console.log('Index alias does not exists', e.message)
                }
            })

        try {
            const response = await client.indices.putAlias({
                index,
                name: config.elasticsearch.indexName
            })
            console.log('Index alias created', response)
            resolve(response)
        } catch(e){
            console.log('Could not create alias', e.message)
            reject()
        }
    })
}
async function setAliasToLatestIndex() {
    const info = await getInfo()
    const index = info.indices.latest.name
    console.log(`Setting alias to latest index: ${index}`)
    return setAlias({ name: index })
}

async function deleteIndex(idOrName){
    const { id, name } = idOrName
    if((id && name) || !(id || name)){
        throw new Error('Either provide id or name.')
    }

    const index = id
        ? `${config.elasticsearch.indexName}_${id}`
        : name

    try {
        console.log(`Deleting index: ${index}.`)
        const response = await client.indices.delete({
            index
        })
        console.log(`Success.`)
        return response
    } catch(e) {
        if(e.status === 404){
            console.log('Could not delete, index does not exist.')
        }
        return Promise.reject()
    }
}
async function reindexFromAliasedIndex(){
    // reindexing references:
    // https://medium.com/@eyaldahari/reindex-elasticsearch-documents-is-easier-than-ever-103f63d411c
    // https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/16.x/api-reference-5-6.html#api-indices-putmapping-5-6
    // https://www.elastic.co/guide/en/elasticsearch/reference/5.6/docs-reindex.html

    // create a new index and add current mappings
    try {
        await createIndexAndAddMappings()
    } catch (e){
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
        const response = await client.reindex({
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
        console.log(`Reindexing task was successfully triggered, check its state by using 'elastic info' command`, response)
        setAliasToLatestIndex()
        return Promise.resolve(response)
    } catch (e){
        console.error('Something went wrong when trying to reindex. Deleting newly created index.')
        console.error(e)
        console.error(`Error: status: ${e.status}, message: ${e.message}, failures: ${e.failures}\n`)
        await deleteIndex({ name: destIndexName })
        return Promise.reject(e)
    }
}

async function createIndexAndAddMappings() {
    return new Promise(async (resolve, reject) => {
        console.log('Will create a new index by increasing the id of the latest and add the current mappings to it.')
        const info = await getInfo()
        const indexName = `${config.elasticsearch.indexName}_${info.indices.latest.id + 1}`
        try {
            const response = await client.indices.create({ index: indexName })
            console.log('Index created', response)
        } catch(e){
            console.error(`Could not create index`)
            console.error(e)
            reject(e)
        }
        try {
            const response = await elastic.putAllMappings(client, indexName)
        } catch(e) {
            console.error(`Could not add mapping`)
            console.error(e)
            reject(e)
        }
        resolve()
    })
}

async function importListOf(entityType, importer, config, api, page = 0, pageSize = 100, recursive = true) {
    if (!config.vsbridge[entityType + '_endpoint']){
        console.error('No endpoint defined for ' + entityType)
        return
    }

    return new Promise(async (resolve, reject) => {
        api.authWith(AUTH_TOKEN)

        const info = await getInfo()
        const query = {
            entityType: entityType,
            page: page,
            pageSize: pageSize
        }

        console.log('*** Getting objects list for', query)
        api.get(config.vsbridge[entityType + '_endpoint']).type('json').query(query).end((resp) => {
            if(resp.body){
                if(resp.body.code !== 200) { // unauthroized request
                    console.log(resp)
                    process.exit(-1)
                }
                if(resp.body.result){
                    const queue = []
                    let index = 0
                    for(let obj of resp.body.result) { // process single record
                        const promise = importer.single(obj).then((singleResults) => {
                            // store results
                            let i = singleResults.length
                            while(--i >= 0){
                                const entry = singleResults[i]
                                client.index({
                                    index: `${config.elasticsearch.indexName}_${info.indices.latest.id}`,
                                    type: entityType,
                                    id: entry.id,
                                    body: entry
                                })
                            }
                            console.log('* Record done for ', obj.id, index, pageSize)
                            index++
                        })
                        if(cli.options.runSerial)
                            queue.push(() => promise)
                        else
                            queue.push(promise)
                    }

                    let resultParser = (results) => {
                        console.log('** Page done ', page, resp.body.result.length)

                        if(resp.body.result.length === pageSize)
                        {
                            if(recursive) {
                                console.log('*** Switching page!')
                                return importListOf(entityType, importer, config, api, page + 1, pageSize)
                            }
                        }
                    }
                    if(cli.options.runSerial)
                        promise.serial(queue).then(resultParser).then((res) => resolve(res)).catch((reason) => { console.error(reason); reject() })
                    else
                        Promise.all(queue).then(resultParser).then((res) => resolve(res)).catch((reason) => { console.error(reason); reject() })
                }
            }
        })
    })
}

// add commands
cli.command('info', async () => {
    // show info table
    await client.cat.indices({ v: true }).then(res => {
        console.log(res)
    })
    
    // show current
    const info = await getInfo()
    console.log(`\nLatest index version is: ${info.indices.latest.id}.`)
    
    // show aliases
    if(!info.aliases || info.aliases.length === 0){
        console.log(`No alias defined. Use 'alias latest index' or 'alias index --id <number>' to enable some index.`)
    } else {
        console.log(`\nAlias ${info.aliases[0].alias} is set on ${info.aliases[0].index}.`)
    }
    
    // show tasks
    console.log('\nTasks:')
    await client.cat.tasks({ detailed: true }).then(res => console.log(res))
    console.log('Pending Tasks:')
    await client.cat.pendingTasks({ v: true }).then(res => console.log(res))
})

cli.command('create index',  () => {
    createIndexAndAddMappings()
})

cli.command('delete index',  () => {
    const { id, name } = cli.options
    deleteIndex({ id, name })
})
cli.command('reindex',  async () => {
    reindexFromAliasedIndex()
})

cli.command('alias latest index', async () => {
    setAliasToLatestIndex()
})
cli.command('alias index',  () => {
    const { id, name } = cli.options
    setAliasToLatestIndex({ id, name })
})
cli.command('delete latest index',  async () => {
    const info = await getInfo()
    deleteIndex(info.indices.latest.id)
})
cli.command('update latest index mappings',  () => {
    updateMappingsOfLatestIndex()
})

cli.command('add attributes',  () => {
    importListOf(
        'attribute',
        new BasicImporter('attribute', config, api, page = cli.options.page, pageSize = cli.options.pageSize),
        config,
        api,
        page = cli.options.page,
        pageSize = cli.options.pageSize
    )
})
cli.command('add taxrules',  () => {
    importListOf(
        'taxrule',
        new BasicImporter('taxrule', config, api, page = cli.options.page, pageSize = cli.options.pageSize),
        config,
        api,
        page = cli.options.page,
        pageSize = cli.options.pageSize
    )
})
cli.command('add categories',  () => {
    importListOf(
        'category',
        new BasicImporter('category', config, api, page = cli.options.page, pageSize = cli.options.pageSize),
        config,
        api,
        page = cli.options.page,
        pageSize = cli.options.pageSize
    ).then((result) => {

    }).catch(err => {
       console.error(err)
    })
})
cli.command('add products',  () => {
   importListOf(
       'product',
       new BasicImporter('product', config, api, page = cli.options.page, pageSize = cli.options.pageSize),
       config,
       api,
       page = cli.options.page,
       pageSize = cli.options.pageSize
    )
})
cli.command('add cms',  () => {
    if (cli.options.pages) {
        importCmsPages()
    } else if (cli.options.blocks) {
        importCmsBlocks()
    } else if (cli.options.hierarchy) {
        importCmsHierarchy()
    } else {
        importCmsPages()
        importCmsBlocks()
        importCmsHierarchy()
    }
})

const commandLineUsage = require('command-line-usage')
function showHelp(){
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
                { name: 'publish latest index', summary: 'set alias to latest index' },
                { name: 'add attributes', summary: 'add attributes to the latest index' },
                { name: 'add taxrules', summary: 'add taxrules to the latest index' },
                { name: 'add categories', summary: 'add categories to the latest index' },
                { name: 'add products', summary: 'add products to the latest index' },
                { name: 'add cms', summary: 'add cms to the latest index' },
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
process.on('unhandledRejection', (reason, p) => {
  console.error(`Unhandled Rejection: ${p.message}, status: ${p.status}, reason: ${reason}.`)
  console.error(p)
})
process.on('uncaughtException', function (exception) {
    console.log('TRIGGERED?')
    console.error(exception)
})
process.on('SIGINT', handleSignal)
process.on('SIGTERM', handleSignal)
function handleSignal(signal) {
    console.log('Received exit signal. Bye!')
    process.exit(-1)
}

// run application
authUser((authResp) => {
  AUTH_TOKEN = authResp.result
  cli.parse(process.argv)
})
