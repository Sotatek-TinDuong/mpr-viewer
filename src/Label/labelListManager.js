const axios = require('axios');

var labelList = [];

var getLabelList = async function() {
  const getUrl = process.env.PACS_HOST + process.env.PACS_LABELLIST_LIST;
  await axios
    .get(getUrl, { params: { type: 'nifti' } })
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

var createOrUpdateLabelList = async function(params) {
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

var deleteLabelList = async function(params) {
  const deleteUrl =
    process.env.PACS_HOST + process.env.PACS_LABELLIST_LIST + '/' + params.id;
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
  createOrUpdateLabelList,
  deleteLabelList,
};

export default labelListManager;
