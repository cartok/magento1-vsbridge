const StoryblokClient = require('storyblok-js-client')
const config = require('../../config/config.json')

console.log(`Will auth to storyblok with token: ${config.storyblok.accessTokenPublished}`)

module.exports = new StoryblokClient({
  accessToken: config.storyblok.accessTokenPublished,
  caches: {
    clear: 'auto',
    type: 'memory'
  }
})
