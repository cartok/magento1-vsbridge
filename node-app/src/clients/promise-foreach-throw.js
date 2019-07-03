
var throwInFirstStage = false
var throwInSecondStage = true
var rejectInFirstStageLoop = true
function f (i) {
  return new Promise((resolve, reject) => {
    // stage 1
    try {
      [1, 2, 3, 4, 5, 6]
        .filter(n => n % 2 === 0)
        .forEach(n => {
          try {
            console.log({ n })
            if (throwInFirstStage) {
              throw new Error(`Error from elastic. Could not delete alias on index '${n}'.`)
            }
            console.log('\n> Index alias deleted.')
          } catch (e) {
            if (rejectInFirstStageLoop) {
              reject(e)
            }
            throw e
          }
        })
    } catch (e) {
      if (!rejectInFirstStageLoop) {
        reject(e)
      }
      console.log('catched error cause the promise was rejected in the first block cause. will not execute 2nd stage. this error wont show if it does not get catched here')
      console.error(e)
      return
    }
    // stage 2
    try {
      if (throwInSecondStage) {
        throw new Error('Error from elastic. Could not create alias on index')
      }
      resolve()
    } catch (e) {
      console.log('will reject in second stage')
      console.error(e)
      reject(e)
      return
    }
    console.log('is this logged after error in 2nd stage try catched? should return when catching in 2nd stage')
  }).then(res => {
    console.log('resolved')
  }).catch(e => {
    console.log('catched later')
    console.error(e)
  })
}
f()
