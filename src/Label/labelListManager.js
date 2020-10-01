const axios = require('axios');

var labelList = [];

var getLabelList = async function() {
  console.log('Get label list');
  const getUrl = process.env.PACS_HOST + process.env.PACS_LABELLIST_LIST;
  await axios
    .get(getUrl)
    .then(function(response) {
      // handle success
      labelList = response.data.response.label_list;
    })
    .catch(function(error) {
      // handle error
    })
    .then(function() {
      return labelList;
    });
  return labelList;
};

var addLabelList = async function(params) {
  const postUrl = process.env.PACS_HOST + process.env.PACS_LABELLIST_ADD;
  await axios
    .post(postUrl)
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

var updateLabelList = async function(params) {
  const patchUrl = process.env.PACS_HOST + process.env.PACS_LABELLIST_UPDATE;
  await axios
    .patch(patchUrl)
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

var deleteLabelList = async function(params) {
  const deleteUrl = process.env.PACS_HOST + process.env.PACS_LABELLIST_DELETE;
  await axios
    .delete(deleteUrl)
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

const labelListManager = {
  getLabelList,
  addLabelList,
  updateLabelList,
  deleteLabelList,
};

export default labelListManager;
