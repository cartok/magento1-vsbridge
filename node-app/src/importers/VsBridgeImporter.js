const BasicImporter = require('./BasicImporter')

class VsBridgeImporter extends BasicImporter {
  constructor (entityType, config, api) {
    super(entityType, config, api)
    if (!config.vsbridge[entityType + '_endpoint']) {
      throw new Error('No endpoint defined for ' + entityType)
    }
  }
}

module.exports = VsBridgeImporter
