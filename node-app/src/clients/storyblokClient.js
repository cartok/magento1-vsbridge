const StoryblokClient = require('storyblok-js-client')
const config = require('../../config/config.json')

module.exports = new StoryblokClient({
  accessToken: config.storyblok.accessTokenPublished,
  caches: {
    clear: 'auto',
    type: 'memory'
  }
})
