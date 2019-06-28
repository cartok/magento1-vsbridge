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

process.on('unhandledRejection', (reason, promise) => {
  const { message, status } = promise
  console.error('Unhandled Rejection:')
  console.error(`${message}, status: ${status}, reason: ${reason}.`)
  console.dir(promise)
})
process.on('uncaughtException', function (exception) {
  console.error('Uncaught Exception:', exception)
  console.dir(exception)
})
process.on('SIGINT', () => process.exit(-1))
process.on('SIGTERM', () => process.exit(-1))

// execute cli
require('./cli')
