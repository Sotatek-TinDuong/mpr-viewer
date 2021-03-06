import React from 'react';
import { Component } from 'react';
import $ from 'jquery';

import {
  View2D,
  View3D,
  getImageData,
  loadImageData,
  vtkInteractorStyleMPRCrosshairs,
  vtkSVGCrosshairsWidget,
  vtkInteractorStyleMPRRotate,
} from '@vtk-viewport';
import { api as dicomwebClientApi } from 'dicomweb-client';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import presets from './presets.js';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
// cornerstone
import CornerstoneViewport from 'react-cornerstone-viewport';
import cornerstone from 'cornerstone-core';
import cornerstoneTools from 'cornerstone-tools';
import './initCornerstone.js';

const { getters, setters, configuration, state } = cornerstoneTools.getModule(
  'segmentation'
);
window.cornerstoneTools = cornerstoneTools;
window.cornerstoneWADOImageLoader = cornerstoneWADOImageLoader;

const url = process.env.DCM4CHEE_HOST + '/dcm4chee-arc/aets/DCM4CHEE/rs';
const url_dicom =
  process.env.DCM4CHEE_HOST +
  '/dcm4chee-arc/aets/DCM4CHEE/wado?requestType=WADO';
const urlPageString = window.location.href;
const formatUrl = new URL(urlPageString);
const studyUid = formatUrl.searchParams.get('studyUid');
const serieUid = formatUrl.searchParams.get('serieUid');
const typeDicom = formatUrl.searchParams.get('type');

const studyInstanceUID = studyUid;
const ctSeriesInstanceUID = serieUid;
const searchInstanceOptions = {
  studyInstanceUID,
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

function getShiftRange(colorTransferArray) {
  // Credit to paraview-glance
  // https://github.com/Kitware/paraview-glance/blob/3fec8eeff31e9c19ad5b6bff8e7159bd745e2ba9/src/components/controls/ColorBy/script.js#L133

  // shift range is original rgb/opacity range centered around 0
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < colorTransferArray.length; i += 4) {
    min = Math.min(min, colorTransferArray[i]);
    max = Math.max(max, colorTransferArray[i]);
  }

  const center = (max - min) / 2;

  return {
    shiftRange: [-center, center],
    min,
    max,
  };
}

function applyPointsToPiecewiseFunction(points, range, pwf) {
  const width = range[1] - range[0];
  const rescaled = points.map(([x, y]) => [x * width + range[0], y]);

  pwf.removeAllPoints();
  rescaled.forEach(([x, y]) => pwf.addPoint(x, y));

  return rescaled;
}

function applyPointsToRGBFunction(points, range, cfun) {
  const width = range[1] - range[0];
  const rescaled = points.map(([x, r, g, b]) => [
    x * width + range[0],
    r,
    g,
    b,
  ]);

  cfun.removeAllPoints();
  rescaled.forEach(([x, r, g, b]) => cfun.addRGBPoint(x, r, g, b));

  return rescaled;
}

function applyPreset(actor, preset) {
  // Create color transfer function
  const colorTransferArray = preset.colorTransfer
    .split(' ')
    .splice(1)
    .map(parseFloat);

  const { shiftRange } = getShiftRange(colorTransferArray);
  let min = shiftRange[0];
  const width = shiftRange[1] - shiftRange[0];
  const cfun = vtkColorTransferFunction.newInstance();
  const normColorTransferValuePoints = [];
  for (let i = 0; i < colorTransferArray.length; i += 4) {
    let value = colorTransferArray[i];
    const r = colorTransferArray[i + 1];
    const g = colorTransferArray[i + 2];
    const b = colorTransferArray[i + 3];

    value = (value - min) / width;
    normColorTransferValuePoints.push([value, r, g, b]);
  }

  applyPointsToRGBFunction(normColorTransferValuePoints, shiftRange, cfun);

  actor.getProperty().setRGBTransferFunction(0, cfun);

  // Create scalar opacity function
  const scalarOpacityArray = preset.scalarOpacity
    .split(' ')
    .splice(1)
    .map(parseFloat);

  const ofun = vtkPiecewiseFunction.newInstance();
  const normPoints = [];
  for (let i = 0; i < scalarOpacityArray.length; i += 2) {
    let value = scalarOpacityArray[i];
    const opacity = scalarOpacityArray[i + 1];

    value = (value - min) / width;

    normPoints.push([value, opacity]);
  }

  applyPointsToPiecewiseFunction(normPoints, shiftRange, ofun);

  actor.getProperty().setScalarOpacity(0, ofun);

  const [
    gradientMinValue,
    gradientMinOpacity,
    gradientMaxValue,
    gradientMaxOpacity,
  ] = preset.gradientOpacity
    .split(' ')
    .splice(1)
    .map(parseFloat);

  actor.getProperty().setUseGradientOpacity(0, true);
  actor.getProperty().setGradientOpacityMinimumValue(0, gradientMinValue);
  actor.getProperty().setGradientOpacityMinimumOpacity(0, gradientMinOpacity);
  actor.getProperty().setGradientOpacityMaximumValue(0, gradientMaxValue);
  actor.getProperty().setGradientOpacityMaximumOpacity(0, gradientMaxOpacity);

  if (preset.interpolation === '1') {
    actor.getProperty().setInterpolationTypeToFastLinear();
    //actor.getProperty().setInterpolationTypeToLinear()
  }

  const ambient = parseFloat(preset.ambient);
  //const shade = preset.shade === '1'
  const diffuse = parseFloat(preset.diffuse);
  const specular = parseFloat(preset.specular);
  const specularPower = parseFloat(preset.specularPower);

  //actor.getProperty().setShade(shade)
  actor.getProperty().setAmbient(ambient);
  actor.getProperty().setDiffuse(diffuse);
  actor.getProperty().setSpecular(specular);
  actor.getProperty().setSpecularPower(specularPower);
}

function createCT3dPipeline(imageData, ctTransferFunctionPresetId) {
  const { actor, mapper } = createActorMapper(imageData);

  const sampleDistance =
    1.2 *
    Math.sqrt(
      imageData
        .getSpacing()
        .map(v => v * v)
        .reduce((a, b) => a + b, 0)
    );

  const range = imageData
    .getPointData()
    .getScalars()
    .getRange();
  actor
    .getProperty()
    .getRGBTransferFunction(0)
    .setRange(range[0], range[1]);

  mapper.setSampleDistance(sampleDistance);

  const preset = presets.find(
    preset => preset.id === ctTransferFunctionPresetId
  );

  applyPreset(actor, preset);

  actor.getProperty().setScalarOpacityUnitDistance(0, 2.5);

  return actor;
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

function createLabelMapImageData(backgroundImageData) {
  const labelMapData = vtkImageData.newInstance(
    backgroundImageData.get('spacing', 'origin', 'direction')
  );
  labelMapData.setDimensions(backgroundImageData.getDimensions());
  labelMapData.computeTransforms();

  const values = new Float32Array(backgroundImageData.getNumberOfPoints());
  const dataArray = vtkDataArray.newInstance({
    numberOfComponents: 1, // labelmap with single component
    values,
  });
  labelMapData.getPointData().setScalars(dataArray);

  return labelMapData;
}

function createVolumeRenderingActor(imageData) {
  const mapper = vtkVolumeMapper.newInstance();
  mapper.setInputData(imageData);

  const actor = vtkVolume.newInstance();
  actor.setMapper(mapper);

  const rgbTransferFunction = actor.getProperty().getRGBTransferFunction(0);
  const range = imageData
    .getPointData()
    .getScalars()
    .getRange();
  rgbTransferFunction.setMappingRange(range[0], range[1]);

  // create color and opacity transfer functions
  const cfun = vtkColorTransferFunction.newInstance();
  cfun.addRGBPoint(range[0], 0.4, 0.2, 0.0);
  cfun.addRGBPoint(range[1], 1.0, 1.0, 1.0);

  const ofun = vtkPiecewiseFunction.newInstance();
  ofun.addPoint(0.0, 0.0);
  ofun.addPoint(1000.0, 0.3);
  ofun.addPoint(6000.0, 0.9);

  actor.getProperty().setRGBTransferFunction(0, cfun);
  actor.getProperty().setScalarOpacity(0, ofun);
  actor.getProperty().setScalarOpacityUnitDistance(0, 4.5);
  actor.getProperty().setInterpolationTypeToLinear();
  actor.getProperty().setUseGradientOpacity(0, true);
  actor.getProperty().setGradientOpacityMinimumValue(0, 15);
  actor.getProperty().setGradientOpacityMinimumOpacity(0, 0.0);
  actor.getProperty().setGradientOpacityMaximumValue(0, 100);
  actor.getProperty().setGradientOpacityMaximumOpacity(0, 1.0);
  actor.getProperty().setAmbient(0.7);
  actor.getProperty().setDiffuse(0.7);
  actor.getProperty().setSpecular(0.3);
  actor.getProperty().setSpecularPower(8.0);

  return actor;
}

class VTKCrosshairsExample extends Component {
  constructor(props) {
    super(props);
    this.state = {
      volumes: [],
      displayCrosshairs: true,
      volumeRenderingVolumes: null,
      ctTransferFunctionPresetId: 'vtkMRMLVolumePropertyNode4',
      focusedWidgetId: 'PaintWidget',
      paintFilterBackgroundImageData: null,
      paintFilterLabelMapImageData: null,
      threshold: 10,
      sengments: [
        { name: 'segment 1', editing: false },
        { name: 'segment 2', editing: false },
        { name: 'segment 3', editing: false },
        { name: 'segment 4', editing: false },
        { name: 'segment 5', editing: false },
      ],
      cornerstoneViewportData: null,
      activeTool: 'FreehandScissors',
      typeDicom: typeDicom,
      pxData: [],
    };
    this.link = React.createRef();
  }

  async componentDidMount() {
    this.apis = [];
    this.apisVolum3D = [];
    this.apiBrush = [];
    this.cornerstoneElements = {};

    const imageIds = await createStudyImageIds(
      url_dicom,
      searchInstanceOptions
    );

    let ctImageIds = imageIds.filter(imageId =>
      imageId.includes(ctSeriesInstanceUID)
    );

    const promises = imageIds.map(imageId => {
      return cornerstone.loadAndCacheImage(imageId);
    });

    Promise.all(promises).then(data => {
      const displaySetInstanceUid = '';
      const cornerstoneViewportData = {
        stack: {
          imageIds,
          currentImageIdIndex: 0,
        },
        displaySetInstanceUid,
      };

      this.setState({
        cornerstoneViewportData,
      });
    });

    if (typeDicom != 'xray') {
      const ctImageDataObject = this.loadDataset(ctImageIds, 'ctDisplaySet');
      const ctImageData = ctImageDataObject.vtkImageData;
      const ctVolVR = createCT3dPipeline(
        ctImageData,
        this.state.ctTransferFunctionPresetId
      );
      this.setState({
        volumeRenderingVolumes: [ctVolVR],
        percentComplete: 0,
      });

      Promise.all(ctImageDataObject.insertPixelDataPromises).then(() => {
        const ctImageData = ctImageDataObject.vtkImageData;

        const range = ctImageData
          .getPointData()
          .getScalars()
          .getRange();

        const ctVol = vtkVolume.newInstance();
        const mapper = vtkVolumeMapper.newInstance();

        ctVol.setMapper(mapper);
        mapper.setInputData(ctImageData);

        const rgbTransferFunction = ctVol
          .getProperty()
          .getRGBTransferFunction(0);
        rgbTransferFunction.setMappingRange(500, 3000);
        rgbTransferFunction.setRange(range[0], range[1]);
        mapper.setMaximumSamplesPerRay(2000);
        const labelMapImageData = createLabelMapImageData(ctImageData);
        const volumeRenderingActor = createVolumeRenderingActor(ctImageData);

        this.setState({
          volumes: [ctVol],
          volumeRenderingVolumes: [volumeRenderingActor],
          paintFilterBackgroundImageData: ctImageData,
          paintFilterLabelMapImageData: labelMapImageData,
        });
      });
    }
  }

  saveApiReference = api => {
    this.apisVolum3D = [api];
  };

  handleChangeCTTransferFunction = event => {
    const ctTransferFunctionPresetId = event.target.value;
    const preset = presets.find(
      preset => preset.id === ctTransferFunctionPresetId
    );

    const actor = this.state.volumeRenderingVolumes[0];

    applyPreset(actor, preset);

    this.rerenderAll();

    this.setState({
      ctTransferFunctionPresetId,
    });
  };

  rerenderAll = () => {
    Object.keys(this.apisVolum3D).forEach(viewportIndex => {
      const renderWindow = this.apisVolum3D[
        viewportIndex
      ].genericRenderWindow.getRenderWindow();

      renderWindow.render();
    });
  };

  storeApi = viewportIndex => {
    return api => {
      this.apis[viewportIndex] = api;

      const apis = this.apis;
      const renderWindow = api.genericRenderWindow.getRenderWindow();

      // Add svg widget
      api.addSVGWidget(
        vtkSVGCrosshairsWidget.newInstance(),
        'crosshairsWidget'
      );

      const istyle = vtkInteractorStyleMPRCrosshairs.newInstance();

      // add istyle
      api.setInteractorStyle({
        istyle,
        configuration: { apis, apiIndex: viewportIndex },
      });

      // set blend mode to MIP.
      const mapper = api.volumes[0].getMapper();
      if (mapper.setBlendModeToMaximumIntensity) {
        mapper.setBlendModeToMaximumIntensity();
      }

      api.setSlabThickness(0.1);

      renderWindow.render();

      // Its up to the layout manager of an app to know how many viewports are being created.
      if (apis[0] && apis[1] && apis[2]) {
        //const api = apis[0];

        const api = apis[0];

        api.svgWidgets.crosshairsWidget.resetCrosshairs(apis, 0);
      }
    };
  };

  saveCornerstoneElements = viewportIndex => {
    return event => {
      this.cornerstoneElements[viewportIndex] = event.detail.element;
    };
  };

  handleSlabThicknessChange(evt) {
    const value = evt.target.value;
    const valueInMM = value / 10;
    const apis = this.apis;

    apis.forEach(api => {
      const renderWindow = api.genericRenderWindow.getRenderWindow();

      api.setSlabThickness(valueInMM);
      renderWindow.render();
    });
  }

  toggleCrosshairs = () => {
    const { displayCrosshairs } = this.state;
    const apis = this.apis;

    const shouldDisplayCrosshairs = !displayCrosshairs;

    apis.forEach(api => {
      const { svgWidgetManager, svgWidgets } = api;
      svgWidgets.crosshairsWidget.setDisplay(shouldDisplayCrosshairs);

      svgWidgetManager.render();
    });

    this.setState({ displayCrosshairs: shouldDisplayCrosshairs });
  };

  loadDataset(imageIds, displaySetInstanceUid) {
    const imageDataObject = getImageData(imageIds, displaySetInstanceUid);

    loadImageData(imageDataObject);

    const { insertPixelDataPromises } = imageDataObject;

    const numberOfFrames = insertPixelDataPromises.length;

    // TODO -> Maybe the component itself should do this.
    insertPixelDataPromises.forEach(promise => {
      promise.then(numberProcessed => {
        const percentComplete = Math.floor(
          (numberProcessed * 100) / numberOfFrames
        );

        if (this.state.percentComplete !== percentComplete) {
          this.setState({ percentComplete });
        }

        if (percentComplete % 20 === 0) {
          this.rerenderAll();
        }
      });
    });

    Promise.all(insertPixelDataPromises).then(() => {
      this.rerenderAll();
    });

    return imageDataObject;
  }

  handleActiveToolCnst = toolName => {
    if (toolName && toolName === 'segmentation') {
      this.setState({
        typeDicom: 'xray',
      });
    } else {
      this.setState({
        typeDicom: undefined,
      });
    }
  };

  // start func canh
  handleClick = () => {
    this.setState({ count: this.state.count + 2 });
  };
  addSegment = () => {
    var index = this.state.sengments.length + 1;
    var newName = 'segment ' + index;
    this.state.sengments.push({ name: newName, editing: false });
    this.setState({ sengments: this.state.sengments });
  };
  removeSegment = idx => {
    this.state.sengments.splice(idx, 1);
    this.setState({ sengments: this.state.sengments });
  };
  editSegmentName = (labelname, idx) => {
    labelname.editing = true;
    this.setState({ sengments: this.state.sengments });
    setTimeout(() => {
      $(input).focus();
    }, 500);
  };
  handleBlur = (item, event) => {
    item.editing = false;
    item.name = event.target.value;
    this.setState({ sengments: this.state.sengments });
  };
  //end func canh

  getSegmentation = () => {
    const element = this.cornerstoneElements[0];

    const get2d = getters.labelmap2D(element);
    const get3d = getters.labelmap3D(element);
    const get3ds = getters.labelmaps3D(element);

    const obj = {
      getters: getters,
      setters: setters,
      get2d: get2d,
      get3d: get3d,
      get3ds: get3ds,
    };

    console.log('params', obj);

    const arr = new Uint8Array(obj.get3d.buffer).toString();
    const buffer = new Uint8Array(arr.split(',')).buffer;

    // console.log(arr);
    // console.log(buffer);

    var newFile = new File([arr], 'buffer.txt', { type: 'text/plain' });

    // const blob = new Blob([arr], {
    //   type: 'text/plain',
    // });

    // const objectURL = URL.createObjectURL(blob);
    // node.href = objectURL;
    // node.href = URL.createObjectURL(blob);
    // node.download = 'buffer.txt';
    // node.click();
    this.download('buffer.txt', arr);
  };

  download = (filename, text) => {
    const node = this.link;
    var element = document.createElement('a');
    element.setAttribute(
      'href',
      'data:text/plain;charset=utf-8,' + encodeURIComponent(text)
    );
    element.setAttribute('download', filename);

    element.style.display = 'none';
    $('#link').append(element);

    element.click();
  };

  setSegmentation = () => {
    const element = this.cornerstoneElements[0];
    setters.undo(element, 0);
    setters.labelmap3DForElement(element, this.state.pxData, 0);
    console.log('set');
  };

  onChange = event => {
    const element = this.cornerstoneElements[0];
    const file = event.target.files[0];
    var reader = new FileReader();
    reader.onload = function () {
      var text = reader.result;
      const buffer = new Uint8Array(text.split(',')).buffer;
      setters.labelmap3DForElement(element, buffer, 0);
      cornerstone.updateImage(element);
    };
    reader.readAsText(file);
  };

  render() {
    const { typeDicom } = this.state;
    const className =
      typeDicom && typeDicom === 'xray' ? 'segmode' : 'crossmode';

    const style = typeDicom
      ? { width: '100%', height: '100%' }
      : { width: '50%', height: '50%' };

    const loading = (
      <div className="loading-box">
        <div className="box-inside">
          <img src="images/loading.gif" alt="" />
          <h4>Loading...</h4>
        </div>
      </div>
    );

    // if (
    //   typeDicom != 'xray' &&
    //   (!this.state.volumes ||
    //     !this.state.volumes.length ||
    //     !this.state.volumeRenderingVolumes)
    // ) {
    //   return loading;
    // }

    return (
      <div>
        <div className="main-mpr">
          <div className="left-panel-tool">
            <div className="logo">
              <img src="../images/worklist/deeplabel_logo.png" alt="" />
              <span>2D</span>
            </div>
            <div className="bar-menu f-left">
              <div className="label-title title" />Project</div>
            <a target="_blank" href="http://www.deepphi.ai" className="link-item" title="DEEP:PHI">
              <img src="../images/new-icon/deep_phi.svg" alt="deep_phi" />
            </a>
            <a target="_blank" href="http://www.deepstoreai.ai" className="link-item" title="DEEP:STORE">
              <img src="../images/new-icon/dee-_store.svg" alt="deep_store" />
            </a>
          </div>

          <div className="label-panel f-left">
            <div id="labelListContent">
              <div className="label-title title">Label</div>
              <div className="box-title">
                <img src="../images/new-icon/lbl-list.png" alt="Label list" />
                <span>Label list</span>
                <span>Labellist</span>
              </div>
              <div className="box-content">
                <div className="label-list-head">
                  <button className="create-label"><img src="../images/new-icon/add-btn-3d.svg" alt="" /> &nbsp Add</button>
                  <div className="label-type">
                    <span>Type: </span>
                    {/* <select ng-model="labelTypeSelect" ng-change="changeLabelType(labelTypeSelect)">
                        <option ng-repeat="type in labelTypeList" value="{{ type }}">{{ type }}</option>
                      </select> */}
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="label-list-table">
                    <thead>
                      <tr>
                        <th>No</th>
                        <th>Name</th>
                        <th>Color</th>
                        <th>Type</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr ng-repeat="label in labelListCreate" ng-click="labelClick($index, label)" ng-className="{ 'select': labelIndex === $index }">
                        <td>asdadsds</td>
                        <td>
                          <span className="label-name" ng-hide="label.name.editing" ng-dblclick="editingLabelName(label.name, $index)" title="{{ label.name.text }}">asdadsadasd</span>
                          <input
                            className="input-label-name"
                            ng-show="label.name.editing"
                            ng-model="label.name.text"
                            ng-blur="editedLabelName(label, $event)"
                            ng-keydown="enterkeypress(label.name, $event)"
                          />
                        </td>
                        <td>
                          <input
                            color-picker
                            color-picker-model="label.color"
                            color-picker-position="bottom"
                            color-picker-output-format="'hex'"
                            ng-model="labelColor.color"
                            ng-value="labelColor.color = label.color"
                            ng-style="{background: label.color}"
                            className="input-color-picker" />
                        </td>
                        <td>label type</td>
                        <td className="last"><button title="Remove label" className="remove-label" ng-click="removeLabelName('label_list', $index, label)"><i className="fa fa-times"></i></button></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            {/* <!-- end label list --> */}
            <div id="annotationListContent">
              <div className="box-title">
                <img src="../images/new-icon/annotation_list.svg" alt="Label list" style="width: 16px" />
                <span>Annotation List</span>
                <span ng-show="annotationList.length">annotationList</span>
              </div>
              <div className="box-content">
                <div className="button-list">
                  <button className="w-50" style="position:relative" ng-disabled="!dataSetSelect">
                    <img src="../images/new-icon/open-file-bbox.svg" alt="" />
                    <input id="inputFileLabel" type="file" accept="text/xml" onchange="angular.element(this).scope().annotationLoad(event)" ng-disabled="!dataSetSelect" />
                      &nbsp Import
                    </button>
                  <div style="position: relative;width: 50%;" click-outside="closeThis()">
                    {/* <!-- <button style="width: 100%;" ng-click="toggleChangeClass()" ng-disabled="!annotationList.length || !annotationSelected">Change</button> --> */}
                    <div id="subClassList" ng-show="isShowChangeClass">
                      <div className="box-title">
                        <div>
                          <img src="../images/new-icon/lbl-list.png" alt="Label list" style="width: 12px" />
                          <span>Change class</span>
                        </div>
                        <div>
                          <div className="upload-json">
                            <img src="../images/new-icon/open-file-bbox.svg" alt="" />
                            <input type="file" id="sub-classes" name="sub-classes" accept="application/json" onchange="angular.element(this).scope().subClassLoad(event)" />
                          </div>
                          <button className="btn-change-class" disabled ng-click="changeAnnotationClass()"><img style="width: 19px" src="../images/new-icon/change-icon.png" alt="" /></button>
                        </div>
                      </div>
                      <div className="wrap">
                        <div className="sub-class-title"></div>
                        <div className="sub-class-item"></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="table-wrap-anno">
                  <table className="label-list-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Name</th>
                        <th>Color</th>
                        <th>Type</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr ng-repeat="annotation in annotationList" ng-click="annotationClick(annotation, $index)" ng-className="{ 'select': annotationIndex === $index }">
                        <td>
                          <button ng-click="toggleVisibleAnnotation($event, $index)">
                            <img ng-show="!annotation.isVisible" src="../images/new-icon/eye-btn-disable.png" alt="" />
                            <img ng-show="annotation.isVisible" src="../images/new-icon/eye-btn-active.png" alt="" />
                          </button>
                        </td>
                        <td className="text-left">
                          <span className="label-name" title="{{ annotation.label }}">labelName</span>
                        </td>
                        <td><input ng-style="{background: annotation.color}" className="input-color-picker" readonly /></td>
                        <td>annotation type</td>
                        <td className="last"><button className="remove-label" ng-click="removeLabelName('annotation_list', $index, annotation)"><i className="fa fa-times"></i></button></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            {/* <!-- end annotation list --> */}
          </div>

          <div className="display-panel f-left">
            <div className="display-title title">Display</div>
            <div className="display-panel-tool" id="label2d-panel">
              <div className="item" ng-click="activeTool('draw_bbox')">
                <button className="viewBtn btn btn-light" title="Draw Bbox">
                  <img src="/images/new-icon/rectangle-d.png" />
                </button>
              </div>
              <div className="item" ng-click="activeTool('pan')">
                <button className="btnPan viewBtn btn btn-light">
                  <img src="/images/new-icon/pan.png" />
                </button>
              </div>
              <div className="item" ng-click="activeTool('zoom')">
                <button className="btnZoom viewBtn btn btn-light">
                  <img src="/images/new-icon/zoom.png" />
                </button>
              </div>
              <div className="item" ng-click="activeTool('magnify')">
                <button className="btnMagnify viewBtn btn btn-light">
                  <img src="/images/new-icon/magnification.png" />
                </button>
              </div>
              <div className="item" ng-click="activeTool('reset_keep_color')">
                <button className="btnFit viewBtn btn btn-light">
                  <img src="/images/new-icon/fit.png" />
                </button>
              </div>
              <div className="item">
                <button className="btnWL viewBtn btn btn-light" ng-click="activeTool('wl')">
                  <img src="/images/new-icon/windowing.png" />
                </button>
              </div>
              <div className="item" ng-click="activeTool('wl_preset')">
                {/* <!--WL Preset--> */}
                <div id="wlDropdownMenu" className="dropdownMemu">
                  <button id="wlPresetBtn" className="viewBtn iconBtnHeader btn btn-light">
                    <img src="/images/new-icon/preset.png" />
                    <span className="dropiconTopBtn">
                      <img src="/images/viewer/svg/ic-dropmenu.svg" />
                    </span>
                  </button>
                  <ul className="ddownEdit" id="wwwlPrestUl"></ul>
                </div>
              </div>
              <div className="item" ng-click="activeTool('invert')">
                <button id="btnInvert" className="btnInvert viewBtn btn btn-light" onClick="twoDapp.invertImageCommand()" data-toggle="tooltip"
                  data-placement="top" title="">
                  <img src="../images/new-icon/invert.png" />
                </button>
              </div>
              <div className="item" ng-click="activeTool('ccr_rotate')">
                <button id="imageCCWRotateBtn_nor" onClick="twoDapp.rotate2DImage(-90)" data-toggle="tooltip"
                  data-placement="top" title="" className="viewBtn btn btn-light">
                  <img src="../images/new-icon/rotation-copy.png" />
                </button>
              </div>
              <div className="item" ng-click="activeTool('cwr_rotate')">
                <button id="imageCWRotateBtn_nor" onClick="twoDapp.rotate2DImage(90)" data-toggle="tooltip" data-placement="top"
                  title="" className="viewBtn btn btn-light">
                  <img src="../images/new-icon/rotation.png" />
                </button>
              </div>
              <div className="item" ng-click="activeTool('draw_bbox')">
                <button className="viewBtn btn btn-light">
                  <img src="/images/new-icon/reset.png" />
                </button>
              </div>
              <div className="item" ng-click="activeTool('v_flip')">
                <button onClick="twoDapp.mirrorImageCommand(false)" data-toggle="tooltip" data-placement="top" title=""
                  className="viewBtn flipVertical btn btn-light" id="flipVertical">
                  <img src="../images/new-icon/vertical.png" />
                </button>
              </div>
              <div className="item" ng-click="activeTool('h_flip')">
                <button onClick="twoDapp.mirrorImageCommand(true)" data-toggle="tooltip" data-placement="top" title=""
                  className="viewBtn flipHorizontal​ btn btn-light">
                  <img src="../images/new-icon/vertical-copy.png" id="flipHorizontal​" />
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
        {/* <div className="sidebar"> */ }
    {/* start canh */ }
    {/* <div className="panel3D">
            <div className="mpr-label-lst">
              <div className="mpr-label-lst__lbl arrow-anim">
                <img src="../images/new-icon/lbl-list.png" />{' '}
                <span>Label List</span>
              </div>
            </div>
            <div className="mpr-label-lst__content collapse in">
              <div className="mpr-label-lst__content--btns">
                <button
                  className="btn btn-light"
                  onClick={() => {
                    this.addSegment();
                  }}
                >
                  <img src="../images/new-icon/add-btn-3d.svg" /> Add
                </button>
                <button className="btn btn-light">
                  <img src="../images/new-icon/minus-btn-3d.svg" /> Remove
                </button>
                <button className="btn btn-light">
                  <img src="../images/new-icon/save-btn-3d.svg" /> Save
                </button>
              </div>
              <div className="able mpr-label-lst__content--tbl-wrapper scroll-bar-bbox">
                <table className="table mpr-label-lst__content--tbl">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Name</th>
                      <th>Color</th>
                    </tr>
                  </thead>
                  <tbody className="table-body">
                    {this.state.sengments.map((item, idx) => {
                      return (
                        <tr key={idx}>
                          <td>
                            <img
                              src="../images/new-icon/eye-btn-active.png"
                              className="img"
                            />
                          </td>
                          <td
                            onDoubleClick={() => {
                              this.editSegmentName(item, idx);
                            }}
                          >
                            <span className={item.editing ? 'hide' : 'show'}>
                              {item.name}
                            </span>
                            <input
                              className="input-label-name"
                              className={item.editing ? 'show' : 'hide'}
                              type="text"
                              defaultValue={item.name}
                              onBlur={() => {
                                this.handleBlur(item, event);
                              }}
                            />
                          </td>
                          <td>
                            <span className="square green"></span>{' '}
                            <img
                              onClick={() => {
                                this.removeSegment(idx);
                              }}
                              src="../images/worklist/delete.png"
                              className="w8 un_ver"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mpr-display">
              <div className="mpr-2d-segment">
                <div
                  className="mpr-volumn-visual__ttl arrow-anim"
                  data-toggle="collapse"
                  data-target="#js-2dsegment-ctn"
                >
                  <img src="/images/new-icon/2d-segment.png" alt="" />
                  <span>2D Segmentation</span>
                </div>
                <div className="collapse in" id="js-2dsegment-ctn">
                  <div className="mpr-display__func mpr-2d">
                    <button
                      className="mpr-display__func--item"
                      title="MPR scroll"
                      onClick={() => {
                        this.handleActiveToolCnst('segmentation');
                      }}
                    >
                      <img src="/images/new-icon/plus-outside.png" />
                    </button>
                    <button className="mpr-display__func--item" title="Rotate">
                      <img src="/images/new-icon/circle-minus.png" />
                    </button>
                    <button className="mpr-display__func--item" title="Zoom">
                      <img src="/images/new-icon/brush.png" />
                    </button>
                    <button className="mpr-display__func--item" title="Pan">
                      <img src="/images/new-icon/eraser.png" />
                    </button>
                    <button
                      className="mpr-display__func--item"
                      title="Reset image"
                    >
                      <img src="/images/new-icon/paint.png" />
                    </button>
                    <button
                      className="mpr-display__func--item"
                      title="Windowing"
                    >
                      <img src="/images/new-icon/recyclebin.png" />
                    </button>
                    <button
                      className="mpr-display__func--item"
                      title="Reset image"
                    >
                      <img src="/images/new-icon/pen.png" />
                    </button>
                    <button
                      className="mpr-display__func--item"
                      title="Reset image"
                    >
                      <img src="/images/new-icon/cube.png" />
                    </button>
                    <button
                      className="mpr-display__func--item"
                      title="Crosshair"
                    >
                      <img
                        src="/images/svg/crosshair.svg"
                        style={{ color: '#c6c6c6' }}
                        onClick={() => {
                          this.handleActiveToolCnst('crosshair');
                        }}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="mpr-display">
              <div className="mpr-2d-segment label-panel">
                <div className="mpr-volumn-visual__ttl arrow-anim">
                  <img
                    src="../images/new-icon/annotation_list.svg"
                    className="w16"
                  />
                  <span>Annotation List</span>
                </div>
                <div className="box-content">
                  <div className="button-list">
                    <button
                      className="w-50"
                      onClick={() => {
                        this.setState({ typeDicom: 'xray' });
                      }}
                    >
                      <img src="../images/new-icon/open-file-bbox.svg" /> Open
                    </button>
                    <button
                      className="w-20"
                      onClick={() => {
                        this.getSegmentation();
                      }}
                    >
                      GET
                    </button>
                    <button
                      className="w-20"
                      onClick={() => {
                        this.setSegmentation();
                      }}
                    >
                      SET
                    </button>
                    <div id="link" ref={this.link}>
                      Click to me
                    </div>
                  </div>
                  <div className="table-wrap-anno">
                    <input type="file" onChange={this.onChange} />
                    <table className="label-list-table">
                      <thead>
                        <tr>
                          <th></th>
                          <th>Name</th>
                          <th>Color</th>
                          <th>Type</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td></td>
                          <td></td>
                          <td></td>
                          <td></td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
            <div className="mpr-display">
              <div className="mpr-2d-segment label-panel">
                <div className="mpr-volumn-visual__ttl arrow-anim">
                  <img src="../images/new-icon/download.svg" className="w16" />
                  <span>Download</span>
                </div>
                <div className="box-content collapse in">
                  <div className="button-list no-border-bottom">
                    <button className="w-50">
                      <img src="../images/new-icon/save-btn-3d.svg" /> VOC
                    </button>
                    <button className="w-50">
                      <img src="../images/new-icon/save-btn-3d.svg" /> CROP
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div> */}

    {/* <div className="mpr-content">
            <div className="col-xs-6 box-item-mpr p0" style={style}>
              <span className="label box-name label-danger">Axial</span>
              {typeDicom != 'xray' && (
                <View2D
                  volumes={this.state.volumes}
                  onCreated={this.storeApi(2)}
                  orientation={{ sliceNormal: [0, 0, 1], viewUp: [0, -1, 0] }}
                />
              )}
              {typeDicom &&
                typeDicom == 'xray' &&
                this.state.cornerstoneViewportData && (
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
                    className={className}
                  />
                )}
            </div>

            <div
              className="col-xs-6 box-item-mpr p0"
              style={{ width: '50%', height: '50%' }}
            >
              <span className={className}>
                <span className="label box-name label-success">Sagittal</span>
                <View2D
                  volumes={this.state.volumes}
                  onCreated={this.storeApi(1)}
                  orientation={{ sliceNormal: [1, 0, 0], viewUp: [0, 0, 1] }}
                />
              </span>
            </div>

            <div
              className="col-xs-6 box-item-mpr p0"
              style={{ width: '50%', height: '50%', marginTop: '15px' }}
            >
              <span className={className}>
                <span className="label box-name label-primary">Coronal</span>
                <View2D
                  volumes={this.state.volumes}
                  onCreated={this.storeApi(0)}
                  orientation={{ sliceNormal: [0, 1, 0], viewUp: [0, 0, 1] }}
                />
              </span>
            </div>

            <div
              className="col-xs-6 box-item-mpr p0"
              style={{ width: '50%', height: '50%', marginTop: '15px' }}
            >
              <span className={className}>
                <span className="label box-name label-warning">3D Volums</span>
                <View3D
                  volumes={this.state.volumeRenderingVolumes}
                  onCreated={this.saveApiReference}
                />
              </span>
            </div>
          </div>
           */}
    {/* </div> */ }
      </div >
    );
  }
}

export default VTKCrosshairsExample;
