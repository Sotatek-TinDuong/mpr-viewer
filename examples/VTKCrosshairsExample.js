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
} from '@vtk-viewport';

import { api as dicomwebClientApi } from 'dicomweb-client';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import presets from './presets.js';
import labelListManager from '../src/Label/labelListManager.js';
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
import LabelListItem from '../src/Label/LabelListItem.js';
var labelList = [];

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

labelListManager.getLabelList().then(res => (labelList = res));

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
      // label panel state
      labelListCreate: [],
    };
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

    const arr = new Uint8Array(obj.get3d.buffer).toString();
    this.download('buffer.txt', arr);
  };

  download = (filename, text) => {
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
  };

  onChange = event => {
    const element = this.cornerstoneElements[0];
    const file = event.target.files[0];
    var reader = new FileReader();
    reader.onload = function() {
      var text = reader.result;
      const buffer = new Uint8Array(text.split(',')).buffer;
      setters.labelmap3DForElement(element, buffer, 0);
      cornerstone.updateImage(element);
    };
    reader.readAsText(file);
  };

  // label map function
  createLabel = () => {
    const { labelListCreate } = this.state;
    let params = {
      no: labelListCreate.length,
      name: `Segmentation ${labelListCreate.length}`,
      color: '#ff0000',
      type: 'nifti',
    };
    this.setState({ labelListCreate: params });
    labelListManager.addLabelList(params);
  };

  removeLabelList = () => {
    labelListManager.removeLabelList(params);
  }

  render() {
    const { typeDicom } = this.state;
    const className =
      typeDicom && typeDicom === 'xray' ? 'segmode' : 'crossmode';

    const loading = (
      <div className="loading-box">
        <div className="box-inside">
          <img alt="" src="images/loading.gif" />
          <h4>Loading...</h4>
        </div>
      </div>
    );

    return (
      <div>
        <div className="left-panel-tool">
          <div className="bar-menu f-left">
            <div className="label-title title">Project</div>
            <a
              href="http://www.deepphi.ai"
              className="link-item"
              title="DEEP:PHI"
            >
              <img src="../images/new-icon/deep_phi.svg" alt="deep_phi" />
            </a>
            <a
              href="http://www.deepstoreai.ai"
              className="link-item"
              title="DEEP:STORE"
            >
              <img src="../images/new-icon/dee-_store.svg" alt="deep_store" />
            </a>
          </div>

          <div className="label-panel f-left">
            <div id="labelListContent">
              <div className="label-title title">Label</div>
              <div className="box-title">
                <img src="../images/new-icon/lbl-list.png" alt="Label list" />
                <span>Label list</span>
                <span>(1)</span>
              </div>

              <div className="box-content">
                <div className="label-list-head">
                  <button
                    className="create-label"
                    onClick={() => this.createLabel()}
                  >
                    <span>
                      <img src="../images/new-icon/add-btn-3d.svg" alt="" />
                    </span>
                    <span>Add</span>
                  </button>
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
                    <tr></tr>
                    <LabelListItem rows={labelList}/>
                  </tbody>
                </table>
              </div>

              <div id="annotationListContent">
                <div className="box-title">
                  <img
                    src="../images/new-icon/pen2x.png"
                    alt="Label list"
                    style={{ width: '16px' }}
                  />
                  <span>2D Segmentation</span>
                </div>

                <div className="mpr-display__func mpr-2d">
                  <button
                    alt=""
                    className="mpr-display__func--item"
                    title=""
                    onClick={() => {
                      this.handleActiveToolCnst('segmentation');
                    }}
                  >
                    <img alt="" src="/images/new-icon/plus-outside.png" />
                  </button>
                  <button className="mpr-display__func--item" title="">
                    <img alt="" src="/images/new-icon/circle-minus.png" />
                  </button>
                  <button className="mpr-display__func--item" title="">
                    <img alt="" src="/images/new-icon/brush.png" />
                  </button>
                  <button className="mpr-display__func--item" title="">
                    <img alt="" src="/images/new-icon/eraser.png" />
                  </button>
                  {/* <button className="mpr-display__func--item" title="">
                    <img alt="" src="/images/new-icon/paint.png" />
                  </button>
                  <button className="mpr-display__func--item" title="">
                    <img alt="" src="/images/new-icon/recyclebin.png" />
                  </button>
                  <button className="mpr-display__func--item" title="">
                    <img alt="" src="/images/new-icon/pen.png" />
                  </button>
                  <button className="mpr-display__func--item" title="">
                    <img alt="" src="/images/new-icon/cube.png" />
                  </button> */}
                  <button
                    className="mpr-display__func--item"
                    title="Crosshair"
                    onClick={() => {
                      this.handleActiveToolCnst('crosshair');
                    }}
                  >
                    <img
                      src="/images/svg/crosshair.svg"
                      style={{ color: '#c6c6c6', width: '23px' }}
                      alt=""
                    />
                  </button>
                </div>

                <div className="box-title">
                  <img
                    src="../images/new-icon/annotation_list.svg"
                    alt="Label list"
                    style={{ width: '16px' }}
                  />
                  <span>Annotation List</span>
                  <span>(1)</span>
                </div>
                <div className="box-content">
                  <div className="button-list">
                    <button className="w-50" style={{ position: 'relative' }}>
                      <img src="../images/new-icon/open-file-bbox.svg" alt="" />
                      <input
                        id="inputFileLabel"
                        type="file"
                        accept="text/xml"
                      />
                      Import
                    </button>
                    <div id="link" ref={this.link}>
                      Click to me
                    </div>
                  </div>
                  <div className="table-wrap-anno">
                    <input
                      type="file"
                      onChange={this.onChange}
                      style={{ display: 'none' }}
                    />
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
                        <tr>
                          <td>
                            <button>
                              <img
                                src="../images/new-icon/eye-btn-disable.png"
                                alt=""
                              />
                            </button>
                          </td>
                          <td className="text-left">
                            <span className="label-name">annotation 1</span>
                          </td>
                          <td>
                            <input className="input-color-picker" readOnly />
                          </td>
                          <td>nifti</td>
                          <td className="last">
                            <button className="remove-label">
                              <i className="fa fa-home" aria-hidden="true"></i>
                            </button>
                          </td>
                        </tr>
                        <tr>
                          <td>
                            <button>
                              <img
                                src="../images/new-icon/eye-btn-disable.png"
                                alt=""
                              />
                            </button>
                          </td>
                          <td className="text-left">
                            <span className="label-name">
                              annotation labelName
                            </span>
                          </td>
                          <td>
                            <input className="input-color-picker" readOnly />
                          </td>
                          <td>nifti</td>
                          <td className="last">
                            <button className="remove-label">
                              <i className="fa fa-home" aria-hidden="true"></i>
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="display-panel f-left">
            <div className="display-title title">Display</div>
            <div className="display-panel-tool" id="label2d-panel">
              <div className="item">
                <button className="btnScroll viewBtn" title="Scroll Image">
                  <img alt="" src="/images/new-icon/empty.png" />
                </button>
              </div>
              <div className="item">
                <button
                  className="btnStackImage viewBtn btn btn-light"
                  title="Stack Image"
                >
                  <img src="/images/new-icon/scroll.png" alt="" />
                </button>
              </div>
              <div className="item">
                <button className="btnPan viewBtn">
                  <img
                    alt=""
                    src="/images/new-icon/pan.png"
                    title="Pan Image"
                  />
                </button>
              </div>
              <div className="item">
                <button className="btnZoom viewBtn">
                  <img alt="" src="/images/new-icon/zoom.png" />
                </button>
              </div>
              <div className="item">
                <button className="btnWL viewBtn">
                  <img alt="" src="/images/new-icon/windowing.png" />
                </button>
              </div>
              <div className="item">
                <button className="btnReset viewBtn" title="Reset Image">
                  <img src="/images/new-icon/reset.png" alt="" />
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* END LEFT PANEL TOOL */}
        <div className="right-mpr-tool">
          {!this.state.volumes ||
          !this.state.volumes.length ||
          !this.state.volumeRenderingVolumes ? (
            loading
          ) : (
            <div className="mpr-content">
              <div className="box-item-mpr">
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
                        {
                          name: 'StackScrollMouseWheel',
                          mouseButtonMasks: [1],
                        },
                        {
                          name: 'StackScrollMultiTouch',
                          mouseButtonMasks: [1],
                        },
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

              <div className="box-item-mpr">
                <span className={className}>
                  <span className="label box-name label-success">Sagittal</span>
                  <View2D
                    volumes={this.state.volumes}
                    onCreated={this.storeApi(1)}
                    orientation={{ sliceNormal: [1, 0, 0], viewUp: [0, 0, 1] }}
                  />
                </span>
              </div>

              <div className="box-item-mpr">
                <span className={className}>
                  <span className="label box-name label-primary">Coronal</span>
                  <View2D
                    volumes={this.state.volumes}
                    onCreated={this.storeApi(0)}
                    orientation={{ sliceNormal: [0, 1, 0], viewUp: [0, 0, 1] }}
                  />
                </span>
              </div>

              <div className="box-item-mpr">
                <span className={className}>
                  <span className="label box-name label-warning">
                    3D Volums
                  </span>
                  <View3D
                    volumes={this.state.volumeRenderingVolumes}
                    onCreated={this.saveApiReference}
                  />
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
}

export default VTKCrosshairsExample;
