import React from 'react';
import { Component } from 'react';

import { getImageData, loadImageData } from '@vtk-viewport';
import { api as dicomwebClientApi } from 'dicomweb-client';
import CornerstoneViewport from 'react-cornerstone-viewport';
import cornerstone from 'cornerstone-core';
import cornerstoneTools from 'cornerstone-tools';
import './initCornerstone.js';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';

const url = process.env.DCM4CHEE_HOST + '/dcm4chee-arc/aets/DCM4CHEE/rs';
const url_dicom = process.env.DCM4CHEE_HOST + '/dcm4chee-arc/aets/DCM4CHEE/wado?requestType=WADO';
const urlPageString = window.location.href;
const formatUrl = new URL(urlPageString);
const studyUid = formatUrl.searchParams.get('studyUid');
const serieUid = formatUrl.searchParams.get('serieUid');

const studyInstanceUID = studyUid;
const ctSeriesInstanceUID = serieUid;
const searchInstanceOptions = {
  studyInstanceUID,
};

window.cornerstoneTools = cornerstoneTools;

const voi = {
  windowCenter: 35,
  windowWidth: 80,
};

function createActorMapper(imageData) {
  const mapper = vtkVolumeMapper.newInstance();
  mapper.setInputData(imageData);

  const actor = vtkVolume.newInstance();
  actor.setMapper(mapper);

  return {
    actor,
    mapper,
  };
}

function createStudyImageIds(baseUrl, studySearchOptions) {
  const SOP_INSTANCE_UID = '00080018';
  const SERIES_INSTANCE_UID = '0020000E';

  const client = new dicomwebClientApi.DICOMwebClient({ url });

  return new Promise((resolve, reject) => {
    client.retrieveStudyMetadata(studySearchOptions).then(instances => {
      const imageIds = instances.map(metaData => {
        const imageId =
          'wadouri:' +
          baseUrl +
          '&studyUID=' +
          studyInstanceUID +
          '&seriesUID=' +
          metaData[SERIES_INSTANCE_UID].Value[0] +
          '&objectUID=' +
          metaData[SOP_INSTANCE_UID].Value[0] +
          '&contentType=application/dicom';

        cornerstoneWADOImageLoader.wadors.metaDataManager.add(
          imageId,
          metaData
        );

        return imageId;
      });

      resolve(imageIds);
    }, reject);
  });
}

class DrawToolsExample extends Component {
  state = {
    volumes: null,
    vtkImageData: null,
    cornerstoneViewportData: null,
    activeTool: 'FreehandScissors',
  };

  async componentDidMount() {
    this.cornerstoneElements = {};

    const imageIds = await createStudyImageIds(url_dicom, searchInstanceOptions);
    const promises = imageIds.map(imageId => {
      return cornerstone.loadAndCacheImage(imageId);
    });

    Promise.all(promises).then((data) => {
      const displaySetInstanceUid = '';
      const cornerstoneViewportData = {
        stack: {
          imageIds,
          currentImageIdIndex: 0,
        },
        displaySetInstanceUid,
      };

      this.setState({
        // vtkImageData: imageDataObject.vtkImageData,
        // volumes: [actor],
        cornerstoneViewportData
      });

      // const imageDataObject = getImageData(imageIds, displaySetInstanceUid)
      // console.log("imageDataObject", imageDataObject);

      // loadImageData(imageDataObject);
      // Promise.all(imageDataObject.insertPixelDataPromises).then(() => {
      //   const { actor } = createActorMapper(imageDataObject.vtkImageData);

      //   const rgbTransferFunction = actor
      //     .getProperty()
      //     .getRGBTransferFunction(0);

      //   const low = voi.windowCenter - voi.windowWidth / 2;
      //   const high = voi.windowCenter + voi.windowWidth / 2;

      //   rgbTransferFunction.setMappingRange(low, high);

      //   this.setState({
      //     vtkImageData: imageDataObject.vtkImageData,
      //     volumes: [actor],
      //     cornerstoneViewportData,
      //   });
      // });
    });
  }

  saveCornerstoneElements = viewportIndex => {
    return event => {
      this.cornerstoneElements[viewportIndex] = event.detail.element;
    };
  };

  handleActiveTool = toolName => {
    this.setState({
      activeTool: toolName,
    });
  };

  render() {
    const styleButton = {
      marginRight: "5px"
    }
    return (
      <div className="col-xs-12 col-sm-6">
        <div className="toolbar" style={{ "marginBottom": "20px" }}>
          <button style={styleButton} type="button" className="btn btn-primary" onClick={() => this.handleActiveTool('Brush')}>Brush</button>
          <button style={styleButton} type="button" className="btn btn-warning" onClick={() => this.handleActiveTool('RectangleScissors')}>RectangleScissors</button>
          <button style={styleButton} type="button" className="btn btn-success" onClick={() => this.handleActiveTool('CircleScissors')}>CircleScissors</button>
          <button style={styleButton} type="button" className="btn btn-danger" onClick={() => this.handleActiveTool('FreehandScissors')}>FreehandScissors</button>
          <button style={styleButton} type="button" className="btn btn-warning" onClick={() => this.handleActiveTool('RectangleScissors')}>RectangleScissors</button>
          <button style={styleButton} type="button" className="btn btn-info" onClick={() => this.handleActiveTool('Wwwc')}>Wwwc</button>
          <button style={styleButton} type="button" className="btn btn-warning" onClick={() => this.handleActiveTool('Zoom')}>Zoom</button>
        </div>
        <div style={{ height: '512px' }}>
          {this.state.cornerstoneViewportData && (
            <CornerstoneViewport
              activeTool={this.state.activeTool}
              availableTools={[
                { name: 'RectangleScissors', mouseButtonMasks: [1] },
                { name: 'StackScrollMouseWheel', mouseButtonMasks: [1] },
                { name: 'StackScrollMultiTouch', mouseButtonMasks: [1] },
                { name: 'Brush', mouseButtonMasks: [1] },
                { name: 'CircleScissors', mouseButtonMasks: [1] },
                { name: 'FreehandScissors', mouseButtonMasks: [1] },
                { name: 'RectangleScissors', mouseButtonMasks: [1] },
                { name: 'Wwwc', mouseButtonMasks: [1] },
                { name: 'Zoom', mouseButtonMasks: [1] },
              ]}
              viewportData={this.state.cornerstoneViewportData}
              onElementEnabled={this.saveCornerstoneElements(0)}
            />
          )}
        </div>
      </div>
    );
  }
}

export default DrawToolsExample;
