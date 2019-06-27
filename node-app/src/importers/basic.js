module.exports = class {
  constructor (entityType, config, api) {
    this.config = config
    this.api = api
    this.single = this.single.bind(this)
  }

  /**
   *
   * @param {*} object
   * @returns Promise
   */
  single (object) {
    return new Promise((resolve, reject) => {
      resolve([object]) // no additional processing
    })
  }
}
