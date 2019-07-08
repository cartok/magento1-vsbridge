const elasticClient = require('./clients/elasticClient')

async function importDocuments (params = { client: undefined, index: undefined, type: undefined, page: 0, pageSize: 25 }) {
  // assign default params and destructure
  const { client: endpointClient, index, type, page, pageSize } = Object.assign({
    client: undefined,
    index: undefined,
    type: undefined,
    page: 0,
    pageSize: 25
  }, params)

  // 'documents' is logged in catch, theirfore declared outside.
  let documents
  try {
    documents = await endpointClient.getDocuments({
      type,
      page,
      pageSize
    })
    console.log(`> document length: ${documents.length}, page: ${page}, pageSize: ${pageSize}.`)

    // stop recursion on an empty page (unlikely to happen, just for safety, depends on endpoint).
    if (documents.length === 0) {
      console.log('> No more pages found.')
      return
    }

    await elasticClient.insertDocuments({
      index,
      type,
      documents
    })
    console.log(`> Imported page ${page}.`)

    if (documents.length < pageSize) {
      console.log('> That was the last page.')
      return
    }

    // if endpoint does not support limiting the length of the response / pages just execute once.
    // @note: eeded this for vsbridge/attributes/index.
    if (documents.length > pageSize) {
      return
    }

    importDocuments({ client: endpointClient, index, type, page: page + 1, pageSize })
  } catch (error) {
    console.log(`> Number of documents from endpoint: ${documents.length}`)
    console.log(`> Current page: ${page}\n`)
    process.exit(-1)
  }
}

module.exports = {
  importDocuments
}
