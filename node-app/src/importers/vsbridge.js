const BasicImporter = require('./basic')

class VSBridgeImporter extends BasicImporter {
  constructor (entityType, config, api) {
    super(entityType, config, api)
    if (!config.vsbridge[entityType + '_endpoint']) {
      throw new Error('No endpoint defined for ' + entityType)
    }
  }
}

module.exports = VSBridgeImporter
