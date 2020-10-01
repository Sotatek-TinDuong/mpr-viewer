const axios = require('axios');

var labelList = [];

var getLabelList = async function() {
  console.log('Get label list');
  const getUrl = process.env.PACS_HOST + '/api/v1/labeling';
  await axios
    .get(getUrl)
    .then(function(response) {
      // handle success
      console.log(response);
    })
    .catch(function(error) {
      // handle error
      console.log(error);
    })
    .then(function() {
      return labelList;
    });
};

var addLabelList = async function(params) {
  console.log('Add label list');

  const postUrl = process.env.PACS_HOST + '/api/v1/labeling/save';
  await axios
    .post(postUrl)
    .then(function(response) {
      // handle success
      console.log(response);
    })
    .catch(function(error) {
      // handle error
      console.log(error);
    })
    .then(function() {
      // always executed
    });
};

var updateLabelList = async function(params) {
  console.log('Update label list');

  const patchUrl = process.env.PACS_HOST;
  await axios
    .patch(patchUrl)
    .then(function(response) {
      // handle success
      console.log(response);
    })
    .catch(function(error) {
      // handle error
      console.log(error);
    })
    .then(function() {
      // always executed
    });
};

var deleteLabelList = async function(params) {
  console.log('Delete label list');

  const deleteUrl = process.env.PACS_HOST + '/api/v1/labeling';
  await axios
    .delete(deleteUrl)
    .then(function(response) {
      // handle success
      console.log(response);
    })
    .catch(function(error) {
      // handle error
      console.log(error);
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
