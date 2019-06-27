const VsBridgeClient = require('../lib/vsbridge')
const config = require('../../../config/config.json')

module.exports = new VsBridgeClient(config)
