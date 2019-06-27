const config = require('../../config.json')
const VsBridgeApiClient = require('../lib/vsbridge-api')
const api = new VsBridgeApiClient(config)

function putAlias(db, originalName, aliasName, next) {
    let step2 = () => {
        db.indices.putAlias({ index: originalName, name: aliasName }).then(result=>{
            console.log('Index alias created', result)
        }).then(next).catch(err => {
            console.log(err.message)
            next()
        })
    }

    return db.indices.deleteAlias({
        index: aliasName,
        name:  originalName
    }).then((result) => {
        console.log('Public index alias deleted', result)
        step2()
    }).catch((err) => {
        console.log('Public index alias does not exists', err.message)
        step2()
    })
}

function deleteIndex(db, indexName, next) {
    db.indices.delete({
        "index": indexName
      }).then((res) => {
        console.dir(res, { depth: null, colors: true })
        next()
      }).catch(err => {
        console.error(err)
        next(err)
      })
}

function reIndex(db, fromIndexName, toIndexName, next) {
    db.reindex({
      waitForCompletion: true,
      body: {
        "source": {
          "index": fromIndexName
        },
        "dest": {
          "index": toIndexName
        }
      }
    }).then(res => {
      console.dir(res, { depth: null, colors: true })
      next()
    }).catch(err => {
      console.error(err)
      next(err)
    })
}

function createIndex(db, indexName, next) {
    const step2 = () => {
        db.indices.delete({
            "index": indexName
            }).then(res1 => {
                console.dir(res1, { depth: null, colors: true })
                db.indices.create(
                    {
                        "index": indexName
                    }).then(res2 => {
                        console.dir(res2, { depth: null, colors: true })
                        next()
                    }).catch(err => {
                        console.error(err)
                        next(err)
                    })
                }).catch(() => {
                    db.indices.create(
                        {
                        "index": indexName
                        }).then(res2 => {
                            console.dir(res2, { depth: null, colors: true })
                            next()
                        }).catch(err => {
                            console.error(err)
                            next(err)
                        })
                })
    }

    return db.indices.deleteAlias({
        index: '*',
        name:  indexName
    }).then((result) => {
        console.log('Public index alias deleted', result)
        step2()
    }).catch((err) => {
        console.log('Public index alias does not exists', err.message)
        step2()
    })
}
// @note: reading mappings from a directory enables us to easily use mapping files outside of the project instead.
const fs = require('fs')
const path = require('path')
const mappingsDirectory = path.join(__dirname, '../../mappings')
const typeMappings = fs.readdirSync(mappingsDirectory, { withFileTypes: false }).map(fullFileName => ({
    type: fullFileName.replace(/(.*)\.json/, '$1'),
    properties: require(`${mappingsDirectory}/${fullFileName}`),
}))
const promise = require('../lib/promise')
async function putAllMappings(db, indexName) {
    return new Promise((resolveAll, rejectAll) => {
        promise.serial(Object.values(typeMappings).map(mapping => () => new Promise((resolve, reject) => {
            console.log(`Will put mapping for '${mapping.type}'.`)
            db.indices.putMapping({
                updateAllTypes: true, // if multiple document types have a field with the same name, update the field type for every document to get no conflicts.
                index: indexName,
                type: mapping.type,
                body: {
                    properties: mapping.properties
                }
            }).then(res => {
                console.log(`Successfully put mapping for '${mapping.type}'.`)
                resolve(true)
            }).catch(err => {
                // @TODO: write to mapping-errors.log
                console.log(`Something happened when adding mapping for '${mapping.type}'.`)
                console.log('Elasticsearch can only execute the following actions for existing mappings: add field, upgrade field to multi-field.')
                console.log('If you need to change some field use reindex.')
                reject(false)
                rejectAll(err)
            })
        })))
        .then(res => {
            console.log('Mappings were added successfully\n')
            resolveAll(true)
        })
        .catch(e => rejectAll(e))
    })
}

async function putMapping(db, indexName, mapping){
    console.log(`Will add mapping for type '${mapping.type}'.`)
    try {
        const response = await db.indices.putMapping({
            updateAllTypes: true, // if multiple document types have a field with the same name, update the field type for every document to get no conflicts.
            index: indexName,
            type: mapping.type,
            body: {
                properties: mapping.properties
            }
        })
        console.log('Success.')
        console.log(response)
    } catch (e) {
        console.error('Something went wrong, could not put mapping.')
        console.error(e)
    }
}
async function putMappingByFilePath(db, indexName, mappingFilePath){
    const mapping = require(path.resolve(__dirname, mappingFilePath))
    putMapping(db, indexName, mapping)
}

/**
 * Get attribute data for mappings
 */
function getAttributeData(token) {
    let promise = new Promise((resolve, reject) => {
        console.log('*** Getting attribute data')
        api.authWith(token);
        api.get(config.vsbridge['product_mapping_endpoint']).type('json').end((resp) => {
            if (resp.body && resp.body.code !== 200) { // unauthroized request
                console.log(resp.body.result);
                process.exit(-1)
            }
            resolve(resp.body.result);
            reject('Attribute data not available now, please try again later');
        })
    });

    return promise
        .then(
            result => (result),
            error => (error)
        );
}

module.exports = {
    putAllMappings,
    putMappingByFilePath,
    putMapping,
    putAlias,
    createIndex,
    deleteIndex,
    reIndex
}