const promise = require('./promise')

/**
 *
 * @param {*} esClient
 * @param {*} indexName
 * @param {*} mapping
 */
async function putMapping (esClient, indexName, mapping) {
  console.log(`Will add mapping for type '${mapping.type}'.`)
  try {
    const response = await esClient.indices.putMapping({
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

/**
 *
 * @param {*} esClient
 * @param {*} indexName
 * @param {*} mappings
 */
function putMappings (esClient, indexName, mappings) {
  return new Promise((resolveAll, rejectAll) => {
    promise.serial(Object.values(mappings).map(mapping => () => new Promise((resolve, reject) => {
      try {
        const response = putMapping(esClient, indexName, mapping)
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

module.exports = {
  putMapping,
  putMappings
}
