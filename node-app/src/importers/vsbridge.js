const BasicImporter = require('./basic')

class VSBridgeImporter extends BasicImporter {
  constructor (entityType, config, api) {
    if (!config.vsbridge[entityType + '_endpoint']) {
      console.error('No endpoint defined for ' + entityType)
      return
    }
    super(entityType, customImporter, config, api, db)
  }
}
