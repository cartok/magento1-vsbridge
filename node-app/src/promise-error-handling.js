var p = new Promise(async (resolve, reject) => {
  try {
    // throw new Error('foo')
    const res = await fetch('fooisthenewbar')
    if(!res.ok){
      throw new Error()
    }
    console.log({res})
  } catch(e){
    console.log('catch')
    reject(e)
  }
})
