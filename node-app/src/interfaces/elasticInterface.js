const fs = require('fs')
const path = require('path')

const elasticClient = require('./clients')
const elasticLibrary = require('../lib/elastic')

// TO LIB?
/**
 * load mappings from the project's mappings directory.
 * reading mappings from a directory enables us to easily use mapping files outside of the project instead aswell.
 * @param {*} absolutePath
 */
function readMappingsFromDirectory (absolutePath) {
  const typeMappings = fs.readdirSync(absolutePath, { withFileTypes: false })
    .filter(fileName => fileName.endsWith('.json'))
    .map(fileName => ({
      type: fileName.replace(/(.*)\.json/, '$1'),
      properties: require(`${absolutePath}/${fileName}`)
    }))
  return typeMappings
}

function putMappingsFromDirectory (indexName, absolutePath) {
  const mappings = readMappingsFromDirectory(absolutePath)
  console.log('TEMP: put mapping from directory, mappings:', mappings)
  return elasticLibrary.putMappings(elasticClient, indexName, mappings)
}
function putMappingFromFile (indexName, absolutePath) {
  const mapping = require(path.resolve(__dirname, absolutePath))
  console.log('TEMP: put mapping from single file, mapping:', mapping)
  return elasticLibrary.putMapping(elasticClient, indexName, mapping)
}

module.exports = {
  putMappingsFromDirectory,
  putMappingFromFile
}
