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

const typeMappings = require('../../mappings/index')
async function updateMapping(db, indexName) {    
    // @TODO: not finished
    return new Promise((resolve, reject) => {
        const promises = Object.values(typeMappings).reduce(async (prevPromise, mapping) => {
            await prevPromise
            const currentMapping = await db.indices.getMapping({
                index: indexName,
                type: mapping.type
            })
            const currentProps = currentMapping[indexName].mappings[mapping.type].properties
            const newPropKeys = Object.keys(currentProps).filter(key => !Object.keys(mapping.properties).includes(key))
            console.log({type: mapping.type, newPropKeys})
        }, Promise.resolve())
        console.log({promises})
        resolve()
    })
}
async function putAllMappings(db, indexName) {
    return new Promise((resolve, reject) => {
        const promises = Object.values(typeMappings).reduce(async (prevPromise, mapping) => {
            await prevPromise
            return db.indices.putMapping({
                updateAllTypes: true, // didnt help
                index: indexName,
                type: mapping.type,
                body: {
                    properties: mapping.properties
                }
            }).then(res => {
                console.dir(res, { depth: null, colors: true })
            }).catch(err => {
                // @TODO: write to mapping-errors.log
                console.error(err)
                throw new Error(err.message)
            })
        }, Promise.resolve())
        // @TODO: check promises all resolved
        console.log({promises})
        resolve()
    })
}
async function putMapping(db, indexName, mapping){
    // @TODO: not finished
    console.log('not implemented.')
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
    updateMapping,
    putMapping,
    putAlias,
    createIndex,
    deleteIndex,
    reIndex
}