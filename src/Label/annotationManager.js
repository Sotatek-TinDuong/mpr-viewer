const axios = require('axios');

var saveArrayMapFile = async function(params) {
  const postUrl = process.env.PACS_HOST + process.env.PACS_LABELLIST_LIST;
  await axios
    .post(postUrl, params)
    .then(function(response) {
      // handle success
    })
    .catch(function(error) {
      // handle error
    })
    .then(function() {
      // always executed
    });
};

const annotationManager = {
  saveArrayMapFile,
};

export default annotationManager;
