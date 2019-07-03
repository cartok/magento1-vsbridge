// https://www.storyblok.com/docs/api/content-delivery
const StoryblokClient = require('storyblok-js-client')
const GetDocumentsInterface = require('./GetDocumentsInterface')
const config = require('../../config/config.json')

class AugmentedStoryblokClient extends GetDocumentsInterface {
  constructor () {
    super()
    this.client = new StoryblokClient({
      accessToken: config.storyblok.accessTokenPublished,
      caches: {
        clear: 'auto',
        type: 'memory'
      }
    })
  }
  // required interface method
  async getDocuments (query) {
    const { page, pageSize } = query
    try {
      const storyblokResponse = await this.client.get('cdn/stories', {
        version: 'published',
        starts_with: `${config.country.toLowerCase()}/`,
        // @notice: this query is just for test purposes, should be unnecessary.
        // filter_query: {
        //   component: {
        //     in: 'page,article'
        //   }
        // },
        page,
        per_page: pageSize
      })

      // @notice: despite that the documentation says that you will receive an empty array (no 404) if no stories are found,
      // storyblock acutally returns:
      // {
      //   "stories": [
      //     "This record could not be found"
      //   ]
      // }
      // https://www.storyblok.com/docs/api/content-delivery#core-resources/stories/retrieve-multiple-stories
      if (storyblokResponse.stories && typeof storyblokResponse.stories[0] === 'string') {
        console.log('> Response from Storyblok:')
        console.log(storyblokResponse)
        throw new Error(`Error from storyblok. Could not get stories.`)
      }
      return storyblokResponse.data.stories
    } catch (error) {
      throw error
    }
  }
}

module.exports = new AugmentedStoryblokClient()
