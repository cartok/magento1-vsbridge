async function execPromiseReturningFunctionsSequential (promises) {
  for (let promise of promises) {
    try {
      await promise()
    } catch (error) {
      // @todo: add msg
      throw error
    }
  }
}

async function execPromiseReturningFunctionsParallel (promises) {
  return new Promise(async (resolve, reject) => {
    let triggeredPromises
    try {
      triggeredPromises = promises.map(p => p())
      await Promise.all(triggeredPromises)
      resolve(triggeredPromises)
    } catch (error) {
      console.log('\n> Some of the concurrent promises failed.')
      reject(error)
    }
  })
}

module.exports = {
  execPromiseReturningFunctionsSequential,
  execPromiseReturningFunctionsParallel
}
