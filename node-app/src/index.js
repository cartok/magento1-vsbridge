// merge custom in default config
const defaultConfig = require('../config/default.json')
const customConfig = require('../config/custom.json')
const path = require('path')
const jsonFile = require('jsonfile')
const objectAssignDeep = require('@cartok/object-assign-deep')

jsonFile.writeFileSync(
  path.join(__dirname, '../config/config.json'),
  objectAssignDeep(defaultConfig, customConfig)
)

// execute cli
require('./cli')
