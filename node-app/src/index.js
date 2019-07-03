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

process.on('unhandledRejection', (error, promise) => {
  console.error('\n> nodejs-event: Unhandled Promise Rejection!\n')
  console.log(error)
  console.log('\n')
  console.log(promise)
  console.log('\n')
})
process.on('\n>uncaughtException', error => {
  console.error('\n> nodejs-event: Uncaught Exception!\n')
  console.log('\n')
  console.log(error)
  console.log('\n')
})
process.on('SIGINT', () => process.exit(-1))
process.on('SIGTERM', () => process.exit(-1))

// execute cli
require('./cli')
