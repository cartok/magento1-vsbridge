class GetDocumentsInterface {
  constructor () {
    if (!this.getDocuments) {
      throw new Error(`'${this.constructor.name}' needs to implement a 'getDocuments' method, that resolves a 'Promise' with an array of objects (documents).`)
    }
  }
}
module.exports = GetDocumentsInterface
