Promise.all([
  fetch('https://demo.storefrontcloud.io/api/catalog/vue_storefront_catalog/product/_search?from=0&size=100').then(d => d.json()),
  fetch('http://prod.vuestorefront.io:8080/api/catalog/vue_storefront_catalog/product/_search?from=0&size=100').then(d => d.json()),
]).then(results => {
  results = results.map(result => result.hits)
  const demoShop = results[0]
  const devShop = results[1]
  window.demoShop = demoShop
  window.devShop = devShop
  console.log({demoShop})
  console.log({devShop})

  // print out which keys of the hits in demoShop.hits[x]._source str are not given in devShop.
  // i just took the first element each for first easy comparison.
  const demoShopFirstHit = demoShop.hits[0]._source
  const devShopFirstHit = devShop.hits[0]._source
  console.log({demoShopFirstHit})
  console.log({devShopFirstHit})
  const resultBool = Object.keys(demoShopFirstHit).every(key => {
    return devShopFirstHit.hasOwnProperty(key)
  })
  console.log({resultBool})
  console.log('data that both have ')
  console.log('---------------------------------------------------')
  let equalKeys = Object.keys(demoShopFirstHit).filter(key => {
    return devShopFirstHit.hasOwnProperty(key)
  })
  console.log({equalKeys})
  let equalEntrys = equalKeys.reduce((acc, key) => {
    acc[key] = demoShopFirstHit[key]
    return acc
  }, {})
  console.log({equalEntrys})

  console.log('data that demo has but dev not')
  console.log('---------------------------------------------------')
  let missingKeys = Object.keys(demoShopFirstHit).filter(key => {
    return !devShopFirstHit.hasOwnProperty(key)
  })
  console.log({missingKeys})
  let missingEntrys = missingKeys.reduce((acc, key) => {
    acc[key] = demoShopFirstHit[key]
    return acc
  }, {})
  console.log({missingEntrys})

  console.log('data that dev has but demo not')
  console.log('---------------------------------------------------')
  missingKeys = Object.keys(devShopFirstHit).filter(key => {
    return !demoShopFirstHit.hasOwnProperty(key)
  })
  console.log({missingKeys})
  missingEntrys = missingKeys.reduce((acc, key) => {
    acc[key] = devShopFirstHit[key]
    return acc
  }, {})
  console.log({missingEntrys})

  console.log('dev slug, url_path, url_key')
  console.log('---------------------------------------------------')
  const slugInDev = devShop.hits
    .map(hit => hit._source)
    .filter(entry => {
      const keys = ['slug', 'url_path', 'url_key']
      return Object.keys(entry).find(key => keys.includes(key))
    })
    .map(entry => ({
      slug: entry.slug,
      url_path: entry.url_path,
      url_key: entry.url_key,
    }))
  console.log({slugInDev})

  console.log('dev is_in_stock')
  console.log('---------------------------------------------------')
  const stockInDev = devShop.hits
    .map(hit => hit._source)
    .filter(entry => {
      return Object.keys(entry).find(key => key === 'is_in_stock')
    })
    .map(entry => ({
      'is_in_stock': entry['is_in_stock'],
      url_key: entry.url_key,
    }))
  console.log({stockInDev})
})

// ---------------------- is in stock test
fetch('http://prod.vuestorefront.io:8080/api/catalog/vue_storefront_catalog/product/_search?from=0&size=10000')
.then(d => d.json())
.then(result => {
  console.log('### is_in_stock')
  console.log('---------------------------------------------------')
  const stockInDev = result.hits.hits
    .map(hit => hit._source)
    .filter(entry => {
      return Object.keys(entry).find(key => key === 'is_in_stock')
    })
    .map(entry => ({
      'is_in_stock': entry['is_in_stock'],
      url_key: entry.url_key,
    }))
  console.log({stockInDev})
})

// ---------------------- media gallery test
fetch('http://prod.vuestorefront.io:8080/api/catalog/vue_storefront_catalog/product/_search?from=0&size=10000')
.then(d => d.json())
.then(result => {
  console.log('### media gallery')
  console.log('---------------------------------------------------')
  const mediaGalleryTest = result.hits.hits
    .map(hit => hit._source)
    .filter(entry => {
      return Object.keys(entry).find(key => key === 'media_gallery')
    })
    .map(entry => ({
      media_gallery: entry.media_gallery,
      url_key: entry.url_key,
    }))
  console.log({mediaGalleryTest})
})
