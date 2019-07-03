const fs = require('fs')

/**
 * load mappings from the project's mappings directory.
 * reading mappings from a directory enables us to easily use mapping files outside of the project instead aswell.
 * @param {*} absolutePath
 */
function readMappingsFromDirectory (absolutePath) {
  try {
    const typeMappings = fs.readdirSync(absolutePath, { withFileTypes: false })
      .filter(fileName => fileName.endsWith('.json'))
      .map(fileName => ({
        type: fileName.replace(/(.*)\.json/, '$1'),
        properties: require(`${absolutePath}/${fileName}`)
      }))
    return typeMappings
  } catch (error) {
    console.log(`\n> Could not read files from '${absolutePath}'`)
    throw error
  }
}

module.exports = {
  readMappingsFromDirectory
}
