* feature: allow user to set mappings-file-path, by writing it to file (same procedure as with index selection)
* refactor: use ES bulk api for putting documents
* refactor: create index should not add mappings, adding documents will need to check if mappings exist before after refactoring
* refactor: iterative version of document import method (not that crucial, upgrade to bulk api before)
* feature: add dump to file and import from file
* qol: add flow + babel + webpack + nodemon, only enable flow in eslint for master branch / production builds. update readme: user needs to build and exec path needs to be changed.
