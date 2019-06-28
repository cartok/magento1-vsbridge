const fs = require('fs')

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

module.exports = {
  readMappingsFromDirectory
}
